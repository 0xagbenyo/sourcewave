import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
  RefreshControl,
  Linking,
  Alert,
  AppState,
  type AppStateStatus,
  Image,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useOptionalBottomTabBarHeight } from '../hooks/useOptionalBottomTabBarHeight';
import { useKeyboardInsets } from '../hooks/useKeyboardOpen';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { useRavenUnread } from '../context/RavenUnreadContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildRavenUrlWithWorkspace, getRavenWebUrl } from '../config/ravenChat';
import { RavenMessageAttachmentBody } from './RavenMessageAttachmentBody';
import { RavenChannelPeerAvatar } from './RavenChannelPeerAvatar';
import { RavenInlineReplyQuote } from './RavenInlineReplyQuote';
import { RavenSharedInChatList } from './RavenSharedInChatList';
import { ravenMessageHasVisualMedia, ravenSameMessageOwner } from '../utils/ravenAttachment';
import { isDmChannel, initialsFromUserId, pastelAvatarBg } from '../utils/ravenChatUi';
import { resolveRavenUserDisplayName } from '../utils/ravenSearchPreview';
import { ravenMessageShortPreview } from '../utils/ravenMessageShortPreview';
import {
  listChannelsForWorkspace,
  listMessagesForChannel,
  resolveRavenWorkspaceId,
  sendRavenChannelMessage,
  uploadRavenFileWithMessage,
  getRavenChannelDisplayLabel,
  getRavenDmPeerUserId,
  enrichRavenChannelsWithPeerProfiles,
  fetchRavenUserProfilesByIds,
  fetchRavenUsersDirectory,
  mergeRavenUserProfileMaps,
  type RavenChannelRow,
  type RavenMessageRow,
  ravenMessageShowsReplyQuoteRow,
  ravenMergeMessageRowFromSendResponse,
  ravenMessageRowSortTimeMs,
  ravenRefreshMessagesPreservingDocLinks,
  ravenRowIsSupplierQuotationDocLink,
  ravenMessageOwnerMatchesSession,
} from '../services/ravenNativeApi';
import { mergeRavenMessagesWithPendingDocInsert } from '../utils/ravenDocLinkMessageMergeBridge';
import {
  getRavenChannelMessagesSnapshot,
  getRavenWorkspaceChannelsSnapshot,
  mergeCachedChannelMessagesWithFreshFirstPage,
  setRavenChannelMessagesSnapshot,
  setRavenWorkspaceChannelsSnapshot,
} from '../utils/ravenMessagingLocalCache';
import {
  pendingAttachmentsFromImagePickerAssets,
  type RavenPendingAttachment,
} from '../utils/ravenMediaPick';
import { tryParseQuotationDraftFromMessage } from '../utils/chatQuotationDraftMessage';
import { RavenQuotationDraftCard } from './RavenQuotationDraftCard';
import { RavenLinkedSupplierQuotationMessage } from './RavenLinkedSupplierQuotationMessage';
import { RavenLinkedGenericDocMessage } from './RavenLinkedGenericDocMessage';
import { getERPNextClient } from '../services/erpnext';
import { userFacingError } from '../utils/userFacingError';
import type { RootStackParamList } from '../types';
import type { NavigationProp } from '@react-navigation/native';

const POLL_MS = 3000;

/** Inverted messages list: show jump-to-latest when scrolled past this offset from newest. */
const NATIVE_RAVEN_MESSAGES_SCROLL_DOWN_SHOW_PX = 160;

const NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE = 36;
const NATIVE_RAVEN_CHAT_OLDER_PAGE_SIZE = 50;

function sortRavenMessagesNewestFirst(rows: RavenMessageRow[]): RavenMessageRow[] {
  return [...rows].sort((a, b) => ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a));
}

type Props = {
  /** Optional Raven Workspace.name; otherwise env or API default. */
  workspaceId?: string;
};

function formatTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function channelListPeerSubtitle(
  c: RavenChannelRow,
  currentEmail?: string | null,
  profiles?: Record<string, { full_name?: string; user_image?: string | null }>
): string {
  if (!isDmChannel(c)) return (c.type || '').trim();
  const peer = getRavenDmPeerUserId(c, currentEmail);
  if (!peer) return 'Direct message';
  return resolveRavenUserDisplayName(peer, profiles);
}

