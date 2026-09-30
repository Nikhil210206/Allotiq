-- Reschedule the minute tick with a check for app.api_url so it doesn't fail continuously on dev
select cron.unschedule('allotiq-tick');
select cron.schedule('allotiq-tick', '* * * * *', $$
  select net.http_post(
    url := current_setting('app.api_url', true) || '/api/jobs/tick',
    headers := jsonb_build_object('x-cron-secret', current_setting('app.cron_secret', true), 'content-type', 'application/json'),
    body := '{}'::jsonb
  )
  where current_setting('app.api_url', true) is not null;
$$);
