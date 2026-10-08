-- Schedules the "your quiz is ready" push notification five times a day:
-- pg_cron calls the send-quiz-push Edge Function at the top of each quiz
-- hour. pg_cron runs in UTC; Tbilisi is UTC+4 all year, so 5,8,11,14,17 UTC
-- is 09:00, 12:00, 15:00, 18:00 and 21:00 local time.
--
-- The call carries no credential. The function is safe to expose because it
-- only sends during those hours and at most once per hour slot, which it
-- records in push_send_log below.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- One row per hour slot already sent, e.g. '2026-10-08T09' (local time).
-- Only the Edge Function's service role touches it: RLS is on with no
-- policies, so signed-in users can neither read nor write it.
create table if not exists public.push_send_log (
  slot text primary key,
  sent_at timestamptz not null default now()
);

alter table public.push_send_log enable row level security;

grant all on public.push_send_log to service_role;

select cron.schedule(
  'quiz-push',
  '0 5,8,11,14,17 * * *',
  $$
  select net.http_post(
    url := 'https://wddqjehzoicwkqyqfiqs.supabase.co/functions/v1/send-quiz-push',
    headers := '{"content-type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
