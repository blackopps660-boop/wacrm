import { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/use-auth';
import { useRealtime } from '../../../hooks/use-realtime';
import { Avatar } from '../../../components/Avatar';
import { colors, spacing } from '../../../lib/theme';
import type { Conversation } from '../../../lib/types';

const PAGE_SIZE = 30;
const ROW_HEIGHT = 74;
// Same embed shape as the web app's CONVERSATION_SELECT
// (src/lib/inbox/conversations.ts), minus the tags join Phase 1
// doesn't need yet.
const CONVERSATION_SELECT = '*, contact:contacts(*)';

const ConversationRow = memo(function ConversationRow({
  item,
  onPress,
}: {
  item: Conversation;
  onPress: (id: string) => void;
}) {
  const isUnread = item.unread_count > 0;
  const label = item.contact?.name || item.contact?.phone || 'Unknown';
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(item.id)}
    >
      <Avatar label={label} seed={item.contact?.id} size={48} />
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, isUnread && styles.unreadText]} numberOfLines={1}>
            {label}
          </Text>
          {item.last_message_at && (
            <Text style={styles.time}>
              {new Date(item.last_message_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          )}
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.preview, isUnread && styles.unreadPreview]} numberOfLines={1}>
            {item.last_message_text || 'No messages yet'}
          </Text>
          {isUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

export default function InboxListScreen() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .order('last_message_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('[Inbox] fetch conversations error:', error.message);
      return;
    }
    setConversations((data as unknown as Conversation[]) ?? []);
  }, []);

  // `accountId` dependency so switching workspace (Phase 4) re-fetches
  // under the new account — tab screens stay mounted across
  // navigation, so a route change alone won't re-run this.
  useEffect(() => {
    setLoading(true);
    fetchConversations().finally(() => setLoading(false));
  }, [fetchConversations, accountId]);

  // Live updates while the list is open. A burst of several messages
  // arriving together (common right after connecting a number) would
  // otherwise trigger a full re-fetch per event; debounce collapses
  // that into a single re-fetch per ~400ms window.
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(fetchConversations, 400);
  }, [fetchConversations]);

  useEffect(() => {
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, []);

  useRealtime({
    channelName: 'mobile-inbox-list',
    onConversationEvent: scheduleRefetch,
    onMessageEvent: scheduleRefetch,
  });

  async function onRefresh() {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }

  const handlePress = useCallback(
    (id: string) => router.push(`/inbox/${id}`),
    [router],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={conversations}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No conversations yet.</Text>
        </View>
      }
      renderItem={({ item }) => <ConversationRow item={item} onPress={handlePress} />}
      getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { color: colors.textFaint },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowPressed: { backgroundColor: colors.surface },
  rowContent: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: colors.textSecondary, fontSize: 15, fontWeight: '500', flexShrink: 1 },
  unreadText: { color: colors.text, fontWeight: '700' },
  time: { color: colors.textFaint, fontSize: 11 },
  preview: { color: colors.textFaint, fontSize: 13, flex: 1, marginRight: spacing.sm },
  unreadPreview: { color: colors.textMuted },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
});
