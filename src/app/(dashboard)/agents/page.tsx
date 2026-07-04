'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bot,
  Loader2,
  Plus,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiConfig } from '@/components/settings/ai-config';
import { useCan } from '@/hooks/use-can';

interface AgentSummary {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic';
  model: string;
  isActive: boolean;
  autoReplyEnabled: boolean;
  isDefault: boolean;
}

type EditorTab = 'playground' | 'setup';

export default function AgentsPage() {
  const canEditSettings = useCan('edit-settings');

  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [settingDefault, setSettingDefault] = useState(false);

  // null selectedAgentId + editing=true means "creating a new agent".
  const [editing, setEditing] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>('playground');

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/agents');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setAgents(Array.isArray(data.agents) ? data.agents : []);
      else toast.error(data.error ?? 'Failed to load agents');
    } catch {
      toast.error('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  function openAgent(id: string) {
    setSelectedAgentId(id);
    setTab('playground');
    setEditing(true);
  }

  function openCreate() {
    setSelectedAgentId(null);
    setTab('setup');
    setEditing(true);
  }

  function backToList() {
    setEditing(false);
    void fetchAgents();
  }

  async function handleSetDefault(agentId: string) {
    setSettingDefault(true);
    try {
      const res = await fetch('/api/ai/agents/default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Default agent updated.');
        await fetchAgents();
      } else {
        toast.error(data.error ?? 'Failed to set default agent');
      }
    } catch {
      toast.error('Failed to set default agent');
    } finally {
      setSettingDefault(false);
    }
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;
  const defaultAgentId = agents.find((a) => a.isDefault)?.id ?? null;

  if (editing) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={backToList}
            className="text-muted-foreground"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All agents
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {selectedAgent?.name ?? (selectedAgentId ? 'Agent' : 'New agent')}
          </h1>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as EditorTab)} className="mt-6">
          <TabsList>
            <TabsTrigger value="playground">
              <Sparkles className="mr-1.5 h-4 w-4" /> Playground
            </TabsTrigger>
            <TabsTrigger value="setup">
              <Settings2 className="mr-1.5 h-4 w-4" /> Setup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="playground" className="mt-4">
            <AiPlayground
              agentId={selectedAgentId}
              onGoToSetup={() => setTab('setup')}
            />
          </TabsContent>

          <TabsContent value="setup" className="mt-4">
            <AiConfig
              agentId={selectedAgentId}
              isDefault={selectedAgentId ? selectedAgentId === defaultAgentId : true}
              onSaved={(id) => {
                setSelectedAgentId(id);
                void fetchAgents();
              }}
              onDeleted={backToList}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Bot className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          AI Agents
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Your bring-your-own-key AI agents — set one up, then test it in the
        Playground before it replies to customers in the inbox. Create
        several for different roles; pick one as the default.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {agents.length > 0 && canEditSettings && (
            <Card className="mt-6">
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Default agent
                  </p>
                  <p className="text-xs text-muted-foreground">
                    New conversations, auto-reply, and the inbox draft button
                    all use this one.
                  </p>
                </div>
                <Select
                  value={defaultAgentId ?? undefined}
                  onValueChange={(v) => v && void handleSetDefault(v)}
                  disabled={settingDefault}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue>
                      {(v: string) => agents.find((a) => a.id === v)?.name ?? 'None'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => openAgent(agent.id)}
                className="text-left"
              >
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Bot className="h-4 w-4 text-primary" />
                        {agent.name}
                      </CardTitle>
                      {agent.isDefault && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Default
                        </span>
                      )}
                    </div>
                    <CardDescription>
                      {agent.provider === 'openai' ? 'OpenAI' : 'Anthropic'} ·{' '}
                      {agent.model}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          agent.isActive
                            ? 'inline-flex items-center gap-1 text-primary'
                            : 'inline-flex items-center gap-1 text-muted-foreground'
                        }
                      >
                        <span
                          className={
                            agent.isActive
                              ? 'size-1.5 rounded-full bg-primary'
                              : 'size-1.5 rounded-full bg-muted-foreground'
                          }
                        />
                        {agent.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {agent.autoReplyEnabled && (
                        <span className="text-muted-foreground">
                          · Auto-reply on
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}

            {canEditSettings && (
              <button onClick={openCreate} className="text-left">
                <Card className="flex h-full min-h-32 items-center justify-center border-dashed transition-colors hover:border-primary/50">
                  <CardContent className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                    <Plus className="h-5 w-5" />
                    <span className="text-sm font-medium">Create AI Agent</span>
                  </CardContent>
                </Card>
              </button>
            )}
          </div>

          {agents.length === 0 && !canEditSettings && (
            <p className="mt-6 text-sm text-muted-foreground">
              No AI agents configured yet. Ask an admin to set one up.
            </p>
          )}
        </>
      )}
    </div>
  );
}
