// Tracks which conversation thread (if any) is currently the focused
// screen, so a push notification for that exact conversation can be
// suppressed while the user is already looking at it live — matches
// WhatsApp's own behavior (no banner for the chat you're actively in;
// the realtime INSERT + in-app receive sound already cover it).
let activeConversationId: string | null = null;

export function setActiveConversationId(id: string | null) {
  activeConversationId = id;
}

export function getActiveConversationId(): string | null {
  return activeConversationId;
}
