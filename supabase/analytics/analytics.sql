-- Utilisation analytics: read-only, set-returning SQL functions. Owner: Nikhil · N7a
--
-- Every dashboard number and every "Ask the dashboard" tool call goes through these (via src/lib/analytics);
-- the LLM picks a function and its arguments, it never writes SQL. Idempotent: safe to run again after any change.
--
-- Definitions (the in-browser mock in src/lib/mock/analytics.ts uses the same ones):
--   in range     a request whose start, lower(during), is in [p_from, p_to)
--   held         completed, checked_in or auto_released: an approved booking whose time came
--   used         completed or checked_in: someone actually showed up
--   ghost        auto_released: approved, never checked in
--   unmet        unplaced_reason is set: the engine found no room for it
--   open hours   each room's opening hours on its open days, clipped to [p_from, p_to)
--   hour slot    a whole clock hour a room is open for; a slot is in range when its start is in [p_from, p_to)
-- All wall-clock logic (days, hours, weekdays) is in Asia/Kolkata. Weekdays are ISO: 1 = Monday.
--
-- Filters shared by every function: p_room_type (a room_type value) and p_building_code (buildings.code);
-- null means "all". A request without a room (unmet demand) matches on its requested room_type and its
-- preferred building.

-- ── Building blocks ─────────────────────────────────────────────────────────────

create or replace function analytics_rooms(p_room_type text default null, p_building_code text default null)
returns table (
  room_id uuid, code text, name text, type room_type, building_code text,
  open_time time, close_time time, open_days int[], is_active boolean
)
language sql stable set search_path = public as $$
  select r.id, r.code, r.name, r.type, b.code, r.open_time, r.close_time, r.open_days::int[], r.is_active
  from rooms r
  join buildings b on b.id = r.building_id
  where (p_room_type is null or r.type::text = p_room_type)
    and (p_building_code is null or b.code = p_building_code)
$$;

/** Requests starting in [p_from, p_to), scoped by the filters, with the flags every metric needs. */
create or replace function analytics_bookings(
  p_from timestamptz, p_to timestamptz,
  p_room_type text default null, p_building_code text default null, p_weekday int default null
)
returns table (
  request_id uuid, title text, room_id uuid, room_code text, building_code text, room_type text,
  starts timestamptz, ends timestamptz, status request_status, requester_kind requester_kind,
  headcount int, unplaced_reason text, held boolean, used boolean, ghost boolean
)
language sql stable set search_path = public as $$
  select
    q.id, q.title, q.room_id, r.code,
    coalesce(r.building_code, pb.code),
    coalesce(r.type::text, q.room_type::text),
    lower(q.during), upper(q.during), q.status, p.kind, q.headcount, q.unplaced_reason,
    q.status in ('completed', 'checked_in', 'auto_released'),
    q.status in ('completed', 'checked_in'),
    q.status = 'auto_released'
  from requests q
  left join analytics_rooms(p_room_type, p_building_code) r on r.room_id = q.room_id
  left join buildings pb on pb.id = q.preferred_building_id
  left join profiles p on p.id = q.requester_id
  where lower(q.during) >= p_from and lower(q.during) < p_to
    and (p_weekday is null or extract(isodow from lower(q.during) at time zone 'Asia/Kolkata')::int = p_weekday)
    and case
      when q.room_id is not null then r.room_id is not null   -- placed: its room must be in scope
      else (p_room_type is null or q.room_type::text = p_room_type)
       and (p_building_code is null or pb.code = p_building_code)
    end
$$;

