import { useCallback, useEffect, useRef, useState } from 'react';
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
import { supabase, apiFetch } from '../../../lib/supabase';
import { useRealtime } from '../../../hooks/use-realtime';
import type { Message } from '../../../lib/types';

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
        <ActivityIndicator color="#a78bfa" />
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
        renderItem={({ item }) => {
          const isAgent = item.sender_type === 'agent' || item.sender_type === 'bot';
          return (
            <View
              style={[
                styles.bubbleRow,
                isAgent ? styles.bubbleRowAgent : styles.bubbleRowCustomer,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  isAgent ? styles.bubbleAgent : styles.bubbleCustomer,
                ]}
              >
                <Text style={isAgent ? styles.bubbleTextAgent : styles.bubbleTextCustomer}>
                  {item.content_text || `[${item.content_type}]`}
                </Text>
                {item.status === 'failed' && (
                  <Text style={styles.failedText}>
                    Failed{item.error_message ? `: ${item.error_message}` : ''}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
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
          placeholderTextColor="#64748b"
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (!text.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 12, gap: 6 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowAgent: { justifyContent: 'flex-end' },
  bubbleRowCustomer: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleAgent: {
    backgroundColor: '#3f3a52',
    borderBottomRightRadius: 4,
  },
  bubbleCustomer: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
  },
  bubbleTextAgent: { color: '#f1f0f7' },
  bubbleTextCustomer: { color: '#e2e8f0' },
  failedText: { color: '#fca5a5', fontSize: 11, marginTop: 4 },
  errorBar: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  errorBarText: { color: '#fca5a5', fontSize: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#f8fafc',
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#fff', fontWeight: '600' },
});
