-- Interactive versions of the textbook's printed exercises, built by the
-- app's exercise builder from the page scans: one row per exercise, keyed
-- by unit, section and item ("u2|GRAMMAR 1|A PRACTICE"). `source_hash` is a
-- hash of the scanned blocks the row was built from, so an exercise is
-- rebuilt only when its scan changes. `topic` holds
-- { instruction, items: [{ prompt, answer, accept }], reason, changes }.

create table if not exists public.book_exercises (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_key text not null,
  source_hash text not null,
  usable boolean not null default false,
  topic jsonb not null,
  model text,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_key)
);

alter table public.book_exercises enable row level security;

create policy "Users can read their own book exercises"
  on public.book_exercises
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own book exercises"
  on public.book_exercises
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own book exercises"
  on public.book_exercises
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own book exercises"
  on public.book_exercises
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.book_exercises to authenticated;
grant all on public.book_exercises to service_role;
