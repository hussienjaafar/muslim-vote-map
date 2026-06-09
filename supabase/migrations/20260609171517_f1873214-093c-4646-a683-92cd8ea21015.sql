select cron.schedule(
  'daily-fundraising-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://dtmftlfgjprzhxbzyzzo.supabase.co/functions/v1/sync-all-orgs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);