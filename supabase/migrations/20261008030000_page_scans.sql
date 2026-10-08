-- Results of the page reader (admin view): the printed content of one
-- photographed textbook page, transcribed by the model. Stored so a page
-- that has been read once can be looked at again without paying for a
-- second reading. `result` holds { page, changes }.

create table if not exists public.page_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text,
  page_number text not null default '',
  unit text not null default '',
  result jsonb not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists page_scans_user_id_idx on public.page_scans (user_id, created_at desc);

alter table public.page_scans enable row level security;

create policy "Users can read their own page scans"
  on public.page_scans
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own page scans"
  on public.page_scans
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- A scan is a disposable reading, not learner progress: deleting one is allowed.
create policy "Users can delete their own page scans"
  on public.page_scans
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.page_scans to authenticated;
grant all on public.page_scans to service_role;
