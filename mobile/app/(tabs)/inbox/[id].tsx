import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, apiFetch } from '../../../lib/supabase';
import { useRealtime } from '../../../hooks/use-realtime';
import { colors, radius, spacing } from '../../../lib/theme';
import type { Message } from '../../../lib/types';

// A message still in flight — rendered immediately on send so the UI
// never waits on the Meta round-trip before showing feedback (matches
// WhatsApp's own "sent locally, then confirmed" feel). Reconciled away
// once the real row lands via realtime (see the INSERT handler below).
interface PendingMessage {
  tempId: string;
  content: string;
  createdAt: string;
  failed: boolean;
}

type ListItem =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'message'; id: string; message: Message }
  | { kind: 'pending'; id: string; pending: PendingMessage };

function dateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

const MessageBubble = memo(function MessageBubble({ item }: { item: Message }) {
  const isAgent = item.sender_type === 'agent' || item.sender_type === 'bot';
  return (
    <View style={[styles.bubbleRow, isAgent ? styles.bubbleRowAgent : styles.bubbleRowCustomer]}>
      <View style={[styles.bubble, isAgent ? styles.bubbleAgent : styles.bubbleCustomer]}>
        <Text style={isAgent ? styles.bubbleTextAgent : styles.bubbleTextCustomer}>
          {item.content_text || `[${item.content_type}]`}
        </Text>
        <View style={styles.bubbleFooter}>
          <Text style={isAgent ? styles.bubbleTimeAgent : styles.bubbleTimeCustomer}>
            {new Date(item.created_at).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          {isAgent && item.status && (
            <Ionicons
              name={
                item.status === 'failed'
                  ? 'alert-circle'
                  : item.status === 'read'
                    ? 'checkmark-done'
                    : item.status === 'delivered'
                      ? 'checkmark-done'
                      : 'checkmark'
              }
              size={13}
              color={
                item.status === 'failed'
                  ? colors.dangerMuted
                  : item.status === 'read'
                    ? colors.info
                    : 'rgba(255,255,255,0.7)'
              }
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
        {item.status === 'failed' && (
          <Text style={styles.failedText}>Failed{item.error_message ? `: ${item.error_message}` : ''}</Text>
        )}
      </View>
    </View>
  );
});

const PendingBubble = memo(function PendingBubble({ pending }: { pending: PendingMessage }) {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowAgent]}>
      <View style={[styles.bubble, styles.bubbleAgent, pending.failed && styles.bubbleFailed]}>
        <Text style={styles.bubbleTextAgent}>{pending.content}</Text>
        <View style={styles.bubbleFooter}>
          {pending.failed ? (
            <Ionicons name="alert-circle" size={13} color={colors.dangerMuted} />
          ) : (
            <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.6)" />
          )}
        </View>
        {pending.failed && <Text style={styles.failedText}>Failed to send — tap to retry</Text>}
      </View>
    </View>
  );
});

const DateSeparator = memo(function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.dateSeparator}>
      <Text style={styles.dateSeparatorText}>{label}</Text>
    </View>
  );
});

