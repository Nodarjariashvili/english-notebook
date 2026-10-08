-- Per-item history of the daily quiz (times asked / wrong / correct in a
-- row / last asked), kept alongside the rest of the learner's progress so
-- it syncs across devices. The app uses it to space out what is already
-- known and bring back what was answered wrong.

alter table public.user_progress
  add column if not exists daily jsonb not null default '{}'::jsonb;
