'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Route-group error boundary for everything under the dashboard shell
 * (Inbox, Flows, Automations, Settings, ...). Before this file existed,
 * ANY render-phase throw anywhere in the dashboard — a bad node config
 * in the Flows builder, a null-deref in some settings panel, whatever —
 * took down the whole page with Next.js's generic root "This page
 * couldn't load" full-navigation failure, with zero trace of what
 * actually broke. This turns that into a scoped, recoverable fallback
 * that stays on the same route and — critically — logs the real error
 * to the console instead of swallowing it, so the next crash is
 * diagnosable from a screenshot instead of guesswork.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError] caught:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="size-10 text-amber-400" />
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Something went wrong on this page
        </h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error.message || 'An unexpected error occurred.'}
        </p>
      </div>
      <Button
        onClick={reset}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <RotateCcw className="size-4" />
        Try again
      </Button>
    </div>
  );
}
