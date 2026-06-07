import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  RefreshControl,
  Alert,
  ActionSheetIOS,
  AppState,
  type AppStateStatus,
  BackHandler,
  ScrollView,
  Image,
  I18nManager,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  StatusBar as RNStatusBar,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useFocusEffect, useNavigation, useRoute, usePreventRemove } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { useRavenUnread } from '../context/RavenUnreadContext';
import { RavenMessageAttachmentBody } from '../components/RavenMessageAttachmentBody';
import { RavenInlineReplyQuote } from '../components/RavenInlineReplyQuote';
import { RavenChannelPeerAvatar } from '../components/RavenChannelPeerAvatar';
import {
  listChannelsForWorkspace,
  listMessagesForChannel,
  listRavenChannelsForSessionUser,
  fetchChannelLatestAndMostRecentTextMessage,
  ravenMessageRowSortTimeMs,
  ravenChannelLastActivitySortTimeMs,
  fetchRavenWorkspaces,
  sendRavenChannelMessage,
  uploadRavenFileWithMessage,
  fetchWorkspaceMembers,
  createDirectMessageChannel,
  getRavenChannelDisplayLabel,
  getRavenDmPeerUserId,
  enrichRavenChannelsWithPeerProfiles,
  fetchRavenActiveUsers,
  fetchRavenInvisibleUserIds,
  ravenUserIsActiveLikeWeb,
  ravenWorkspaceMemberLinkedSupplierId,
  ravenMessageShowsReplyQuoteRow,
  ravenMergeMessageRowFromSendResponse,
  ravenRefreshMessagesPreservingDocLinks,
  ravenRowIsSupplierQuotationDocLink,
  ravenMessageOwnerMatchesSession,
  fetchRavenUserProfilesByIds,
  type RavenChannelRow,
  type RavenMessageRow,
  type RavenWorkspaceMemberRow,
  type RavenWorkspaceRow,
} from '../services/ravenNativeApi';
import {
  formatMessageHeaderTime,
  initialsFromUserId,
  isDmChannel,
  pastelAvatarBg,
} from '../utils/ravenChatUi';
import {
  getRavenMemberDirectoryView,
  ravenWorkspaceAdminsSorted,
  ravenWorkspaceMemberIsAdmin,
  ravenWorkspaceMemberMatchesViewer,
} from '../utils/ravenWorkspaceMemberVisibility';
import { ravenMessageHasVisualMedia, ravenSameMessageOwner } from '../utils/ravenAttachment';
import {
  pendingAttachmentsFromImagePickerAssets,
  type RavenPendingAttachment,
} from '../utils/ravenMediaPick';
import { getRavenLastChat, setRavenLastChat } from '../utils/ravenLastChatStorage';
import {
  getRavenChannelMessagesSnapshot,
  getRavenGlobalInboxSnapshot,
  getRavenWorkspaceChannelsSnapshot,
  mergeCachedChannelMessagesWithFreshFirstPage,
  setRavenChannelMessagesSnapshot,
  setRavenGlobalInboxSnapshot,
  setRavenWorkspaceChannelsSnapshot,
  type RavenCachedGlobalInboxRow,
} from '../utils/ravenMessagingLocalCache';
import { setRavenOpenChatFromProfileSubscriber } from '../utils/ravenOpenChatFromProfileBridge';
import { getMainTabBarStyle } from '../navigation/mainTabBarStyle';
import { RavenGlobalSearchModal } from '../components/RavenGlobalSearchModal';
import { RavenSharedInChatList } from '../components/RavenSharedInChatList';
import { RavenQuotationDraftCard } from '../components/RavenQuotationDraftCard';
import { RavenLinkedSupplierQuotationMessage } from '../components/RavenLinkedSupplierQuotationMessage';
import { RavenLinkedGenericDocMessage } from '../components/RavenLinkedGenericDocMessage';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';
import { channelPrefix, friendlySenderLabel, replySnippet } from '../utils/ravenSearchPreview';
import { ravenMessageShortPreview } from '../utils/ravenMessageShortPreview';
import { resolveRavenErpAttachImageUri } from '../utils/ravenFileUrl';
import { tryParseQuotationDraftFromMessage } from '../utils/chatQuotationDraftMessage';
import { mergeRavenMessagesWithPendingDocInsert } from '../utils/ravenDocLinkMessageMergeBridge';
import { getERPNextClient } from '../services/erpnext';

const POLL_MS = 3000;

/** First page when opening a thread — small for fast paint; older loads via `onEndReached`. */
const RAVEN_CHAT_FIRST_PAGE_SIZE = 36;
const RAVEN_CHAT_OLDER_PAGE_SIZE = 50;

/** Global inbox: preview fetches run in parallel up to this limit; each row commits as soon as its fetch finishes (no batch wait). */
const RAVEN_GLOBAL_INBOX_PREVIEW_CONCURRENCY = 10;

function sortRavenMessagesNewestFirst(rows: RavenMessageRow[]): RavenMessageRow[] {
  return [...rows].sort((a, b) => ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a));
}

const HUB_INFO_SUPPLIER_GROUPS_BODY =
  'Choose a supplier group to see suppliers, open supplier profiles, and start conversations.';

const HUB_INFO_SUPPLIERS_BODY =
  'These people represent suppliers in this supplier group. Tap a row to open their supplier profile, then use chat from there if you need to message them.';

/** When `listChannelsForWorkspace` has not yet returned a freshly-created DM, match `openDmWith` fallback. */
function buildFallbackDmChannelRow(workspaceWs: string, channelId: string, peerUserId: string): RavenChannelRow {
  return {
    name: channelId,
    channel_name: peerUserId,
    workspace: workspaceWs || undefined,
    type: 'Direct',
    is_direct_message: 1,
    peer_user_id: peerUserId,
  } as RavenChannelRow;
}
/** Raven web dedupes active users ~5m; we refresh a bit faster while the workspace is open. */
const PRESENCE_POLL_MS = 45_000;
const DRAWER_RAIL_W = 52;

function workspaceListPrimaryLabel(w: RavenWorkspaceRow): string {
  const t = (w.workspace_name || w.name || '').trim();
  return t || 'Supplier group';
}

function workspaceListSecondaryLabel(w: RavenWorkspaceRow): string | null {
  const id = (w.name || '').trim();
  const primary = (w.workspace_name || '').trim();
  if (!id) return null;
  if (primary && id !== primary) return id;
  return null;
}

type InboxPreviewMeta = { preview: string; timeLabel: string; timeMs: number; hasMessages: boolean };

/** One row in the header inbox: a channel with at least one text message from you or someone else (deduped by Raven channel id). */
type GlobalInboxRow = {
  key: string;
  workspaceId: string;
  workspaceLabel: string;
  /** From Raven Workspace `logo` when the workspace row is known. */
  workspaceLogo?: string | null;
  channel: RavenChannelRow;
  preview: string;
  timeLabel: string;
  timeMs: number;
  hasMessages: boolean;
};

function inboxPreviewFromLastMessage(last: RavenMessageRow | undefined): InboxPreviewMeta {
  if (!last) {
    return { preview: 'No messages yet', timeLabel: '', timeMs: 0, hasMessages: false };
  }
  const timeMs = ravenMessageRowSortTimeMs(last);
  const iso = last.creation || last.modified;
  const text = last.text?.trim();
  const linkDt = String(last.link_doctype || '').trim();
  const linkDn = String(last.link_document || '').trim();
  const linkLine = linkDt && linkDn ? `${linkDt} ${linkDn}` : '';
  const hasFile = !!(last.file?.trim() || last.file_thumbnail?.trim());
  let preview = replySnippet(text || '');
  if (!text && linkLine) preview = linkLine;
  if (!text && !linkLine && hasFile) preview = last.file_thumbnail ? 'Photo or video' : 'Attachment';
  if (!text && !linkLine && !hasFile) preview = 'Message';
  return {
    preview,
    timeLabel: formatMessageHeaderTime(iso) || '',
    timeMs,
    hasMessages: timeMs > 0 || !!(last.name?.trim()) || !!text || !!linkLine || hasFile,
  };
}

/**
 * Bounded parallel async work: each item’s `work` runs as soon as a worker is free.
 * Unlike batching all results, `work` can update UI per completion (newest items are queued first by caller).
 */
async function forEachWithConcurrency<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const workers = Math.max(1, Math.min(Math.max(1, concurrency), items.length));

  const runWorker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await work(items[i]);
    }
  };

  await Promise.all(Array.from({ length: workers }, () => runWorker()));
}

/** Inverted messages list: show jump-to-latest when scrolled past this offset from newest. */
const RAVEN_MESSAGES_SCROLL_DOWN_SHOW_PX = 160;

/**
 * Native team chat screen (light theme).
 */