/** Each room's opening window per IST day, clipped to [p_from, p_to). */
create or replace function analytics_open_windows(
  p_from timestamptz, p_to timestamptz,
  p_room_type text default null, p_building_code text default null, p_weekday int default null
)
returns table (room_id uuid, building_code text, day date, opens timestamptz, closes timestamptz)
language sql stable set search_path = public as $$
  select * from (
    select
      r.room_id, r.building_code, d::date,
      greatest(p_from, (d::date + r.open_time) at time zone 'Asia/Kolkata'),
      least(p_to, (d::date + r.close_time) at time zone 'Asia/Kolkata')
    from analytics_rooms(p_room_type, p_building_code) r
    cross join generate_series(
      (p_from at time zone 'Asia/Kolkata')::date,
      (p_to at time zone 'Asia/Kolkata')::date,
      interval '1 day'
    ) d
    where extract(isodow from d)::int = any (r.open_days)
      and (p_weekday is null or extract(isodow from d)::int = p_weekday)
  ) w (room_id, building_code, day, opens, closes)
  where opens < closes
$$;

/** Whole clock hours each room is open for, per IST day, whose start is in [p_from, p_to). */
create or replace function analytics_hour_slots(
  p_from timestamptz, p_to timestamptz,
  p_room_type text default null, p_building_code text default null
)
returns table (room_id uuid, building_code text, weekday int, hour int, slot_start timestamptz)
language sql stable set search_path = public as $$
  select * from (
    select
      r.room_id, r.building_code, extract(isodow from d)::int, h,
      (d::date + make_interval(hours => h)) at time zone 'Asia/Kolkata'
    from analytics_rooms(p_room_type, p_building_code) r
    cross join generate_series(
      (p_from at time zone 'Asia/Kolkata')::date,
      (p_to at time zone 'Asia/Kolkata')::date,
      interval '1 day'
    ) d
    cross join generate_series(0, 23) h
    where extract(isodow from d)::int = any (r.open_days)
      and extract(epoch from r.open_time) <= h * 3600
      and extract(epoch from r.close_time) >= (h + 1) * 3600
  ) s (room_id, building_code, weekday, hour, slot_start)
  where slot_start >= p_from and slot_start < p_to
$$;

-- ── Tools (1:1 with "Ask the dashboard", plan §6.4) ─────────────────────────────

/** get_utilization: per room, used hours ÷ open hours. Sorted busiest last. */
create or replace function analytics_utilization(
  p_from timestamptz, p_to timestamptz,
  p_room_type text default null, p_building_code text default null, p_weekday int default null
)
returns table (
  room_id uuid, code text, name text, type room_type, building_code text, is_active boolean,
  open_hours numeric, used_hours numeric, bookings int, occupancy_pct numeric
)
language sql stable set search_path = public as $$
  with open as (
    select w.room_id, sum(extract(epoch from w.closes - w.opens)) / 3600 as hours
    from analytics_open_windows(p_from, p_to, p_room_type, p_building_code, p_weekday) w
    group by w.room_id
  ),
  booked as (
    select
      b.room_id,
      coalesce(sum(extract(epoch from b.ends - b.starts)) filter (where b.used), 0) / 3600 as hours,
      count(*) filter (where b.held) as n
    from analytics_bookings(p_from, p_to, p_room_type, p_building_code, p_weekday) b
    where b.room_id is not null
    group by b.room_id
  )
  select
    r.room_id, r.code, r.name, r.type, r.building_code, r.is_active,
    round(coalesce(o.hours, 0), 2),
    round(coalesce(k.hours, 0), 2),
    coalesce(k.n, 0)::int,
    case when coalesce(o.hours, 0) > 0 then round(100 * coalesce(k.hours, 0) / o.hours, 1) else 0 end
  from analytics_rooms(p_room_type, p_building_code) r
  left join open o on o.room_id = r.room_id
  left join booked k on k.room_id = r.room_id
  order by 10, r.code
$$;

