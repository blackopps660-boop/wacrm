-- ============================================================
-- Workspace lock
--
-- Protects a workspace's name from accidental edits. This is
-- deliberately NOT a suspend/freeze — messaging, login, and every
-- other feature keep working while locked. It only gates the
-- rename path in PATCH /api/account (src/app/api/account/route.ts),
-- same admin+ tier that can rename in the first place.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;
