import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// decrypt is identity in tests so we don't depend on real ciphertext.
vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (v: string) => `plain:${v}`,
}))

import { loadAiConfig, loadDefaultAiConfig, listAiConfigs } from './config'

/** A minimal fake client: `accounts` queries return `account`,
 *  `ai_configs` single-row queries return `configRow`, and the list
 *  query (no `.maybeSingle()`) returns `configRows`. */
function fakeDb(opts: {
  account?: { default_ai_config_id: string | null } | null
  configRow?: Record<string, unknown> | null
  configRows?: Record<string, unknown>[]
}): SupabaseClient {
  const db = {
    from: (table: string) => {
      if (table === 'accounts') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => Promise.resolve({ data: opts.account ?? null, error: null }),
        }
        return chain
      }
      // ai_configs
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () =>
          Promise.resolve({ data: opts.configRows ?? [], error: null }),
        maybeSingle: () => Promise.resolve({ data: opts.configRow ?? null, error: null }),
      }
      return chain
    },
  }
  return db as unknown as SupabaseClient
}

const ROW = {
  id: 'agent-1',
  name: 'Support Bot',
  provider: 'openai',
  model: 'gpt-x',
  api_key: 'enc-key',
  system_prompt: null,
  is_active: false,
  auto_reply_enabled: false,
  auto_reply_max_per_conversation: 3,
  embeddings_api_key: null,
}

describe('loadAiConfig requireActive', () => {
  it('returns null for an inactive config by default', async () => {
    const db = fakeDb({ configRow: ROW })
    expect(await loadAiConfig(db, 'acct', 'agent-1')).toBeNull()
  })

  it('returns the config when requireActive is false (Playground path)', async () => {
    const db = fakeDb({ configRow: ROW })
    const config = await loadAiConfig(db, 'acct', 'agent-1', {
      requireActive: false,
    })
    expect(config).not.toBeNull()
    expect(config!.id).toBe('agent-1')
    expect(config!.name).toBe('Support Bot')
    expect(config!.provider).toBe('openai')
    expect(config!.apiKey).toBe('plain:enc-key')
  })

  it('returns null when there is no row', async () => {
    const db = fakeDb({ configRow: null })
    expect(
      await loadAiConfig(db, 'acct', 'agent-1', { requireActive: false }),
    ).toBeNull()
  })
})

describe('loadDefaultAiConfig', () => {
  it('returns null when the account has no default agent set', async () => {
    const db = fakeDb({ account: { default_ai_config_id: null } })
    expect(await loadDefaultAiConfig(db, 'acct')).toBeNull()
  })

  it('resolves through accounts.default_ai_config_id to the right agent', async () => {
    const db = fakeDb({
      account: { default_ai_config_id: 'agent-1' },
      configRow: { ...ROW, is_active: true },
    })
    const config = await loadDefaultAiConfig(db, 'acct')
    expect(config?.id).toBe('agent-1')
  })
})

describe('listAiConfigs', () => {
  it('flags exactly the account default among several agents', async () => {
    const db = fakeDb({
      account: { default_ai_config_id: 'agent-2' },
      configRows: [
        { id: 'agent-1', name: 'A', provider: 'openai', model: 'gpt-x', is_active: true, auto_reply_enabled: false, created_at: '2024-01-02' },
        { id: 'agent-2', name: 'B', provider: 'anthropic', model: 'claude-x', is_active: false, auto_reply_enabled: true, created_at: '2024-01-01' },
      ],
    })
    const list = await listAiConfigs(db, 'acct')
    expect(list).toEqual([
      { id: 'agent-1', name: 'A', provider: 'openai', model: 'gpt-x', isActive: true, autoReplyEnabled: false, isDefault: false },
      { id: 'agent-2', name: 'B', provider: 'anthropic', model: 'claude-x', isActive: false, autoReplyEnabled: true, isDefault: true },
    ])
  })

  it('returns an empty list, none flagged default, when the account has no agents', async () => {
    const db = fakeDb({ account: { default_ai_config_id: null }, configRows: [] })
    expect(await listAiConfigs(db, 'acct')).toEqual([])
  })
})
