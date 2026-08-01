-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Sets up server-side rate-limit bookkeeping for the anthropic-chat and
-- whisper-transcribe Edge Functions. Nothing here is ever reachable from the
-- browser directly -- only the Edge Functions (using the service_role key)
-- are allowed to touch this table/function.

create table if not exists public.api_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  day date not null,
  count integer not null default 0,
  primary key (user_id, function_name, day)
);

alter table public.api_usage enable row level security;
-- Deliberately no policies are created for anon/authenticated roles -- with
-- RLS enabled and zero policies, no client-side request (even from a signed-in
-- user's own JWT) can read or write this table at all. Only the service_role
-- key (used exclusively inside the Edge Functions, never shipped to the
-- browser) bypasses RLS entirely, which is how the functions can read/update it.

create or replace function public.increment_api_usage(
  p_user_id uuid,
  p_function_name text,
  p_day date,
  p_limit integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.api_usage (user_id, function_name, day, count)
  values (p_user_id, p_function_name, p_day, 1)
  on conflict (user_id, function_name, day)
  do update set count = api_usage.count + 1
  returning count into new_count;

  if new_count > p_limit then
    -- roll back the increment so a rejected request doesn't still consume a slot
    update public.api_usage
      set count = count - 1
      where user_id = p_user_id and function_name = p_function_name and day = p_day;
    return -1; -- signal to the caller: over the daily limit
  end if;

  return new_count;
end;
$$;

-- Lock the function down to service_role only -- newly created functions are
-- granted to PUBLIC by default in Postgres, which would let anon/authenticated
-- callers invoke it directly (and manipulate their own usage counter) if not revoked.
revoke execute on function public.increment_api_usage(uuid, text, date, integer) from public;
revoke execute on function public.increment_api_usage(uuid, text, date, integer) from anon;
revoke execute on function public.increment_api_usage(uuid, text, date, integer) from authenticated;
grant execute on function public.increment_api_usage(uuid, text, date, integer) to service_role;

-- Verify afterwards:
select table_name, row_security from information_schema.tables
  where table_schema = 'public' and table_name = 'api_usage';
select routine_name, security_type from information_schema.routines
  where routine_name = 'increment_api_usage';
