-- ============================================================
-- 043_multiple_ai_agents.sql — multiple named AI agents per workspace
--
-- ai_configs was UNIQUE(account_id) — exactly one AI setup per
-- workspace, like whatsapp_config. This lifts that: an account can now
-- have several independently-configured agents (different name,
-- provider, model, prompt, actions), and picks one as the "default" —
-- the one auto-reply, the webhook's new-conversation routing, and the
-- inbox draft button actually use. Mirrors how whatsapp_config's own
-- UNIQUE(user_id) was dropped in 017 for the same reason (single- to
-- multi- tenancy), reusing the exact same dynamic-constraint-lookup
-- pattern from 014_message_templates_meta_integration.sql so this
-- doesn't depend on guessing Postgres's auto-generated constraint name.
--
-- Knowledge base / embeddings stay account-wide (ai_knowledge_documents
-- is keyed by account_id, not agent) — only the *default* agent's
-- embeddings key is used for ingestion/retrieval; a non-default agent's
-- embeddings_api_key column is simply unused. Documented in code, not
-- worth a schema constraint for what is fundamentally a UI concern.
--
-- Backward-compatible for every existing account: each one has exactly
-- one ai_configs row today, which becomes name='Default Agent' (column
-- default — Postgres backfills it for existing rows) and is pointed to
-- by the new accounts.default_ai_config_id, so auto-reply/draft/
-- webhook routing behave identically immediately after this migration.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Drop the one-per-account UNIQUE constraint, discovered dynamically
-- rather than assuming its auto-generated name.
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'ai_configs'::regclass
    AND contype = 'u'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute
       WHERE attrelid = 'ai_configs'::regclass AND attname = 'account_id')
    ];
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_configs DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.ai_configs
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Default Agent';

-- The UNIQUE constraint above also served as an index; replace it with
-- a plain one now that lookups are "all agents for this account" (a
-- list), not "the one row for this account".
CREATE INDEX IF NOT EXISTS idx_ai_configs_account ON ai_configs(account_id);

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS default_ai_config_id UUID REFERENCES ai_configs(id) ON DELETE SET NULL;

-- Backfill: every account's existing (only) agent becomes its default.
UPDATE accounts a
SET default_ai_config_id = ac.id
FROM ai_configs ac
WHERE ac.account_id = a.id
  AND a.default_ai_config_id IS NULL;
