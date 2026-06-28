import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { reactToRavenMessage, type RavenMessageRow } from '../services/ravenNativeApi';
import { applyOptimisticRavenReaction } from '../utils/ravenMessageReactions';
import type { RavenMessageActionExtras } from '../components/RavenMessageActionSheet';

export function useRavenMessageActions(
  setMessages: Dispatch<SetStateAction<RavenMessageRow[]>>,
  currentUserId: string | null | undefined,
  onReplyTo?: (msg: RavenMessageRow) => void
) {
  const [actionsMessage, setActionsMessage] = useState<RavenMessageRow | null>(null);
  const [actionsExtras, setActionsExtras] = useState<RavenMessageActionExtras | null>(null);
  const [forwardMessage, setForwardMessage] = useState<RavenMessageRow | null>(null);

  const openMessageActions = useCallback((msg: RavenMessageRow, extras?: RavenMessageActionExtras) => {
    setActionsMessage(msg);
    setActionsExtras(extras ?? null);
  }, []);

  const closeMessageActions = useCallback(() => {
    setActionsMessage(null);
    setActionsExtras(null);
  }, []);

  const onActionReply = useCallback(() => {
    if (actionsMessage) onReplyTo?.(actionsMessage);
    closeMessageActions();
  }, [actionsMessage, onReplyTo, closeMessageActions]);

  const onActionForward = useCallback(() => {
    if (actionsMessage) setForwardMessage(actionsMessage);
    closeMessageActions();
  }, [actionsMessage, closeMessageActions]);

  const toggleReaction = useCallback(
    async (message: RavenMessageRow, emoji: string) => {
      const uid = String(currentUserId || '').trim();
      const messageId = String(message.name || '').trim();
      const reaction = String(emoji || '').trim();
      if (!uid || !messageId || !reaction) return;

      let previousReactions: string | undefined;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.name !== messageId) return m;
          previousReactions = m.message_reactions;
          return {
            ...m,
            message_reactions: applyOptimisticRavenReaction(m.message_reactions, reaction, uid),
          };
        })
      );

      try {
        await reactToRavenMessage(messageId, reaction);
      } catch {
        if (previousReactions !== undefined) {
          setMessages((prev) =>
            prev.map((m) =>
              m.name === messageId ? { ...m, message_reactions: previousReactions } : m
            )
          );
        }
      }
    },
    [currentUserId, setMessages]
  );

  const onActionReact = useCallback(
    (emoji: string) => {
      if (!actionsMessage) return;
      void toggleReaction(actionsMessage, emoji);
      closeMessageActions();
    },
    [actionsMessage, toggleReaction, closeMessageActions]
  );

  return {
    actionsMessage,
    actionsExtras,
    forwardMessage,
    setForwardMessage,
    openMessageActions,
    closeMessageActions,
    onActionReply,
    onActionForward,
    onActionReact,
    toggleReaction,
  };
}