export const RavenUIMessagesScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  /** Header stack Chats + supplier portal Chat tab: inbox of all channels first (no workspace picker). */
  const isHeaderChatInbox = route.name === 'RavenChatInbox' || route.name === 'SupplierMessages';
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useUserSession();
  const { setActiveChannelId, refreshUnreadCounts, unreadByChannelId } = useRavenUnread();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [workspaceRows, setWorkspaceRows] = useState<RavenWorkspaceRow[]>([]);
  const [channels, setChannels] = useState<RavenChannelRow[]>([]);
  const [channel, setChannel] = useState<RavenChannelRow | null>(null);
  const [messages, setMessages] = useState<RavenMessageRow[]>([]);
  const [loadingBoot, setLoadingBoot] = useState(true);
  const [loadingWorkspaceChannels, setLoadingWorkspaceChannels] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<RavenWorkspaceMemberRow[]>([]);
  const [openingDmFor, setOpeningDmFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<RavenMessageRow | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<RavenPendingAttachment[]>([]);
  /** Inverted chat: user scrolled up (older); show FAB to jump back to newest. */
  const [showScrollToLatestBtn, setShowScrollToLatestBtn] = useState(false);
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  /** Header inbox: aggregated threads across all workspaces (no workspace picker). */
  const [globalInboxRows, setGlobalInboxRows] = useState<GlobalInboxRow[]>([]);
  /** True on header Chats until the first inbox row paints or the current `loadGlobalInbox` run ends (`finally`). */
  const [loadingGlobalInbox, setLoadingGlobalInbox] = useState(isHeaderChatInbox);
  /** Hub screen help: description shown in a modal from the header (i) button. */
  const [hubInfoModal, setHubInfoModal] = useState<null | 'supplier-groups' | 'suppliers'>(null);
  /** Buyer accept/reject for quotation draft messages keyed by Supplier Quotation name. */
  const [quotationActionByName, setQuotationActionByName] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [quotationActionBusy, setQuotationActionBusy] = useState<string | null>(null);
  /** Inline filter for the visible chat / supplier group / supplier list (header search bar). */
  const [listSearchQuery, setListSearchQuery] = useState('');
  /** Same semantics as Raven `useIsUserActive` (get_active_users + Invisible on Raven User). */
  const [activeUserIds, setActiveUserIds] = useState<string[]>([]);
  const [invisibleUserIds, setInvisibleUserIds] = useState<string[]>([]);
  /** Frappe `User.user_image` by owner id (message bubbles). */
  const [ownerProfileImageByUserId, setOwnerProfileImageByUserId] = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const messagesListRef = useRef<FlatList<RavenMessageRow> | null>(null);
  const messagesRef = useRef<RavenMessageRow[]>([]);
  const loadingOlderRef = useRef(false);
  /** Avoids `onEndReached` firing once on mount (inverted list) before the user scrolls. */
  const allowOlderEndReachedRef = useRef(false);
  const screenFocusedRef = useRef(false);
  const membersPresenceRef = useRef<RavenWorkspaceMemberRow[]>([]);
  const channelsPresenceRef = useRef<RavenChannelRow[]>([]);
  /** Latest selected workspace id — ignore stale fetches after switching workspaces. */
  const selectedWorkspaceRef = useRef<string | null>(null);
  /** Open a channel picked from the cross-workspace inbox (workspace effect restores `channel`). */
  const pendingOpenFromGlobalRef = useRef<{ ws: string; channelId: string; peerUserId?: string } | null>(null);
  /** Open full-screen workspace menu once per workspace when user enters it. */
  const menuOpenedForWorkspaceRef = useRef<string | null>(null);
  /** Header Chats list (no workspace) is active — gates silent inbox reloads. */
  const headerGlobalInboxSurfaceRef = useRef(false);
  /** Bumped on effect cleanup so overlapping global inbox fetches never commit stale rows. */
  const globalInboxLoadGenerationRef = useRef(0);

  /** Latest hierarchy for back / swipe — refs avoid stale reads inside navigation gesture handlers. */
  const hierarchyForBackRef = useRef({
    hubInfoModal: null as null | 'supplier-groups' | 'suppliers',
    searchOpen: false,
    drawerOpen: false,
    channel: null as RavenChannelRow | null,
    workspace: null as string | null,
  });

  useLayoutEffect(() => {
    hierarchyForBackRef.current = {
      hubInfoModal,
      searchOpen,
      drawerOpen,
      channel,
      workspace,
    };
  }, [hubInfoModal, searchOpen, drawerOpen, channel, workspace]);

  useEffect(() => {
    selectedWorkspaceRef.current = workspace?.trim() || null;
  }, [workspace]);

  useEffect(() => {
    if (channel) {
      setHubInfoModal(null);
      setListSearchQuery('');
    }
  }, [channel]);

  useEffect(() => {
    membersPresenceRef.current = members;
  }, [members]);

  useEffect(() => {
    channelsPresenceRef.current = channels;
  }, [channels]);

  useEffect(() => {
    const w = workspace?.trim() || null;
    if (!w) {
      menuOpenedForWorkspaceRef.current = null;
      setDrawerOpen(false);
      return;
    }
    if (menuOpenedForWorkspaceRef.current !== w) {
      menuOpenedForWorkspaceRef.current = w;
      setDrawerOpen(false);
    }
  }, [workspace]);

  useEffect(() => {
    headerGlobalInboxSurfaceRef.current = Boolean(isHeaderChatInbox && workspace == null);
  }, [isHeaderChatInbox, workspace]);

  useEffect(() => {
    if (route.name !== 'RavenChatInbox') return;
    const p = route.params as { openWorkspaceId?: string; openChannelId?: string } | undefined;
    const ws = String(p?.openWorkspaceId ?? '').trim();
    const ch = String(p?.openChannelId ?? '').trim();
    if (!ws || !ch) return;
    pendingOpenFromGlobalRef.current = { ws, channelId: ch };
    void setRavenLastChat(user?.email, { workspace: ws, channelId: ch });
    setWorkspace(ws);
    const raf = requestAnimationFrame(() => {
      try {
        (navigation as unknown as { setParams: (p: Record<string, unknown>) => void }).setParams({
          openWorkspaceId: undefined,
          openChannelId: undefined,
        });
      } catch {
        /* noop */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [route.name, route.params, user?.email, navigation]);

  /** Buyer Suppliers tab only — supplier portal Chat has no “suggested suppliers” block. */
  const showSuggestedSuppliersInMenu = route.name === 'Suppliers';

  const { visibleMembers } = useMemo(
    () => getRavenMemberDirectoryView(members, user?.email, user?.user),
    [members, user?.email, user?.user]
  );

  /** Omit self — suggested supplier contacts you can open a DM with. */
  const directoryMembers = useMemo(
    () =>
      visibleMembers.filter(
        (m) => !ravenWorkspaceMemberMatchesViewer(m, user?.email, user?.user)
      ),
    [visibleMembers, user?.email, user?.user]
  );

  const workspaceAdminsSorted = useMemo(() => ravenWorkspaceAdminsSorted(members), [members]);

  const workspaceScreenTitle = useMemo(() => {
    if (!workspace?.trim()) return '';
    const id = workspace.trim();
    const row = workspaceRows.find((w) => String(w.name).toLowerCase() === id.toLowerCase());
    if (row?.workspace_name != null && String(row.workspace_name).trim()) {
      return String(row.workspace_name).trim();
    }
    if (row?.name != null && String(row.name).trim()) return String(row.name).trim();
    return id;
  }, [workspace, workspaceRows]);

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
      setDrawerOpen(false);
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
    setShowScrollToLatestBtn(y > RAVEN_MESSAGES_SCROLL_DOWN_SHOW_PX);
  }, []);

  const loadMessages = useCallback(async (channelId: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    let cachedMsgs: RavenMessageRow[] | null = null;
    if (!silent) {
      cachedMsgs = await getRavenChannelMessagesSnapshot(user?.email, channelId);
      if (cachedMsgs?.length) {
        setMessages(sortRavenMessagesNewestFirst(mergeRavenMessagesWithPendingDocInsert(channelId, cachedMsgs)));
        setHasMoreOlderMessages(cachedMsgs.length >= RAVEN_CHAT_FIRST_PAGE_SIZE);
        setLoadingMsgs(false);
      } else {
        setMessages([]);
        setLoadingMsgs(true);
      }
    }
    try {
      const rows = await listMessagesForChannel(channelId, RAVEN_CHAT_FIRST_PAGE_SIZE);
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
          combined.length >= RAVEN_CHAT_FIRST_PAGE_SIZE || combined.length > rowsMerged.length
        );
      }
      setError(null);
    } catch (e: any) {
      if (!silent) {
        if (cachedMsgs?.length) {
          setMessages(sortRavenMessagesNewestFirst(mergeRavenMessagesWithPendingDocInsert(channelId, cachedMsgs)));
          setHasMoreOlderMessages(cachedMsgs.length >= RAVEN_CHAT_FIRST_PAGE_SIZE);
        } else {
          setMessages([]);
          setHasMoreOlderMessages(false);
        }
        setError(e?.message || 'Could not load messages');
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
      const older = await listMessagesForChannel(ch, RAVEN_CHAT_OLDER_PAGE_SIZE, { limitStart: start });
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
      if (olderMerged.length < RAVEN_CHAT_OLDER_PAGE_SIZE) {
        setHasMoreOlderMessages(false);
      }
    } catch {
      /* keep hasMore so user can retry */
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMsgs(false);
    }
  }, [channel?.name, hasMoreOlderMessages]);

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
    (navigation as { navigate: (name: string, params: object) => void }).navigate('SupplierQuotationCompose', {
      ravenChannelId: channel.name,
    });
  }, [navigation, channel?.name]);

  const onMessagesEndReached = useCallback(() => {
    if (!channel?.name || loadingMsgs || !hasMoreOlderMessages) return;
    if (!allowOlderEndReachedRef.current) return;
    void loadOlderMessages();
  }, [channel?.name, loadingMsgs, hasMoreOlderMessages, loadOlderMessages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
        setOwnerProfileImageByUserId((prev) => {
          const next = { ...prev };
          for (const [id, p] of profiles) {
            const img = p.user_image != null ? String(p.user_image).trim() : '';
            if (!img) continue;
            next[id] = img;
            const lo = id.toLowerCase();
            if (lo !== id) next[lo] = img;
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  const presenceActiveSet = useMemo(
    () => new Set(activeUserIds.map((x) => x.trim().toLowerCase()).filter(Boolean)),
    [activeUserIds]
  );
  const presenceInvisibleSet = useMemo(
    () => new Set(invisibleUserIds.map((x) => x.trim().toLowerCase()).filter(Boolean)),
    [invisibleUserIds]
  );

  const viewerFrappeName = (user?.email || user?.user || '').trim() || null;

  const loadPresence = useCallback(async () => {
    const ws = selectedWorkspaceRef.current;
    if (!ws) return;
    try {
      const active = await fetchRavenActiveUsers();
      const needInvisible = new Set<string>();
      for (const id of active) {
        const t = id.trim();
        if (t) needInvisible.add(t);
      }
      for (const m of membersPresenceRef.current) {
        const u = m.user?.trim();
        if (u) needInvisible.add(u);
      }
      for (const ch of channelsPresenceRef.current) {
        const p = getRavenDmPeerUserId(ch, viewerFrappeName);
        if (p) needInvisible.add(p);
      }
      const invisible = await fetchRavenInvisibleUserIds([...needInvisible]);
      if (selectedWorkspaceRef.current !== ws) return;
      setActiveUserIds(active);
      setInvisibleUserIds(invisible);
    } catch {
      /* keep last presence */
    }
  }, [viewerFrappeName]);

  useEffect(() => {
    if (!workspace?.trim()) {
      setActiveUserIds([]);
      setInvisibleUserIds([]);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void loadPresence();
    };
    tick();
    const t = setInterval(tick, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [workspace, loadPresence]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingBoot(true);
      setError(null);
      try {
        const wsList = await fetchRavenWorkspaces();
        if (cancelled) return;
        const list = Array.isArray(wsList) ? wsList : [];
        setWorkspaceRows(list);
        setChannels([]);
        setMembers([]);
        setChannel(null);
        let initialWs: string | null = null;
        if (list.length > 0 && !isHeaderChatInbox) {
          const last = await getRavenLastChat(user?.email);
          if (last?.workspace?.trim()) {
            const lw = last.workspace.trim().toLowerCase();
            const match = list.find((row) => String(row.name || '').trim().toLowerCase() === lw);
            if (match) initialWs = String(match.name).trim();
          }
        }
        setWorkspace(initialWs);
        if (list.length === 0) {
          setError('No supplier groups found. Ask your admin to add you to a supplier group in Raven.');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load supplier groups');
      } finally {
        if (!cancelled) setLoadingBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email, isHeaderChatInbox]);

  useEffect(() => {
    if (!workspace?.trim()) {
      setLoadingWorkspaceChannels(false);
      setChannels([]);
      setMembers([]);
      setChannel(null);
      return;
    }
    const wsTarget = workspace.trim();
    let cancelled = false;
    setLoadingWorkspaceChannels(true);
    setError(null);
    setChannels([]);
    setMembers([]);
    setChannel(null);
    (async () => {
      try {
        const viewer = (user?.user || user?.email || '').trim();
        const cachedChannels = await getRavenWorkspaceChannelsSnapshot(user?.email, wsTarget);
        if (!cancelled && selectedWorkspaceRef.current === wsTarget && cachedChannels?.length) {
          setChannels(cachedChannels);
        }
        const [rows, mem] = await Promise.all([
          listChannelsForWorkspace(wsTarget, viewer),
          fetchWorkspaceMembers(wsTarget),
        ]);
        if (cancelled || selectedWorkspaceRef.current !== wsTarget) return;
        setChannels(rows);
        void setRavenWorkspaceChannelsSnapshot(user?.email, wsTarget, rows);
        setMembers(mem);
        const last = await getRavenLastChat(user?.email);
        let restored: RavenChannelRow | null = null;
        const pending = pendingOpenFromGlobalRef.current;
        if (pending && pending.ws.trim().toLowerCase() === wsTarget.trim().toLowerCase()) {
          const chId = pending.channelId.trim();
          const peer = pending.peerUserId?.trim();
          pendingOpenFromGlobalRef.current = null;
          restored = rows.find((r) => String(r.name) === chId) ?? null;
          if (!restored && peer) {
            const base = buildFallbackDmChannelRow(wsTarget, chId, peer);
            const enriched = await enrichRavenChannelsWithPeerProfiles([base], user?.email);
            restored = enriched[0] ?? base;
          }
          if (!restored) {
            setWorkspace(null);
            Alert.alert('Chat', 'That conversation is no longer available.');
          }
        } else if (!isHeaderChatInbox && last?.workspace?.trim() && last.channelId?.trim()) {
          const lw = last.workspace.trim().toLowerCase();
          const tw = wsTarget.trim().toLowerCase();
          if (lw === tw) {
            restored = rows.find((r) => String(r.name) === last.channelId.trim()) ?? null;
          }
        }
        setChannel(restored);
        setError(null);
      } catch (e: any) {
        if (!cancelled && selectedWorkspaceRef.current === wsTarget) {
          setChannels([]);
          setMembers([]);
          setError(e?.message || 'Failed to load supplier group');
        }
      } finally {
        if (!cancelled && selectedWorkspaceRef.current === wsTarget) {
          setLoadingWorkspaceChannels(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace, user?.email, isHeaderChatInbox]);

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

  const sortedWorkspaceRows = useMemo(() => {
    return [...workspaceRows]
      .filter((w) => String(w.name || '').trim())
      .sort((a, b) =>
        workspaceListPrimaryLabel(a).localeCompare(workspaceListPrimaryLabel(b), undefined, {
          sensitivity: 'base',
        })
      );
  }, [workspaceRows]);

  const listSearchQ = listSearchQuery.trim().toLowerCase();

  const filteredGlobalInboxRows = useMemo(() => {
    if (!listSearchQ) return globalInboxRows;
    return globalInboxRows.filter((row) => {
      const ch = row.channel;
      const titlePrefix = isDmChannel(ch) ? '' : channelPrefix(ch.type);
      const title = `${titlePrefix}${getRavenChannelDisplayLabel(ch, user?.email)}`.toLowerCase();
      const ws = (row.workspaceLabel || '').toLowerCase();
      const prev = (row.preview || '').toLowerCase();
      return title.includes(listSearchQ) || ws.includes(listSearchQ) || prev.includes(listSearchQ);
    });
  }, [globalInboxRows, listSearchQ, user?.email]);

  const filteredSortedWorkspaceRows = useMemo(() => {
    if (!listSearchQ) return sortedWorkspaceRows;
    return sortedWorkspaceRows.filter((w) => {
      const primary = workspaceListPrimaryLabel(w).toLowerCase();
      const secondary = (workspaceListSecondaryLabel(w) || '').toLowerCase();
      return primary.includes(listSearchQ) || secondary.includes(listSearchQ);
    });
  }, [sortedWorkspaceRows, listSearchQ]);

  const filteredWorkspaceAdminsSorted = useMemo(() => {
    if (!listSearchQ) return workspaceAdminsSorted;
    return workspaceAdminsSorted.filter((m) => {
      const label = friendlySenderLabel(m.user).toLowerCase();
      const uid = (m.user || '').trim().toLowerCase();
      const linked = (ravenWorkspaceMemberLinkedSupplierId(m) || '').trim().toLowerCase();
      return (
        label.includes(listSearchQ) ||
        uid.includes(listSearchQ) ||
        (linked.length > 0 && linked.includes(listSearchQ))
      );
    });
  }, [workspaceAdminsSorted, listSearchQ]);

  useEffect(() => {
    setHubInfoModal(null);
    setListSearchQuery('');
  }, [workspace]);

  useEffect(() => {
    setListSearchQuery('');
  }, [route.name]);

  const loadGlobalInbox = useCallback(
    async (opts?: {
      silent?: boolean;
      isCancelled?: () => boolean;
      workspaceRowsSnapshot?: RavenWorkspaceRow[];
    }) => {
      const silent = opts?.silent === true;

      if (!isHeaderChatInbox || workspace != null) return;

      const myGen = ++globalInboxLoadGenerationRef.current;
      const isCancelled = opts?.isCancelled;
      const stale = () =>
        isCancelled?.() === true || myGen !== globalInboxLoadGenerationRef.current;

      const wsRows = opts?.workspaceRowsSnapshot ?? workspaceRows;

      if (!silent) {
        const cachedInbox = await getRavenGlobalInboxSnapshot(user?.email);
        if (stale()) return;
        if (cachedInbox?.length) {
          setGlobalInboxRows(cachedInbox as GlobalInboxRow[]);
          setLoadingGlobalInbox(false);
        } else {
          setLoadingGlobalInbox(true);
        }
      }
      try {
        let chs: RavenChannelRow[] = [];
        const viewerId = (user?.user || user?.email || '').trim();
        try {
          chs = await listRavenChannelsForSessionUser(viewerId);
        } catch {
          chs = [];
        }
        if (stale()) return;
        if (chs.length === 0) {
          if (!stale()) {
            setGlobalInboxRows([]);
            void setRavenGlobalInboxSnapshot(user?.email, []);
          }
          return;
        }

        const chsSorted = [...chs].sort(
          (a, b) => ravenChannelLastActivitySortTimeMs(b) - ravenChannelLastActivitySortTimeMs(a)
        );

        const finalizeGlobalInboxRows = (raw: GlobalInboxRow[]) => {
          const byChannelId = new Map<string, GlobalInboxRow>();
          const rowScore = (r: GlobalInboxRow) => r.timeMs;
          for (const row of raw) {
            const cid = row.channel.name?.trim();
            if (!cid) continue;
            const prevRow = byChannelId.get(cid);
            if (!prevRow || rowScore(row) > rowScore(prevRow)) {
              byChannelId.set(cid, {
                ...row,
                key: cid,
                workspaceId: row.workspaceId,
                workspaceLabel: row.workspaceLabel,
                workspaceLogo: row.workspaceLogo,
                channel: row.channel,
              });
            }
          }
          const merged = Array.from(byChannelId.values());
          const chLabel = (r: GlobalInboxRow) =>
            getRavenChannelDisplayLabel(r.channel, user?.email).toLowerCase();
          merged.sort((a, b) => {
            const d = rowScore(b) - rowScore(a);
            if (d !== 0) return d;
            return chLabel(a).localeCompare(chLabel(b), undefined, { sensitivity: 'base' });
          });
          return merged;
        };

        const buildInboxRow = async (ch: RavenChannelRow): Promise<GlobalInboxRow | null> => {
          const id = ch.name?.trim();
          if (!id) return null;
          const wsKey = String(ch.workspace || '').trim();
          const wsRow = wsRows.find(
            (w) => String(w.name || '').trim().toLowerCase() === wsKey.toLowerCase()
          );
          const lbl = wsRow ? workspaceListPrimaryLabel(wsRow) : wsKey || 'Supplier group';
          const wsLogo =
            wsRow?.logo != null && String(wsRow.logo).trim() ? String(wsRow.logo).trim() : null;
          try {
            const { latest, latestText } = await fetchChannelLatestAndMostRecentTextMessage(id);
            /** Include threads whose newest activity is only a document link or attachment (no plain `text`). */
            const rowForPreview = latestText ?? latest;
            if (!rowForPreview) return null;
            const previewMeta = inboxPreviewFromLastMessage(rowForPreview);
            const sortAnchor = latest ?? latestText ?? rowForPreview;
            const sortMeta = inboxPreviewFromLastMessage(sortAnchor);
            const tLatest = ravenMessageRowSortTimeMs(latest);
            const tText = ravenMessageRowSortTimeMs(latestText);
            const channelActivityMs = ravenChannelLastActivitySortTimeMs(ch);
            const recencyMs = Math.max(tLatest, tText, sortMeta.timeMs, channelActivityMs);
            return {
              key: `${wsKey || 'ws'}:${id}`,
              workspaceId: wsKey || String(wsRow?.name || '').trim() || id,
              workspaceLabel: lbl,
              workspaceLogo: wsLogo,
              channel: ch,
              preview: previewMeta.preview,
              timeLabel: sortMeta.timeLabel,
              timeMs: recencyMs || sortMeta.timeMs,
              hasMessages: true,
            };
          } catch {
            return null;
          }
        };

        /** Each channel preview commits on its own — first row clears the spinner; no waiting for peers in the same wave. */
        let clearedSpinnerAfterFirstRow = false;
        const tryClearLoadingAfterFirstRow = () => {
          if (silent || clearedSpinnerAfterFirstRow || stale() || myGen !== globalInboxLoadGenerationRef.current) return;
          clearedSpinnerAfterFirstRow = true;
          setLoadingGlobalInbox(false);
        };

        await forEachWithConcurrency(chsSorted, RAVEN_GLOBAL_INBOX_PREVIEW_CONCURRENCY, async (ch) => {
          if (stale()) return;
          const row = await buildInboxRow(ch);
          if (stale() || !row) return;
          setGlobalInboxRows((prev) => finalizeGlobalInboxRows([...prev, row]));
          tryClearLoadingAfterFirstRow();
        });
      } catch {
        if (!stale()) {
          setGlobalInboxRows([]);
          void setRavenGlobalInboxSnapshot(user?.email, []);
        }
      } finally {
        if (!silent && myGen === globalInboxLoadGenerationRef.current) {
          setLoadingGlobalInbox(false);
        }
      }
    },
    [isHeaderChatInbox, workspace, workspaceRows, user?.email, user?.user]
  );

  /** Persist global inbox to disk (debounced) for next cold open. */
  useEffect(() => {
    if (!isHeaderChatInbox || workspace != null) return;
    const email = user?.email?.trim();
    if (!email || globalInboxRows.length === 0) return;
    const t = setTimeout(() => {
      void setRavenGlobalInboxSnapshot(email, globalInboxRows as RavenCachedGlobalInboxRow[]);
    }, 650);
    return () => clearTimeout(t);
  }, [globalInboxRows, user?.email, isHeaderChatInbox, workspace]);

  /** Persist recent messages for the open thread (debounced). */
  useEffect(() => {
    const email = user?.email?.trim();
    const ch = channel?.name?.trim();
    if (!email || !ch || messages.length === 0) return;
    const t = setTimeout(() => {
      void setRavenChannelMessagesSnapshot(email, ch, messages);
    }, 550);
    return () => clearTimeout(t);
  }, [messages, channel?.name, user?.email]);

  /** True after we have painted the header Chats list surface at least once (avoids empty flash on tab switch). */
  const wasOnGlobalInboxListRef = useRef(false);

  useLayoutEffect(() => {
    const onGlobalInboxList = isHeaderChatInbox && workspace == null;
    if (!onGlobalInboxList) {
      setLoadingGlobalInbox(false);
      wasOnGlobalInboxListRef.current = false;
      return;
    }
    if (!wasOnGlobalInboxListRef.current) {
      wasOnGlobalInboxListRef.current = true;
      /** Spinner + first paint are driven by `loadGlobalInbox` (hydrates from disk snapshot when present). */
    }
  }, [isHeaderChatInbox, workspace]);

  /** Suppliers tab: hide bottom tabs during an open conversation (same feel as stack “Chats”). */
  useLayoutEffect(() => {
    const isSuppliersTab = route.name === 'Suppliers' || route.name === 'SupplierMessages';
    // Supplier Chat uses the same inbox UI as header Chats but is still a tab — hide tabs when a thread is open.
    if (route.name === 'RavenChatInbox' || !isSuppliersTab) {
      return undefined;
    }
    const defaultStyle = getMainTabBarStyle(insets);
    const hideTab = !!(workspace?.trim() && channel);
    const nav = navigation as { setOptions: (o: { tabBarStyle?: object }) => void };
    nav.setOptions({
      tabBarStyle: hideTab ? { display: 'none' } : defaultStyle,
    });
    return () => {
      nav.setOptions({ tabBarStyle: defaultStyle });
    };
  }, [route.name, workspace, channel, navigation, insets]);

  /** Initial + dependency-driven reload of the header Chats list (runs in parallel with workspace boot when hub is visible). */
  useEffect(() => {
    if (!isHeaderChatInbox || workspace != null) return;
    let cancelled = false;
    void loadGlobalInbox({ silent: false, isCancelled: () => cancelled });
    return () => {
      cancelled = true;
      globalInboxLoadGenerationRef.current++;
    };
  }, [isHeaderChatInbox, workspace, workspaceRows, user?.email, user?.user, loadGlobalInbox]);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      setActiveChannelId(channelIdRef.current);
      void refreshUnreadCounts();
      if (workspace?.trim()) void loadPresence();
      const tick = () => {
        const id = channelIdRef.current;
        if (id) void loadMessages(id, { silent: true });
        void refreshUnreadCounts();
        if (
          isHeaderChatInbox &&
          workspace == null &&
          screenFocusedRef.current &&
          headerGlobalInboxSurfaceRef.current
        ) {
          void loadGlobalInbox({
            silent: true,
            isCancelled: () =>
              !screenFocusedRef.current ||
              !headerGlobalInboxSurfaceRef.current,
          });
        }
      };
      tick();
      pollRef.current = setInterval(tick, POLL_MS);
      return () => {
        screenFocusedRef.current = false;
        setActiveChannelId(null);
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [
      loadMessages,
      refreshUnreadCounts,
      setActiveChannelId,
      workspace,
      loadPresence,
      isHeaderChatInbox,
      loadGlobalInbox,
    ])
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
        if (
          isHeaderChatInbox &&
          workspace == null &&
          headerGlobalInboxSurfaceRef.current
        ) {
          void loadGlobalInbox({
            silent: true,
            isCancelled: () => !headerGlobalInboxSurfaceRef.current,
          });
        }
      }
    });
    return () => sub.remove();
  }, [loadMessages, refreshUnreadCounts, isHeaderChatInbox, workspace, loadGlobalInbox]);

  /**
   * Pops one level of in-screen hierarchy (modals → thread → workspace).
   * Returns true if the pop gesture / back should NOT dismiss this route yet.
   */
  const consumeRavenMessagesInternalBack = useCallback((): boolean => {
    const s = hierarchyForBackRef.current;
    if (s.hubInfoModal != null) {
      setHubInfoModal(null);
      return true;
    }
    if (s.searchOpen) {
      setSearchOpen(false);
      return true;
    }
    if (s.drawerOpen) {
      setDrawerOpen(false);
      return true;
    }
    if (s.channel) {
      if (isHeaderChatInbox) {
        setChannel(null);
        setWorkspace(null);
        setChannels([]);
        setMembers([]);
        return true;
      }
      setChannel(null);
      return true;
    }
    if (s.workspace?.trim()) {
      if (isHeaderChatInbox) {
        setDrawerOpen(false);
        setWorkspace(null);
        setChannels([]);
        setMembers([]);
        setChannel(null);
        setError(null);
        return true;
      }
      setDrawerOpen(false);
      setWorkspace(null);
      setChannels([]);
      setMembers([]);
      setChannel(null);
      setError(null);
      return true;
    }
    return false;
  }, [isHeaderChatInbox]);

  /** When true, stack swipe / gesture back is deferred to in-screen hierarchy (see `usePreventRemove`). */
  const hasRavenMessagesHierarchyToPop = useMemo(
    () =>
      hubInfoModal != null ||
      searchOpen ||
      drawerOpen ||
      !!channel ||
      !!(workspace && workspace.trim()),
    [hubInfoModal, searchOpen, drawerOpen, channel, workspace]
  );

  /** Header chevron + Android hardware back: also pops the stack when at hierarchy root. */
  const performRavenMessagesBackAction = useCallback((): boolean => {
    if (consumeRavenMessagesInternalBack()) return true;
    (navigation as { goBack: () => void }).goBack();
    return true;
  }, [consumeRavenMessagesInternalBack, navigation]);

  const onPreventRemoveSwipe = useCallback(() => {
    consumeRavenMessagesInternalBack();
  }, [consumeRavenMessagesInternalBack]);

  usePreventRemove(hasRavenMessagesHierarchyToPop, onPreventRemoveSwipe);

  /**
   * JS stack: interactive pop can still win over `usePreventRemove`. Disable the stack's edge pop
   * while there is in-screen hierarchy, and use a thin edge pan (below) to run the same back logic.
   */
  const stackGestureSurface = route.name === 'RavenChatInbox' || route.name === 'RavenUIMessages';
  const showEdgeSwipeBackStrip =
    (stackGestureSurface || route.name === 'Suppliers' || route.name === 'SupplierMessages') &&
    hasRavenMessagesHierarchyToPop;

  useLayoutEffect(() => {
    if (!stackGestureSurface) return;
    const nav = navigation as { setOptions: (o: { gestureEnabled?: boolean }) => void };
    nav.setOptions({
      gestureEnabled: !hasRavenMessagesHierarchyToPop,
    });
    return () => {
      nav.setOptions({ gestureEnabled: true });
    };
  }, [navigation, hasRavenMessagesHierarchyToPop, stackGestureSurface]);

  const performBackFromEdgeSwipeJs = useCallback(() => {
    performRavenMessagesBackAction();
  }, [performRavenMessagesBackAction]);

  const edgeSwipeBackGesture = useMemo(() => {
    const rtl = I18nManager.isRTL;
    return Gesture.Pan()
      .activeOffsetX(rtl ? -12 : 12)
      .failOffsetY([-28, 28])
      .onEnd((e) => {
        'worklet';
        const tx = e.translationX;
        const vx = e.velocityX;
        const shouldAct = rtl ? tx < -52 || vx < -600 : tx > 52 || vx > 600;
        if (shouldAct) {
          runOnJS(performBackFromEdgeSwipeJs)();
        }
      });
  }, [performBackFromEdgeSwipeJs]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => performRavenMessagesBackAction());
      return () => sub.remove();
    }, [performRavenMessagesBackAction])
  );

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

  const openProfileFromDrawer = useCallback(() => {
    setDrawerOpen(false);
    (navigation as { navigate: (name: string, params?: object) => void }).navigate('Main', { screen: 'Profile' });
  }, [navigation]);

  const openSettingsFromDrawer = useCallback(() => {
    setDrawerOpen(false);
    (navigation as { navigate: (name: string) => void }).navigate('Settings');
  }, [navigation]);

  const openAttachMenu = useCallback(() => {
    if (!channel || sending) return;

    const supplierChat = route.name === 'SupplierMessages';

    if (supplierChat) {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Photos & videos', 'File', 'New quotation'],
            cancelButtonIndex: 0,
          },
          (idx) => {
            if (idx === 1) void pickMedia();
            if (idx === 2) void pickDocument();
            if (idx === 3) openQuotationComposeFromChat();
          }
        );
      } else {
        Alert.alert('Attach', undefined, [
          { text: 'Photos & videos', onPress: () => void pickMedia() },
          { text: 'File', onPress: () => void pickDocument() },
          { text: 'New quotation', onPress: () => openQuotationComposeFromChat() },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Photos & videos', 'File'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) void pickMedia();
          if (idx === 2) void pickDocument();
        }
      );
    } else {
      Alert.alert('Attach', undefined, [
        { text: 'Photos & videos', onPress: () => void pickMedia() },
        { text: 'File', onPress: () => void pickDocument() },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [channel, sending, pickMedia, pickDocument, route.name, openQuotationComposeFromChat]);

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
      let rows = await listMessagesForChannel(channel.name, RAVEN_CHAT_FIRST_PAGE_SIZE);
      for (const p of mergePayloads) {
        rows = ravenMergeMessageRowFromSendResponse(rows, p);
      }
      const apiLen = rows.length;
      const msgSnap = await getRavenChannelMessagesSnapshot(user?.email, channel.name);
      rows = mergeCachedChannelMessagesWithFreshFirstPage(rows, msgSnap);
      setMessages(sortRavenMessagesNewestFirst(rows));
      setHasMoreOlderMessages(rows.length >= RAVEN_CHAT_FIRST_PAGE_SIZE || rows.length > apiLen);
      setError(null);
    } catch (e: any) {
      Alert.alert('Message not sent', e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (channel?.name) {
      void loadMessages(channel.name);
      return;
    }
    if (!workspace?.trim()) {
      void (async () => {
        try {
          const wsList = await fetchRavenWorkspaces();
          const next = Array.isArray(wsList) ? wsList : [];
          setWorkspaceRows(next);
          if (isHeaderChatInbox) {
            await loadGlobalInbox({ silent: true, workspaceRowsSnapshot: next });
          }
        } catch {
          /* keep list */
        } finally {
          setRefreshing(false);
        }
      })();
      return;
    }
    void (async () => {
      try {
        const viewer = (user?.user || user?.email || '').trim();
        const ws = workspace.trim();
        const cached = await getRavenWorkspaceChannelsSnapshot(user?.email, ws);
        if (cached?.length) setChannels(cached);
        const rows = await listChannelsForWorkspace(workspace, viewer);
        setChannels(rows);
        void setRavenWorkspaceChannelsSnapshot(user?.email, ws, rows);
        const mem = await fetchWorkspaceMembers(workspace);
        setMembers(mem);
      } catch {
        /* keep existing list */
      } finally {
        setRefreshing(false);
      }
    })();
  };

  const selectChannel = useCallback(
    (c: RavenChannelRow) => {
      setChannel(c);
      setDrawerOpen(false);
      if (workspace?.trim() && c?.name) {
        void setRavenLastChat(user?.email, { workspace: workspace.trim(), channelId: c.name });
      }
    },
    [workspace, user?.email]
  );

  const openGlobalInboxChat = useCallback((row: GlobalInboxRow) => {
    void setRavenLastChat(user?.email, {
      workspace: row.workspaceId.trim(),
      channelId: row.channel.name.trim(),
    });
    pendingOpenFromGlobalRef.current = { ws: row.workspaceId.trim(), channelId: row.channel.name.trim() };
    setWorkspace(row.workspaceId.trim());
  }, [user?.email]);

  const renderGlobalInboxRow = useCallback(
    ({ item }: { item: GlobalInboxRow }) => {
      const ch = item.channel;
      const unread = unreadByChannelId[ch.name] ?? 0;
      const titlePrefix = isDmChannel(ch) ? '' : channelPrefix(ch.type);
      const peerLine = getRavenDmPeerUserId(ch, user?.email);
      const metaLine = isDmChannel(ch)
        ? peerLine
          ? friendlySenderLabel(peerLine)
          : 'Direct message'
        : ch.type || '';
      const titleText = `${titlePrefix}${getRavenChannelDisplayLabel(ch, user?.email)}`;
      const subCore = item.preview?.trim() || metaLine || '';
      const subText = (item.workspaceLabel ? `${item.workspaceLabel} · ` : '') + (subCore || ' ');
      const wsLogoUri = resolveRavenErpAttachImageUri(item.workspaceLogo);
      return (
        <TouchableOpacity
          style={s.refListRow}
          onPress={() => openGlobalInboxChat(item)}
          activeOpacity={0.7}
        >
          <View style={s.refListAvatarWrap}>
            {wsLogoUri ? (
              <View style={[s.refListInitCircle, s.refListLogoClip]}>
                <ErpAuthenticatedImage uri={wsLogoUri} style={s.refListWorkspaceLogoImg} resizeMode="cover" />
              </View>
            ) : (
              <RavenChannelPeerAvatar channel={ch} currentUserEmail={user?.email} size={52} variant="raven" />
            )}
            {peerLine &&
            ravenUserIsActiveLikeWeb(peerLine, viewerFrappeName, presenceActiveSet, presenceInvisibleSet) ? (
              <View style={s.refListOnlineDot} />
            ) : null}
          </View>
          <View style={s.refListMain}>
            <View style={s.refListTopRow}>
              <Text style={s.refListTitle} numberOfLines={1}>
                {titleText}
              </Text>
              {item.timeLabel ? <Text style={s.refListTime}>{item.timeLabel}</Text> : null}
            </View>
            <View style={s.refListSubRow}>
              {unread === 0 && !!item.preview?.trim() ? (
                <Ionicons name="checkmark-done" size={16} color={RavenLight.success} style={{ marginRight: 4 }} />
              ) : null}
              <Text style={s.refListSubtitle} numberOfLines={1}>
                {subText}
              </Text>
            </View>
          </View>
          <View style={s.refListRight}>
            {unread > 0 ? (
              <View style={s.refListUnreadBadge}>
                <Text style={s.refListUnreadText}>{unread > 99 ? '99+' : String(unread)}</Text>
              </View>
            ) : (
              <Ionicons name="time-outline" size={15} color={RavenLight.textSubtle} />
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [openGlobalInboxChat, user?.email, unreadByChannelId, viewerFrappeName, presenceActiveSet, presenceInvisibleSet]
  );

  const openDmWith = async (otherUserId: string) => {
    if (!workspace || openingDmFor) return;
    setOpeningDmFor(otherUserId);
    try {
      const chId = await createDirectMessageChannel(otherUserId);
      const viewer = (user?.user || user?.email || '').trim();
      const ws = workspace.trim();
      const cached = await getRavenWorkspaceChannelsSnapshot(user?.email, ws);
      if (cached?.length) setChannels(cached);
      const next = await listChannelsForWorkspace(workspace, viewer);
      setChannels(next);
      void setRavenWorkspaceChannelsSnapshot(user?.email, ws, next);
      const found = next.find((c) => c.name === chId);
      const base: RavenChannelRow =
        found ?? buildFallbackDmChannelRow(workspace.trim(), chId, otherUserId);
      const enriched = await enrichRavenChannelsWithPeerProfiles([base], user?.email);
      const opened = enriched[0] ?? base;
      setChannel(opened);
      void setRavenLastChat(user?.email, { workspace: workspace.trim(), channelId: opened.name });
      setDrawerOpen(false);
      await loadMessages(chId);
    } catch (e: any) {
      Alert.alert('Direct message', e?.message || 'Could not open DM. Both people need chat accounts on the site.');
    } finally {
      setOpeningDmFor(null);
    }
  };

  const openChannelFromSuppliersRouteParams = useCallback(
    async (wsRaw: string, chRaw: string, peerUserIdRaw?: string) => {
      const wsNorm = wsRaw.trim();
      const chNorm = chRaw.trim();
      const peerNorm = (peerUserIdRaw || '').trim();
      if (!wsNorm || !chNorm) return;
      void setRavenLastChat(user?.email, { workspace: wsNorm, channelId: chNorm });
      const sameWs = workspace?.trim().toLowerCase() === wsNorm.toLowerCase();
      if (sameWs) {
        try {
          const viewer = (user?.user || user?.email || '').trim();
          const cached = await getRavenWorkspaceChannelsSnapshot(user?.email, wsNorm);
          if (cached?.length) setChannels(cached);
          const rows = await listChannelsForWorkspace(wsNorm, viewer);
          if (selectedWorkspaceRef.current !== wsNorm) return;
          setChannels(rows);
          void setRavenWorkspaceChannelsSnapshot(user?.email, wsNorm, rows);
          const mem = await fetchWorkspaceMembers(wsNorm);
          if (selectedWorkspaceRef.current !== wsNorm) return;
          setMembers(mem);
          const found = rows.find((r) => String(r.name) === chNorm) ?? null;
          let opened: RavenChannelRow | null = null;
          if (found) {
            const [ec] = await enrichRavenChannelsWithPeerProfiles([found], user?.email);
            opened = ec ?? found;
          } else if (peerNorm) {
            const base = buildFallbackDmChannelRow(wsNorm, chNorm, peerNorm);
            const enriched = await enrichRavenChannelsWithPeerProfiles([base], user?.email);
            opened = enriched[0] ?? base;
          }
          if (opened) {
            setChannel(opened);
            void loadMessages(chNorm);
          } else {
            Alert.alert('Chat', 'Could not open that conversation.');
          }
        } catch (e: any) {
          Alert.alert('Chat', e?.message || 'Could not load conversation.');
        }
      } else {
        pendingOpenFromGlobalRef.current = {
          ws: wsNorm,
          channelId: chNorm,
          ...(peerNorm ? { peerUserId: peerNorm } : {}),
        };
        setWorkspace(wsNorm);
      }
    },
    [workspace, user?.email, loadMessages]
  );

  useEffect(() => {
    if (isHeaderChatInbox) return;
    const p = route.params as
      | { openRavenWorkspaceId?: string; openRavenChannelId?: string; openRavenPeerUserId?: string }
      | undefined;
    const ws = String(p?.openRavenWorkspaceId ?? '').trim();
    const ch = String(p?.openRavenChannelId ?? '').trim();
    const peer = String(p?.openRavenPeerUserId ?? '').trim();
    if (!ws || !ch) return;
    void openChannelFromSuppliersRouteParams(ws, ch, peer || undefined);
    const raf = requestAnimationFrame(() => {
      try {
        (navigation as unknown as { setParams: (obj: Record<string, unknown>) => void }).setParams({
          openRavenWorkspaceId: undefined,
          openRavenChannelId: undefined,
          openRavenPeerUserId: undefined,
        });
      } catch {
        /* noop */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isHeaderChatInbox, route.params, openChannelFromSuppliersRouteParams, navigation]);

  useEffect(() => {
    if (isHeaderChatInbox) {
      setRavenOpenChatFromProfileSubscriber(null);
      return;
    }
    setRavenOpenChatFromProfileSubscriber((p) => {
      void openChannelFromSuppliersRouteParams(p.workspaceId, p.channelId, p.peerUserId);
    });
    return () => setRavenOpenChatFromProfileSubscriber(null);
  }, [isHeaderChatInbox, openChannelFromSuppliersRouteParams]);

  const openAdminSupplierSheet = useCallback(
    (m: RavenWorkspaceMemberRow) => {
      const linked = ravenWorkspaceMemberLinkedSupplierId(m);
      if (!linked) {
        Alert.alert(
          'No supplier linked',
          'Set the Supplier field (`custom_supplier`) on this Raven member record in Frappe to open the full supplier profile.'
        );
        return;
      }
      (navigation as { navigate: (name: string, params: object) => void }).navigate('RavenWorkspaceSupplierProfile', {
        supplierDocName: linked,
        workspaceAdminUser: m.user,
        ...(workspace?.trim() ? { ravenWorkspaceId: workspace.trim() } : {}),
      });
    },
    [navigation, workspace]
  );

  const renderWorkspaceRow = useCallback(({ item }: { item: RavenWorkspaceRow }) => {
    const primary = workspaceListPrimaryLabel(item);
    const secondary = workspaceListSecondaryLabel(item);
    const logoUri = resolveRavenErpAttachImageUri(item.logo);
    return (
      <TouchableOpacity
        style={s.refListRow}
        onPress={() => {
          setWorkspace(String(item.name).trim());
          setChannel(null);
        }}
        activeOpacity={0.7}
      >
        <View style={s.refListAvatarWrap}>
          {logoUri ? (
            <View style={[s.refListInitCircle, s.refListLogoClip]}>
              <ErpAuthenticatedImage uri={logoUri} style={s.refListWorkspaceLogoImg} resizeMode="cover" />
            </View>
          ) : (
            <View style={[s.refListInitCircle, { backgroundColor: pastelAvatarBg(item.name || '?') }]}>
              <Text style={s.refListInitText}>{initialsFromUserId(primary)}</Text>
            </View>
          )}
        </View>
        <View style={s.refListMain}>
          <View style={s.refListTopRow}>
            <Text style={s.refListTitle} numberOfLines={1}>
              {primary}
            </Text>
          </View>
          <View style={s.refListSubRow}>
            <Ionicons name="layers-outline" size={15} color={RavenLight.textSubtle} style={{ marginRight: 4 }} />
            <Text style={s.refListSubtitle} numberOfLines={1}>
              {secondary || 'Supplier group'}
            </Text>
          </View>
        </View>
        <View style={s.refListRight}>
          <Ionicons name="chevron-forward" size={18} color={RavenLight.textSubtle} />
        </View>
      </TouchableOpacity>
    );
  }, []);

  const renderWorkspaceAdminRow = useCallback(
    ({ item }: { item: RavenWorkspaceMemberRow }) => {
      const seed = item.user || '?';
      const hasSupplier = !!ravenWorkspaceMemberLinkedSupplierId(item);
      const userImgUri = resolveRavenErpAttachImageUri(item.user_profile_image);
      const supplierImgUri = resolveRavenErpAttachImageUri(item.supplier_image);
      const avatarUri = userImgUri || supplierImgUri;
      const showDot = ravenUserIsActiveLikeWeb(item.user, viewerFrappeName, presenceActiveSet, presenceInvisibleSet);
      const subLine = hasSupplier ? 'Profile linked · tap to open supplier' : 'No supplier profile linked';
      return (
        <TouchableOpacity
          style={s.refListRow}
          onPress={() => openAdminSupplierSheet(item)}
          activeOpacity={0.7}
        >
          <View style={s.refListAvatarWrap}>
            {avatarUri ? (
              <View style={[s.refListInitCircle, s.refListLogoClip]}>
                <ErpAuthenticatedImage uri={avatarUri} style={s.refListWorkspaceLogoImg} resizeMode="cover" />
              </View>
            ) : (
              <View style={[s.refListInitCircle, { backgroundColor: pastelAvatarBg(seed) }]}>
                <Text style={s.refListInitText}>{initialsFromUserId(seed)}</Text>
              </View>
            )}
            {showDot ? <View style={s.refListOnlineDot} /> : null}
          </View>
          <View style={s.refListMain}>
            <View style={s.refListTopRow}>
              <Text style={s.refListTitle} numberOfLines={1}>
                {friendlySenderLabel(item.user)}
              </Text>
            </View>
            <View style={s.refListSubRow}>
              <Ionicons name="person-outline" size={15} color={RavenLight.textSubtle} style={{ marginRight: 4 }} />
              <Text style={s.refListSubtitle} numberOfLines={1}>
                {subLine}
              </Text>
            </View>
          </View>
          <View style={s.refListRight}>
            {showDot ? (
              <Ionicons name="radio-button-on" size={14} color={RavenLight.onlineGreen} />
            ) : (
              <Ionicons name="time-outline" size={15} color={RavenLight.textSubtle} />
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [openAdminSupplierSheet, viewerFrappeName, presenceActiveSet, presenceInvisibleSet]
  );

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
      const isSupplierRoute = route.name === 'SupplierMessages';
      const isSupplierPortalUser = user?.appMode === 'supplier' || !!user?.supplierId?.trim();
      const showBuyerQuotationActions =
        (!!qDraft || !!sqLink) && !mine && !isSupplierPortalUser && !isSupplierRoute;
      /** Any linked SQ in supplier inbox: Pay/Reply long-press applies to admin or self-posted links once ERP supplier matches session. */
      const supplierSqSelfServeUx = isSupplierRoute && !!sqLink;

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

      const attachBody = hasAttach ? (
        <RavenMessageAttachmentBody
          item={item}
          mine={mine}
          variant="raven"
          mediaGroupNeighbor={mediaGroupNeighbor}
          onReplyLongPress={() => setReplyTo(item)}
        />
      ) : null;
      const tLine = formatMessageHeaderTime(item.creation);
      const showReplyQuote = ravenMessageShowsReplyQuoteRow(item);

      /**
       * Frappe User for SI **customer** resolution (Raven User.custom_customer, portal, etc.).
       * Always pass session user (including supplier Pay) so bill-to resolution runs; do not use Raven `owner`.
       */
      const customerPartyFrappeUserForSq = String(user?.user || user?.email || '').trim() || null;

      const quotationCard =
        sqLink != null ? (
          <RavenLinkedSupplierQuotationMessage
            sqName={sqLink}
            billToFrappeUserId={customerPartyFrappeUserForSq}
            supplierSelfServeUx={supplierSqSelfServeUx}
            showBuyerActions={showBuyerQuotationActions}
            viewerSupplierDocId={user?.supplierId}
            handled={quotationActionByName[sqLink] ?? null}
            busy={quotationActionBusy === sqLink}
            onAccept={showBuyerQuotationActions ? () => void handleAcceptQuotationDraft(sqLink) : undefined}
            onReject={showBuyerQuotationActions ? () => void handleRejectQuotationDraft(sqLink) : undefined}
            onSupplierReplyToQuotation={supplierSqSelfServeUx ? () => setReplyTo(item) : undefined}
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

      const showPlainTextBubble = !!item.text?.trim() && !qDraft && !sqLink && !genericDocLink;
      const blockRowLongPressForSupplierSqMenu = isSupplierRoute && sqLink != null;

      if (mine) {
        return (
          <Pressable
            style={[s.bubbleRow, s.bubbleRowMine]}
            onLongPress={blockRowLongPressForSupplierSqMenu ? undefined : () => setReplyTo(item)}
            delayLongPress={380}
          >
            <View style={s.msgColMine}>
              {showReplyQuote ? (
                <RavenInlineReplyQuote
                  item={item}
                  mine={mine}
                  messagesById={messagesById}
                  onScrollToQuoted={scrollToMessageById}
                  variant="raven"
                />
              ) : null}
              {!showReplyQuote && !!item.is_reply ? <Text style={[s.replyBadge, s.replyBadgeMine]}>Reply</Text> : null}
              {attachBody}
              {quotationCard}
              {showPlainTextBubble ? (
                <View style={s.mineTextBubble}>
                  <Text style={[s.bubbleBody, s.bubbleBodyMine]}>{item.text}</Text>
                </View>
              ) : null}
              <Text style={s.msgTimeMine}>{tLine}</Text>
            </View>
          </Pressable>
        );
      }

      const ownerKey = item.owner || '?';
      const ownerRaw =
        ownerProfileImageByUserId[ownerKey] ?? ownerProfileImageByUserId[ownerKey.toLowerCase()] ?? '';
      const ownerAvatarUri = resolveRavenErpAttachImageUri(ownerRaw);
      return (
        <Pressable
          style={s.msgRowTheirs}
          onLongPress={blockRowLongPressForSupplierSqMenu ? undefined : () => setReplyTo(item)}
          delayLongPress={380}
        >
          <View style={s.msgAvatarWrap}>
            {ownerAvatarUri ? (
              <View style={[s.msgAvatarSq, s.msgAvatarSqClip]}>
                <ErpAuthenticatedImage uri={ownerAvatarUri} style={s.msgAvatarImage} resizeMode="cover" />
              </View>
            ) : (
              <View style={[s.msgAvatarSq, { backgroundColor: pastelAvatarBg(ownerKey) }]}>
                <Text style={s.msgAvatarSqText}>{initialsFromUserId(ownerKey)}</Text>
              </View>
            )}
            {ravenUserIsActiveLikeWeb(item.owner, viewerFrappeName, presenceActiveSet, presenceInvisibleSet) ? (
              <View style={s.onlineDot} />
            ) : null}
          </View>
          <View style={s.msgColTheirs}>
            <View style={s.msgNameRow}>
              <Text style={s.msgAuthorName} numberOfLines={1}>
                {friendlySenderLabel(item.owner)}
              </Text>
              <Text style={s.msgHeaderTime}> {tLine}</Text>
            </View>
            {showReplyQuote ? (
              <RavenInlineReplyQuote
                item={item}
                mine={mine}
                messagesById={messagesById}
                onScrollToQuoted={scrollToMessageById}
                variant="raven"
              />
            ) : null}
            {!showReplyQuote && !!item.is_reply ? <Text style={s.replyBadge}>Reply</Text> : null}
            {attachBody}
            {quotationCard}
            {showPlainTextBubble ? (
              <View style={s.theirsTextBubble}>
                <Text style={s.msgTextTheirs}>{item.text}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [
      user?.email,
      user?.user,
      user?.appMode,
      user?.supplierId,
      route.name,
      messages,
      messagesById,
      viewerFrappeName,
      presenceActiveSet,
      presenceInvisibleSet,
      scrollToMessageById,
      ownerProfileImageByUserId,
      quotationActionByName,
      quotationActionBusy,
      handleAcceptQuotationDraft,
      handleRejectQuotationDraft,
    ]
  );

  if (loadingBoot && !(isHeaderChatInbox && workspace == null)) {
    return (
      <View style={s.safe}>
        <StatusBar style="dark" backgroundColor={RavenLight.panel} translucent />
        <View style={[s.bootCenter, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={RavenLight.accent} />
          <Text style={s.bootHint}>Loading…</Text>
        </View>
      </View>
    );
  }

  const chName = channel ? getRavenChannelDisplayLabel(channel, user?.email) : 'Select channel';
  const headerDmPeerId = channel ? getRavenDmPeerUserId(channel, user?.email) : null;
  const headerPeerIsActive =
    !!headerDmPeerId &&
    ravenUserIsActiveLikeWeb(headerDmPeerId, viewerFrappeName, presenceActiveSet, presenceInvisibleSet);

  const showListSearchBar = !channel;

  return (
    <View style={s.safe}>
      <StatusBar style="dark" backgroundColor={RavenLight.panel} translucent />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={
          Platform.OS === 'ios' ? insets.top + 6 : (RNStatusBar.currentHeight ?? 0)
        }
      >
        {/* Top bar — paddingTop pulls content below status bar; panel fills notch (see StatusBar). */}
        <View style={[s.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            onPress={performRavenMessagesBackAction}
            style={s.headerIconBtn}
            hitSlop={10}
            accessibilityLabel={
              channel
                ? 'Back to all chats'
                : workspace
                  ? isHeaderChatInbox
                    ? 'Back to all chats'
                    : 'Back to supplier groups'
                  : 'Go back'
            }
          >
            <Ionicons name="chevron-back" size={22} color={RavenLight.text} />
          </TouchableOpacity>
          {channel ? (
            <TouchableOpacity
              style={s.headerCenter}
              onPress={() => setDrawerOpen(true)}
              activeOpacity={0.85}
              accessibilityLabel="Open messages menu"
            >
              <View style={s.headerAvatarCircleWrap}>
                <RavenChannelPeerAvatar channel={channel} currentUserEmail={user?.email} size={40} variant="raven" />
                {headerPeerIsActive ? <View style={s.headerOnlineDot} /> : null}
              </View>
              <Text style={s.headerPeerName} numberOfLines={1}>
                {chName}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[s.headerCenter, s.headerInboxCenter]} pointerEvents="none">
              <Text style={s.headerInboxTitle} numberOfLines={1}>
                {!workspace
                  ? isHeaderChatInbox
                    ? 'Chats'
                    : route.name === 'SupplierMessages'
                      ? 'Workspaces'
                      : 'Supplier groups'
                  : isHeaderChatInbox && !channel
                    ? 'Chats'
                    : workspaceScreenTitle || 'Supplier group'}
              </Text>
              {workspace && !channel ? (
                <Text style={s.headerInboxSub} numberOfLines={1}>
                  {isHeaderChatInbox
                    ? workspaceScreenTitle || 'Supplier group'
                    : route.name === 'SupplierMessages'
                      ? 'Messages'
                      : 'Suppliers'}
                </Text>
              ) : null}
            </View>
          )}
          <View style={s.headerRightActions}>
            {!isHeaderChatInbox && !channel && !workspace ? (
              <TouchableOpacity
                onPress={() => setHubInfoModal('supplier-groups')}
                style={s.headerIconBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="About supplier groups"
              >
                <View style={s.headerInfoCircle}>
                  <Text style={s.headerInfoCircleText}>i</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            {!isHeaderChatInbox && !!workspace?.trim() && !channel ? (
              <TouchableOpacity
                onPress={() => setHubInfoModal('suppliers')}
                style={s.headerIconBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="About suppliers"
              >
                <View style={s.headerInfoCircle}>
                  <Text style={s.headerInfoCircleText}>i</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            {channel ? (
              <TouchableOpacity
                onPress={() => setSearchOpen(true)}
                style={s.headerIconBtn}
                hitSlop={10}
                accessibilityLabel="Search messages and channels"
              >
                <Ionicons name="search-outline" size={22} color={RavenLight.text} />
              </TouchableOpacity>
            ) : null}
            {workspace ? (
              <TouchableOpacity onPress={() => setDrawerOpen(true)} style={s.headerIconBtn} hitSlop={10}>
                <Ionicons name="menu-outline" size={24} color={RavenLight.text} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 4 }} />
            )}
          </View>
        </View>

        {showListSearchBar ? (
          <View style={s.listSearchBarRow}>
            <View style={s.listSearchBarInner}>
              <Ionicons name="search-outline" size={18} color={RavenLight.textSubtle} />
              <TextInput
                style={s.listSearchBarInput}
                value={listSearchQuery}
                onChangeText={setListSearchQuery}
                placeholder={
                  isHeaderChatInbox && !workspace
                    ? 'Search chats…'
                    : !workspace
                      ? 'Search supplier groups…'
                      : 'Search suppliers…'
                }
                placeholderTextColor={RavenLight.textSubtle}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Filter list"
              />
              {Platform.OS === 'android' && listSearchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setListSearchQuery('')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={22} color={RavenLight.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={s.warnBanner}>
            <Ionicons name="warning-outline" size={16} color={RavenLight.danger} style={{ marginRight: 8 }} />
            <Text style={s.warnText}>{error}</Text>
          </View>
        ) : null}

        <View style={s.messageCanvas}>
          {!workspace ? (
            isHeaderChatInbox ? (
              <FlatList
                data={filteredGlobalInboxRows}
                keyExtractor={(row) => row.key}
                renderItem={renderGlobalInboxRow}
                extraData={listSearchQuery}
                contentContainerStyle={s.hubListContent}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RavenLight.accent} />
                }
                ListEmptyComponent={
                  <View style={s.hubEmpty}>
                    {loadingGlobalInbox ||
                    (refreshing && filteredGlobalInboxRows.length === 0 && globalInboxRows.length === 0) ? (
                      <>
                        <ActivityIndicator color={RavenLight.accent} style={{ marginBottom: 12 }} />
                        <Text style={s.inboxEmptyText}>Loading your chats…</Text>
                      </>
                    ) : globalInboxRows.length === 0 ? (
                      <>
                        <View style={s.hubEmptyIconCircle}>
                          <Ionicons name="chatbubbles-outline" size={36} color={RavenLight.accent} />
                        </View>
                        <Text style={s.inboxEmptyText}>No text chats yet</Text>
                        <Text style={s.inboxEmptyHint}>
                          {route.name === 'SupplierMessages'
                            ? 'When buyers message you or add you to a channel in Raven, conversations appear here.'
                            : 'Please go to the supplier list and select a supplier to begin a conversation.'}
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={s.hubEmptyIconCircle}>
                          <Ionicons name="search-outline" size={36} color={RavenLight.textMuted} />
                        </View>
                        <Text style={s.inboxEmptyText}>No matching chats</Text>
                        <Text style={s.inboxEmptyHint}>Try a different search or clear the search bar.</Text>
                      </>
                    )}
                  </View>
                }
              />
            ) : (
              <FlatList
                data={filteredSortedWorkspaceRows}
                keyExtractor={(w) => w.name}
                renderItem={renderWorkspaceRow}
                extraData={listSearchQuery}
                contentContainerStyle={s.hubListContent}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RavenLight.accent} />
                }
                ListEmptyComponent={
                  <View style={s.hubEmpty}>
                    {sortedWorkspaceRows.length === 0 ? (
                      <>
                        <View style={s.hubEmptyIconCircle}>
                          <Ionicons name="layers-outline" size={36} color={RavenLight.accent} />
                        </View>
                        <Text style={s.inboxEmptyText}>No supplier groups</Text>
                        <Text style={s.inboxEmptyHint}>
                          You are not in a supplier group yet, or the list could not be loaded. Ask your admin to add you in
                          Raven.
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={s.hubEmptyIconCircle}>
                          <Ionicons name="search-outline" size={36} color={RavenLight.textMuted} />
                        </View>
                        <Text style={s.inboxEmptyText}>No matching supplier groups</Text>
                        <Text style={s.inboxEmptyHint}>Try a different search or clear the search bar.</Text>
                      </>
                    )}
                  </View>
                }
              />
            )
          ) : loadingWorkspaceChannels && !channel ? (
            <View style={s.bootCenter}>
              <ActivityIndicator color={RavenLight.accent} />
              <Text style={s.bootHint}>Loading supplier group…</Text>
            </View>
          ) : !channel ? (
            isHeaderChatInbox ? (
              <View style={s.bootCenter}>
                <ActivityIndicator color={RavenLight.accent} />
                <Text style={s.bootHint}>Opening conversation…</Text>
              </View>
            ) : (
              <FlatList
                data={filteredWorkspaceAdminsSorted}
                keyExtractor={(m) => `${workspace}-${m.name}-${m.user}`}
                renderItem={renderWorkspaceAdminRow}
                extraData={listSearchQuery}
                contentContainerStyle={s.hubListContent}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RavenLight.accent} />
                }
                ListEmptyComponent={
                  <View style={s.hubEmpty}>
                    {workspaceAdminsSorted.length === 0 ? (
                      <>
                        <View style={s.hubEmptyIconCircle}>
                          <Ionicons name="people-outline" size={36} color={RavenLight.accent} />
                        </View>
                        <Text style={s.inboxEmptyText}>No suppliers yet</Text>
                        <Text style={s.inboxEmptyHint}>
                          In Raven / Frappe, add supplier representatives to this supplier group so they appear here.
                          Use the menu (⋯) in a chat for channels and direct messages.
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={s.hubEmptyIconCircle}>
                          <Ionicons name="search-outline" size={36} color={RavenLight.textMuted} />
                        </View>
                        <Text style={s.inboxEmptyText}>No matching suppliers</Text>
                        <Text style={s.inboxEmptyHint}>Try a different search or clear the search bar.</Text>
                      </>
                    )}
                  </View>
                }
              />
            )
          ) : loadingMsgs && messages.length === 0 ? (
            <View style={s.bootCenter}>
              <ActivityIndicator color={RavenLight.accent} />
            </View>
          ) : (
            <View style={s.messagesListShell}>
              <FlatList
                ref={messagesListRef}
                style={s.messagesListFlex}
                data={messages}
                keyExtractor={(m) => m.name}
                renderItem={renderMessage}
                inverted
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="on-drag"
                contentContainerStyle={s.listPad}
                onScroll={onMessagesScroll}
                scrollEventThrottle={16}
                onMomentumScrollBegin={() => {
                  allowOlderEndReachedRef.current = true;
                }}
                onEndReached={onMessagesEndReached}
                onEndReachedThreshold={0.25}
                ListFooterComponent={
                  loadingOlderMsgs ? (
                    <View style={s.messagesOlderLoader} accessibilityLabel="Loading older messages">
                      <ActivityIndicator color={RavenLight.accent} />
                    </View>
                  ) : null
                }
                onScrollToIndexFailed={onMessagesScrollToIndexFailed}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RavenLight.accent} />
                }
              />
              {showScrollToLatestBtn ? (
                <Pressable
                  style={s.scrollDownFab}
                  onPress={scrollMessagesToLatest}
                  accessibilityRole="button"
                  accessibilityLabel="Scroll to latest messages"
                >
                  <Ionicons name="chevron-down" size={26} color={RavenLight.accent} />
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        {channel ? (
        <View style={[s.composerBar, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 8) + tabBarHeight }]}>
          {replyTo ? (
            <View style={s.replyStrip}>
              <Pressable
                style={s.flex}
                onPress={() => {
                  const id = String(replyTo.name || '').trim();
                  if (id) scrollToMessageById(id);
                }}
                accessibilityRole="button"
                accessibilityLabel="Go to message you are replying to"
              >
                <Text style={s.replyStripLabel}>Replying to</Text>
                <Text style={s.replyStripPreview} numberOfLines={2}>
                  {ravenMessageShortPreview(replyTo)}
                </Text>
              </Pressable>
              <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={10} style={s.replyStripClose}>
                <Ionicons name="close-circle" size={22} color={RavenLight.textMuted} />
              </TouchableOpacity>
            </View>
          ) : null}
          {pendingAttachments.length > 0 ? (
            <View style={s.pendingWrap}>
              {pendingAttachments.map((p) => (
                <View key={p.key} style={s.pendingChip}>
                  {p.mimeType.toLowerCase().startsWith('image/') ? (
                    <Image source={{ uri: p.uri }} style={s.pendingImgThumb} />
                  ) : p.mimeType.toLowerCase().startsWith('video/') ? (
                    <View style={[s.pendingImgThumb, s.pendingFileThumb]}>
                      <Ionicons name="videocam" size={22} color={RavenLight.accent} />
                    </View>
                  ) : (
                    <View style={[s.pendingImgThumb, s.pendingFileThumb]}>
                      <Ionicons name="document-text" size={22} color={RavenLight.accent} />
                    </View>
                  )}
                  <Text style={s.pendingChipName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setPendingAttachments((prev) => prev.filter((x) => x.key !== p.key))}
                    hitSlop={10}
                    accessibilityLabel="Remove attachment"
                  >
                    <Ionicons name="close-circle" size={20} color={RavenLight.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
          <View style={s.composerInner}>
            <TouchableOpacity
              style={[s.plusCircleBtn, (!channel || sending) && s.attachBtnOff]}
              onPress={openAttachMenu}
              disabled={!channel || sending}
              accessibilityLabel="Add attachment"
            >
              <Ionicons name="add" size={26} color={RavenLight.textMuted} />
            </TouchableOpacity>
            <View style={s.inputShell}>
              <TextInput
                style={s.inputMessenger}
                placeholder={replyTo ? 'Add a reply…' : 'Type a message...'}
                placeholderTextColor={RavenLight.textSubtle}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={4000}
                editable={!!channel && !sending}
              />
              <View style={s.inputRightIcons}>
                <TouchableOpacity
                  onPress={() => void onSend()}
                  disabled={(!draft.trim() && pendingAttachments.length === 0) || sending || !channel}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Send"
                  style={[
                    s.sendFab,
                    (!draft.trim() && pendingAttachments.length === 0) || sending || !channel
                      ? s.sendFabDisabled
                      : s.sendFabActive,
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator color={RavenLight.bubbleMineText} size="small" />
                  ) : (
                    <Ionicons
                      name="send"
                      size={18}
                      color={
                        (!draft.trim() && pendingAttachments.length === 0) || !channel
                          ? RavenLight.textSubtle
                          : RavenLight.bubbleMineText
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Supplier group menu — full screen when opened (default after entering a supplier group). */}
      <Modal
        visible={drawerOpen && !!workspace}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={s.drawerRoot}>
          <View style={s.drawerPanel}>
            <View style={s.drawerMainCol}>
              <ScrollView
                style={s.drawerScroll}
                contentContainerStyle={s.drawerScrollPad}
                keyboardShouldPersistTaps="handled"
              >
                <View style={[s.drawerMainHead, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
                  <TouchableOpacity
                    onPress={() => setDrawerOpen(false)}
                    style={s.drawerCloseBtn}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Close menu"
                  >
                    <Ionicons name="close" size={28} color={RavenLight.text} />
                  </TouchableOpacity>
                  <Text style={s.drawerWordmark}>Messages</Text>
                </View>

                {channel?.name ? (
                  <RavenSharedInChatList
                    active={drawerOpen}
                    channelId={channel.name}
                    variant="raven"
                    onGoToMessage={goToMessageFromSharedMenu}
                  />
                ) : null}

                {showSuggestedSuppliersInMenu ? (
                  <>
                    <View style={s.drawerSectionRow}>
                      <Text style={s.drawerSectionBold}>Suggested suppliers</Text>
                    </View>
                    <Text style={s.drawerMemberScopeHint}>
                      People in this supplier group you can message for supplier conversations. Your own account is not listed. Switch
                      to another supplier group to refresh this list.
                    </Text>
                    {members.length === 0 ? (
                      <Text style={s.drawerEmpty}>
                        No contacts returned. Your account may need permission to view members for this
                        supplier group.
                      </Text>
                    ) : directoryMembers.length === 0 ? (
                      <Text style={s.drawerEmpty}>No other people to show for this supplier group yet.</Text>
                    ) : (
                      directoryMembers.map((m) => {
                        const isAdmin = ravenWorkspaceMemberIsAdmin(m);
                        const busy = openingDmFor === m.user;
                        const seed = m.user || '?';
                        const userImg = resolveRavenErpAttachImageUri(m.user_profile_image);
                        const supplierImg = resolveRavenErpAttachImageUri(m.supplier_image);
                        const avatarUri = userImg || supplierImg;
                        return (
                          <TouchableOpacity
                            key={`${workspace}-${m.name}`}
                            style={s.memberRow}
                            onPress={() => void openDmWith(m.user)}
                            disabled={busy || !!openingDmFor}
                          >
                            <View style={s.memberAvatarWrap}>
                              {avatarUri ? (
                                <View style={[s.memberAvatarSq, s.memberAvatarSqClip]}>
                                  <ErpAuthenticatedImage uri={avatarUri} style={s.memberAvatarImage} resizeMode="cover" />
                                </View>
                              ) : (
                                <View style={[s.memberAvatarSq, { backgroundColor: pastelAvatarBg(seed) }]}>
                                  <Text style={s.memberAvatarSqText}>{initialsFromUserId(seed)}</Text>
                                </View>
                              )}
                              {ravenUserIsActiveLikeWeb(m.user, viewerFrappeName, presenceActiveSet, presenceInvisibleSet) ? (
                                <View style={s.memberOnlineDot} />
                              ) : null}
                            </View>
                            <View style={s.flex}>
                              <Text style={s.memberUser} numberOfLines={1}>
                                {friendlySenderLabel(m.user)}
                              </Text>
                              {isAdmin ? <Text style={s.memberAdmin}>Supplier</Text> : null}
                            </View>
                            {busy ? <ActivityIndicator size="small" color={RavenLight.accent} /> : null}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </>
                ) : null}
              </ScrollView>
            </View>
            <View style={[s.drawerRail, { paddingTop: Math.max(insets.top, 8) }]}>
              <View style={s.flex} />
              <TouchableOpacity
                style={s.drawerRailBtn}
                onPress={openSettingsFromDrawer}
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={22} color={RavenLight.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.railAvatarWrap}
                onPress={openProfileFromDrawer}
                accessibilityLabel="Profile"
                activeOpacity={0.7}
              >
                <View style={[s.railAvatar, { backgroundColor: pastelAvatarBg(user?.email || 'me') }]}>
                  <Text style={s.railAvatarText}>{initialsFromUserId(user?.email || 'U')}</Text>
                </View>
                {user?.email || user?.user ? <View style={s.railOnlineDot} /> : null}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={hubInfoModal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setHubInfoModal(null)}
      >
        <View style={s.hubInfoRoot}>
          <Pressable
            style={s.hubInfoBackdrop}
            onPress={() => setHubInfoModal(null)}
            accessibilityLabel="Dismiss"
          />
          <View style={s.hubInfoCenterWrap} pointerEvents="box-none">
            <View style={s.hubInfoCard}>
              <View style={s.hubInfoHead}>
                <Text style={s.hubInfoTitle}>
                  {hubInfoModal === 'supplier-groups' ? 'Supplier groups' : 'Suppliers'}
                </Text>
                <TouchableOpacity
                  onPress={() => setHubInfoModal(null)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={26} color={RavenLight.text} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={s.hubInfoScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={s.hubInfoBody}>
                  {hubInfoModal === 'supplier-groups' ? HUB_INFO_SUPPLIER_GROUPS_BODY : HUB_INFO_SUPPLIERS_BODY}
                </Text>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <RavenGlobalSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Search"
        inChannelId={channel?.name}
        inChannelLabel={channel ? getRavenChannelDisplayLabel(channel, user?.email) : undefined}
        onChannelPicked={(ws, chId) => {
          pendingOpenFromGlobalRef.current = { ws, channelId: chId };
          setDrawerOpen(false);
          setWorkspace(ws);
        }}
      />
      {showEdgeSwipeBackStrip ? (
        <GestureDetector gesture={edgeSwipeBackGesture}>
          <View
            pointerEvents="box-only"
            style={[
              s.edgeSwipeBackStrip,
              { top: insets.top + 54 },
              I18nManager.isRTL ? { right: 0 } : { left: 0 },
            ]}
            collapsable={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </GestureDetector>
      ) : null}
    </View>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: RavenLight.panel },
  /** Invisible hit target: edge swipe runs same back logic as header (stack pop stays off until list root). */
  edgeSwipeBackStrip: {
    position: 'absolute',
    bottom: 0,
    width: 44,
    zIndex: 10000,
  },
  flex: { flex: 1 },
  bootCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bootHint: { marginTop: 10, fontSize: 14, color: RavenLight.textMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
    ...Platform.select({
      ios: {
        shadowColor: RavenLight.shadowSoft,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  headerIconBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  headerInfoCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: RavenLight.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfoCircleText: {
    fontSize: 13,
    fontWeight: '800',
    fontStyle: 'italic',
    color: RavenLight.textMuted,
    lineHeight: Platform.OS === 'android' ? 16 : 15,
    marginTop: Platform.OS === 'ios' ? -1 : 0,
  },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginHorizontal: 4,
  },
  headerAvatarCircleWrap: {
    position: 'relative',
    marginRight: 10,
  },
  headerAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarInitials: {
    fontSize: 15,
    fontWeight: '700',
    color: RavenLight.text,
  },
  headerOnlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: RavenLight.onlineGreen,
    borderWidth: 2,
    borderColor: RavenLight.panel,
  },
  headerPeerName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: RavenLight.text,
  },
  headerInboxCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInboxTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: RavenLight.text,
  },
  headerInboxSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: RavenLight.textMuted,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingVertical: 10,
    backgroundColor: '#FFF4F4',
    borderBottomWidth: 1,
    borderBottomColor: RavenLight.border,
  },
  warnText: { flex: 1, fontSize: 13, color: RavenLight.danger },
  messageCanvas: { flex: 1, backgroundColor: RavenLight.panel },
  messagesListShell: { flex: 1, position: 'relative' },
  messagesListFlex: { flex: 1 },
  scrollDownFab: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
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
  hubListContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 32,
    flexGrow: 1,
  },
  listSearchBarRow: {
    paddingHorizontal: Spacing.MD,
    paddingVertical: 8,
    backgroundColor: RavenLight.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
  },
  listSearchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: RavenLight.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  listSearchBarInput: {
    flex: 1,
    marginLeft: 8,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    fontSize: 16,
    color: RavenLight.text,
  },
  refListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.MD,
    backgroundColor: RavenLight.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
  },
  refListAvatarWrap: {
    width: 56,
    height: 56,
    marginRight: 12,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refListInitCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refListLogoClip: {
    overflow: 'hidden',
    backgroundColor: RavenLight.canvas,
  },
  refListWorkspaceLogoImg: {
    width: 52,
    height: 52,
  },
  refListInitText: {
    fontSize: 18,
    fontWeight: '700',
    color: RavenLight.text,
  },
  refListOnlineDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: RavenLight.onlineGreen,
    borderWidth: 2,
    borderColor: RavenLight.panel,
  },
  refListMain: { flex: 1, minWidth: 0, justifyContent: 'center' },
  refListTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  refListTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: RavenLight.text },
  refListTime: { fontSize: 13, color: RavenLight.textSubtle, flexShrink: 0 },
  refListSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    minHeight: 20,
  },
  refListSubtitle: { flex: 1, fontSize: 14, color: RavenLight.textMuted },
  refListRight: {
    width: 28,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 4,
  },
  refListUnreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: RavenLight.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refListUnreadText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  hubInfoRoot: { flex: 1 },
  hubInfoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  hubInfoCenterWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.XL,
  },
  hubInfoCard: {
    alignSelf: 'center',
    width: '100%' as const,
    maxWidth: 400,
    maxHeight: '72%' as const,
    backgroundColor: RavenLight.panel,
    borderRadius: 16,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.SM,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    ...Platform.select({
      ios: {
        shadowColor: RavenLight.shadowSoft,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  hubInfoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
  },
  hubInfoTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: RavenLight.text, marginRight: 8 },
  hubInfoScroll: { maxHeight: 360 },
  hubInfoBody: { fontSize: 16, lineHeight: 24, color: RavenLight.textMuted },
  hubEmpty: {
    paddingVertical: Spacing.LG * 2,
    paddingHorizontal: Spacing.SM,
    alignItems: 'center',
  },
  hubEmptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: RavenLight.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  inboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
  },
  inboxAvatarCol: {
    position: 'relative',
    marginRight: 12,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxOnlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: RavenLight.onlineGreen,
    borderWidth: 2,
    borderColor: RavenLight.panel,
  },
  inboxRowMid: { flex: 1, minWidth: 0 },
  inboxRowTopLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  inboxRowTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: RavenLight.text, marginRight: 8 },
  inboxRowTime: { fontSize: 12, color: RavenLight.textMuted, fontWeight: '600' },
  inboxRowPreview: { fontSize: 14, color: RavenLight.textMuted, lineHeight: 19 },
  inboxUnreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: RavenLight.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  inboxUnreadText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  inboxEmpty: { padding: Spacing.LG * 2, alignItems: 'center' },
  inboxEmptyText: { fontSize: 17, fontWeight: '800', color: RavenLight.text, textAlign: 'center' },
  inboxEmptyHint: {
    marginTop: 10,
    fontSize: 14,
    color: RavenLight.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.MD,
  },
  wsAdminAvatarWrap: {
    position: 'relative',
    marginRight: 12,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wsAdminAvatarSq: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wsAdminAvatarText: { fontSize: 15, fontWeight: '800', color: RavenLight.text },
  wsAdminOnlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: RavenLight.onlineGreen,
    borderWidth: 2,
    borderColor: RavenLight.panel,
  },
  wsAdminMid: { flex: 1, minWidth: 0 },
  wsAdminTitle: { fontSize: 17, fontWeight: '800', color: RavenLight.text, letterSpacing: -0.2 },
  wsAdminSub: { marginTop: 4, fontSize: 12, color: RavenLight.textMuted },
  wsAdminBadgeRow: { marginTop: 8, flexDirection: 'row' },
  wsAdminBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: RavenLight.accentSoft,
  },
  wsAdminBadgeText: { fontSize: 11, fontWeight: '700', color: RavenLight.accent },
  wsIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  wsIconText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  wsRowText: { flex: 1, minWidth: 0 },
  wsRowTitle: { fontSize: 18, fontWeight: '800', color: RavenLight.text, letterSpacing: -0.3 },
  wsRowSub: { marginTop: 3, fontSize: 13, color: RavenLight.textMuted },
  listPad: { paddingHorizontal: Spacing.MD, paddingVertical: 16, paddingBottom: 20 },
  bubbleRow: { flexDirection: 'row', marginBottom: 14, maxWidth: '100%', width: '100%', alignSelf: 'stretch' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    maxWidth: '100%',
    width: '100%',
    alignSelf: 'stretch',
  },
  msgAvatarWrap: {
    position: 'relative',
    width: 40,
    marginRight: 10,
    paddingTop: 2,
  },
  msgAvatarSq: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgAvatarSqClip: {
    overflow: 'hidden',
    backgroundColor: RavenLight.canvas,
  },
  msgAvatarImage: {
    width: 36,
    height: 36,
  },
  msgAvatarSqText: {
    fontSize: 13,
    fontWeight: '700',
    color: RavenLight.text,
  },
  onlineDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: RavenLight.onlineGreen,
    borderWidth: 2,
    borderColor: RavenLight.panel,
  },
  msgColTheirs: {
    flex: 1,
    minWidth: 0,
  },
  msgNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  msgAuthorName: {
    fontSize: 15,
    fontWeight: '700',
    color: RavenLight.text,
    maxWidth: '72%',
  },
  msgHeaderTime: {
    fontSize: 13,
    fontWeight: '400',
    color: RavenLight.textSubtle,
  },
  msgTextTheirs: {
    fontSize: 15,
    color: RavenLight.text,
    lineHeight: 21,
  },
  theirsTextBubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: RavenLight.bubbleOther,
    borderRadius: RavenLight.radiusLg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 2,
    marginBottom: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    ...Platform.select({
      ios: {
        shadowColor: '#1C2024',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.07,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  msgColMine: {
    width: '88%',
    maxWidth: '88%',
    /** `flex-end` can collapse linked-document rows (loader / maxWidth %) so only the timestamp shows. */
    alignItems: 'stretch',
  },
  mineTextBubble: {
    alignSelf: 'flex-end',
    backgroundColor: RavenLight.bubbleMine,
    borderRadius: RavenLight.radiusLg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
    ...Platform.select({
      ios: {
        shadowColor: RavenLight.bubbleMine,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  msgTimeMine: {
    fontSize: 12,
    color: RavenLight.textSubtle,
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  bubbleBody: { fontSize: 15, color: RavenLight.text, lineHeight: 21 },
  bubbleBodyMine: { color: RavenLight.bubbleMineText },
  replyBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: RavenLight.accent,
    marginBottom: 4,
  },
  replyBadgeMine: { color: 'rgba(255,255,255,0.85)' },
  replyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: RavenLight.accentSoft,
    borderRadius: RavenLight.radiusMd,
  },
  replyStripLabel: { fontSize: 11, fontWeight: '700', color: RavenLight.accent },
  replyStripPreview: { fontSize: 13, color: RavenLight.text, marginTop: 2 },
  replyStripClose: { marginLeft: 8 },
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
    backgroundColor: RavenLight.sidebarHover,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  pendingChipName: { flex: 1, minWidth: 0, fontSize: 12, color: RavenLight.textMuted },
  pendingImgThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: RavenLight.panel },
  pendingFileThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
  },
  attachBtnOff: { opacity: 0.35 },
  plusCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: RavenLight.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  composerBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RavenLight.border,
    backgroundColor: RavenLight.canvas,
    paddingHorizontal: Spacing.MD,
    paddingTop: 10,
  },
  composerInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    backgroundColor: RavenLight.panel,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    paddingLeft: 14,
    paddingRight: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#1C2024',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  inputMessenger: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    fontSize: 15,
    color: RavenLight.text,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },
  inputRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    gap: 4,
  },
  sendFab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendFabActive: {
    backgroundColor: RavenLight.bubbleMine,
  },
  sendFabDisabled: {
    backgroundColor: RavenLight.sidebarHover,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  drawerRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: RavenLight.sidebar,
  },
  drawerPanel: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: RavenLight.sidebar,
  },
  drawerRail: {
    width: DRAWER_RAIL_W,
    backgroundColor: RavenLight.panel,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: RavenLight.railBorder,
    alignItems: 'center',
    paddingBottom: 20,
  },
  drawerRailBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railAvatarWrap: {
    position: 'relative',
    marginTop: 8,
    marginBottom: 4,
  },
  railAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railAvatarText: { fontSize: 12, fontWeight: '800', color: RavenLight.text },
  railOnlineDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: RavenLight.onlineGreen,
    borderWidth: 2,
    borderColor: RavenLight.panel,
  },
  drawerMainCol: {
    flex: 1,
    minWidth: 0,
    backgroundColor: RavenLight.sidebar,
  },
  drawerScroll: { flex: 1 },
  drawerScrollPad: { paddingBottom: Spacing.LG },
  drawerMainHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.MD,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
  },
  drawerWordmark: {
    fontSize: 22,
    fontWeight: '800',
    color: RavenLight.text,
    letterSpacing: -0.5,
    marginLeft: 4,
  },
  drawerCloseBtn: {
    padding: 4,
    marginRight: 4,
    marginLeft: -4,
  },
  drawerNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.MD,
  },
  drawerNavText: { fontSize: 15, fontWeight: '600', color: RavenLight.text },
  drawerSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    paddingBottom: 6,
  },
  drawerSectionBold: {
    fontSize: 15,
    fontWeight: '700',
    color: RavenLight.text,
  },
  drawerMemberScopeHint: {
    fontSize: 12,
    color: RavenLight.textMuted,
    paddingHorizontal: Spacing.MD,
    paddingBottom: 8,
    lineHeight: 16,
  },
  channelsEmpty: {
    fontSize: 13,
    color: RavenLight.textMuted,
    paddingHorizontal: Spacing.MD,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  drawerEmpty: {
    fontSize: 13,
    color: RavenLight.textMuted,
    marginHorizontal: Spacing.MD,
    marginTop: 6,
    lineHeight: 18,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.MD,
    marginHorizontal: 8,
    borderRadius: RavenLight.radiusMd,
  },
  memberAvatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  memberAvatarSq: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarSqClip: {
    overflow: 'hidden',
    backgroundColor: RavenLight.canvas,
  },
  memberAvatarImage: {
    width: 36,
    height: 36,
  },
  memberAvatarSqText: {
    fontSize: 13,
    fontWeight: '700',
    color: RavenLight.text,
  },
  memberOnlineDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: RavenLight.onlineGreen,
    borderWidth: 2,
    borderColor: RavenLight.panel,
  },
  memberUser: { fontSize: 14, fontWeight: '600', color: RavenLight.text, flex: 1, minWidth: 0 },
  memberAdmin: { fontSize: 11, color: RavenLight.textMuted, marginTop: 2 },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.MD,
    marginHorizontal: 8,
    borderRadius: RavenLight.radiusMd,
  },
  drawerDmAvatarCol: {
    position: 'relative',
    marginRight: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerDmOnlineDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: RavenLight.onlineGreen,
    borderWidth: 2,
    borderColor: RavenLight.panel,
  },
  drawerRowActive: { backgroundColor: RavenLight.accentSoft },
  drawerHashBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: RavenLight.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  drawerHashText: { fontSize: 14, fontWeight: '800', color: RavenLight.textMuted },
  drawerRowText: { flex: 1 },
  drawerRowTitle: { fontSize: 15, fontWeight: '600', color: RavenLight.text },
  drawerRowTitleActive: { color: RavenLight.accent },
  drawerRowMeta: { fontSize: 11, color: RavenLight.textMuted, marginTop: 2 },
  drawerUnreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: RavenLight.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  drawerUnreadBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
});
