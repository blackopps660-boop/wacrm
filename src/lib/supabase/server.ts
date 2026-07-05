import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

/**
 * Same RLS-scoped client as createClient(), but also accepts a mobile
 * client's `Authorization: Bearer <token>` header as an alternative to
 * cookies — React Native has no browser cookie jar to carry the SSR
 * session in. Falls back to the cookie path when no bearer token is
 * present, so every existing web caller (which never sends this header)
 * is completely unaffected.
 *
 * Returns `bearerToken` alongside the client so callers can pass it to
 * `supabase.auth.getUser(bearerToken)` — passing `undefined` there (the
 * cookie-mode case) is equivalent to calling `getUser()` with no
 * argument, so one call site works for both auth paths.
 */
export async function createClientForRequest(request: Request) {
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (bearerToken) {
    const supabase = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${bearerToken}` },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )
    return { supabase, bearerToken }
  }

  return { supabase: await createClient(), bearerToken: undefined }
}
