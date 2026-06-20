import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import {
  listSharedAttachmentsInChannel,
  type RavenSharedChatAttachment,
} from '../services/ravenNativeApi';
import { classifyRavenAttachment, getRavenAttachmentLabel } from '../utils/ravenAttachment';
import { formatMessageHeaderTime } from '../utils/ravenChatUi';
import { resolveRavenUserDisplayName, type RavenUserDisplayProfiles } from '../utils/ravenSearchPreview';

export type RavenSharedInChatListVariant = 'raven' | 'wine';

type Props = {
  /** When false, list is cleared and no fetch runs. */
  active: boolean;
  channelId: string | null | undefined;
  variant?: RavenSharedInChatListVariant;
  /** Close menu and scroll the open chat to this message. */
  onGoToMessage: (messageName: string) => void;
  userDisplayProfiles?: RavenUserDisplayProfiles;
};

function attachmentIconName(kind: string): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'image':
      return 'image-outline';
    case 'video':
      return 'videocam-outline';
    case 'audio':
      return 'musical-notes-outline';
    case 'pdf':
      return 'document-text-outline';
    default:
      return 'attach-outline';
  }
}

export const RavenSharedInChatList: React.FC<Props> = ({
  active,
  channelId,
  variant = 'raven',
  onGoToMessage,
  userDisplayProfiles,
}) => {
  const wine = variant === 'wine';
  const text = wine ? Colors.BLACK : RavenLight.text;
  const textMuted = wine ? Colors.TEXT_SECONDARY : RavenLight.textMuted;
  const accent = wine ? Colors.WINE : RavenLight.accent;
  const border = wine ? '#E8E8E8' : RavenLight.border;

  const [items, setItems] = useState<RavenSharedChatAttachment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = channelId?.trim();
    if (!active || !id) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listSharedAttachmentsInChannel(id)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, channelId]);

  const onRowPress = useCallback(
    (row: RavenSharedChatAttachment) => {
      const id = String(row.messageName || '').trim();
      if (!id) return;
      onGoToMessage(id);
    },
    [onGoToMessage]
  );

  if (!channelId?.trim()) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionTitle, { color: text }]}>Shared in this chat</Text>
        {loading ? <ActivityIndicator size="small" color={accent} /> : null}
      </View>
      <Text style={[styles.hint, { color: textMuted }]}>
        Photos, videos, PDFs, and other files posted in this conversation. Tap to jump to that message in the chat.
      </Text>
      {loading && items.length === 0 ? (
        <Text style={[styles.empty, { color: textMuted }]}>Loading attachments…</Text>
      ) : items.length === 0 ? (
        <Text style={[styles.empty, { color: textMuted }]}>No files shared in this chat yet.</Text>
      ) : (
        items.map((row) => {
          const { kind } = classifyRavenAttachment(row.file, row.message_type);
          const label = getRavenAttachmentLabel(row.file) || 'Attachment';
          const when = formatMessageHeaderTime(row.creation);
          const who = resolveRavenUserDisplayName(row.owner, userDisplayProfiles);
          return (
            <TouchableOpacity
              key={`${row.messageName}-${row.file}`}
              style={[styles.row, { borderBottomColor: border }]}
              onPress={() => onRowPress(row)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: wine ? '#FCE4EC' : RavenLight.accentSoft }]}>
                <Ionicons name={attachmentIconName(kind)} size={20} color={accent} />
              </View>
              <View style={styles.rowMain}>
                <Text style={[styles.fileName, { color: text }]} numberOfLines={2}>
                  {label}
                </Text>
                <Text style={[styles.meta, { color: textMuted }]} numberOfLines={1}>
                  {[when, who].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={textMuted} accessibilityLabel="Go to message" />
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: Spacing.SM,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.SM,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: Spacing.MD,
    paddingBottom: 10,
  },
  empty: {
    fontSize: 13,
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.SM,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.MD,
    marginHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    marginTop: 2,
  },
});
