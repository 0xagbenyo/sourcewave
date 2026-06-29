import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the jump-to-message blue accent stays visible. */
export const CHAT_MESSAGE_JUMP_HIGHLIGHT_MS = 1200;

export function useChatMessageJumpHighlight() {
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashMessageHighlight = useCallback((messageId: string) => {
    const id = String(messageId || '').trim();
    if (!id) return;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedMessageId(id);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimerRef.current = null;
    }, CHAT_MESSAGE_JUMP_HIGHLIGHT_MS);
  }, []);

  const isMessageHighlighted = useCallback(
    (messageId: string | undefined | null) => {
      const id = String(messageId || '').trim();
      return id.length > 0 && id === highlightedMessageId;
    },
    [highlightedMessageId]
  );

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    []
  );

  return { flashMessageHighlight, isMessageHighlighted, highlightedMessageId };
}
