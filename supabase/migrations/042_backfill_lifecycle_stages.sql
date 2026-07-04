-- ============================================================
-- 042_backfill_lifecycle_stages.sql — seed defaults for existing accounts
--
-- 041 wired seed_default_lifecycle_stages() into the two account-
-- creation paths (signup, self-serve "Create Workspace"), so every
-- NEW account gets the four defaults automatically — but every
-- account created before 041 has zero lifecycle stages until an
-- admin adds one by hand. One-time backfill: seed defaults for any
-- account that doesn't already have at least one stage.
--
-- Idempotent — an account that already has stages (freshly created
-- post-041, or an admin already added one) is left untouched.
-- ============================================================

DO $$
DECLARE
  v_account RECORD;
BEGIN
  FOR v_account IN
    SELECT a.id
    FROM accounts a
    WHERE NOT EXISTS (
      SELECT 1 FROM lifecycle_stages ls WHERE ls.account_id = a.id
    )
  LOOP
    PERFORM public.seed_default_lifecycle_stages(v_account.id);
  END LOOP;
END $$;