/** get_heatmap: share of open room-hours that were held, per ISO weekday × clock hour (0…1). */
create or replace function analytics_heatmap(
  p_from timestamptz, p_to timestamptz,
  p_room_type text default null, p_building_code text default null
)
returns table (weekday int, hour int, booked int, room_hours int, occupancy numeric)
language sql stable set search_path = public as $$
  with slots as (
    select * from analytics_hour_slots(p_from, p_to, p_room_type, p_building_code)
  ),
  capacity as (
    select s.weekday, s.hour, count(*) as n from slots s group by 1, 2
  ),
  booked as (
    select t.weekday, t.hour, count(*) as n
    from (select distinct s.weekday, s.hour, s.slot_start from slots s) t
    join analytics_bookings(p_from, p_to, p_room_type, p_building_code) b
      on b.held and b.room_id is not null
     and b.starts < t.slot_start + interval '1 hour' and b.ends > t.slot_start
    group by 1, 2
  )
  select c.weekday, c.hour, coalesce(k.n, 0)::int, c.n::int,
         round(least(1, coalesce(k.n, 0)::numeric / c.n), 3)
  from capacity c
  left join booked k using (weekday, hour)
  order by 1, 2
$$;

/**
 * get_ghost_rate: auto-released ÷ held, grouped by 'room' | 'requester_kind' | 'weekday' | 'building' |
 * 'time_band' (before noon / 12–4 pm / after 4 pm) | 'none'. Worst first.
 */
create or replace function analytics_ghost_rate(
  p_from timestamptz, p_to timestamptz, p_group_by text,
  p_room_type text default null, p_building_code text default null
)
returns table (group_key text, label text, bookings int, ghosts int, rate_pct numeric)
language plpgsql stable set search_path = public as $$
begin
  if p_group_by not in ('room', 'requester_kind', 'weekday', 'building', 'time_band', 'none') then
    raise exception 'analytics_ghost_rate: unknown group_by %', p_group_by;
  end if;
  return query
  with g as (
    select
      case p_group_by
        when 'room' then b.room_id::text
        when 'requester_kind' then coalesce(b.requester_kind::text, 'unknown')
        when 'weekday' then extract(isodow from b.starts at time zone 'Asia/Kolkata')::int::text
        when 'building' then b.building_code
        when 'time_band' then analytics_time_band(b.starts)
        else 'all'
      end as k,
      case p_group_by
        when 'room' then b.room_code
        when 'weekday' then trim(to_char(b.starts at time zone 'Asia/Kolkata', 'Day'))
        when 'time_band' then analytics_time_band_label(analytics_time_band(b.starts))
        else null
      end as l,
      b.ghost
    from analytics_bookings(p_from, p_to, p_room_type, p_building_code) b
    where b.held
  )
  select g.k, coalesce(max(g.l), g.k), count(*)::int, count(*) filter (where g.ghost)::int,
         round(100.0 * count(*) filter (where g.ghost) / count(*), 1)
  from g
  group by g.k
  order by 5 desc, 4 desc, 1;
end $$;

/**
 * get_unmet_demand: requests the engine couldn't place, grouped by 'capacity_band' | 'time_band' |
 * 'room_type' | 'none'. Rows come in band order (smallest / earliest first).
 */
create or replace function analytics_unmet_demand(
  p_from timestamptz, p_to timestamptz, p_group_by text,
  p_room_type text default null, p_building_code text default null
)
returns table (group_key text, label text, requests int, seats int)
language plpgsql stable set search_path = public as $$
begin
  if p_group_by not in ('capacity_band', 'time_band', 'room_type', 'none') then
    raise exception 'analytics_unmet_demand: unknown group_by %', p_group_by;
  end if;
  return query
  with g as (
    select
      case p_group_by
        when 'capacity_band' then case
          when b.headcount < 30 then '1_29'
          when b.headcount < 60 then '30_59'
          when b.headcount < 100 then '60_99'
          when b.headcount < 150 then '100_149'
          else '150_plus'
        end
        when 'time_band' then analytics_time_band(b.starts)
        when 'room_type' then coalesce(b.room_type, 'any')
        else 'all'
      end as k,
      b.headcount
    from analytics_bookings(p_from, p_to, p_room_type, p_building_code) b
    where b.unplaced_reason is not null
  )
  select
    g.k,
    case p_group_by
      when 'capacity_band' then case g.k
        when '1_29' then 'Under 30 seats' when '30_59' then '30–59 seats' when '60_99' then '60–99 seats'
        when '100_149' then '100–149 seats' else '150+ seats'
      end
      when 'time_band' then analytics_time_band_label(g.k)
      when 'room_type' then case g.k when 'any' then 'Any room' else initcap(replace(g.k, '_', ' ')) end
      else 'All'
    end,
    count(*)::int,
    sum(g.headcount)::int
  from g
  group by g.k
  order by min(g.headcount), 1;
