// Ported from src/lib/auth/roles.ts (web app) — pure, no I/O, no
// framework coupling, so it's copied verbatim rather than re-derived.
// Mirrors the `account_role_enum` Postgres type from migration
// 017_account_sharing.sql.

export type AccountRole = 'owner' | 'admin' | 'agent' | 'viewer';

export const ACCOUNT_ROLES: readonly AccountRole[] = [
  'viewer',
  'agent',
  'admin',
  'owner',
] as const;

export function roleRank(role: AccountRole): number {
  switch (role) {
    case 'owner':
      return 4;
    case 'admin':
      return 3;
    case 'agent':
      return 2;
    case 'viewer':
      return 1;
  }
}

export function hasMinRole(role: AccountRole, min: AccountRole): boolean {
  return roleRank(role) >= roleRank(min);
}

export function isAccountRole(value: unknown): value is AccountRole {
  return (
    typeof value === 'string' &&
    (ACCOUNT_ROLES as readonly string[]).includes(value)
  );
}

export function canManageMembers(role: AccountRole): boolean {
  return hasMinRole(role, 'admin');
}

export function canEditSettings(role: AccountRole): boolean {
  return hasMinRole(role, 'admin');
}

export function canSendMessages(role: AccountRole): boolean {
  return hasMinRole(role, 'agent');
}

export function canViewOnly(role: AccountRole): boolean {
  return role === 'viewer';
}
