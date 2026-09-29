-- Schedule the minute tick to run the Allotiq engine.
-- Requires `app.api_url` and `app.cron_secret` to be configured in Supabase settings
-- (Database -> Variables or via alter role).
select cron.schedule('allotiq-tick', '* * * * *', $$
  select net.http_post(
    url := current_setting('app.api_url', true) || '/api/jobs/tick',
    headers := jsonb_build_object('x-cron-secret', current_setting('app.cron_secret', true), 'content-type', 'application/json'),
    body := '{}'::jsonb
  )
$$);
