-- Accurate, stable counts for the Inbox's status tabs and Stage/Tag
-- filter chips — a single real aggregate query per account instead of
-- counting over whatever page of conversations happened to be loaded
-- client-side. That client-side approach (still in use as of migration
-- 053) is why the same chip showed a different number on every reload:
-- the "loaded page" is a shifting window (most-recent-N by
-- last_message_at) that changes as new messages arrive, so a count
-- over it isn't a real total, it's a sample that happens to fluctuate.
--
-- SECURITY DEFINER + is_account_member() gate, same pattern as every
-- other cross-tenant-capable RPC in this schema (see
-- switch_current_account / close_inactive_conversations) — callers
-- pass their own account_id, verified against auth.uid() server-side
-- before any row is touched.
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
        WHERE account_id = p_account_id AND status = 'closed'
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

ALTER FUNCTION get_inbox_counts(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_inbox_counts(UUID) TO authenticated, service_role;
