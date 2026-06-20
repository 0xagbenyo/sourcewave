/**
 * Raven-style attachment rendering: tap image to fullscreen, PDF in WebView with auth headers,
 * video modal with native controls, inline audio, file tap downloads (share sheet) like a real attachment.
 *
 * @see https://github.com/The-Commit-Company/raven/blob/develop/frontend/src/components/feature/chat/ChatMessage/Renderers/ImageMessage.tsx
 * @see https://github.com/The-Commit-Company/raven/blob/develop/frontend/src/components/feature/chat/ChatMessage/Renderers/FileMessage.tsx
 * @see https://github.com/The-Commit-Company/raven/blob/develop/frontend/src/utils/operations.ts
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Audio, ResizeMode, Video } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { RavenLight } from '../constants/ravenLightTheme';
import type { RavenMessageRow } from '../services/ravenNativeApi';
import { fetchErpSiteFileAsDataUri, getERPNextAuthorizationHeader } from '../services/erpnext';
import { hasFrappeRavenSession } from '../services/frappeRavenSession';
import { buildAuthenticatedErpImageSource } from '../utils/erpImageUrl';
import {
  buildAbsoluteRavenFileUrl,
  classifyRavenAttachment,
  getRavenAttachmentLabel,
  getRavenFileExtension,
  resolveRavenMessageFilePaths,
} from '../utils/ravenAttachment';
import { downloadErpFileAndShare } from '../utils/ravenDownloadAttachment';
import { sanitizeRavenWebMessageFileUrl } from '../utils/ravenFileUrl';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';
import { ErpAuthenticatedPdfWebView } from './ErpAuthenticatedPdfWebView';

export type RavenMessageAttachmentVariant = 'wine' | 'raven';

/** Row height under safe-area inset (icons + padding). */
const PDF_TOOLBAR_BASE_H = 52;

/**
 * Raven web `ImageMessage.tsx`: default inline box **300×200**; when `thumbnail_width` / `thumbnail_height`
 * exist on Raven Message, the web uses those pixel sizes (halved on mobile). We mirror with `winW < 768`.
 */
const RAVEN_CHAT_MEDIA_DEFAULT_W = 300;
const RAVEN_CHAT_MEDIA_DEFAULT_H = 200;
const RAVEN_CHAT_COMPACT_BREAKPOINT = 768;

/**
 * Inline `Video` reports full decode resolution; cap long edge before fitting so previews stay image-like.
 */
const VIDEO_INLINE_MAX_NATURAL_LONG_EDGE = 340;

/** Align with chat row long-press so users can reply to media/files. */
const REPLY_LONG_PRESS_DELAY_MS = 380;