export default function MessageThreadScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ListItem>>(null);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('[Thread] fetch messages error:', error.message);
      return;
    }
    setMessages((data as Message[]) ?? []);
  }, [conversationId]);

  // Load thread + contact name for the header, mark read on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchMessages();
      if (cancelled) return;
      setLoading(false);

      const { data: conv } = await supabase
        .from('conversations')
        .select('unread_count, contact:contacts(name, phone)')
        .eq('id', conversationId)
        .maybeSingle();

      if (cancelled) return;
      const contact = conv?.contact as unknown as
        | { name?: string; phone?: string }
        | null;
      navigation.setOptions({ title: contact?.name || contact?.phone || 'Conversation' });

      if (conv && conv.unread_count > 0) {
        await supabase
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('id', conversationId);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useRealtime({
    channelName: `mobile-thread-${conversationId}`,
    onMessageEvent: (event) => {
      const row = event.new as Message;
      if (row.conversation_id !== conversationId) return;
      if (event.eventType === 'INSERT') {
        setMessages((prev) =>
          prev.some((m) => m.id === row.id) ? prev : [...prev, row],
        );
        // The real row arrived — drop the oldest matching pending
        // bubble so we don't show the same text twice.
        if (row.sender_type === 'agent' || row.sender_type === 'bot') {
          setPending((prev) => {
            const idx = prev.findIndex((p) => p.content === row.content_text);
            if (idx === -1) return prev;
            return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
          });
        }
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      } else if (event.eventType === 'UPDATE') {
        setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
      }
    },
  });

  async function sendText(content: string, replacePendingId?: string) {
    setSendError(null);
    try {
      const res = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversationId,
          message_type: 'text',
          content_text: content,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSendError(body.error || 'Failed to send message');
        setPending((prev) =>
          prev.map((p) =>
            p.tempId === replacePendingId || (!replacePendingId && p.content === content)
              ? { ...p, failed: true }
              : p,
          ),
        );
        return;
      }
      // Success: the real row lands via realtime and reconciles the
      // pending bubble away (see onMessageEvent above). Nothing to do
      // here — leaving the pending bubble in place briefly is fine,
      // it's visually identical to the real one until it's replaced.
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message');
      setPending((prev) =>
        prev.map((p) => (p.tempId === replacePendingId ? { ...p, failed: true } : p)),
      );
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPending((prev) => [
      ...prev,
      { tempId, content: trimmed, createdAt: new Date().toISOString(), failed: false },
    ]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    void sendText(trimmed, tempId);
  }

  function retryPending(item: PendingMessage) {
    setPending((prev) => prev.map((p) => (p.tempId === item.tempId ? { ...p, failed: false } : p)));
    void sendText(item.content, item.tempId);
  }

  // Flattens messages + in-flight pending bubbles into one list with
  // WhatsApp-style date separators inserted between day boundaries.
  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    let lastDay: string | null = null;
    for (const m of messages) {
      const day = dateLabel(m.created_at);
      if (day !== lastDay) {
        items.push({ kind: 'date', id: `date-${day}-${m.id}`, label: day });
        lastDay = day;
      }
      items.push({ kind: 'message', id: m.id, message: m });
    }
    for (const p of pending) {
      items.push({ kind: 'pending', id: p.tempId, pending: p });
    }
    return items;
  }, [messages, pending]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={listRef}
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          if (item.kind === 'date') return <DateSeparator label={item.label} />;
          if (item.kind === 'pending') {
            return (
              <Pressable
                onPress={() => item.pending.failed && retryPending(item.pending)}
                disabled={!item.pending.failed}
              >
                <PendingBubble pending={item.pending} />
              </Pressable>
            );
          }
          return <MessageBubble item={item.message} />;
        }}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
      />

      {sendError && (
        <View style={styles.errorBar}>
          <Text style={styles.errorBarText}>{sendError}</Text>
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Type a message…"
          placeholderTextColor={colors.textFaint}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            !text.trim() && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <Ionicons name="send" size={17} color={colors.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: spacing.md, gap: 6 },
  dateSeparator: { alignItems: 'center', marginVertical: spacing.sm },
  dateSeparatorText: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowAgent: { justifyContent: 'flex-end' },
  bubbleRowCustomer: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleAgent: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleFailed: { opacity: 0.6 },
  bubbleCustomer: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleTextAgent: { color: colors.white, fontSize: 15 },
  bubbleTextCustomer: { color: colors.textSecondary, fontSize: 15 },
  bubbleFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3 },
  bubbleTimeAgent: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  bubbleTimeCustomer: { color: colors.textFaint, fontSize: 10 },
  failedText: { color: colors.dangerMuted, fontSize: 11, marginTop: 4 },
  errorBar: {
    backgroundColor: colors.dangerBg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  errorBarText: { color: colors.dangerMuted, fontSize: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm + 2,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: { opacity: 0.85 },
  sendButtonDisabled: { opacity: 0.5 },
});
