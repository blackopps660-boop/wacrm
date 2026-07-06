import { NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { saveWhatsappConfig } from '@/lib/whatsapp/save-config'

// ============================================================
// POST /api/whatsapp/embedded-signup
//
// Exchanges the `code` Meta's Embedded Signup JS SDK hands back
// (see src/app/whatsapp-embedded-signup/page.tsx) for a long-lived
// access token, then runs it through the exact same
// verify -> encrypt -> register -> subscribe -> persist pipeline the
// manual-entry form uses (saveWhatsappConfig) — this route only
// replaces *how* the credentials are obtained, not what happens once
// we have them.
//
// Requires META_APP_ID + META_APP_SECRET (already used elsewhere for
// the Resumable Upload API / webhook signature verification) and a
// WhatsApp Embedded Signup configuration created in the Meta App
// dashboard (Meta App > WhatsApp > Embedded Signup > Configurations),
// whose ID must be set as NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID.
// Advanced Access for whatsapp_business_management additionally
// requires Meta App Review before this works for non-admin testers.
// ============================================================

let _adminClient: ReturnType<typeof createAdminClient> | null = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}

async function exchangeCodeForUserToken(code: string): Promise<string> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('META_APP_ID / META_APP_SECRET are not configured on the server.')
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  })
  const res = await fetch(`https://graph.facebook.com/v23.0/oauth/access_token?${params}`)
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(body?.error?.message || 'Failed to exchange embedded signup code for a token')
  }
  return body.access_token as string
}

async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId!,
    client_secret: appSecret!,
    fb_exchange_token: shortLivedToken,
  })
  const res = await fetch(`https://graph.facebook.com/v23.0/oauth/access_token?${params}`)
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(body?.error?.message || 'Failed to obtain a long-lived access token')
  }
  return body.access_token as string
}

export async function POST(request: Request) {
  try {
    const { supabase, bearerToken } = await createClientForRequest(request)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(bearerToken)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => null)
    const { code, phone_number_id, waba_id } = body ?? {}

    if (typeof code !== 'string' || !code) {
      return NextResponse.json({ error: 'Missing embedded signup code' }, { status: 400 })
    }
    if (typeof phone_number_id !== 'string' || !phone_number_id) {
      return NextResponse.json(
        { error: 'Missing phone_number_id from the embedded signup session' },
        { status: 400 },
      )
    }

    let longLivedToken: string
    try {
      const shortLived = await exchangeCodeForUserToken(code)
      longLivedToken = await exchangeForLongLivedToken(shortLived)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error exchanging code'
      console.error('[embedded-signup] token exchange failed:', message)
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const result = await saveWhatsappConfig(supabase, supabaseAdmin(), {
      accountId,
      userId: user.id,
      phoneNumberId: phone_number_id,
      wabaId: waba_id ?? null,
      accessToken: longLivedToken,
      // No verify_token/PIN in the embedded signup flow — subscribe
      // covers webhook delivery, and Embedded Signup numbers don't
      // expose a 2FA PIN the way manual production numbers do.
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    if (!result.success) {
      return NextResponse.json({
        success: false,
        registration_error: result.registrationError,
        phone_info: result.phoneInfo,
      })
    }
    return NextResponse.json({
      success: true,
      registered: result.registered,
      phone_info: result.phoneInfo,
    })
  } catch (error) {
    console.error('[embedded-signup] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
