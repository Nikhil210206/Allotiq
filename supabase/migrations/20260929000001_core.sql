-- Allotiq core schema. Owner: Aditi (D1). Only Aditi runs `supabase db push`.

create extension if not exists btree_gist;
create extension if not exists pg_cron;   -- if this errors, enable it in Dashboard → Database → Extensions
create extension if not exists pg_net;
create extension if not exists pgcrypto;

create type user_role      as enum ('requester','approver','admin');
create type requester_kind as enum ('faculty','club','department','student');
create type room_type      as enum ('lab','classroom','seminar_hall','meeting_room','auditorium');
create type access_rule    as enum ('open','dept_only');
create type purpose_kind   as enum ('exam','academic','department_event','club_event','meeting','student_activity');
create type request_status as enum ('waitlisted','pending','approved','checked_in','completed',
                                    'rejected','expired','cancelled','auto_released','bumped');

create table buildings (
  id   uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  lat  double precision,
  lng  double precision
);

create table departments (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  building_id uuid references buildings
);

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  full_name     text not null,
  role          user_role not null default 'requester',
  kind          requester_kind,
  department_id uuid references departments,
  org_name      text                                   -- club name etc.
);

create table rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  name          text not null,
  building_id   uuid not null references buildings,
  type          room_type not null,
  capacity      int not null check (capacity > 0),
  systems_count int not null default 0 check (systems_count >= 0),
  features      text[] not null default '{}',          -- projector, mic, computers, smart_board, ac, ...
  department_id uuid references departments,
  access        access_rule not null default 'open',
  approver_id   uuid references profiles,
  open_time     time not null default '08:00',
  close_time    time not null default '20:00',
  open_days     smallint[] not null default '{1,2,3,4,5,6}',   -- ISO weekdays
  attributes    jsonb not null default '{}',            -- generic resource model → roadmap: vehicles/equipment
  qr_secret     text not null default encode(gen_random_bytes(12), 'hex'),
  is_active     boolean not null default true,
  check (close_time > open_time)
);

create table room_blackouts (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms on delete cascade,
  during     tstzrange not null check (not isempty(during)),
  reason     text not null,
  created_by uuid references profiles,
  created_at timestamptz not null default now()
);
create index room_blackouts_room_during on room_blackouts using gist (room_id, during);

create table requests (
  id                    uuid primary key default gen_random_uuid(),
  requester_id          uuid not null references profiles,
  title                 text not null,
  purpose               purpose_kind not null,
  priority              smallint not null,           -- derived server-side from purpose; never from client input
  headcount             int not null check (headcount between 1 and 5000),
  min_systems           int not null default 0,
  required_features     text[] not null default '{}',
  room_type             room_type,
  preferred_building_id uuid references buildings,
  during                tstzrange not null check (lower(during) < upper(during)),  -- '[)' = half-open
  room_id               uuid references rooms,
  status                request_status not null default 'pending',
  hold_expires_at       timestamptz,
  checked_in_at         timestamptz,
  decided_by            uuid references profiles,
  decision_reason       text,
  unplaced_reason       text,                        -- engine couldn't place it → feeds "unmet demand"
  offered_alternatives  jsonb,
  score_breakdown       jsonb,
  source                text not null default 'form' check (source in ('form','text','voice','lab','seed')),
  raw_input             text,
  last_actor_id         uuid references profiles,    -- read by the audit trigger
  last_action           text,
  last_action_at        timestamptz,
  created_at            timestamptz not null,        -- app sets created_at = getNow()
  updated_at            timestamptz not null default now(),
  constraint room_needed check (
    room_id is not null or status in ('waitlisted','rejected','expired','cancelled','bumped')
  ),
  -- THE anti-double-booking guarantee. Deferrable so apply_plan() can swap rooms in one transaction.
  constraint no_double_booking exclude using gist (room_id with =, during with &&)
    where (status in ('pending','approved','checked_in')) deferrable initially deferred
);
create index requests_status_start on requests (status, lower(during));
create index requests_requester on requests (requester_id);

create table audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null,
  actor_id    uuid,
  entity      text not null,
  entity_id   uuid not null,
  action      text not null,
  from_status request_status,
  to_status   request_status,
  details     jsonb not null default '{}'
);
create index audit_log_entity on audit_log (entity_id, at);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles,
  kind       text not null,
  title      text not null,
  body       text,
  request_id uuid references requests,
  created_at timestamptz not null,
  read_at    timestamptz
);
create index notifications_user on notifications (user_id, created_at desc);

-- clock_offset_ms, demo_anchor, engine_weights, hold_minutes, noshow_grace_minutes
create table app_settings (key text primary key, value jsonb not null);

create table demo_tokens (
  token      text primary key,
  user_id    uuid references profiles,
  expires_at timestamptz,
  used_count int not null default 0
);

create table lab_scenarios (
  id          text primary key,
  name        text not null,
  description text,
  requests    jsonb not null
);

create table engine_runs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,        -- recommend | lab | disruption | waitlist | bump
  solver     text,
  input      jsonb,
  output     jsonb,
  ms         int,
  created_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('clock_offset_ms', '0'),
  ('hold_minutes', '120'),
  ('noshow_grace_minutes', '15'),
  ('engine_weights', '{"capacityFit":0.3,"featureMatch":0.1,"proximity":0.2,"scarcity":0.2,"preference":0.1,"energy":0.1}');
