import { useCallback, useEffect, useRef, useState, memo } from 'react';
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

export default function MessageThreadScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

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
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      } else if (event.eventType === 'UPDATE') {
        setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
      }
    },
  });

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversationId,
          message_type: 'text',
          content_text: trimmed,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSendError(body.error || 'Failed to send message');
        return;
      }
      setText('');
      // The real row lands via realtime; no optimistic insert needed
      // for this phase since Meta's round-trip is typically sub-second.
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => <MessageBubble item={item} />}
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
            (!text.trim() || sending) && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Ionicons name="send" size={17} color={colors.white} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: spacing.md, gap: 6 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowAgent: { justifyContent: 'flex-end' },
  bubbleRowCustomer: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleAgent: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
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
