-- State machine guard, audit trigger, atomic plan application. Owner: Aditi (D1).
-- Transitions must match TRANSITIONS in src/contracts/domain.ts.

create function is_valid_transition(f request_status, t request_status) returns boolean
language sql immutable as $$
  select (f::text || '>' || t::text) = any (array[
    'waitlisted>pending','waitlisted>approved','waitlisted>cancelled','waitlisted>expired',
    'pending>approved','pending>rejected','pending>expired','pending>cancelled','pending>bumped',
    'approved>checked_in','approved>auto_released','approved>cancelled','approved>bumped',
    'checked_in>completed',
    'bumped>pending','bumped>cancelled','bumped>expired','bumped>waitlisted'
  ])
$$;

create function requests_guard() returns trigger language plpgsql as $$
declare r rooms;
begin
  if new.room_id is not null and new.status in ('pending','approved','checked_in') then
    select * into r from rooms where id = new.room_id;
    if not r.is_active then
      raise exception 'ROOM_INACTIVE';
    end if;
    if new.headcount > r.capacity then
      raise exception 'OVER_CAPACITY';
    end if;
    if exists (select 1 from room_blackouts b where b.room_id = new.room_id and b.during && new.during) then
      raise exception 'ROOM_BLACKOUT';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status and not is_valid_transition(old.status, new.status) then
    raise exception 'INVALID_TRANSITION % -> %', old.status, new.status;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger requests_guard
  before insert or update on requests
  for each row execute function requests_guard();

create function audit_requests() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status
     or old.room_id is distinct from new.room_id or old.during is distinct from new.during then
    insert into audit_log (at, actor_id, entity, entity_id, action, from_status, to_status, details)
    values (
      coalesce(new.last_action_at, now()), new.last_actor_id, 'request', new.id,
      coalesce(new.last_action, lower(tg_op)),
      case when tg_op = 'UPDATE' then old.status end, new.status,
      jsonb_build_object(
        'room_from', case when tg_op = 'UPDATE' then old.room_id end,
        'room_to', new.room_id,
        'during', new.during::text
      )
    );
  end if;
  return new;
end $$;

create trigger audit_requests
  after insert or update on requests
  for each row execute function audit_requests();

-- Generic audit for resource registration (rooms, blackouts).
create function audit_generic() returns trigger language plpgsql as $$
declare rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into audit_log (at, actor_id, entity, entity_id, action, details)
  values (now(), null, tg_argv[0], (rec->>'id')::uuid, lower(tg_op), rec);
  return coalesce(new, old);
end $$;

create trigger audit_rooms after insert or update or delete on rooms
  for each row execute function audit_generic('room');
create trigger audit_blackouts after insert or update or delete on room_blackouts
  for each row execute function audit_generic('blackout');

-- Atomic multi-row plan application (Lab apply, disruption rehome, bumping). One transaction;
-- the deferred exclusion constraint is checked at COMMIT, so swaps A<->B are legal.
create function apply_plan(p_moves jsonb, p_inserts jsonb, p_actor uuid, p_action text, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  update requests r set
    room_id = m.room_id,
    during = tstzrange(m.s, m.e),
    status = coalesce(m.status, r.status),
    offered_alternatives = coalesce(m.offers, r.offered_alternatives),
    last_actor_id = p_actor,
    last_action = p_action,
    last_action_at = p_at
  from jsonb_to_recordset(coalesce(p_moves, '[]'::jsonb))
    as m(request_id uuid, room_id uuid, s timestamptz, e timestamptz, status request_status, offers jsonb)
  where r.id = m.request_id;

  insert into requests
  select * from jsonb_populate_recordset(null::requests, coalesce(p_inserts, '[]'::jsonb));  -- app supplies id + created_at
end $$;
