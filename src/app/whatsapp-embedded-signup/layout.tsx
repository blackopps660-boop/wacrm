// Dedicated full-bleed layout, same rationale as /join/layout.tsx: this
// page must work for a Bearer-token mobile session with no cookie jar
// at all, so it can't reuse (dashboard)'s cookie-gated layout — and it
// shouldn't look like a dashboard page anyway, since Meta's embedded
// signup popup is meant to feel like a focused, single-purpose flow.

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Connect WhatsApp — BlinkMoon',
  robots: { index: false, follow: false },
};

export default function EmbeddedSignupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020617] px-4">
      {children}
    </div>
  );
}
