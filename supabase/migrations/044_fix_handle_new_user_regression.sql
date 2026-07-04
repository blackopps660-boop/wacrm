-- ============================================================
-- 044_fix_handle_new_user_regression.sql — restore the account_memberships
-- insert that 041 silently dropped from handle_new_user()
--
-- Bug: 041_contact_lifecycle_stages.sql redefined handle_new_user()
-- by copying its body from 017_account_sharing.sql (the version at the
-- time that migration was first written) and adding one line for the
-- lifecycle-stage seed call. It didn't account for 031_account_
-- memberships.sql having *already* redefined the same function to also
-- insert into account_memberships — so 041's CREATE OR REPLACE quietly
-- reverted that, and every signup since 041 was applied got a
-- profiles.account_id/account_role pointer but no matching
-- account_memberships row. GET /api/account/workspaces (which reads
-- account_memberships, not profiles) and every account-scoped API
-- route consequently 403'd for brand-new signups.
--
-- Fix: redefine handle_new_user() one more time with both pieces
-- present — the account_memberships insert (031) and the lifecycle-
-- stage seed (041) — plus backfill the one account this affected in
-- practice (only ever live for a few minutes before being caught).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  INSERT INTO public.account_memberships (account_id, user_id, role)
  VALUES (v_account_id, NEW.id, 'owner');

  PERFORM public.seed_default_lifecycle_stages(v_account_id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- Backfill any account whose owner is missing a membership row (in
-- practice, only accounts created in the window between 041 and this
-- migration being applied).
INSERT INTO account_memberships (account_id, user_id, role)
SELECT p.account_id, p.user_id, p.account_role
FROM profiles p
WHERE p.account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM account_memberships am
    WHERE am.account_id = p.account_id AND am.user_id = p.user_id
  )
ON CONFLICT DO NOTHING;