function clampMediaLongestEdge(w: number, h: number, maxLong: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (!(long > 0) || long <= maxLong) return { w, h };
  const s = maxLong / long;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Scale image/video to fit the bubble while preserving aspect ratio. */
function fitChatMediaSize(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  if (!(naturalW > 0) || !(naturalH > 0)) {
    return { width: maxW, height: Math.min(200, maxH) };
  }
  const scale = Math.min(1, maxW / naturalW, maxH / naturalH);
  return {
    width: Math.max(1, Math.round(naturalW * scale)),
    height: Math.max(1, Math.round(naturalH * scale)),
  };
}

type Theme = {
  extBg: string;
  extText: string;
  name: string;
  border: string;
};

function themeOf(mine: boolean, variant: RavenMessageAttachmentVariant): Theme {
  if (variant === 'raven') {
    return mine
      ? {
          extBg: 'rgba(255,255,255,0.22)',
          extText: RavenLight.bubbleMineText,
          name: RavenLight.bubbleMineText,
          border: 'rgba(255,255,255,0.35)',
        }
      : {
          extBg: RavenLight.accentSoft,
          extText: RavenLight.accent,
          name: RavenLight.text,
          border: RavenLight.border,
        };
  }
  return mine
    ? {
        extBg: 'rgba(255,255,255,0.22)',
        extText: Colors.WHITE,
        name: Colors.WHITE,
        border: 'rgba(255,255,255,0.35)',
      }
    : {
        extBg: '#FCE4EC',
        extText: Colors.WINE,
        name: Colors.BLACK,
        border: '#E8E8E8',
      };
}

function extLabel(ext: string): string {
  const e = (ext || 'file').toUpperCase();
  return e.length <= 4 ? e : e.slice(0, 4);
}

function RavenAudioRow({
  streamPath,
  theme,
  onReplyLongPress,
}: {
  streamPath: string;
  theme: Theme;
  onReplyLongPress?: () => void;
}) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(
    () => () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    },
    []
  );

  const toggle = async () => {
    setBusy(true);
    try {
      if (soundRef.current) {
        const st = await soundRef.current.getStatusAsync();
        if (st.isLoaded && 'isPlaying' in st && st.isPlaying) {
          await soundRef.current.pauseAsync();
          setPlaying(false);
          return;
        }
        if (st.isLoaded && 'isPlaying' in st && !st.isPlaying) {
          await soundRef.current.playAsync();
          setPlaying(true);
          return;
        }
      }

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const src = buildAuthenticatedErpImageSource(streamPath);
      if (!src?.uri) {
        Alert.alert('Audio', 'Missing file URL.');
        return;
      }

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: src.uri, ...(src.headers ? { headers: src.headers } : {}) } as any,
        { shouldPlay: true }
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if ('didJustFinish' in status && status.didJustFinish) {
          setPlaying(false);
        }
        if ('isPlaying' in status) {
          setPlaying(!!status.isPlaying);
        }
      });
      soundRef.current = sound;
      setPlaying(true);
    } catch {
      Alert.alert('Audio', 'Could not play this file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.audioRow, { borderColor: theme.border }]}
      onPress={() => void toggle()}
      onLongPress={onReplyLongPress}
      delayLongPress={REPLY_LONG_PRESS_DELAY_MS}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause audio' : 'Play audio'}
    >
      {busy ? (
        <ActivityIndicator color={theme.extText} size="small" />
      ) : (
        <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={36} color={theme.extText} />
      )}
      <Text style={[styles.audioLabel, { color: theme.name }]} numberOfLines={1}>
        Voice / audio clip
      </Text>
    </TouchableOpacity>
  );
}

type Props = {
  item: RavenMessageRow;
  mine: boolean;
  variant: RavenMessageAttachmentVariant;
  /** Consecutive image/video from the same user — slightly smaller + tighter vertical spacing */
  mediaGroupNeighbor?: boolean;
  /** Long-press on attachment surfaces to reply (parent row long-press does not reach nested touchables). */
  onReplyLongPress?: () => void;
};

