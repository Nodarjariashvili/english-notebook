-- Results of the content checker (admin view): one row per scanned page
-- ("page:32") or built exercise ("ex:u2|GRAMMAR 1|A PRACTICE"), with a hash
-- of what was checked so nothing is checked twice unless it changes.
-- `findings` is a list of
-- { id, kind, original, suggestion, reason, status }, where status is
-- open | applied | dismissed (book text: the user decides) or auto-fixed
-- (an exercise answer the model had written itself).

create table if not exists public.content_checks (
  user_id uuid not null references auth.users(id) on delete cascade,
  check_key text not null,
  source_hash text not null,
  findings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, check_key)
);

alter table public.content_checks enable row level security;

create policy "Users can read their own content checks"
  on public.content_checks for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own content checks"
  on public.content_checks for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own content checks"
  on public.content_checks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own content checks"
  on public.content_checks for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.content_checks to authenticated;
grant all on public.content_checks to service_role;

-- An approved fix is written back into the page scan itself.
create policy "Users can update their own page scans"
  on public.page_scans for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant update on public.page_scans to authenticated;
