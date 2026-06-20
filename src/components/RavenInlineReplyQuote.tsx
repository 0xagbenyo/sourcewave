import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { Colors } from '../constants/colors';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';
import { replySnippet, resolveRavenUserDisplayName, type RavenUserDisplayProfiles } from '../utils/ravenSearchPreview';
import { ravenMessageShortPreview, ravenRepliedDetailsResolvedPlainText } from '../utils/ravenMessageShortPreview';
import { formatRavenReplyQuotedDateTime } from '../utils/ravenChatUi';
import {
  classifyRavenAttachment,
  getRavenAttachmentLabel,
  resolveRavenMessageFilePaths,
} from '../utils/ravenAttachment';
import { sanitizeRavenWebMessageFileUrl } from '../utils/ravenFileUrl';
import {
  ravenMessageReplyLinkedId,
  ravenRepliedDetailsPlainText,
  ravenIsReplyMessage,
  type RavenMessageRow,
} from '../services/ravenNativeApi';

export type RavenInlineReplyQuoteVariant = 'raven' | 'wine';

type ParentVisual =
  | { kind: 'image'; uri: string }
  | { kind: 'video'; posterUri: string | null; label: string }
  | { kind: 'audio'; label: string }
  | { kind: 'file'; label: string };

function buildParentVisual(parent: RavenMessageRow | undefined): ParentVisual | null {
  if (!parent) return null;
  const { display } = resolveRavenMessageFilePaths(parent);
  if (!display) return null;
  const { kind } = classifyRavenAttachment(display, parent.message_type);
  const fullImage = sanitizeRavenWebMessageFileUrl(parent.file) || display;
  const thumb = (parent.file_thumbnail ?? '').trim();
  const thumbUri = sanitizeRavenWebMessageFileUrl(thumb) || thumb;

  if (kind === 'image') {
    return { kind: 'image', uri: fullImage };
  }
  if (kind === 'video') {
    return { kind: 'video', posterUri: thumbUri || null, label: getRavenAttachmentLabel(display) };
  }
  if (kind === 'audio') {
    return { kind: 'audio', label: 'Voice / audio clip' };
  }
  return {
    kind: 'file',
    label: getRavenAttachmentLabel(display) || getRavenAttachmentLabel(parent.file ?? '') || 'Attachment',
  };
}

type Props = {
  item: RavenMessageRow;
  mine: boolean;
  messagesById: Map<string, RavenMessageRow>;
  onScrollToQuoted: (messageId: string) => void;
  variant?: RavenInlineReplyQuoteVariant;
  userDisplayProfiles?: RavenUserDisplayProfiles;
};