export const RavenMessageAttachmentBody: React.FC<Props> = ({
  item,
  mine,
  variant,
  mediaGroupNeighbor = false,
  onReplyLongPress,
}) => {
  const insets = useSafeAreaInsets();
  const { display, stream } = resolveRavenMessageFilePaths(item);

  const classified = useMemo(
    () =>
      display
        ? classifyRavenAttachment(display, item.message_type)
        : { ext: '', displayName: 'Attachment', kind: 'file' as const },
    [display, item.message_type]
  );
  const { ext, displayName, kind } = classified;

  const resolvedFileName = useMemo(() => {
    if (!display) return 'Attachment';
    for (const raw of [item.file, item.file_thumbnail]) {
      if (!raw?.trim()) continue;
      const label = getRavenAttachmentLabel(raw).trim();
      if (label) return label;
    }
    const fc = (displayName || '').trim();
    if (fc && fc !== 'Attachment') return fc;
    for (const p of [stream, display]) {
      if (!p?.trim()) continue;
      const label = getRavenAttachmentLabel(p).trim();
      if (label) return label;
    }
    return 'Attachment';
  }, [display, displayName, item.file, item.file_thumbnail, stream]);

  const [imagePreview, setImagePreview] = useState<{ uri: string; title: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ uri: string; title: string } | null>(null);
  const [videoPreview, setVideoPreview] = useState<{ uri: string; title: string } | null>(null);
  const [busyDownload, setBusyDownload] = useState(false);
  /** Android: expo-av posterSource ignores auth headers; load JPEG/PNG poster via axios like ErpAuthenticatedImage. */
  const [androidVideoPosterDataUri, setAndroidVideoPosterDataUri] = useState<string | null>(null);

  const fullResImageUri = sanitizeRavenWebMessageFileUrl(item.file) || display;

  const copyLinkAlert = useCallback((pathForUrl: string, title: string) => {
    const abs = buildAbsoluteRavenFileUrl(pathForUrl);
    Alert.alert(title, undefined, [
      { text: 'Copy link', onPress: () => void Clipboard.setStringAsync(abs).catch(() => {}) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const runDownload = useCallback(async (path: string, name: string) => {
    if (busyDownload) return;
    setBusyDownload(true);
    try {
      await downloadErpFileAndShare(path, name);
    } catch (e: any) {
      Alert.alert('Download', e?.message || 'Could not download this file.');
    } finally {
      setBusyDownload(false);
    }
  }, [busyDownload]);

  const videoSource = videoPreview ? buildAuthenticatedErpImageSource(videoPreview.uri) : null;

  const { width: winW, height: winH } = useWindowDimensions();
  /** Match Raven `useIsMobile`–style layout: half thumbnail dimensions on compact widths. */
  const compactChat = winW < RAVEN_CHAT_COMPACT_BREAKPOINT;
  const groupScale = mediaGroupNeighbor ? 0.86 : 1;
  const chatMediaMaxW = Math.min(winW - 48, 280) * groupScale;
  const chatMediaMaxH = Math.min(winH * 0.5, 440) * groupScale;

  const mediaRowAlign = useMemo(
    () => [styles.chatMediaRow, mine ? styles.chatMediaRowMine : styles.chatMediaRowTheirs],
    [mine]
  );

  const mediaBottomGap = mediaGroupNeighbor ? 2 : 4;

  const ravenStoredMediaSize = useMemo(() => {
    const factor = compactChat ? 0.5 : 1;
    const tw = item.thumbnail_width;
    const th = item.thumbnail_height;
    if (tw && th && tw > 0 && th > 0) {
      return { w: Math.round(tw * factor), h: Math.round(th * factor) };
    }
    return null;
  }, [compactChat, item.thumbnail_width, item.thumbnail_height]);

  const [clientImageSize, setClientImageSize] = useState<{ w: number; h: number } | null>(null);
  const [clientVideoSize, setClientVideoSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setClientImageSize(null);
    setClientVideoSize(null);
  }, [item.name]);

  useEffect(() => {
    setClientImageSize(null);
  }, [fullResImageUri]);

  useEffect(() => {
    setClientVideoSize(null);
  }, [stream]);

  const videoPosterUri = useMemo(() => {
    const thumb = (item.file_thumbnail ?? '').trim();
    if (!thumb) return null;
    const s = sanitizeRavenWebMessageFileUrl(thumb) || thumb;
    const e = getRavenFileExtension(s).toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(e)) return s;
    return null;
  }, [item.file_thumbnail]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setAndroidVideoPosterDataUri(null);
      return;
    }
    if (!videoPosterUri) {
      setAndroidVideoPosterDataUri(null);
      return;
    }
    const src = buildAuthenticatedErpImageSource(videoPosterUri);
    if (!src?.uri) {
      setAndroidVideoPosterDataUri(null);
      return;
    }
    const low = src.uri.toLowerCase();
    if (!low.includes('/files/')) {
      setAndroidVideoPosterDataUri(null);
      return;
    }
    let auth: string | undefined;
    try {
      auth = getERPNextAuthorizationHeader();
    } catch {
      auth = undefined;
    }
    const needBinary = !!(src.headers?.Authorization || (hasFrappeRavenSession() && !auth));
    if (!needBinary) {
      setAndroidVideoPosterDataUri(null);
      return;
    }
    let cancelled = false;
    void fetchErpSiteFileAsDataUri(src.uri).then((d) => {
      if (cancelled) return;
      setAndroidVideoPosterDataUri(d);
    });
    return () => {
      cancelled = true;
    };
  }, [videoPosterUri]);

  const inlineVideoSource = useMemo(() => buildAuthenticatedErpImageSource(stream), [stream]);

  const imageNaturalForFit = useMemo(() => {
    if (ravenStoredMediaSize) return ravenStoredMediaSize;
    if (clientImageSize) return clientImageSize;
    return { w: RAVEN_CHAT_MEDIA_DEFAULT_W, h: RAVEN_CHAT_MEDIA_DEFAULT_H };
  }, [ravenStoredMediaSize, clientImageSize]);

  const videoNaturalForFit = useMemo(() => {
    if (ravenStoredMediaSize) return ravenStoredMediaSize;
    if (clientVideoSize) {
      return clampMediaLongestEdge(
        clientVideoSize.w,
        clientVideoSize.h,
        VIDEO_INLINE_MAX_NATURAL_LONG_EDGE
      );
    }
    return { w: RAVEN_CHAT_MEDIA_DEFAULT_W, h: RAVEN_CHAT_MEDIA_DEFAULT_H };
  }, [ravenStoredMediaSize, clientVideoSize]);

  const imageChatSize = useMemo(
    () => fitChatMediaSize(imageNaturalForFit.w, imageNaturalForFit.h, chatMediaMaxW, chatMediaMaxH),
    [imageNaturalForFit, chatMediaMaxW, chatMediaMaxH]
  );

  /** Same width cap as images; shorter max height so inline video stays smaller than tall photos. */
  const chatMediaMaxHVideo = Math.min(chatMediaMaxH, 260);

  const videoChatSize = useMemo(
    () => fitChatMediaSize(videoNaturalForFit.w, videoNaturalForFit.h, chatMediaMaxW, chatMediaMaxHVideo),
    [videoNaturalForFit, chatMediaMaxW, chatMediaMaxHVideo]
  );

  if (!display) return null;

  const t = themeOf(mine, variant);
  const closeIcon = variant === 'raven' ? RavenLight.textMuted : Colors.TEXT_SECONDARY;
  const accent = variant === 'raven' ? RavenLight.accent : Colors.WINE;

  const blocks: React.ReactNode[] = [];

  if (kind === 'image') {
    blocks.push(
      <View key="img" style={mediaRowAlign}>
        <Pressable
          onPress={() => setImagePreview({ uri: fullResImageUri, title: resolvedFileName })}
          onLongPress={onReplyLongPress}
          delayLongPress={REPLY_LONG_PRESS_DELAY_MS}
          accessibilityRole="imagebutton"
          accessibilityLabel="View image full screen"
        >
          <ErpAuthenticatedImage
            uri={fullResImageUri}
            style={[
              styles.messageImage,
              variant === 'raven' && styles.messageImageMessenger,
              { width: imageChatSize.width, height: imageChatSize.height, marginBottom: mediaBottomGap },
            ]}
            resizeMode="contain"
            onLoad={
              ravenStoredMediaSize
                ? undefined
                : ({ width, height }) => setClientImageSize({ w: width, h: height })
            }
          />
        </Pressable>
      </View>
    );
  } else if (kind === 'video') {
    const posterAuth = videoPosterUri ? buildAuthenticatedErpImageSource(videoPosterUri) : null;
    const videoPosterResolved =
      Platform.OS === 'android' && androidVideoPosterDataUri
        ? { uri: androidVideoPosterDataUri }
        : posterAuth?.uri
          ? {
              uri: posterAuth.uri,
              ...(posterAuth.headers ? { headers: posterAuth.headers } : {}),
            }
          : undefined;
    blocks.push(
      <Pressable
        key="vid"
        style={mediaRowAlign}
        onPress={() => setVideoPreview({ uri: stream, title: resolvedFileName })}
        onLongPress={onReplyLongPress}
        delayLongPress={REPLY_LONG_PRESS_DELAY_MS}
        accessibilityRole="button"
        accessibilityLabel="Play video"
      >
        <View
          style={[
            styles.videoInlineWrap,
            variant === 'raven' && styles.videoInlineWrapMessenger,
            { width: videoChatSize.width, height: videoChatSize.height, marginBottom: mediaBottomGap },
          ]}
        >
          {inlineVideoSource?.uri ? (
            <Video
              source={{
                uri: inlineVideoSource.uri,
                headers: inlineVideoSource.headers as Record<string, string> | undefined,
              }}
              style={{ width: videoChatSize.width, height: videoChatSize.height }}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isMuted
              isLooping={false}
              useNativeControls={false}
              usePoster={!!videoPosterResolved}
              posterSource={videoPosterResolved}
              onReadyForDisplay={(evt) => {
                if (ravenStoredMediaSize) return;
                const ns = evt.naturalSize;
                let nw = ns.width;
                let nh = ns.height;
                if (ns.orientation === 'portrait' && nw > nh) {
                  nw = ns.height;
                  nh = ns.width;
                } else if (ns.orientation === 'landscape' && nh > nw) {
                  nw = ns.height;
                  nh = ns.width;
                }
                setClientVideoSize({ w: nw, h: nh });
              }}
            />
          ) : null}
          <View style={styles.videoPlayOverlay} pointerEvents="none">
            <Ionicons name="play-circle" size={42} color="rgba(255,255,255,0.92)" />
          </View>
        </View>
      </Pressable>
    );
  } else if (kind === 'audio') {
    blocks.push(
      <View key="aud" style={mediaRowAlign}>
        <RavenAudioRow streamPath={stream} theme={t} onReplyLongPress={onReplyLongPress} />
      </View>
    );
  } else if (kind === 'pdf') {
    if (variant === 'raven') {
      blocks.push(
        <View
          key="pdf"
          style={[
            styles.messengerFileCard,
            mine ? styles.messengerFileCardMine : styles.messengerFileCardTheirs,
          ]}
        >
          <Pressable
            style={styles.messengerPdfPreviewHit}
            onPress={() => setPdfPreview({ uri: stream, title: resolvedFileName })}
            onLongPress={onReplyLongPress}
            delayLongPress={REPLY_LONG_PRESS_DELAY_MS}
            accessibilityRole="button"
            accessibilityLabel="View PDF"
          >
            <Ionicons name="document-text" size={22} color="#E5484D" style={{ marginRight: 8 }} />
            <Text style={styles.messengerFileName} numberOfLines={2}>
              {resolvedFileName}
            </Text>
          </Pressable>
          <TouchableOpacity
            style={styles.messengerDownloadBtn}
            onPress={() => void runDownload(stream, resolvedFileName)}
            disabled={busyDownload}
            accessibilityLabel="Download PDF"
          >
            {busyDownload ? (
              <ActivityIndicator color={RavenLight.messengerEyeIcon} size="small" />
            ) : (
              <Ionicons name="download-outline" size={20} color={RavenLight.messengerEyeIcon} />
            )}
          </TouchableOpacity>
        </View>
      );
    } else {
      blocks.push(
        <Pressable
          key="pdf"
          style={[styles.fileRow, mine && styles.fileRowMine, { borderColor: t.border }]}
          onPress={() => setPdfPreview({ uri: stream, title: resolvedFileName })}
          onLongPress={() => {
            if (onReplyLongPress) onReplyLongPress();
            else copyLinkAlert(stream, resolvedFileName);
          }}
          delayLongPress={REPLY_LONG_PRESS_DELAY_MS}
          accessibilityRole="button"
          accessibilityLabel="View PDF"
        >
          <View style={[styles.extBadge, { backgroundColor: t.extBg }]}>
            <Text style={[styles.extText, { color: t.extText }]}>{extLabel(ext)}</Text>
          </View>
          <Text style={[styles.fileName, { color: t.name }]} numberOfLines={2}>
            {resolvedFileName}
          </Text>
          <Ionicons name="document-text" size={20} color={t.extText} />
        </Pressable>
      );
    }
  } else {
    if (variant === 'raven') {
      const excelish = ['xlsx', 'xls', 'xlsm', 'csv', 'ods'].includes(ext.toLowerCase());
      blocks.push(
        <View
          key="file"
          style={[
            styles.messengerFileCard,
            mine ? styles.messengerFileCardMine : styles.messengerFileCardTheirs,
          ]}
        >
          <Pressable
            style={styles.messengerFileTitleRow}
            onLongPress={onReplyLongPress}
            delayLongPress={REPLY_LONG_PRESS_DELAY_MS}
          >
            <Ionicons
              name="document-text"
              size={22}
              color={excelish ? '#217346' : RavenLight.textMuted}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.messengerFileName} numberOfLines={2}>
              {resolvedFileName}
            </Text>
          </Pressable>
          <TouchableOpacity
            style={styles.messengerDownloadBtn}
            onPress={() => void runDownload(stream, resolvedFileName)}
            disabled={busyDownload}
            accessibilityLabel="Download file"
          >
            {busyDownload ? (
              <ActivityIndicator color={RavenLight.messengerEyeIcon} size="small" />
            ) : (
              <Ionicons name="download-outline" size={20} color={RavenLight.messengerEyeIcon} />
            )}
          </TouchableOpacity>
        </View>
      );
    } else {
      blocks.push(
        <Pressable
          key="file"
          style={[styles.fileRow, mine && styles.fileRowMine, { borderColor: t.border }]}
          onPress={() => void runDownload(stream, resolvedFileName)}
          onLongPress={() => {
            if (onReplyLongPress) onReplyLongPress();
            else copyLinkAlert(stream, resolvedFileName);
          }}
          delayLongPress={REPLY_LONG_PRESS_DELAY_MS}
          accessibilityRole="button"
          accessibilityLabel="Download file"
        >
          <View style={[styles.extBadge, { backgroundColor: t.extBg }]}>
            <Text style={[styles.extText, { color: t.extText }]}>{extLabel(ext)}</Text>
          </View>
          <Text style={[styles.fileName, { color: t.name }]} numberOfLines={2}>
            {resolvedFileName}
          </Text>
          {busyDownload ? (
            <ActivityIndicator color={t.extText} />
          ) : (
            <Ionicons name="download-outline" size={22} color={t.extText} />
          )}
        </Pressable>
      );
    }
  }

  return (
    <>
      {blocks}

      <Modal visible={!!imagePreview} transparent animationType="fade" onRequestClose={() => setImagePreview(null)}>
        <View style={[styles.mediaModalRoot, { paddingTop: Math.max(insets.top, 8) }]}>
          <View style={styles.mediaModalTopBar}>
            <Text style={styles.mediaModalTitle} numberOfLines={1}>
              {imagePreview?.title}
            </Text>
            <TouchableOpacity
              onPress={() => setImagePreview(null)}
              style={styles.mediaModalCloseBtn}
              accessibilityLabel="Close"
            >
              <Ionicons name="close-circle" size={40} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.mediaModalBody}>
            <View style={styles.mediaModalBodyInner} pointerEvents="box-none">
              {imagePreview ? (
                <ErpAuthenticatedImage
                  uri={imagePreview.uri}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!pdfPreview}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setPdfPreview(null)}
      >
        <View style={styles.pdfRoot}>
          <View style={[styles.pdfWebShell, { paddingTop: PDF_TOOLBAR_BASE_H + Math.max(insets.top, 12) }]}>
            {pdfPreview?.uri ? (
              <ErpAuthenticatedPdfWebView resourceUri={pdfPreview.uri} style={styles.webView} />
            ) : null}
          </View>
          <View
            style={[
              styles.pdfToolbarOverlay,
              {
                paddingTop: Math.max(insets.top, 12) + 4,
                minHeight: PDF_TOOLBAR_BASE_H + Math.max(insets.top, 12) + 4,
              },
            ]}
            collapsable={false}
          >
            <TouchableOpacity
              onPress={() => setPdfPreview(null)}
              style={styles.pdfToolbarIcon}
              accessibilityLabel="Close PDF"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-down-circle" size={34} color={closeIcon} />
            </TouchableOpacity>
            <Text style={styles.pdfTitle} numberOfLines={1}>
              {pdfPreview?.title}
            </Text>
            <TouchableOpacity
              onPress={() => pdfPreview && void runDownload(pdfPreview.uri, pdfPreview.title)}
              style={styles.pdfToolbarIcon}
              disabled={busyDownload}
              accessibilityLabel="Download PDF"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {busyDownload ? (
                <ActivityIndicator color={accent} size="small" />
              ) : (
                <Ionicons name="download-outline" size={26} color={accent} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPdfPreview(null)}
              style={styles.pdfToolbarIcon}
              accessibilityLabel="Close"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={28} color={closeIcon} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!videoPreview} transparent animationType="fade" onRequestClose={() => setVideoPreview(null)}>
        <View style={[styles.mediaModalRoot, { paddingTop: Math.max(insets.top, 8) }]}>
          <View style={styles.mediaModalTopBar}>
            <Text style={styles.mediaModalTitle} numberOfLines={1}>
              {videoPreview?.title}
            </Text>
            <TouchableOpacity
              onPress={() => setVideoPreview(null)}
              style={styles.mediaModalCloseBtn}
              accessibilityLabel="Close"
            >
              <Ionicons name="close-circle" size={40} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.mediaModalBody}>
            <View style={styles.videoModalInner} pointerEvents="box-none">
              {videoSource?.uri ? (
                <Video
                  style={styles.videoPlayer}
                  source={{
                    uri: videoSource.uri,
                    headers: videoSource.headers as Record<string, string> | undefined,
                  }}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  chatMediaRow: {
    maxWidth: '100%',
  },
  chatMediaRowTheirs: {
    alignSelf: 'flex-start',
  },
  chatMediaRowMine: {
    alignSelf: 'flex-end',
  },
  messageImage: {
    borderRadius: 12,
    backgroundColor: '#EEE',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
    maxWidth: '100%',
  },
  fileRowMine: {
    alignSelf: 'flex-end',
  },
  extBadge: {
    minWidth: 40,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extText: { fontSize: 11, fontWeight: '800' },
  fileName: { flex: 1, fontSize: 14, fontWeight: '600' },
  videoInlineWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
    maxWidth: '100%',
  },
  audioLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  mediaModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  mediaModalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 50,
    elevation: 50,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  mediaModalTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginRight: 8,
  },
  mediaModalCloseBtn: { padding: 4 },
  mediaModalBody: { flex: 1 },
  mediaModalBodyInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  fullImage: {
    width: '100%',
    flex: 1,
    minHeight: 200,
    backgroundColor: 'transparent',
  },
  pdfRoot: { flex: 1, backgroundColor: Colors.WHITE },
  pdfWebShell: {
    flex: 1,
    backgroundColor: Colors.WHITE,
  },
  pdfToolbarOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    zIndex: 1000,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  pdfToolbarIcon: { padding: 8 },
  pdfTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.BLACK,
    marginHorizontal: 4,
  },
  webView: { flex: 1, backgroundColor: Colors.WHITE },
  videoModalInner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  videoPlayer: {
    width: '100%',
    minHeight: 220,
    maxHeight: 420,
    backgroundColor: '#000',
  },
  messageImageMessenger: {
    borderRadius: 8,
  },
  videoInlineWrapMessenger: {
    borderRadius: 8,
  },
  messengerFileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    minWidth: 200,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: RavenLight.messengerFileBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.messengerFileBorder,
  },
  messengerFileCardMine: {
    alignSelf: 'flex-end',
  },
  messengerFileCardTheirs: {
    alignSelf: 'flex-start',
  },
  messengerFileTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: 8,
  },
  messengerPdfPreviewHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: 8,
    paddingVertical: 2,
  },
  messengerFileName: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    color: RavenLight.text,
  },
  messengerDownloadBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: RavenLight.messengerEyeBtnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
