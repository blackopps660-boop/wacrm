'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// ============================================================
// Meta WhatsApp Embedded Signup — the "Login with Meta / Register
// Number" flow (mirrors respond.io's onboarding), replacing manual
// entry of phone_number_id / WABA ID / access token.
//
// Two independent async signals have to both arrive before we can
// call our backend:
//   1. `FB.login()`'s callback — gives us an OAuth `code`.
//   2. A `window.postMessage` from the Meta signup iframe — gives us
//      the `phone_number_id` / `waba_id` Meta just created for this
//      business, which never appears in the `code` itself.
// Whichever resolves second triggers the exchange POST.
//
// Requires env vars (see .env.local.example):
//   NEXT_PUBLIC_META_APP_ID
//   NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID  (created in the Meta
//     App dashboard under WhatsApp > Embedded Signup > Configurations)
//   META_APP_SECRET (server-side only, already used elsewhere)
// Meta App Review approval for the whatsapp_business_management scope
// is required before this works for anyone but the app's own admins/
// testers — that approval is entirely on Meta's side, not something
// this code can complete.
// ============================================================

declare global {
  interface Window {
    FB?: {
      init: (config: { appId: string; version: string; xfbml?: boolean }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

interface FacebookLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface EmbeddedSignupSessionData {
  phone_number_id?: string;
  waba_id?: string;
  business_id?: string;
}

type Stage = 'loading_sdk' | 'ready' | 'in_progress' | 'exchanging' | 'success' | 'error';

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID;

export default function WhatsappEmbeddedSignupPage() {
  const searchParams = useSearchParams();
  const bearerToken = searchParams.get('token');
  const isMobile = searchParams.get('mobile') === '1';

  const [stage, setStage] = useState<Stage>(META_APP_ID ? 'loading_sdk' : 'error');
  const [error, setError] = useState<string | null>(
    META_APP_ID ? null : 'NEXT_PUBLIC_META_APP_ID is not configured.',
  );
  const codeRef = useRef<string | null>(null);
  const sessionDataRef = useRef<EmbeddedSignupSessionData | null>(null);

  const attemptExchange = useCallback(async () => {
    if (!codeRef.current || !sessionDataRef.current?.phone_number_id) return;
    setStage('exchanging');
    try {
      const res = await fetch('/api/whatsapp/embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
        body: JSON.stringify({
          code: codeRef.current,
          phone_number_id: sessionDataRef.current.phone_number_id,
          waba_id: sessionDataRef.current.waba_id,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.error || body.success === false) {
        setError(body.error || body.registration_error || 'Failed to connect WhatsApp');
        setStage('error');
        return;
      }
      setStage('success');
      if (isMobile) {
        // Hands control back to the app — expo-web-browser's
        // openAuthSessionAsync watches for this scheme and auto-closes.
        setTimeout(() => {
          window.location.href = 'blinkmoon://whatsapp-connected';
        }, 1200);
      } else if (window.opener) {
        // Web flow: this page is a popup opened from the Settings page
        // (see whatsapp-config.tsx) — tell it to refresh, then close.
        window.opener.postMessage({ type: 'whatsapp-embedded-signup-success' }, window.location.origin);
        setTimeout(() => window.close(), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect WhatsApp');
      setStage('error');
    }
  }, [bearerToken, isMobile]);

  // Load the Facebook JS SDK once. The missing-config case is handled
  // by the useState initializers above (this effect just needs to not
  // run at all in that case, without calling setState synchronously).
  useEffect(() => {
    if (!META_APP_ID) return;
    const initFacebookSdk = () => {
      window.FB?.init({ appId: META_APP_ID, version: 'v23.0', xfbml: false });
      setStage('ready');
    };
    window.fbAsyncInit = initFacebookSdk;
    if (document.getElementById('facebook-jssdk')) {
      // Already injected by a previous mount (fast refresh / nav back) —
      // defer so this still goes through a microtask rather than
      // calling setState synchronously in the effect body.
      if (window.FB) queueMicrotask(initFacebookSdk);
      return;
    }
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Listen for Meta's embedded signup session-info postMessage — this
  // is the only place phone_number_id/waba_id ever appear.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.origin !== 'https://www.facebook.com' &&
        event.origin !== 'https://web.facebook.com'
      ) {
        return;
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.event === 'FINISH') {
          sessionDataRef.current = data.data as EmbeddedSignupSessionData;
          attemptExchange();
        }
      } catch {
        // Not a JSON message we care about (Meta's SDK posts a few
        // unrelated message shapes on the same channel) — ignore.
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [attemptExchange]);

  function handleConnect() {
    if (!window.FB || !CONFIG_ID) {
      setError('Embedded signup is not configured yet (missing configuration ID).');
      setStage('error');
      return;
    }
    setStage('in_progress');
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setError('Meta signup was cancelled or did not return an authorization code.');
          setStage('error');
          return;
        }
        codeRef.current = code;
        attemptExchange();
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: '3' },
      },
    );
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7c3aed]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 5h4" />
          <path d="M20 3v4" />
          <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-slate-50">Connect WhatsApp</h1>
      <p className="mt-2 text-sm text-slate-400">
        Register your WhatsApp Business number directly through Meta — no need to copy tokens or
        IDs by hand.
      </p>

      {stage === 'error' && error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-left text-sm text-red-300">
          {error}
        </div>
      )}

      {stage === 'success' ? (
        <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          WhatsApp connected successfully.
          {isMobile ? ' Returning to the app…' : ' You can close this tab.'}
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={stage === 'loading_sdk' || stage === 'in_progress' || stage === 'exchanging'}
          className="mt-6 w-full rounded-lg bg-[#7c3aed] px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {stage === 'loading_sdk' && 'Loading…'}
          {stage === 'ready' && 'Continue with Meta'}
          {stage === 'in_progress' && 'Waiting for Meta…'}
          {stage === 'exchanging' && 'Connecting…'}
          {stage === 'error' && 'Try again'}
        </button>
      )}
    </div>
  );
}
