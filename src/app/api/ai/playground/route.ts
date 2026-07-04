import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadAiConfig, loadDefaultAiConfig, hasAnyActionEnabled } from '@/lib/ai/config'
import { retrieveKnowledge } from '@/lib/ai/knowledge'
import { runAgentTurn } from '@/lib/ai/agent'
import { buildSystemPrompt } from '@/lib/ai/defaults'
import { latestUserMessage } from '@/lib/ai/query'
import { AiError, type ChatMessage } from '@/lib/ai/types'

// Keep the tested transcript bounded, mirroring the live context window.
const MAX_TURNS = 20

/**
 * POST /api/ai/playground  (agent+)
 *
 * Test-chat with one of the account's agents WITHOUT touching WhatsApp.
 * Runs the exact same path the auto-reply bot uses — knowledge-base
 * retrieval + `auto_reply` system prompt + the configured provider —
 * so what you see here is what a real customer would get. Reads the
 * config even when the master switch is off (requireActive:false) so
 * you can try it before going live. Stateless: the client sends the
 * running transcript each turn.
 *
 * Body: { messages, agent_id? } — `agent_id` picks which agent to
 * test (an account can have several since migration 043); omitted
 * falls back to the account's default agent, preserving the original
 * single-agent behaviour.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const limit = checkRateLimit(`ai-playground:${userId}`, RATE_LIMITS.aiDraft)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    const rawMessages = Array.isArray(body?.messages) ? body.messages : null
    if (!rawMessages) {
      return NextResponse.json({ error: 'messages is required' }, { status: 400 })
    }
    const agentId = typeof body?.agent_id === 'string' ? body.agent_id : null

    const messages: ChatMessage[] = rawMessages
      .filter(
        (m: unknown): m is ChatMessage =>
          !!m &&
          typeof m === 'object' &&
          ((m as ChatMessage).role === 'user' ||
            (m as ChatMessage).role === 'assistant') &&
          typeof (m as ChatMessage).content === 'string' &&
          (m as ChatMessage).content.trim().length > 0,
      )
      .slice(-MAX_TURNS)

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'Send a message to test the agent.' },
        { status: 400 },
      )
    }

    const config = await (agentId
      ? loadAiConfig(supabase, accountId, agentId, { requireActive: false })
      : loadDefaultAiConfig(supabase, accountId, { requireActive: false })
    ).catch((err) => {
      console.error('[ai/playground] load config error:', err)
      throw new AiError('Stored API key could not be decrypted.', {
        code: 'key_decrypt_failed',
        status: 400,
      })
    })
    if (!config) {
      return NextResponse.json(
        {
          error: 'No agent configured yet. Add your provider key in Setup.',
          code: 'ai_not_configured',
        },
        { status: 400 },
      )
    }

    const knowledge = await retrieveKnowledge(
      supabase,
      accountId,
      config,
      latestUserMessage(messages),
    )
    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
      hasActions: hasAnyActionEnabled(config.actions),
    })

    // No real contact/conversation in the Playground — `runAgentTurn`
    // still shows the model any enabled actions (so the transcript
    // behaves like production) but every tool call is simulated, never
    // written to real data.
    const { text, handoff } = await runAgentTurn({
      config,
      systemPrompt,
      messages,
      db: supabase,
      accountId,
    })
    return NextResponse.json({ reply: text, handoff })
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      )
    }
    return toErrorResponse(err)
  }
}
