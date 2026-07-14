-- ============================================================
-- 052_messages_account_id.sql
--
-- Denormalizes `account_id` onto `messages` so Supabase Realtime can
-- filter the `messages` table subscription server-side
-- (`account_id=eq.<id>`) instead of every open inbox tab receiving
-- every message INSERT/UPDATE across every tenant on the instance and
-- discarding almost all of it client-side. `messages` only carries
-- `conversation_id` today (001_initial_schema.sql) — account scoping
-- has always gone through a join to `conversations`, which Realtime's
-- row-filter syntax can't express (it only matches columns on the
-- subscribed table itself).
--
-- This became a real problem, not a theoretical one, once an account
-- had ~70-80 live conversations generating real WhatsApp traffic: the
-- unfiltered client-side subscription (src/hooks/use-realtime.ts,
-- fixed alongside this migration) was processing a flood of
-- cross-tenant events, degrading the whole inbox — visibly slower,
-- and clicks appearing to lag/stick on stale state under the backed-up
-- render queue.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Add the column (nullable for the backfill step below).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;

-- 2. Backfill every existing row from its conversation.
UPDATE messages m
SET account_id = c.account_id
FROM conversations c
WHERE m.conversation_id = c.id
  AND m.account_id IS DISTINCT FROM c.account_id;

-- 3. Trigger to keep new rows populated automatically — INSERT never
--    has to remember to set this; it's derived from conversation_id
--    the same way the RLS policies already resolve account scope.
CREATE OR REPLACE FUNCTION set_message_account_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_id IS NULL THEN
    SELECT account_id INTO NEW.account_id FROM conversations WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_message_account_id ON messages;
CREATE TRIGGER trg_set_message_account_id
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION set_message_account_id();

-- 4. NOT NULL once every row (existing + new) is guaranteed populated.
ALTER TABLE messages ALTER COLUMN account_id SET NOT NULL;

-- 5. Index — same account-scoped query pattern every other table
--    already has (migration 036_scale_indexes.sql), plus it's what
--    makes the Realtime filter above cheap to evaluate.
CREATE INDEX IF NOT EXISTS idx_messages_account_id ON messages(account_id);
