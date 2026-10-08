-- Web Push subscriptions: one row per browser/device that has switched on
-- "quiz notifications" in Settings. The send-quiz-push Edge Function reads
-- these (with the service role) and sends a "your quiz is ready" push to
-- each one several times a day.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Written directly by the signed-in user's own client (like profiles), so
-- everything is scoped to auth.uid() = user_id. DELETE is allowed here,
-- unlike the other tables: switching notifications off must remove the row,
-- otherwise pushes would keep being sent to a device that opted out.
create policy "Users can read their own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
