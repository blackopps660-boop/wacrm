-- ============================================================
-- 041_contact_lifecycle_stages.sql — lightweight per-contact lifecycle stage
--
-- A single-select status per contact (New Lead, Hot Lead, Customer,
-- ...) — distinct from Pipelines/Deals, which track individual deals
-- rather than the contact's overall relationship stage. Modeled on
-- `pipeline_stages` (ordered, coloured, account-scoped) but simpler:
-- one stage per contact via a plain FK column rather than a pivot
-- table, since a contact is never in more than one stage at once.
--
-- `is_lost` groups a stage into a separate "Lost stages" bucket in the
-- UI (e.g. "Cold Lead") without needing a second table — mirrors how
-- pipelines already separate `deals.status` into open/won/lost.
--
-- Every account gets four sensible defaults seeded automatically (see
-- seed_default_lifecycle_stages below), wired into both places an
-- account gets created: handle_new_user (signup) and create_workspace
-- (self-serve, migration 031). Admins can rename/recolor/reorder/
-- delete freely afterward — the seed is just a starting point.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lifecycle_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  position INTEGER NOT NULL DEFAULT 0,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_stages_account ON lifecycle_stages(account_id);

ALTER TABLE public.lifecycle_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lifecycle_stages_select ON lifecycle_stages;
CREATE POLICY lifecycle_stages_select ON lifecycle_stages FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS lifecycle_stages_insert ON lifecycle_stages;
CREATE POLICY lifecycle_stages_insert ON lifecycle_stages FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS lifecycle_stages_update ON lifecycle_stages;
CREATE POLICY lifecycle_stages_update ON lifecycle_stages FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS lifecycle_stages_delete ON lifecycle_stages;
CREATE POLICY lifecycle_stages_delete ON lifecycle_stages FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- contacts.lifecycle_stage_id — nullable (existing contacts start
-- unassigned; ON DELETE SET NULL so removing a stage un-assigns
-- rather than blocking or cascading a contact delete).
-- ============================================================
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lifecycle_stage_id UUID REFERENCES lifecycle_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle_stage
  ON contacts(account_id, lifecycle_stage_id);

-- ============================================================
-- seed_default_lifecycle_stages(p_account_id)
--
-- Called right after a new account row is created — never called
-- standalone by the app, only from the two account-creation paths
-- below. SECURITY DEFINER since it runs inside handle_new_user
-- (trigger context, no auth.uid()) and create_workspace (already
-- SECURITY DEFINER) alike.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_default_lifecycle_stages(p_account_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO lifecycle_stages (account_id, name, color, position, is_lost)
  VALUES
    (p_account_id, 'New Lead', '#3b82f6', 0, FALSE),
    (p_account_id, 'Hot Lead', '#f97316', 1, FALSE),
    (p_account_id, 'Customer', '#10b981', 2, FALSE),
    (p_account_id, 'Cold Lead', '#6b7280', 3, TRUE);
$$;

ALTER FUNCTION public.seed_default_lifecycle_stages(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.seed_default_lifecycle_stages(UUID) FROM PUBLIC;

-- ============================================================
-- Wire the seed into both account-creation paths.
-- ============================================================

-- (1) New signup — handle_new_user (originally 017_account_sharing.sql).
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

  PERFORM public.seed_default_lifecycle_stages(v_account_id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- (2) Self-serve "Create Workspace" — create_workspace (031_account_memberships.sql).
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_new_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_name := NULLIF(TRIM(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Workspace name is required' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_name) > 80 THEN
    RAISE EXCEPTION 'Workspace name must be 80 characters or fewer' USING ERRCODE = '22023';
  END IF;

  INSERT INTO accounts (name, owner_user_id)
  VALUES (v_name, auth.uid())
  RETURNING id INTO v_new_account_id;

  INSERT INTO account_memberships (account_id, user_id, role)
  VALUES (v_new_account_id, auth.uid(), 'owner');

  UPDATE profiles
  SET account_id = v_new_account_id,
      account_role = 'owner'
  WHERE user_id = auth.uid();

  PERFORM public.seed_default_lifecycle_stages(v_new_account_id);

  RETURN v_new_account_id;
END;
$$;

ALTER FUNCTION public.create_workspace(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_workspace(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT) TO authenticated;

-- ============================================================
-- filter_contacts_by_tags gains an optional lifecycle-stage filter
-- (combined with tags via AND) so both filters can be active at once
-- on the Contacts page. Signature changed (new parameter), so the old
-- 4-arg overload is dropped explicitly rather than left dangling.
-- ============================================================
DROP FUNCTION IF EXISTS public.filter_contacts_by_tags(UUID[], TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0,
  p_lifecycle_stage_id UUID DEFAULT NULL
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (
        p_search IS NULL
        OR c.name ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
      )
      AND (p_lifecycle_stage_id IS NULL OR c.lifecycle_stage_id = p_lifecycle_stage_id)
  ),
  page AS (
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

ALTER FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, UUID) TO authenticated;