export const RavenInlineReplyQuote: React.FC<Props> = ({
  item,
  mine,
  messagesById,
  onScrollToQuoted,
  variant = 'raven',
  userDisplayProfiles,
}) => {
  const isWine = variant === 'wine';
  const lid = (ravenMessageReplyLinkedId(item) ?? '').trim();
  const detailsSnippet =
    ravenRepliedDetailsResolvedPlainText(item.replied_message_details) ??
    ravenRepliedDetailsPlainText(item.replied_message_details);
  const isReply = ravenIsReplyMessage(item.is_reply);
  if (!lid && !detailsSnippet && !isReply) return null;

  const parent = lid ? messagesById.get(lid) : undefined;
  const author = parent
    ? resolveRavenUserDisplayName(parent.owner, userDisplayProfiles)
    : 'Replied message';
  const quotedTime = parent?.creation ? formatRavenReplyQuotedDateTime(parent.creation) : '';
  const parentVisual = buildParentVisual(parent);

  let textPreview = '';
  if (!parent) {
    textPreview = detailsSnippet ? replySnippet(detailsSnippet) : '';
  } else if (parentVisual && parentVisual.kind !== 'file') {
    textPreview = '';
  } else if (parentVisual?.kind === 'file') {
    textPreview = '';
  } else {
    const short = ravenMessageShortPreview(parent);
    if (short && short !== 'Message') textPreview = short;
    else if (parent.file?.trim()) textPreview = '';
  }

  const snippetFallback =
    parent && !parentVisual && !textPreview
      ? ravenMessageShortPreview(parent) || (parent.file?.trim() ? 'Attachment' : '')
      : detailsSnippet
        ? replySnippet(detailsSnippet)
        : '';

  const bodyLine =
    textPreview ||
    snippetFallback ||
    (parent && !parentVisual
      ? 'Original message is not in this window — scroll up to load older messages.'
      : isReply && !lid && !detailsSnippet
        ? 'Pull down to refresh if the quoted message still does not show.'
        : '');

  /** Raven main chat: quote sits on the light panel (not on the blue bubble) — always use dark text. Wine mine: quote is inside the wine bubble — keep light text. */
  const quoteOnColoredBubble = isWine && mine;
  const metaStyle = quoteOnColoredBubble ? styles.metaMine : isWine ? styles.metaWine : styles.metaTheirs;
  const snippetStyle = quoteOnColoredBubble ? styles.snippetMine : isWine ? styles.snippetWine : styles.snippetTheirs;
  const accentStyle = quoteOnColoredBubble ? styles.accentMine : isWine ? styles.accentWine : styles.accent;

  return (
    <Pressable
      onPress={() => {
        if (lid) onScrollToQuoted(lid);
      }}
      disabled={!lid}
      style={[
        styles.wrap,
        isWine ? styles.wrapWine : null,
        mine && isWine ? styles.wrapWineMine : null,
        mine && !isWine ? styles.wrapRavenMine : null,
        !mine && !isWine ? styles.wrapTheirs : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={lid ? 'Go to quoted message' : 'Quoted message preview'}
    >
      <View style={[styles.accent, accentStyle]} />
      <View style={styles.inner}>
        <Text style={[styles.meta, metaStyle]} numberOfLines={2}>
          {quotedTime ? `${author} | ${quotedTime}` : parent ? author : isReply ? 'Replying to a message' : author}
        </Text>

        {parentVisual?.kind === 'image' ? (
          <View style={styles.mediaRow}>
            <ErpAuthenticatedImage uri={parentVisual.uri} style={styles.thumb} resizeMode="cover" />
            <Text style={[styles.fileName, snippetStyle]} numberOfLines={2}>
              {getRavenAttachmentLabel(parent?.file ?? '') ||
                getRavenAttachmentLabel(parentVisual.uri) ||
                'Image'}
            </Text>
          </View>
        ) : null}

        {parentVisual?.kind === 'video' ? (
          <View style={styles.mediaRow}>
            {parentVisual.posterUri ? (
              <ErpAuthenticatedImage uri={parentVisual.posterUri} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.videoPh, isWine ? styles.videoPhWine : null]}>
                <Ionicons name="videocam" size={22} color={isWine ? Colors.WINE : RavenLight.accent} />
              </View>
            )}
            <Text style={[styles.fileName, snippetStyle]} numberOfLines={2}>
              {parentVisual.label || 'Video'}
            </Text>
          </View>
        ) : null}

        {parentVisual?.kind === 'audio' ? (
          <View style={styles.mediaRow}>
            <View style={[styles.thumb, styles.videoPh, isWine ? styles.videoPhWine : null]}>
              <Ionicons name="mic" size={20} color={isWine ? Colors.WINE : RavenLight.accent} />
            </View>
            <Text style={[styles.fileName, snippetStyle]} numberOfLines={1}>
              {parentVisual.label}
            </Text>
          </View>
        ) : null}

        {parentVisual?.kind === 'file' ? (
          <View style={styles.mediaRow}>
            <View style={[styles.thumb, styles.videoPh, isWine ? styles.videoPhWine : null]}>
              <Ionicons name="document-text" size={20} color={isWine ? Colors.WINE : RavenLight.textMuted} />
            </View>
            <Text style={[styles.fileName, snippetStyle]} numberOfLines={2}>
              {parentVisual.label}
            </Text>
          </View>
        ) : null}

        {bodyLine ? (
          <Text style={[styles.snippet, snippetStyle]} numberOfLines={3}>
            {bodyLine}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    backgroundColor: '#F3F3F6',
  },
  wrapTheirs: { alignSelf: 'flex-start' },
  /** Align outgoing quote to the right; keep same light gray card + dark text as incoming (card sits on panel, not on blue bubble). */
  wrapRavenMine: { alignSelf: 'flex-end', maxWidth: '88%' },
  wrapWine: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
    alignSelf: 'flex-start',
  },
  wrapWineMine: { alignSelf: 'flex-end' },
  accent: {
    width: 3,
    backgroundColor: RavenLight.textMuted,
  },
  accentMine: { backgroundColor: 'rgba(255,255,255,0.55)' },
  accentWine: { backgroundColor: Colors.WINE },
  inner: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
  },
  metaTheirs: { color: RavenLight.textMuted },
  metaMine: { color: 'rgba(255,255,255,0.88)' },
  metaWine: { color: Colors.TEXT_SECONDARY },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: RavenLight.sidebarHover,
  },
  videoPh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPhWine: { backgroundColor: '#EEE' },
  fileName: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18 },
  snippet: { marginTop: 4, fontSize: 14, lineHeight: 19 },
  snippetTheirs: { color: RavenLight.text },
  snippetMine: { color: 'rgba(255,255,255,0.92)' },
  snippetWine: { color: Colors.BLACK },
});
