-- Lets a workspace designate one approved template as the one-click
-- "quick re-engage" send for expired (>24h) conversations, instead of
-- always requiring the full template picker. NULL = not configured,
-- composer falls back to opening the picker as before.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS default_reengagement_template_id UUID
    REFERENCES message_templates(id) ON DELETE SET NULL;
