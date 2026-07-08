-- Pin / mute / archive for conversations, surfaced from the mobile
-- inbox's long-press action sheet (matches migration 047's contact
-- blocking pattern — mobile-first, web can grow the same UI later).
-- Enforced/read the same way blocked_at is: plain nullable timestamp
-- columns, no new RLS needed since conversations_update (017) already
-- lets any account agent update any column on their account's rows.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS muted_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN conversations.pinned_at IS
  'When set, this conversation is pinned to the top of the inbox (ordered by this value, most recent pin first).';
COMMENT ON COLUMN conversations.muted_at IS
  'When set, push notifications for new messages in this conversation are suppressed until unmuted (NULL again). Realtime/in-app updates are unaffected.';
COMMENT ON COLUMN conversations.archived_at IS
  'When set, this conversation is hidden from the main inbox list until unarchived (NULL again) or a new message arrives.';

-- Sorting the inbox (pinned first, then by last_message_at) and
-- filtering archived conversations out of the default list are both
-- hot paths on every inbox open.
CREATE INDEX IF NOT EXISTS idx_conversations_pinned_at ON conversations(pinned_at DESC) WHERE pinned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_archived_at ON conversations(archived_at) WHERE archived_at IS NOT NULL;

-- Matches WhatsApp's own behavior: a new message (either direction —
-- inbound via the webhook, or outbound via the dashboard/mobile send
-- routes) un-archives the conversation automatically, since archiving
-- is meant to declutter a settled thread, not permanently hide an
-- active one. One trigger here covers every send/receive code path at
-- once instead of duplicating the same UPDATE in each of them.
CREATE OR REPLACE FUNCTION unarchive_conversation_on_new_message()
RETURNS trigger AS $$
BEGIN
  UPDATE conversations
  SET archived_at = NULL
  WHERE id = NEW.conversation_id AND archived_at IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS unarchive_on_new_message ON messages;
CREATE TRIGGER unarchive_on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION unarchive_conversation_on_new_message();
