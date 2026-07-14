"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, Conversation } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface RealtimeEvent<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: Partial<T>;
}

interface UseRealtimeOptions {
  channelName: string;
  onMessageEvent?: (event: RealtimeEvent<Message>) => void;
  onConversationEvent?: (event: RealtimeEvent<Conversation>) => void;
  /** Postgres row filter (e.g. `account_id=eq.<id>` or
   *  `conversation_id=eq.<id>`) — scopes the subscription server-side
   *  instead of receiving every row in the table, for every account on
   *  the whole instance, and discarding almost all of it client-side.
   *  Always pass this; an unfiltered subscription here means a single
   *  open inbox tab re-processes every message/conversation change for
   *  every tenant, which is fine with a handful of test rows and falls
   *  over once real WhatsApp traffic is flowing (the flood of events
   *  backs up React's render queue badly enough that clicks appear to
   *  do nothing / show stale state — this is the mobile app's already-
   *  fixed version of this same hook, ported back here). */
  messagesFilter?: string;
  conversationsFilter?: string;
  enabled?: boolean;
}

export function useRealtime({
  channelName,
  onMessageEvent,
  onConversationEvent,
  messagesFilter,
  conversationsFilter,
  enabled = true,
}: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Store latest callbacks in refs to avoid re-subscribing when the
  // parent re-renders with fresh closures. Assigned inside an effect
  // so the mutation doesn't happen during render (React 19's refs
  // rule) — subscribers only read `.current` inside async Realtime
  // callbacks, which always run after the render that updates it.
  const onMessageRef = useRef(onMessageEvent);
  const onConversationRef = useRef(onConversationEvent);
  useEffect(() => {
    onMessageRef.current = onMessageEvent;
    onConversationRef.current = onConversationEvent;
  });

  useEffect(() => {
    if (!enabled) return;
    // Neither handler passed — nothing to subscribe to.
    if (!onMessageRef.current && !onConversationRef.current) return;

    const supabase = createClient();
    let channel = supabase.channel(channelName);

    // Only subscribe to a table when a caller actually handles it — the
    // thread view only cares about `messages`, so it never needs to
    // receive (and discard) every `conversations` row change too.
    if (onMessageRef.current) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          ...(messagesFilter ? { filter: messagesFilter } : {}),
        },
        (payload) => {
          onMessageRef.current?.({
            eventType: payload.eventType as RealtimeEvent<Message>["eventType"],
            new: payload.new as Message,
            old: payload.old as Partial<Message>,
          });
        }
      );
    }

    if (onConversationRef.current) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          ...(conversationsFilter ? { filter: conversationsFilter } : {}),
        },
        (payload) => {
          onConversationRef.current?.({
            eventType: payload.eventType as RealtimeEvent<Conversation>["eventType"],
            new: payload.new as Conversation,
            old: payload.old as Partial<Conversation>,
          });
        }
      );
    }

    channel.subscribe((status) => {
      setIsConnected(status === "SUBSCRIBED");
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [channelName, enabled, messagesFilter, conversationsFilter]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return { isConnected, unsubscribe };
}
