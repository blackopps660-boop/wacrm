-- "Delete for Me" from the mobile chat's tap-to-select action bar.
--
-- WhatsApp's own "Delete for Everyone" unsends a message using the
-- consumer app's client protocol between devices — the Cloud API
-- businesses integrate against has no equivalent endpoint, so there is
-- no way to actually remove a message from the customer's phone via
-- this app. This column only supports the "Delete for Me" half: hiding
-- a message from this account's own inbox view without touching
-- anything on the customer's side.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN messages.deleted_at IS
  'When set, this message is hidden from the account''s own inbox view ("Delete for Me"). Purely local — WhatsApp gives businesses no API to unsend/recall a message from the customer''s device, so there is no "delete for everyone" here.';

CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at) WHERE deleted_at IS NOT NULL;
