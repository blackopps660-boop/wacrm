// Single source of truth for the mobile app's visual language. Every
// screen should pull from here instead of hardcoding hex values, so a
// palette/spacing change only has to happen in one place.

export const colors = {
  // Backgrounds
  bg: '#020617',
  surface: '#0f172a',
  surfaceRaised: '#141e33',
  border: '#1e293b',
  borderStrong: '#334155',

  // Text
  text: '#f8fafc',
  textSecondary: '#e2e8f0',
  textMuted: '#94a3b8',
  textFaint: '#64748b',

  // Brand
  primary: '#7c3aed',
  primaryMuted: 'rgba(124,58,237,0.15)',
  accent: '#a78bfa',

  // Chart / secondary accent
  info: '#38bdf8',

  // Status
  success: '#4ade80',
  successMuted: '#86efac',
  danger: '#f87171',
  dangerMuted: '#fca5a5',
  dangerBg: 'rgba(239,68,68,0.1)',
  dangerBorder: 'rgba(239,68,68,0.3)',

  white: '#ffffff',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
  avatar: 999,
} as const;

export const typography = {
  title: { fontSize: 22, fontWeight: '700' as const },
  heading: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '400' as const },
};

export const avatarPalette = [
  '#7c3aed',
  '#38bdf8',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#f43f5e',
  '#8b5cf6',
] as const;

/** Deterministic color for an avatar based on a stable id/name, so the same contact always gets the same color. */
export function colorForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return avatarPalette[Math.abs(hash) % avatarPalette.length];
}