export const NativeRavenChat: React.FC<Props> = ({ workspaceId: workspaceProp }) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useUserSession();
  const { setActiveChannelId, refreshUnreadCounts } = useRavenUnread();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useOptionalBottomTabBarHeight();
  const { open: keyboardOpen, height: keyboardHeight } = useKeyboardInsets();
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [channels, setChannels] = useState<RavenChannelRow[]>([]);
  const [channel, setChannel] = useState<RavenChannelRow | null>(null);
  const [messages, setMessages] = useState<RavenMessageRow[]>([]);
  const [loadingBoot, setLoadingBoot] = useState(true);
  /** Start true so we never paint an empty message list before the first `loadMessages` pass (effect runs after paint). */
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<RavenMessageRow | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<RavenPendingAttachment[]>([]);
  const [showScrollToLatestBtn, setShowScrollToLatestBtn] = useState(false);
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotationActionByName, setQuotationActionByName] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [quotationActionBusy, setQuotationActionBusy] = useState<string | null>(null);
  const [ravenUserProfilesById, setRavenUserProfilesById] = useState<
    Record<string, { full_name?: string; user_image?: string | null }>
  >({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const messagesListRef = useRef<FlatList<RavenMessageRow> | null>(null);
  const messagesRef = useRef<RavenMessageRow[]>([]);
  const loadingOlderRef = useRef(false);
  const allowOlderEndReachedRef = useRef(false);
  const screenFocusedRef = useRef(false);

  const loadMessages = useCallback(async (channelId: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    let cachedMsgs: RavenMessageRow[] | null = null;
    if (!silent) {
      cachedMsgs = await getRavenChannelMessagesSnapshot(user?.email, channelId);
      if (cachedMsgs?.length) {
        setMessages(sortRavenMessagesNewestFirst(mergeRavenMessagesWithPendingDocInsert(channelId, cachedMsgs)));
        setHasMoreOlderMessages(cachedMsgs.length >= NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE);
        setLoadingMsgs(false);
      } else {
        setMessages([]);
        setLoadingMsgs(true);
      }
    }
    try {
      const rows = await listMessagesForChannel(channelId, NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE);
      const rowsMerged = mergeRavenMessagesWithPendingDocInsert(channelId, rows);
      if (silent) {
        setMessages((prev) => {
          const mergedRows = ravenRefreshMessagesPreservingDocLinks(rowsMerged, prev);
          const fresh = new Map(
            mergedRows
              .map((m) => [(m.name || '').trim(), m] as const)
              .filter(([k]) => k.length > 0)
          );
          const preserved = prev.filter((m) => {
            const n = (m.name || '').trim();
            return n && !fresh.has(n);
          });
          return sortRavenMessagesNewestFirst([...mergedRows, ...preserved]);
        });
      } else {
        const combined = mergeCachedChannelMessagesWithFreshFirstPage(rowsMerged, cachedMsgs);
        setMessages(combined);
        setHasMoreOlderMessages(
          combined.length >= NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE || combined.length > rowsMerged.length
        );
      }
      setError(null);
    } catch (e: any) {
      if (!silent) {
        if (cachedMsgs?.length) {
          setMessages(sortRavenMessagesNewestFirst(mergeRavenMessagesWithPendingDocInsert(channelId, cachedMsgs)));
          setHasMoreOlderMessages(cachedMsgs.length >= NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE);
        } else {
          setMessages([]);
          setHasMoreOlderMessages(false);
        }
        setError(userFacingError(e, 'Could not load messages'));
      }
    } finally {
      if (!silent) setLoadingMsgs(false);
      setRefreshing(false);
    }
  }, [user?.email]);

  const loadOlderMessages = useCallback(async () => {
    const ch = channel?.name;
    if (!ch || loadingOlderRef.current || !hasMoreOlderMessages) return;
    loadingOlderRef.current = true;
    setLoadingOlderMsgs(true);
    try {
      const start = messagesRef.current.length;
      const older = await listMessagesForChannel(ch, NATIVE_RAVEN_CHAT_OLDER_PAGE_SIZE, { limitStart: start });
      const olderMerged = mergeRavenMessagesWithPendingDocInsert(ch, older);
      if (olderMerged.length === 0) {
        setHasMoreOlderMessages(false);
        return;
      }
      const prev = messagesRef.current;
      const seen = new Set(prev.map((m) => (m.name || '').trim()).filter(Boolean));
      const extra = olderMerged.filter((m) => {
        const n = (m.name || '').trim();
        return n && !seen.has(n);
      });
      if (extra.length === 0) {
        setHasMoreOlderMessages(false);
        return;
      }
      setMessages(sortRavenMessagesNewestFirst([...prev, ...extra]));
      if (olderMerged.length < NATIVE_RAVEN_CHAT_OLDER_PAGE_SIZE) {
        setHasMoreOlderMessages(false);
      }
    } catch {
      /* keep hasMore */
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMsgs(false);
    }
  }, [channel?.name, hasMoreOlderMessages]);

  const messagesById = useMemo(() => {
    const map = new Map<string, RavenMessageRow>();
    for (const m of messages) {
      const n = (m.name || '').trim();
      if (n) map.set(n, m);
    }
    return map;
  }, [messages]);

  const onMessagesScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    const avg = Math.max(56, info.averageItemLength || 88);
    messagesListRef.current?.scrollToOffset({
      offset: avg * info.index,
      animated: true,
    });
  }, []);

  const scrollToMessageById = useCallback((messageId: string) => {
    const id = String(messageId || '').trim();
    if (!id) return;
    const index = messages.findIndex((m) => (m.name || '').trim() === id);
    if (index < 0) return;
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.35,
      });
    });
  }, [messages]);

  const goToMessageFromSharedMenu = useCallback(
    (messageName: string) => {
      const id = String(messageName || '').trim();
      if (!id) return;
      setPickerOpen(false);
      requestAnimationFrame(() => {
        const idx = messages.findIndex((m) => (m.name || '').trim() === id);
        if (idx < 0) {
          Alert.alert(
            'Chat',
            "That message isn't loaded yet. Scroll up in the chat to load older messages, then try again."
          );
          return;
        }
        scrollToMessageById(id);
      });
    },
    [messages, scrollToMessageById]
  );

  const scrollMessagesToLatest = useCallback(() => {
    const list = messagesListRef.current;
    if (!list) return;
    try {
      list.scrollToOffset({ offset: 0, animated: true });
    } catch {
      list.scrollToEnd({ animated: true });
    }
    setShowScrollToLatestBtn(false);
  }, []);

  const onMessagesScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setShowScrollToLatestBtn(y > NATIVE_RAVEN_MESSAGES_SCROLL_DOWN_SHOW_PX);
  }, []);

  const onMessagesEndReached = useCallback(() => {
    if (!channel?.name || loadingMsgs || !hasMoreOlderMessages) return;
    if (!allowOlderEndReachedRef.current) return;
    void loadOlderMessages();
  }, [channel?.name, loadingMsgs, hasMoreOlderMessages, loadOlderMessages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    void fetchRavenUsersDirectory().then((dir) => {
      if (cancelled || Object.keys(dir).length === 0) return;
      setRavenUserProfilesById((prev) => mergeRavenUserProfileMaps(dir, prev));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const owners = new Set<string>();
    for (const m of messages) {
      const o = (m.owner || '').trim();
      if (o) owners.add(o);
    }
    if (owners.size === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const profiles = await fetchRavenUserProfilesByIds([...owners]);
        if (cancelled) return;
        const patch: Record<string, { full_name?: string; user_image?: string | null }> = {};
        for (const [id, p] of profiles) patch[id] = p;
        setRavenUserProfilesById((prev) => mergeRavenUserProfileMaps(prev, patch));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  useEffect(() => {
    const email = user?.email?.trim();
    const ch = channel?.name?.trim();
    if (!email || !ch || messages.length === 0) return;
    const t = setTimeout(() => {
      void setRavenChannelMessagesSnapshot(email, ch, messages);
    }, 550);
    return () => clearTimeout(t);
  }, [messages, channel?.name, user?.email]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingBoot(true);
      setError(null);
      try {
        const ws = await resolveRavenWorkspaceId(workspaceProp);
        if (cancelled) return;
        setWorkspace(ws);
        if (!ws) {
          setError('No supplier group is set up for your account. Contact your administrator for access.');
          setLoadingMsgs(false);
          setLoadingBoot(false);
          return;
        }
        const cachedCh = await getRavenWorkspaceChannelsSnapshot(user?.email, ws);
        if (cancelled) return;
        if (cachedCh?.length) setChannels(cachedCh);
        const rows = await listChannelsForWorkspace(ws, user?.email);
        if (cancelled) return;
        setChannels(rows);
        void setRavenWorkspaceChannelsSnapshot(user?.email, ws, rows);
        if (rows.length === 0) {
          setChannel(null);
          setMessages([]);
          setLoadingMsgs(false);
        }
        if (rows.length) {
          setChannel((prev) => {
            if (prev && rows.some((c) => c.name === prev.name)) return prev;
            return rows[0];
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(userFacingError(e, 'Failed to open chat'));
          setLoadingMsgs(false);
        }
      } finally {
        if (!cancelled) setLoadingBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceProp, user?.email]);

  useEffect(() => {
    channelIdRef.current = channel?.name ?? null;
  }, [channel?.name]);

  useEffect(() => {
    if (channel?.name) void loadMessages(channel.name);
  }, [channel?.name, loadMessages]);

  useEffect(() => {
    setReplyTo(null);
    setPendingAttachments([]);
    setShowScrollToLatestBtn(false);
    allowOlderEndReachedRef.current = false;
    loadingOlderRef.current = false;
  }, [channel?.name]);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      setActiveChannelId(channelIdRef.current);
      void refreshUnreadCounts();
      const tick = () => {
        const id = channelIdRef.current;
        if (id) void loadMessages(id, { silent: true });
        void refreshUnreadCounts();
      };
      tick();
      pollRef.current = setInterval(tick, POLL_MS);
      return () => {
        screenFocusedRef.current = false;
        setActiveChannelId(null);
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [loadMessages, refreshUnreadCounts, setActiveChannelId])
  );

  useEffect(() => {
    if (screenFocusedRef.current) setActiveChannelId(channel?.name ?? null);
  }, [channel?.name, setActiveChannelId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        const id = channelIdRef.current;
        if (id) void loadMessages(id, { silent: true });
        void refreshUnreadCounts();
      }
    });
    return () => sub.remove();
  }, [loadMessages, refreshUnreadCounts]);

  const openMemberPicker = useCallback(() => {
    setPickerOpen(true);
  }, []);

  const pickMedia = useCallback(async () => {
    if (!channel?.name) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Media', 'Allow photo library access to attach photos or videos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      allowsMultipleSelection: true,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    });
    if (res.canceled || !res.assets?.length) return;
    setPendingAttachments((prev) => [...prev, ...pendingAttachmentsFromImagePickerAssets(res.assets)]);
  }, [channel?.name]);

  const handleAcceptQuotationDraft = useCallback(
    async (sqName: string) => {
      const n = sqName.trim();
      if (!n) return;
      setQuotationActionBusy(n);
      try {
        await getERPNextClient().submitSupplierQuotation(n);
        try {
          const billTo = (user?.user || user?.email || '').trim();
          await getERPNextClient().ensureSalesInvoiceForSupplierQuotation(
            n,
            billTo ? { billToFrappeUserId: billTo } : undefined
          );
        } catch (invErr) {
          console.warn('[Supplier Quotation] Could not auto-create sales invoice:', invErr);
        }
        setQuotationActionByName((prev) => ({ ...prev, [n]: 'accepted' }));
        const ch = channel?.name;
        if (ch) await loadMessages(ch, { silent: true });
      } catch (e: unknown) {
        Alert.alert('Quotation', e instanceof Error ? e.message : 'Could not submit.');
      } finally {
        setQuotationActionBusy(null);
      }
    },
    [channel?.name, loadMessages, user?.email, user?.user]
  );

  const handleRejectQuotationDraft = useCallback(
    async (sqName: string) => {
      const n = sqName.trim();
      if (!n) return;
      setQuotationActionBusy(n);
      try {
        await getERPNextClient().rejectSupplierQuotationDraft(n);
        setQuotationActionByName((prev) => ({ ...prev, [n]: 'rejected' }));
        const ch = channel?.name;
        if (ch) await loadMessages(ch, { silent: true });
      } catch (e: unknown) {
        Alert.alert('Quotation', e instanceof Error ? e.message : 'Could not reject.');
      } finally {
        setQuotationActionBusy(null);
      }
    },
    [channel?.name, loadMessages]
  );

  const openQuotationComposeFromChat = useCallback(() => {
    if (!channel?.name) {
      Alert.alert('Chat', 'Open a conversation first.');
      return;
    }
    navigation.navigate('SupplierQuotationCompose', { ravenChannelId: channel.name });
  }, [navigation, channel?.name]);

  const pickDocument = useCallback(async () => {
    if (!channel?.name) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const picked: RavenPendingAttachment[] = res.assets.map((a, i) => ({
        key: `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
        uri: a.uri,
        mimeType: (a.mimeType || 'application/octet-stream').trim() || 'application/octet-stream',
        name: a.name?.trim() || `file-${Date.now()}-${i}`,
      }));
      setPendingAttachments((prev) => [...prev, ...picked]);
    } catch (e: any) {
      Alert.alert('File', e?.message || 'Could not pick a file.');
    }
  }, [channel?.name]);

  const openRavenWeb = () => {
    if (!workspace) {
      Linking.openURL(getRavenWebUrl()).catch(() => {});
      return;
    }
    Linking.openURL(buildRavenUrlWithWorkspace(workspace)).catch(() => {});
  };

  const onSend = async () => {
    if (!channel?.name || sending) return;
    const text = draft.trim();
    const hasText = !!text;
    const hasFile = pendingAttachments.length > 0;
    if (!hasText && !hasFile) return;
    setSending(true);
    const rid = replyTo?.name;
    try {
      const mergePayloads: unknown[] = [];
      if (hasText) {
        const sendRes = await sendRavenChannelMessage(channel.name, text, rid ? { replyToMessageId: rid } : undefined);
        mergePayloads.push(sendRes?.message ?? sendRes);
      }
      for (const file of pendingAttachments) {
        const upRes = await uploadRavenFileWithMessage(channel.name, file.uri, file.name, file.mimeType, {
          caption: '',
          replyToMessageId: rid,
        });
        mergePayloads.push(upRes?.message ?? upRes);
      }
      setDraft('');
      setPendingAttachments([]);
      setReplyTo(null);
      let rows = await listMessagesForChannel(channel.name, NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE);
      for (const p of mergePayloads) {
        rows = ravenMergeMessageRowFromSendResponse(rows, p);
      }
      const apiLen = rows.length;
      const msgSnap = await getRavenChannelMessagesSnapshot(user?.email, channel.name);
      rows = mergeCachedChannelMessagesWithFreshFirstPage(rows, msgSnap);
      setMessages(sortRavenMessagesNewestFirst(rows));
      setHasMoreOlderMessages(
        rows.length >= NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE || rows.length > apiLen
      );
    } catch (e: any) {
      const msg = e?.message || 'Send failed';
      Alert.alert('Message not sent', msg);
    } finally {
      setSending(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (channel?.name) void loadMessages(channel.name);
    else setRefreshing(false);
  };

  const renderMessage = useCallback(
    ({ item, index }: { item: RavenMessageRow; index: number }) => {
      const mine = ravenMessageOwnerMatchesSession(item.owner, user);
      const hasAttach = !!(item.file?.trim() || item.file_thumbnail?.trim());
      const linkDtRaw = String(item.link_doctype || '').trim();
      const linkDnRaw = String(item.link_document || '').trim();
      const isSupplierQuotationLink = !hasAttach && ravenRowIsSupplierQuotationDocLink(linkDtRaw, linkDnRaw);
      const sqLink = isSupplierQuotationLink ? linkDnRaw : null;
      const genericDocLink =
        !hasAttach && !!linkDtRaw && !!linkDnRaw && !isSupplierQuotationLink
          ? { doctype: linkDtRaw, document: linkDnRaw }
          : null;
      const qDraft =
        !hasAttach && !sqLink && !genericDocLink ? tryParseQuotationDraftFromMessage(item.text) : null;
      const isSupplierPortalUser = user?.appMode === 'supplier' || !!user?.supplierId?.trim();
      const isSupplierLike = user?.appMode === 'supplier' || !!user?.supplierId?.trim();
      const showBuyerQuotationActions = (!!qDraft || !!sqLink) && !mine && !isSupplierPortalUser;
      const supplierSqLinkSelfServeUx = !!sqLink && isSupplierLike;
      const older = index < messages.length - 1 ? messages[index + 1] : null;
      const newer = index > 0 ? messages[index - 1] : null;
      const mediaGroupNeighbor =
        hasAttach &&
        ravenMessageHasVisualMedia(item) &&
        ((older != null &&
          ravenSameMessageOwner(item, older) &&
          ravenMessageHasVisualMedia(older)) ||
          (newer != null &&
            ravenSameMessageOwner(item, newer) &&
            ravenMessageHasVisualMedia(newer)));

      const showReplyQuote = ravenMessageShowsReplyQuoteRow(item);
      const showPlainTextBubble = !!item.text?.trim() && !qDraft && !sqLink && !genericDocLink;
      /**
       * Frappe User for SI **customer** resolution (Raven User.custom_customer, portal, etc.).
       * Use signed-in user for **both** buyer chat and supplier approve-payment — supplier flow used to pass `null`, which
       * skipped all bill-to resolution and always failed when SQ had no `customer` / `custom_bill_to_customer`.
       */
      const customerPartyFrappeUserForSq = String(user?.user || user?.email || '').trim() || null;

      const linkedOrQuotationCard =
        sqLink != null ? (
          <RavenLinkedSupplierQuotationMessage
            sqName={sqLink}
            billToFrappeUserId={customerPartyFrappeUserForSq}
            supplierSelfServeUx={supplierSqLinkSelfServeUx}
            showBuyerActions={showBuyerQuotationActions}
            viewerSupplierDocId={user?.supplierId}
            handled={quotationActionByName[sqLink] ?? null}
            busy={quotationActionBusy === sqLink}
            onAccept={showBuyerQuotationActions ? () => void handleAcceptQuotationDraft(sqLink) : undefined}
            onReject={showBuyerQuotationActions ? () => void handleRejectQuotationDraft(sqLink) : undefined}
            onSupplierReplyToQuotation={supplierSqLinkSelfServeUx ? () => setReplyTo(item) : undefined}
          />
        ) : genericDocLink != null ? (
          <RavenLinkedGenericDocMessage
            linkDoctype={genericDocLink.doctype}
            linkDocument={genericDocLink.document}
          />
        ) : qDraft != null ? (
          <RavenQuotationDraftCard
            payload={qDraft}
            showBuyerActions={showBuyerQuotationActions && qDraft.buyerReviewEligible !== false}
            handled={quotationActionByName[qDraft.name] ?? null}
            busy={quotationActionBusy === qDraft.name}
            onAccept={
              showBuyerQuotationActions && qDraft.buyerReviewEligible !== false
                ? () => void handleAcceptQuotationDraft(qDraft.name)
                : undefined
            }
            onReject={
              showBuyerQuotationActions && qDraft.buyerReviewEligible !== false
                ? () => void handleRejectQuotationDraft(qDraft.name)
                : undefined
            }
          />
        ) : null;
      const inner = (
        <>
          {showReplyQuote ? (
            <RavenInlineReplyQuote
              item={item}
              mine={mine}
              messagesById={messagesById}
              onScrollToQuoted={scrollToMessageById}
              variant="wine"
              userDisplayProfiles={ravenUserProfilesById}
            />
          ) : null}
          {!showReplyQuote && !!item.is_reply ? (
            <Text style={[styles.replyBadge, mine && styles.replyBadgeMine]}>Reply</Text>
          ) : null}
          {hasAttach ? (
            <RavenMessageAttachmentBody
              item={item}
              mine={mine}
              variant="wine"
              mediaGroupNeighbor={mediaGroupNeighbor}
              onReplyLongPress={() => setReplyTo(item)}
            />
          ) : null}
          {linkedOrQuotationCard}
          {showPlainTextBubble ? (
            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.text}</Text>
          ) : !hasAttach && !qDraft && !sqLink && !genericDocLink ? (
            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}> </Text>
          ) : null}
          <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatTime(item.creation)}</Text>
        </>
      );

      const blockBubbleLongPressForSupplierSq = !!sqLink && isSupplierLike;

      return (
        <Pressable
          style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}
          onLongPress={blockBubbleLongPressForSupplierSq ? undefined : () => setReplyTo(item)}
          delayLongPress={380}
        >
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            {!mine && !!item.owner && (
              <Text style={styles.bubbleMeta}>{resolveRavenUserDisplayName(item.owner, ravenUserProfilesById)}</Text>
            )}
            {inner}
          </View>
        </Pressable>
      );
    },
    [
      user?.email,
      user?.user,
      user?.appMode,
      user?.supplierId,
      messages,
      messagesById,
      scrollToMessageById,
      ravenUserProfilesById,
      quotationActionByName,
      quotationActionBusy,
      handleAcceptQuotationDraft,
      handleRejectQuotationDraft,
    ]
  );

  if (loadingBoot) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.WINE} />
        <Text style={styles.hint}>Connecting…</Text>
      </View>
    );
  }

  const composerBottomPad = keyboardOpen
    ? 0
    : Spacing.SM + Math.max(insets.bottom, 6) + tabBarHeight;

  return (
    <View
      style={[
        styles.root,
        keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : null,
      ]}
    >
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.wsLabel} numberOfLines={1}>
            {workspace || '—'}
          </Text>
          <TouchableOpacity style={styles.channelBtn} onPress={openMemberPicker} disabled={!workspace}>
            {channel ? (
              <RavenChannelPeerAvatar channel={channel} currentUserEmail={user?.email} size={32} variant="wine" />
            ) : null}
            <Text style={styles.channelBtnText} numberOfLines={1}>
              {channel ? getRavenChannelDisplayLabel(channel, user?.email, ravenUserProfilesById) : 'Channel'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={Colors.WINE} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={openRavenWeb} hitSlop={12}>
          <Ionicons name="open-outline" size={22} color={Colors.WINE} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : null}

      {loadingMsgs && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.WINE} />
        </View>
      ) : (
        <View style={styles.messagesListShell}>
          <FlatList
            ref={messagesListRef}
            style={styles.messagesListFlex}
            data={messages}
            keyExtractor={(m) => m.name}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={styles.listContent}
            onScroll={onMessagesScroll}
            scrollEventThrottle={16}
            onMomentumScrollBegin={() => {
              allowOlderEndReachedRef.current = true;
            }}
            onEndReached={onMessagesEndReached}
            onEndReachedThreshold={0.25}
            ListFooterComponent={
              loadingOlderMsgs ? (
                <View style={styles.messagesOlderLoader} accessibilityLabel="Loading older messages">
                  <ActivityIndicator color={Colors.WINE} />
                </View>
              ) : null
            }
            onScrollToIndexFailed={onMessagesScrollToIndexFailed}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.WINE} />}
          />
          {showScrollToLatestBtn ? (
            <Pressable
              style={styles.scrollDownFab}
              onPress={scrollMessagesToLatest}
              accessibilityRole="button"
              accessibilityLabel="Scroll to latest messages"
            >
              <Ionicons name="chevron-down" size={26} color={Colors.WINE} />
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={[styles.composerWrap, { paddingBottom: composerBottomPad }]}>
        {replyTo ? (
          <View style={styles.replyStrip}>
            <Pressable
              style={styles.replyStripText}
              onPress={() => {
                const id = String(replyTo.name || '').trim();
                if (id) scrollToMessageById(id);
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to message you are replying to"
            >
              <Text style={styles.replyStripLabel}>Replying to</Text>
              <Text style={styles.replyStripPreview} numberOfLines={2}>
                {ravenMessageShortPreview(replyTo)}
              </Text>
            </Pressable>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={10}>
              <Ionicons name="close-circle" size={22} color={Colors.TEXT_SECONDARY} />
            </TouchableOpacity>
          </View>
        ) : null}
        {pendingAttachments.length > 0 ? (
          <View style={styles.pendingWrap}>
            {pendingAttachments.map((p) => (
              <View key={p.key} style={styles.pendingChip}>
                {p.mimeType.toLowerCase().startsWith('image/') ? (
                  <Image source={{ uri: p.uri }} style={styles.pendingImgThumb} />
                ) : p.mimeType.toLowerCase().startsWith('video/') ? (
                  <View style={[styles.pendingImgThumb, styles.pendingFileThumb]}>
                    <Ionicons name="videocam" size={22} color={Colors.WINE} />
                  </View>
                ) : (
                  <View style={[styles.pendingImgThumb, styles.pendingFileThumb]}>
                    <Ionicons name="document-text" size={22} color={Colors.WINE} />
                  </View>
                )}
                <Text style={styles.pendingChipName} numberOfLines={1}>
                  {p.name}
                </Text>
                <TouchableOpacity
                  onPress={() => setPendingAttachments((prev) => prev.filter((x) => x.key !== p.key))}
                  hitSlop={10}
                  accessibilityLabel="Remove attachment"
                >
                  <Ionicons name="close-circle" size={20} color={Colors.WINE} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.composer}>
          <View style={styles.attachRow}>
            <TouchableOpacity
              style={[styles.attachBtn, (!channel || sending) && styles.attachBtnOff]}
              onPress={() => void pickMedia()}
              disabled={!channel || sending}
              accessibilityLabel="Attach photos or videos"
            >
              <Ionicons name="images-outline" size={24} color={Colors.WINE} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attachBtn, (!channel || sending) && styles.attachBtnOff]}
              onPress={() => void pickDocument()}
              disabled={!channel || sending}
              accessibilityLabel="Attach file"
            >
              <Ionicons name="attach-outline" size={24} color={Colors.WINE} />
            </TouchableOpacity>
            {user?.appMode === 'supplier' ? (
              <TouchableOpacity
                style={[styles.attachBtn, (!channel || sending) && styles.attachBtnOff]}
                onPress={openQuotationComposeFromChat}
                disabled={!channel || sending}
                accessibilityLabel="New quotation"
              >
                <Ionicons name="document-text-outline" size={24} color={Colors.WINE} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TextInput
            style={styles.input}
            placeholder={replyTo ? 'Add a reply…' : 'Message'}
            placeholderTextColor={Colors.TEXT_SECONDARY}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={4000}
            editable={!!channel && !sending}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              ((!draft.trim() && pendingAttachments.length === 0) || sending || !channel) && styles.sendBtnDisabled,
            ]}
            onPress={() => void onSend()}
            disabled={(!draft.trim() && pendingAttachments.length === 0) || sending || !channel}
          >
            {sending ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <Ionicons name="send" size={20} color={Colors.WHITE} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerModalHead}>
              <Text style={styles.pickerModalTitle}>Shared in chat</Text>
              <TouchableOpacity
                onPress={() => setPickerOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
              >
                <Ionicons name="close" size={28} color={Colors.BLACK} />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Spacing.LG }}
              showsVerticalScrollIndicator={false}
            >
              {channel?.name ? (
                <RavenSharedInChatList
                  active={pickerOpen}
                  channelId={channel.name}
                  variant="wine"
                  onGoToMessage={goToMessageFromSharedMenu}
                  userDisplayProfiles={ravenUserProfilesById}
                />
              ) : (
                <Text style={[styles.channelRowMeta, { paddingHorizontal: Spacing.LG, paddingVertical: Spacing.MD }]}>
                  Select a channel to see files shared in the conversation.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.BACKGROUND },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.LG },
  hint: { marginTop: Spacing.SM, color: Colors.TEXT_SECONDARY, fontSize: 14 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
    backgroundColor: Colors.WHITE,
  },
  topBarLeft: { flex: 1, marginRight: Spacing.SM },
  wsLabel: { fontSize: 11, fontWeight: '700', color: Colors.TEXT_SECONDARY, textTransform: 'uppercase' },
  channelBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 8 },
  channelBtnText: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.BLACK },
  pickerMemberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerMemberAvatarImageClip: { overflow: 'hidden', padding: 0 },
  pickerMemberAvatarImage: { width: 36, height: 36 },
  pickerMemberAvatarText: { fontSize: 13, fontWeight: '800', color: Colors.BLACK },
  banner: { backgroundColor: '#FFF4E5', paddingHorizontal: Spacing.MD, paddingVertical: Spacing.SM },
  bannerText: { color: '#8B4513', fontSize: 13 },
  messagesListShell: { flex: 1, position: 'relative' },
  messagesListFlex: { flex: 1 },
  scrollDownFab: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E8E8',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 5,
      },
      android: { elevation: 4 },
    }),
  },
  messagesOlderLoader: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingHorizontal: Spacing.MD, paddingVertical: Spacing.SM },
  bubbleWrap: { marginVertical: 4, maxWidth: '92%' },
  bubbleWrapMine: { alignSelf: 'flex-end' },
  bubbleWrapTheirs: { alignSelf: 'flex-start' },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: Colors.WINE, alignItems: 'stretch' },
  bubbleTheirs: { backgroundColor: Colors.WHITE, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E8E8E8' },
  bubbleMeta: { fontSize: 11, fontWeight: '700', color: Colors.TEXT_SECONDARY, marginBottom: 2 },
  bubbleText: { fontSize: 15, color: Colors.BLACK, lineHeight: 20 },
  bubbleTextMine: { color: Colors.WHITE, alignSelf: 'stretch', textAlign: 'right' },
  bubbleTime: { fontSize: 10, marginTop: 4, color: Colors.TEXT_SECONDARY, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.85)' },
  replyBadge: { fontSize: 11, fontWeight: '700', color: Colors.WINE, marginBottom: 4 },
  replyBadgeMine: { color: 'rgba(255,255,255,0.9)' },
  replyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.BRAND_SOFT,
    borderRadius: 12,
  },
  replyStripText: { flex: 1 },
  replyStripLabel: { fontSize: 11, fontWeight: '700', color: Colors.WINE },
  replyStripPreview: { fontSize: 13, color: Colors.BLACK, marginTop: 2 },
  pendingWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingVertical: 4,
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#F8F8F8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
  },
  pendingChipName: { flex: 1, minWidth: 0, fontSize: 12, color: Colors.TEXT_SECONDARY },
  pendingImgThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#EEE' },
  pendingFileThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    backgroundColor: '#F8F8F8',
  },
  attachRow: { flexDirection: 'row', alignItems: 'flex-end', marginRight: 6 },
  attachBtn: { paddingRight: 4, paddingVertical: 4, justifyContent: 'center' },
  attachBtnOff: { opacity: 0.35 },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E8E8',
    backgroundColor: Colors.WHITE,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: Colors.BLACK,
    marginRight: Spacing.SM,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.WINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalSheet: {
    maxHeight: '55%',
    backgroundColor: Colors.WHITE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Spacing.LG,
  },
  pickerModalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    paddingBottom: 8,
  },
  pickerModalTitle: { fontSize: 17, fontWeight: '800', color: Colors.BLACK, flex: 1, marginRight: 8 },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.LG,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  channelUnreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: Colors.WINE,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  channelUnreadBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.WHITE },
  channelRowActive: { backgroundColor: Colors.BRAND_SOFT },
  channelRowName: { fontSize: 16, fontWeight: '700', color: Colors.BLACK },
  channelRowMeta: { fontSize: 12, color: Colors.TEXT_SECONDARY, marginTop: 2 },
});
