-- Per-user profile data (name, age, city, job -- ka/en pairs where the app
-- shows both). Previously this lived only in a hardcoded PROFILE object,
-- optionally overridden per-device in localStorage -- moving it here so it
-- syncs across devices for a signed-in user.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  name_en text,
  surname text,
  surname_en text,
  age integer,
  city text,
  city_en text,
  job text,
  job_en text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Unlike user_progress/subscriptions/api_usage, this table IS meant to be
-- written directly by the signed-in user's own client (there's no Edge
-- Function proxy for profile edits) -- so SELECT/INSERT/UPDATE are all
-- scoped to auth.uid() = user_id. No DELETE policy, matching this app's
-- existing convention of not letting users delete their own rows outright.
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