end $$;

/** get_underused_rooms: active rooms booked less than p_threshold_pct of their open hours. Quietest first. */
create or replace function analytics_underused_rooms(
  p_from timestamptz, p_to timestamptz, p_threshold_pct numeric,
  p_room_type text default null, p_building_code text default null, p_weekday int default null
)
returns table (
  room_id uuid, code text, name text, type room_type, building_code text,
  open_hours numeric, used_hours numeric, occupancy_pct numeric
)
language sql stable set search_path = public as $$
  select u.room_id, u.code, u.name, u.type, u.building_code, u.open_hours, u.used_hours, u.occupancy_pct
  from analytics_utilization(p_from, p_to, p_room_type, p_building_code, p_weekday) u
  where u.is_active and u.open_hours > 0 and u.occupancy_pct < p_threshold_pct
  order by u.occupancy_pct, u.code
$$;

-- ── Dashboard-only extras (not LLM tools) ──────────────────────────────────────

/** The unmet requests themselves, earliest first. */
create or replace function analytics_unmet_requests(
  p_from timestamptz, p_to timestamptz,
  p_room_type text default null, p_building_code text default null
)
returns table (request_id uuid, title text, headcount int, starts timestamptz, ends timestamptz, room_type text, reason text)
language sql stable set search_path = public as $$
  select b.request_id, b.title, b.headcount, b.starts, b.ends, b.room_type, b.unplaced_reason
  from analytics_bookings(p_from, p_to, p_room_type, p_building_code) b
  where b.unplaced_reason is not null
  order by b.starts, b.title
$$;

/**
 * Energy estimate: per building, hour slots when at least one in-scope room was open but none was held —
 * lights and AC that could have been off. Labelled an estimate in the UI.
 */
create or replace function analytics_idle_building_hours(
  p_from timestamptz, p_to timestamptz,
  p_room_type text default null, p_building_code text default null
)
returns table (building_code text, open_hours int, idle_hours int)
language sql stable set search_path = public as $$
  with building_slots as (
    select distinct s.building_code, s.slot_start
    from analytics_hour_slots(p_from, p_to, p_room_type, p_building_code) s
  ),
  busy as (
    select distinct bs.building_code, bs.slot_start
    from building_slots bs
    join analytics_bookings(p_from, p_to, p_room_type, p_building_code) b
      on b.held and b.room_id is not null and b.building_code = bs.building_code
     and b.starts < bs.slot_start + interval '1 hour' and b.ends > bs.slot_start
  )
  select bs.building_code, count(*)::int, (count(*) - count(busy.slot_start))::int
  from building_slots bs
  left join busy using (building_code, slot_start)
  group by bs.building_code
  order by 3 desc, 1
$$;

-- ── Helpers ─────────────────────────────────────────────────────────────────────

create or replace function analytics_time_band(p_at timestamptz) returns text
language sql immutable as $$
  select case
    when extract(hour from p_at at time zone 'Asia/Kolkata') < 12 then 'morning'
    when extract(hour from p_at at time zone 'Asia/Kolkata') < 16 then 'afternoon'
    else 'evening'
  end
$$;

create or replace function analytics_time_band_label(p_band text) returns text
language sql immutable as $$
  select case p_band when 'morning' then 'Before noon' when 'afternoon' then '12–4 pm' else 'After 4 pm' end
$$;

-- ── Access: server only (service role through src/lib/analytics), never the browser ──

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'analytics\_%'
  loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
