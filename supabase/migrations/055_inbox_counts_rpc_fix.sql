-- Corrects get_inbox_counts (migration 054):
--   - adds `active` (open+pending, non-archived) for web's Active tab
--     badge — distinct from `all`, which mobile's flat "All" pill uses
--     and deliberately includes closed conversations.
--   - `closed` now excludes archived_at, matching the dedicated
--     fetches on both platforms (.eq('status','closed').is('archived_at', null))
--     — a conversation that's both closed and archived belongs only in
--     Archived, not double-counted into Closed too.
CREATE OR REPLACE FUNCTION get_inbox_counts(p_account_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT is_account_member(p_account_id) THEN NULL
    ELSE json_build_object(
      'all', (
        SELECT count(*) FROM conversations
        WHERE account_id = p_account_id AND archived_at IS NULL
      ),
      'active', (
        SELECT count(*) FROM conversations
        WHERE account_id = p_account_id AND archived_at IS NULL AND status != 'closed'
      ),
      'unread', (
        SELECT count(*) FROM conversations
        WHERE account_id = p_account_id AND archived_at IS NULL AND unread_count > 0
      ),
      'open', (
        SELECT count(*) FROM conversations
        WHERE account_id = p_account_id AND archived_at IS NULL AND status = 'open'
      ),
      'pending', (
        SELECT count(*) FROM conversations
        WHERE account_id = p_account_id AND archived_at IS NULL AND status = 'pending'
      ),
      'closed', (
        SELECT count(*) FROM conversations
        WHERE account_id = p_account_id AND archived_at IS NULL AND status = 'closed'
      ),
      'archived', (
        SELECT count(*) FROM conversations
        WHERE account_id = p_account_id AND archived_at IS NOT NULL
      ),
      'stages', (
        SELECT COALESCE(json_object_agg(stage_id, cnt), '{}'::json)
        FROM (
          SELECT c.lifecycle_stage_id AS stage_id, count(*) AS cnt
          FROM conversations conv
          JOIN contacts c ON c.id = conv.contact_id
          WHERE conv.account_id = p_account_id
            AND conv.archived_at IS NULL
            AND c.lifecycle_stage_id IS NOT NULL
          GROUP BY c.lifecycle_stage_id
        ) s
      ),
      'tags', (
        SELECT COALESCE(json_object_agg(tag_id, cnt), '{}'::json)
        FROM (
          SELECT ct.tag_id, count(DISTINCT conv.id) AS cnt
          FROM conversations conv
          JOIN contact_tags ct ON ct.contact_id = conv.contact_id
          WHERE conv.account_id = p_account_id
            AND conv.archived_at IS NULL
          GROUP BY ct.tag_id
        ) t
      )
    )
  END;
$$;
