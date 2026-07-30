-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- It removes any existing DELETE policy on user_progress, whatever it's named,
-- without touching the existing SELECT/INSERT/UPDATE policies.
--
-- Why this is enough: Postgres RLS is default-deny. If a table has RLS enabled
-- (it does) and there is zero policy permitting DELETE for a given role, DELETE
-- is blocked entirely for that role -- there is no need to add a "deny" policy,
-- only to make sure no "allow" policy for DELETE exists.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_progress' AND cmd = 'DELETE'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.user_progress', pol.policyname);
    RAISE NOTICE 'Dropped DELETE policy: %', pol.policyname;
  END LOOP;
END $$;

-- Verify afterwards: this should list only SELECT/INSERT/UPDATE rows, no DELETE row.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_progress'
ORDER BY cmd;
