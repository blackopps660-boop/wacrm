import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

/**
 * POST /api/ai/agents/default  (admin+)
 *
 * Body: { agent_id } — set which agent auto-reply, the webhook's
 * new-conversation routing, and inbox draft use. Scoped to the
 * caller's account by construction: the update's WHERE clause requires
 * the agent row to belong to this account, so a foreign id just
 * matches zero rows rather than adopting someone else's agent.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const body = await request.json().catch(() => null)
    const agentId = typeof body?.agent_id === 'string' ? body.agent_id : null
    if (!agentId) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    }

    const { data: agent } = await supabase
      .from('ai_configs')
      .select('id')
      .eq('id', agentId)
      .eq('account_id', accountId)
      .maybeSingle()
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('accounts')
      .update({ default_ai_config_id: agentId })
      .eq('id', accountId)
    if (error) {
      console.error('[ai/agents/default POST] update error:', error)
      return NextResponse.json({ error: 'Failed to set default agent' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
