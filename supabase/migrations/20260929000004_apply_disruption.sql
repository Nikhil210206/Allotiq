-- Atomic A11 disruption persistence. Keep apply_plan() unchanged; this wrapper
-- adds an in-transaction stale-state check and the blackout write.
create function apply_disruption(
  p_moves jsonb,
  p_expected_states jsonb,
  p_room_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_reason text,
  p_actor uuid,
  p_action text,
  p_at timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid;
  v_expected_count bigint;
  v_expected_unique bigint;
  v_move_count bigint;
  v_move_unique bigint;
  v_room_active boolean;
  v_blackout tstzrange;
begin
  if jsonb_typeof(p_expected_states) is distinct from 'array'
     or jsonb_typeof(p_moves) is distinct from 'array' then
    raise exception 'INVALID_DISRUPTION_PAYLOAD' using errcode = '22023';
  end if;
  if p_room_id is null or p_start is null or p_end is null or p_start >= p_end
     or p_reason is null or length(trim(p_reason)) < 2 or length(p_reason) > 200
     or p_actor is null or p_action is null or length(trim(p_action)) = 0 or p_at is null then
    raise exception 'INVALID_DISRUPTION_INPUT' using errcode = '22023';
  end if;

  v_blackout := tstzrange(p_start, p_end, '[)');

  -- Lock the room while validating and applying this disruption. The schema has
  -- no exclusion constraint for blackouts, so this does not promise protection
  -- against writers that do not follow the same room-lock protocol.
  select r.is_active into v_room_active
  from rooms r where r.id = p_room_id for update;
  if not found or v_room_active is distinct from true then
    raise exception 'ROOM_INACTIVE_OR_NOT_FOUND';
  end if;

  select count(*), count(distinct x.request_id)
    into v_expected_count, v_expected_unique
  from jsonb_to_recordset(p_expected_states) as x(
    request_id uuid, status request_status, room_id uuid,
    start_at timestamptz, end_at timestamptz
  );
  select count(*), count(distinct x.request_id)
    into v_move_count, v_move_unique
  from jsonb_to_recordset(p_moves) as x(
    request_id uuid, room_id uuid, s timestamptz, e timestamptz,
    status request_status, offers jsonb
  );
  if v_expected_count = 0 or v_expected_count <> v_expected_unique
     or v_move_count <> v_move_unique or v_expected_count <> v_move_count then
    raise exception 'INVALID_DISRUPTION_REQUEST_SET' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_expected_states) as x(
      request_id uuid, status request_status, room_id uuid,
      start_at timestamptz, end_at timestamptz
    )
    full join jsonb_to_recordset(p_moves) as m(
      request_id uuid, room_id uuid, s timestamptz, e timestamptz,
      status request_status, offers jsonb
    ) using (request_id)
    where x.request_id is null or m.request_id is null
  ) then
    raise exception 'INVALID_DISRUPTION_REQUEST_SET' using errcode = '22023';
  end if;

  -- Lock in stable order before comparing exact status, assignment and [) range.
  for v_request_id in
    select x.request_id
    from jsonb_to_recordset(p_expected_states) as x(
      request_id uuid, status request_status, room_id uuid,
      start_at timestamptz, end_at timestamptz
    ) order by x.request_id
  loop
    perform 1 from requests r where r.id = v_request_id for update;
    if not found then raise exception 'DISRUPTION_STALE_REQUEST_STATE'; end if;
  end loop;

  if exists (
    select 1
    from jsonb_to_recordset(p_expected_states) as x(
      request_id uuid, status request_status, room_id uuid,
      start_at timestamptz, end_at timestamptz
    )
    left join requests r on r.id = x.request_id
    where r.id is null
       or r.status is distinct from x.status
       or r.room_id is distinct from x.room_id
       or r.during is distinct from tstzrange(x.start_at, x.end_at, '[)')
       or x.status not in ('pending', 'approved')
       or x.room_id is null or x.start_at is null or x.end_at is null
       or x.start_at >= x.end_at
  ) then
    raise exception 'DISRUPTION_STALE_OR_INELIGIBLE_REQUEST_STATE';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_moves) as x(
      request_id uuid, room_id uuid, s timestamptz, e timestamptz,
      status request_status, offers jsonb
    )
    where x.request_id is null or x.s is null or x.e is null or x.s >= x.e
  ) then
    raise exception 'INVALID_DISRUPTION_MOVE' using errcode = '22023';
  end if;

  if exists (
    select 1 from room_blackouts b
    where b.room_id = p_room_id and b.during && v_blackout
  ) then
    raise exception 'ROOM_BLACKOUT_OVERLAP';
  end if;

  insert into room_blackouts (room_id, during, reason, created_by, created_at)
  values (p_room_id, v_blackout, p_reason, p_actor, p_at);

  -- Function calls share the caller's transaction. Any trigger, constraint or
  -- blackout error therefore rolls back both this insert and the plan changes.
  perform apply_plan(p_moves, '[]'::jsonb, p_actor, p_action, p_at);
end;
$$;

revoke all on function apply_disruption(jsonb, jsonb, uuid, timestamptz, timestamptz, text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function apply_disruption(jsonb, jsonb, uuid, timestamptz, timestamptz, text, uuid, text, timestamptz)
  to service_role;
