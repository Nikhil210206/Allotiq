-- Row Level Security: clients only READ (for Realtime + RLS-protected reads).
-- All writes go through Next.js route handlers using the service role. Owner: Aditi (D1).

alter table buildings      enable row level security;
alter table departments    enable row level security;
alter table profiles       enable row level security;
alter table rooms          enable row level security;
alter table room_blackouts enable row level security;
alter table requests       enable row level security;
alter table audit_log      enable row level security;
alter table notifications  enable row level security;
alter table app_settings   enable row level security;
alter table demo_tokens    enable row level security;
alter table lab_scenarios  enable row level security;
alter table engine_runs    enable row level security;

create function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create policy catalog_read on buildings      for select to authenticated using (true);
create policy catalog_read on departments    for select to authenticated using (true);
create policy catalog_read on profiles       for select to authenticated using (true);
create policy catalog_read on rooms          for select to authenticated using (true);
create policy catalog_read on room_blackouts for select to authenticated using (true);
create policy catalog_read on lab_scenarios  for select to authenticated using (true);

create policy req_read on requests for select to authenticated using (
  requester_id = auth.uid()
  or is_admin()
  or exists (select 1 from rooms where rooms.id = requests.room_id and rooms.approver_id = auth.uid())
);

create policy notif_read on notifications for select to authenticated using (user_id = auth.uid());
create policy audit_read on audit_log     for select to authenticated using (is_admin());

-- app_settings, demo_tokens, engine_runs: no policies → server (service role) only.

alter publication supabase_realtime add table requests, notifications, audit_log;

-- Minute tick: run ONCE by hand in each project's SQL editor. Never commit the real secret/URL.
-- select cron.schedule('allotiq-tick', '* * * * *', $$
--   select net.http_post(url := 'https://<app>.vercel.app/api/jobs/tick',
--     headers := jsonb_build_object('x-cron-secret','<CRON_SECRET>','content-type','application/json'),
--     body := '{}'::jsonb) $$);
