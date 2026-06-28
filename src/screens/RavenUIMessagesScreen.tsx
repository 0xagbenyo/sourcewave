import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from 'react';
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
  AppState,
  type AppStateStatus,
  BackHandler,
  ScrollView,
  Image,
  I18nManager,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useFocusEffect, useNavigation, useRoute, usePreventRemove } from '@react-navigation/native';
import { useOptionalBottomTabBarHeight } from '../hooks/useOptionalBottomTabBarHeight';
import { useKeyboardInsets } from '../hooks/useKeyboardOpen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useRavenUnread } from '../context/RavenUnreadContext';
import { useTranslation } from 'react-i18next';
import { RavenMessageAttachmentBody } from '../components/RavenMessageAttachmentBody';
import { RavenChatAttachTrigger } from '../components/RavenChatAttachTrigger';
import { RavenInlineReplyQuote } from '../components/RavenInlineReplyQuote';
import { RavenChannelPeerAvatar } from '../components/RavenChannelPeerAvatar';
import {
  listChannelsForWorkspace,
  listRavenChannelsForSessionUser,
  fetchChannelLatestAndMostRecentTextMessage,
  ravenMessageRowSortTimeMs,
  ravenChannelLastActivitySortTimeMs,
  ravenChannelLastMessagePreviewRow,
  fetchRavenWorkspaces,
  pickRavenWorkspaceId,
  matchRavenWorkspaceRow,
  resolveRavenWorkspaceDocId,
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
  ravenRowIsSupplierQuotationDocLink,
  ravenRowIsSalesOrderDocLink,
  ravenRowIsSalesInvoiceDocLink,
  ravenMessageOwnerMatchesSession,
  fetchRavenUserProfilesByIds,
  fetchRavenUsersDirectory,
  mergeRavenUserProfileMaps,
  type RavenChannelRow,
  type RavenMessageRow,
  type RavenWorkspaceMemberRow,
  type RavenWorkspaceRow,
} from '../services/ravenNativeApi';
import {
  formatChatDateSeparator,
  formatMessageBubbleTime,
  formatMessageHeaderTime,
  initialsFromUserId,
  isDmChannel,
  pastelAvatarBg,
  shouldShowChatDateSeparator,
} from '../utils/ravenChatUi';
import {
  ravenWorkspaceMemberIsAdmin,
  ravenWorkspaceMemberMatchesViewer,
  ravenWorkspaceSupplierAdminsForList,
} from '../utils/ravenWorkspaceMemberVisibility';
import { ravenMessageHasVisualMedia, ravenSameMessageOwner } from '../utils/ravenAttachment';
import {
  pendingAttachmentsFromImagePickerAssets,
  type RavenPendingAttachment,
} from '../utils/ravenMediaPick';
import { getRavenLastChat, setRavenLastChat } from '../utils/ravenLastChatStorage';
import { subscribeSuppliersTabReset } from '../utils/suppliersTabReset';
import {
  getRavenGlobalInboxSnapshot,
  getRavenWorkspaceChannelsSnapshot,
  setRavenChannelMessagesSnapshot,
  setRavenGlobalInboxSnapshot,
  setRavenWorkspaceChannelsSnapshot,
  type RavenCachedGlobalInboxRow,
} from '../utils/ravenMessagingLocalCache';
import {
  channelMessagesMemoryIsFresh,
  fetchChannelMessagesAroundBase,
  fetchChannelMessagesFirstPage,
  fetchChannelOlderMessagesPage,
  readChannelMessagesDiskPaint,
  readChannelMessagesMemoryPaint,
  refreshChannelMessagesAfterSend,
  saveChannelMessagesMemoryCache,
  sortRavenMessagesNewestFirst,
} from '../utils/ravenChannelMessagesLoad';
import { setRavenOpenChatFromProfileSubscriber } from '../utils/ravenOpenChatFromProfileBridge';
import { resetToAuthScreen } from '../navigation/rootNavigation';
import { getMainTabBarStyle } from '../navigation/mainTabBarStyle';
import { RavenGlobalSearchModal } from '../components/RavenGlobalSearchModal';
import { RavenMessageReactionsRow } from '../components/RavenMessageReactionsRow';
import { RavenMessageActionSheet } from '../components/RavenMessageActionSheet';
import { RavenForwardMessageModal } from '../components/RavenForwardMessageModal';
import { RavenComposerEmojiSheet } from '../components/RavenComposerEmojiSheet';
import { useRavenMessageActions } from '../hooks/useRavenMessageActions';
import { useSqPaymentActionRegistry } from '../hooks/useSqPaymentActionRegistry';
import { ravenMessageIsForwarded } from '../utils/ravenMessageReactions';
import { RavenSharedInChatList } from '../components/RavenSharedInChatList';
import { RavenQuotationDraftCard } from '../components/RavenQuotationDraftCard';
import { RavenLinkedSupplierQuotationMessage } from '../components/RavenLinkedSupplierQuotationMessage';
import { RavenLinkedSalesOrderMessage } from '../components/RavenLinkedSalesOrderMessage';
import { RavenLinkedSalesInvoiceMessage } from '../components/RavenLinkedSalesInvoiceMessage';
import { RavenLinkedGenericDocMessage } from '../components/RavenLinkedGenericDocMessage';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';
import { channelPrefix, resolveRavenUserDisplayName, replySnippet } from '../utils/ravenSearchPreview';
import { ravenMessageShortPreview } from '../utils/ravenMessageShortPreview';
import { resolveRavenErpAttachImageUri } from '../utils/ravenFileUrl';
import { tryParseQuotationDraftFromMessage } from '../utils/chatQuotationDraftMessage';
import {
  notifyQuotationAcceptedInChat,
  notifyQuotationRejectedInChat,
  type ErpDocChatContext,
} from '../utils/erpDocChatStatusReply';
import { getERPNextClient } from '../services/erpnext';
import { useAutoNavigateToSubscriptionWhenInactive } from '../hooks/useAutoNavigateToSubscriptionWhenInactive';
import { buyerRavenRouteNeedsSubscription } from '../utils/buyerSuppliersPremium';
import { userFacingError } from '../utils/userFacingError';
import { userFacingFrappeError } from '../utils/frappeHttpError';

const POLL_MS = 3000;

/** First page when opening a thread — small for fast paint; older loads via `onEndReached`. */
const RAVEN_CHAT_FIRST_PAGE_SIZE = 36;
const RAVEN_CHAT_OLDER_PAGE_SIZE = 50;

/** Global inbox: preview fetches run in parallel up to this limit; each row commits as soon as its fetch finishes (no batch wait). */
const RAVEN_GLOBAL_INBOX_PREVIEW_CONCURRENCY = 12;
/** Shown while a channel preview is still being fetched (replaced when the fetch completes). */
const GLOBAL_INBOX_PREVIEW_PLACEHOLDER = '…';

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

function globalInboxWorkspaceMeta(ch: RavenChannelRow, wsRows: RavenWorkspaceRow[]) {
  const id = ch.name?.trim() || '';
  const wsKey = String(ch.workspace || '').trim();
  const wsRow = wsRows.find(
    (w) => String(w.name || '').trim().toLowerCase() === wsKey.toLowerCase()
  );
  const lbl = wsRow ? workspaceListPrimaryLabel(wsRow) : wsKey || 'Supplier group';
  const wsLogo = wsRow?.logo != null && String(wsRow.logo).trim() ? String(wsRow.logo).trim() : null;
  return {
    id,
    wsKey,
    wsRow,
    lbl,
    wsLogo,
    workspaceId: wsKey || String(wsRow?.name || '').trim() || id,
  };
}

/** Instant inbox row from `get_channels` snapshot, or a lightweight placeholder when activity exists. */
function globalInboxRowFromChannelFast(
  ch: RavenChannelRow,
  wsRows: RavenWorkspaceRow[],
  allowPlaceholder: boolean
): GlobalInboxRow | null {
  const { id, wsKey, wsRow, lbl, wsLogo, workspaceId } = globalInboxWorkspaceMeta(ch, wsRows);
  if (!id) return null;

  const snapshotRow = ravenChannelLastMessagePreviewRow(ch);
  if (snapshotRow && (snapshotRow.text?.trim() || snapshotRow.file?.trim())) {
    const previewMeta = inboxPreviewFromLastMessage(snapshotRow);
    const channelActivityMs = ravenChannelLastActivitySortTimeMs(ch);
    const recencyMs = Math.max(previewMeta.timeMs, channelActivityMs);
    return {
      key: `${wsKey || 'ws'}:${id}`,
      workspaceId,
      workspaceLabel: lbl,
      workspaceLogo: wsLogo,
      channel: ch,
      preview: previewMeta.preview,
      timeLabel: previewMeta.timeLabel,
      timeMs: recencyMs || previewMeta.timeMs,
      hasMessages: true,
    };
  }

  if (!allowPlaceholder) return null;
  const channelActivityMs = ravenChannelLastActivitySortTimeMs(ch);
  if (!channelActivityMs) return null;
  const iso = ch.last_message_timestamp || ch.modified;
  return {
    key: `${wsKey || 'ws'}:${id}`,
    workspaceId,
    workspaceLabel: lbl,
    workspaceLogo: wsLogo,
    channel: ch,
    preview: GLOBAL_INBOX_PREVIEW_PLACEHOLDER,
    timeLabel: formatMessageHeaderTime(iso) || '',
    timeMs: channelActivityMs,
    hasMessages: true,
  };
}

async function globalInboxRowFromChannelFetched(
  ch: RavenChannelRow,
  wsRows: RavenWorkspaceRow[]
): Promise<GlobalInboxRow | null> {
  const fast = globalInboxRowFromChannelFast(ch, wsRows, false);
  if (fast) return fast;

  const { id, wsKey, lbl, wsLogo, workspaceId } = globalInboxWorkspaceMeta(ch, wsRows);
  if (!id) return null;

  try {
    const { latest, latestText } = await fetchChannelLatestAndMostRecentTextMessage(id);
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
      workspaceId,
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
}

function mergeGlobalInboxChannel(
  existing: RavenChannelRow,
  incoming: RavenChannelRow
): RavenChannelRow {
  const existingImg = existing.peer_user_image != null ? String(existing.peer_user_image).trim() : '';
  const incomingImg = incoming.peer_user_image != null ? String(incoming.peer_user_image).trim() : '';
  const existingFn = existing.full_name != null ? String(existing.full_name).trim() : '';
  const incomingFn = incoming.full_name != null ? String(incoming.full_name).trim() : '';
  return {
    ...incoming,
    peer_user_image: incomingImg || existingImg || incoming.peer_user_image,
    full_name: incomingFn || existingFn || incoming.full_name,
  };
}

function mergeGlobalInboxRow(existing: GlobalInboxRow, incoming: GlobalInboxRow): GlobalInboxRow {
  const keepPreview =
    incoming.preview === GLOBAL_INBOX_PREVIEW_PLACEHOLDER && existing.preview !== GLOBAL_INBOX_PREVIEW_PLACEHOLDER
      ? existing.preview
      : incoming.preview;
  return {
    ...incoming,
    preview: keepPreview,
    timeLabel: incoming.timeLabel || existing.timeLabel,
    timeMs: Math.max(incoming.timeMs, existing.timeMs),
    workspaceLogo: incoming.workspaceLogo ?? existing.workspaceLogo,
    channel: mergeGlobalInboxChannel(existing.channel, incoming.channel),
  };
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
  /** Buyer Suppliers tab — do not restore or persist last-open DM (tab should open the group list). */
  const isSuppliersBuyerTab = route.name === 'Suppliers';
  const shareSalesOrderName = useMemo(() => {
    if (!isSuppliersBuyerTab) return '';
    const p = route.params as { shareSalesOrderName?: string } | undefined;
    return String(p?.shareSalesOrderName ?? '').trim();
  }, [isSuppliersBuyerTab, route.params]);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useOptionalBottomTabBarHeight();
  const { open: keyboardOpen, height: keyboardHeight } = useKeyboardInsets();
  const { user } = useUserSession();
  const { t } = useTranslation();
  const { isActive: subscriptionActive, isLoading: subscriptionLoading, refresh: refreshSubscription } =
    useSubscription();
  const buyerPremiumGate = buyerRavenRouteNeedsSubscription(String(route.name));
  useAutoNavigateToSubscriptionWhenInactive(navigation as { navigate: (name: string) => void }, {
    email: user?.email,
    isLoading: subscriptionLoading,
    isActive: subscriptionActive,
    enabled: buyerPremiumGate,
  });
  const { setActiveChannelId, refreshUnreadCounts, unreadByChannelId } = useRavenUnread();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [workspaceRows, setWorkspaceRows] = useState<RavenWorkspaceRow[]>([]);
  const [channels, setChannels] = useState<RavenChannelRow[]>([]);
  const [channel, setChannel] = useState<RavenChannelRow | null>(null);
  const [messages, setMessages] = useState<RavenMessageRow[]>([]);
  const [loadingBoot, setLoadingBoot] = useState(true);
  const [loadingWorkspaceChannels, setLoadingWorkspaceChannels] = useState(false);
  const [loadingWorkspaceMembers, setLoadingWorkspaceMembers] = useState(false);
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
  /** False until the first inbox fetch finishes — avoids endless “loading” when there are zero chats. */
  const [globalInboxSettled, setGlobalInboxSettled] = useState(false);
  /** True only while the first-pass preview fetch runs (not on background polls). */
  const [inboxPreviewEnriching, setInboxPreviewEnriching] = useState(false);
  /** Hub screen help: description shown in a modal from the header (i) button. */
  const [hubInfoModal, setHubInfoModal] = useState<null | 'supplier-groups' | 'suppliers'>(null);
  /** Buyer accept/reject for quotation draft messages keyed by Supplier Quotation name. */
  const [quotationActionByName, setQuotationActionByName] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [quotationActionBusy, setQuotationActionBusy] = useState<string | null>(null);
  /** Inline filter for the visible chat / supplier group / supplier list (header search bar). */
  const [listSearchQuery, setListSearchQuery] = useState('');

  const persistLastChat = useCallback(
    (value: Parameters<typeof setRavenLastChat>[1]) => {
      if (isSuppliersBuyerTab) return;
      void setRavenLastChat(user?.email, value);
    },
    [isSuppliersBuyerTab, user?.email]
  );

  const resetSuppliersTabToRoot = useCallback(() => {
    setDrawerOpen(false);
    setSearchOpen(false);
    setHubInfoModal(null);
    setListSearchQuery('');
    setChannel(null);
    setWorkspace(null);
    setChannels([]);
    setMembers([]);
    setError(null);
    void setRavenLastChat(user?.email, null);
  }, [user?.email]);

  /** Same semantics as Raven `useIsUserActive` (get_active_users + Invisible on Raven User). */
  const [activeUserIds, setActiveUserIds] = useState<string[]>([]);
  const [invisibleUserIds, setInvisibleUserIds] = useState<string[]>([]);
  /** Frappe `User.user_image` by owner id (message bubbles). */
  const [ravenUserProfilesById, setRavenUserProfilesById] = useState<
    Record<string, { full_name?: string; user_image?: string | null }>
  >({});
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
  /** Workspace id we already loaded channels for — avoids clearing an open thread on metadata refresh. */
  const workspaceHydratedRef = useRef<string | null>(null);
  /** Open a channel picked from the cross-workspace inbox (workspace effect restores `channel`). */
  const pendingOpenFromGlobalRef = useRef<{ ws: string; channelId: string; peerUserId?: string; messageId?: string } | null>(null);
  /** Scroll to message after search jump loads context around a hit. */
  const pendingScrollToMessageRef = useRef<string | null>(null);
  const jumpToMessageAttemptRef = useRef<string | null>(null);
  /** Open full-screen workspace menu once per workspace when user enters it. */
  const menuOpenedForWorkspaceRef = useRef<string | null>(null);
  /** Header Chats list (no workspace) is active — gates silent inbox reloads. */
  const headerGlobalInboxSurfaceRef = useRef(false);
  /** Bumped on effect cleanup so overlapping global inbox fetches never commit stale rows. */
  const globalInboxLoadGenerationRef = useRef(0);
  /** Avoid stale reads inside `loadGlobalInbox` (callback deps omit row state). */
  const globalInboxRowsRef = useRef<GlobalInboxRow[]>([]);
  const globalInboxSettledRef = useRef(false);
  /** Per-user workspace bootstrap — avoid clearing supplier roster on subscription refresh. */
  const workspacesBootstrappedForUserRef = useRef<string | null>(null);
  /** Skip one focus-reset after opening profile / DM from supplier profile (root stack covers Main). */
  const skipSuppliersFocusResetRef = useRef(false);
  /** True after Suppliers tab loses focus (another tab selected). */
  const suppliersTabWasBlurredRef = useRef(false);

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

  useFocusEffect(
    useCallback(() => {
      if (buyerPremiumGate) void refreshSubscription();
    }, [buyerPremiumGate, refreshSubscription])
  );

  useEffect(() => {
    globalInboxRowsRef.current = globalInboxRows;
  }, [globalInboxRows]);

  useEffect(() => {
    globalInboxSettledRef.current = globalInboxSettled;
  }, [globalInboxSettled]);

  useEffect(() => {
    const raw = workspace?.trim() || '';
    selectedWorkspaceRef.current = raw
      ? resolveRavenWorkspaceDocId(raw, workspaceRows) || raw
      : null;
  }, [workspace, workspaceRows]);

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

  useEffect(() => {
    if (!isSuppliersBuyerTab) return;
    return subscribeSuppliersTabReset(resetSuppliersTabToRoot);
  }, [isSuppliersBuyerTab, resetSuppliersTabToRoot]);

  useFocusEffect(
    useCallback(() => {
      if (!isSuppliersBuyerTab) return;
      if (skipSuppliersFocusResetRef.current) {
        skipSuppliersFocusResetRef.current = false;
        suppliersTabWasBlurredRef.current = false;
        return;
      }
      if (suppliersTabWasBlurredRef.current) {
        resetSuppliersTabToRoot();
      }
      suppliersTabWasBlurredRef.current = false;
      return () => {
        suppliersTabWasBlurredRef.current = true;
      };
    }, [isSuppliersBuyerTab, resetSuppliersTabToRoot])
  );

  /** Buyer Suppliers tab only — supplier portal Chat has no “suggested suppliers” block. */
  const showSuggestedSuppliersInMenu = route.name === 'Suppliers';

  /** Omit self — suggested supplier contacts (workspace admins only) you can open a DM with. */
  const directoryMembers = useMemo(
    () => ravenWorkspaceSupplierAdminsForList(members, user?.email, user?.user),
    [members, user?.email, user?.user]
  );

  const workspaceSuppliersSorted = useMemo(
    () => ravenWorkspaceSupplierAdminsForList(members, user?.email, user?.user),
    [members, user?.email, user?.user]
  );

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

  const jumpToMessageInChat = useCallback(
    async (messageId: string) => {
      const id = messageId.trim();
      const cid = channel?.name?.trim();
      if (!id || !cid) return;

      const idx = messagesRef.current.findIndex((m) => (m.name || '').trim() === id);
      if (idx >= 0) {
        scrollToMessageById(id);
        setHighlightedMessageId(id);
        return;
      }

      setLoadingMsgs(true);
      try {
        const result = await fetchChannelMessagesAroundBase(cid, id);
        setMessages(result.messages);
        setHasMoreOlderMessages(result.hasMoreOlder);
        saveChannelMessagesMemoryCache(user?.email, cid, result.messages, result.hasMoreOlder);
      } catch (e: unknown) {
        pendingScrollToMessageRef.current = null;
        Alert.error('Search', userFacingError(e, t('ravenSearch.messageNotLoaded')));
      } finally {
        setLoadingMsgs(false);
      }
    },
    [channel?.name, scrollToMessageById, user?.email, t]
  );

  useEffect(() => {
    if (!highlightedMessageId) return;
    const timer = setTimeout(() => setHighlightedMessageId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightedMessageId]);

  useEffect(() => {
    const id = pendingScrollToMessageRef.current?.trim();
    const ch = channel?.name?.trim();
    if (!id || !ch || loadingMsgs) return;

    const idx = messages.findIndex((m) => (m.name || '').trim() === id);
    if (idx >= 0) {
      pendingScrollToMessageRef.current = null;
      jumpToMessageAttemptRef.current = null;
      requestAnimationFrame(() => {
        scrollToMessageById(id);
        setHighlightedMessageId(id);
      });
      return;
    }

    const attemptKey = `${ch}:${id}`;
    if (jumpToMessageAttemptRef.current === attemptKey) return;
    jumpToMessageAttemptRef.current = attemptKey;
    void jumpToMessageInChat(id);
  }, [messages, channel?.name, loadingMsgs, scrollToMessageById, jumpToMessageInChat]);

  const goToMessageFromSharedMenu = useCallback(
    (messageName: string) => {
      const id = String(messageName || '').trim();
      if (!id) return;
      setDrawerOpen(false);
      requestAnimationFrame(() => {
        void jumpToMessageInChat(id);
      });
    },
    [jumpToMessageInChat]
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

  const loadMessages = useCallback(async (channelId: string, opts?: { silent?: boolean; force?: boolean }) => {
    const silent = opts?.silent === true;
    const force = opts?.force === true;
    const cid = channelId.trim();
    if (!cid) return;

    let prevForMerge: RavenMessageRow[] = [];

    if (!silent) {
      const memPaint = readChannelMessagesMemoryPaint(user?.email, cid);
      if (memPaint) {
        setMessages(memPaint.messages);
        setHasMoreOlderMessages(memPaint.hasMoreOlder);
        setLoadingMsgs(false);
        prevForMerge = memPaint.messages;

        if (!force && channelMessagesMemoryIsFresh(user?.email, cid)) {
          try {
            const result = await fetchChannelMessagesFirstPage(
              cid,
              RAVEN_CHAT_FIRST_PAGE_SIZE,
              memPaint.messages,
              { silent: true }
            );
            startTransition(() => {
              setMessages(result.messages);
              setHasMoreOlderMessages(result.hasMoreOlder);
            });
            saveChannelMessagesMemoryCache(user?.email, cid, result.messages, result.hasMoreOlder);
            setError(null);
          } catch {
            /* keep cached thread */
          }
          setRefreshing(false);
          return;
        }
      } else {
        const diskPaint = await readChannelMessagesDiskPaint(user?.email, cid, RAVEN_CHAT_FIRST_PAGE_SIZE);
        if (diskPaint) {
          setMessages(diskPaint.messages);
          setHasMoreOlderMessages(diskPaint.hasMoreOlder);
          setLoadingMsgs(false);
          prevForMerge = diskPaint.messages;
        } else {
          setMessages([]);
          setLoadingMsgs(true);
        }
      }
    }

    try {
      const result = await fetchChannelMessagesFirstPage(
        cid,
        RAVEN_CHAT_FIRST_PAGE_SIZE,
        silent ? messagesRef.current : prevForMerge,
        { silent }
      );
      if (silent) {
        startTransition(() => {
          setMessages(result.messages);
          setHasMoreOlderMessages(result.hasMoreOlder);
        });
      } else {
        setMessages(result.messages);
        setHasMoreOlderMessages(result.hasMoreOlder);
      }
      saveChannelMessagesMemoryCache(user?.email, cid, result.messages, result.hasMoreOlder);
      setError(null);
    } catch (e: any) {
      if (!silent) {
        const fallback =
          readChannelMessagesMemoryPaint(user?.email, cid) ??
          (prevForMerge.length ? { messages: prevForMerge, hasMoreOlder: true } : null);
        if (fallback) {
          setMessages(fallback.messages);
          setHasMoreOlderMessages(fallback.hasMoreOlder);
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
      const result = await fetchChannelOlderMessagesPage(
        ch,
        RAVEN_CHAT_OLDER_PAGE_SIZE,
        messagesRef.current
      );
      if (!result) return;
      setMessages(result.messages);
      setHasMoreOlderMessages(result.hasMoreOlder);
      saveChannelMessagesMemoryCache(user?.email, ch, result.messages, result.hasMoreOlder);
    } catch {
      /* keep hasMore so user can retry */
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMsgs(false);
    }
  }, [channel?.name, hasMoreOlderMessages, user?.email]);

  const handleAcceptQuotationDraft = useCallback(
    async (sqName: string, chat?: ErpDocChatContext) => {
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
        notifyQuotationAcceptedInChat(n, {
          ravenChannelId: chat?.ravenChannelId ?? channel?.name,
          linkMessageId: chat?.linkMessageId,
          sessionEmail: user?.email ?? null,
        });
        setQuotationActionByName((prev) => ({ ...prev, [n]: 'accepted' }));
        const ch = channel?.name;
        if (ch) await loadMessages(ch, { silent: true });
      } catch (e: unknown) {
        Alert.error('Quotation', userFacingFrappeError(e, userFacingError(e, 'Could not submit.')));
      } finally {
        setQuotationActionBusy(null);
      }
    },
    [channel?.name, loadMessages, user?.email, user?.user]
  );

  const handleRejectQuotationDraft = useCallback(
    async (sqName: string, chat?: ErpDocChatContext) => {
      const n = sqName.trim();
      if (!n) return;
      setQuotationActionBusy(n);
      try {
        await getERPNextClient().rejectSupplierQuotationDraft(n);
        notifyQuotationRejectedInChat(n, {
          ravenChannelId: chat?.ravenChannelId ?? channel?.name,
          linkMessageId: chat?.linkMessageId,
          sessionEmail: user?.email ?? null,
        });
        setQuotationActionByName((prev) => ({ ...prev, [n]: 'rejected' }));
        const ch = channel?.name;
        if (ch) await loadMessages(ch, { silent: true });
      } catch (e: unknown) {
        Alert.error('Quotation', userFacingFrappeError(e, userFacingError(e, 'Could not reject.')));
      } finally {
        setQuotationActionBusy(null);
      }
    },
    [channel?.name, loadMessages, user?.email]
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

  const openSalesOrderShareFromChat = useCallback(async () => {
    if (!channel?.name) {
      Alert.alert('Chat', 'Open a conversation first.');
      return;
    }
    let wsName = '';
    const wsId = workspace?.trim();
    if (wsId) {
      const row = workspaceRows.find((w) => String(w.name).toLowerCase() === wsId.toLowerCase());
      wsName = String(row?.workspace_name || wsId).trim();
    }

    let supplierDoc = '';
    let supplierGroup = '';
    let supplierLabel = '';
    const peerId = getRavenDmPeerUserId(channel, user?.email);
    if (peerId) {
      const peerLower = peerId.trim().toLowerCase();
      const mem = members.find((m) => (m.user || '').trim().toLowerCase() === peerLower);
      supplierDoc = (ravenWorkspaceMemberLinkedSupplierId(mem) || '').trim();
      const fromMember = mem?.full_name != null ? String(mem.full_name).trim() : '';
      supplierLabel =
        fromMember || (peerId.trim() ? resolveRavenUserDisplayName(peerId, ravenUserProfilesById) : '');
    }
    if (supplierDoc) {
      try {
        const sup = await getERPNextClient().getSupplier(supplierDoc);
        supplierGroup = String(sup?.supplier_group || '').trim();
        if (!supplierLabel) {
          supplierLabel = String(sup?.supplier_name || sup?.name || '').trim();
        }
      } catch {
        // Still open the form with supplier items even if group lookup fails.
      }
    }

    (navigation as { navigate: (name: string, params: object) => void }).navigate('SourcingRequest', {
      ravenChannelId: channel.name,
      ...(peerId ? { peerUserId: peerId } : {}),
      ...(wsId ? { ravenWorkspaceId: wsId } : {}),
      ...(supplierDoc ? { supplierDocName: supplierDoc, supplierGroup } : {}),
      ...(supplierLabel ? { supplierLabel } : {}),
      ...(wsName ? { workspaceName: wsName } : {}),
    });
  }, [navigation, channel, user?.email, members, workspace, workspaceRows, ravenUserProfilesById]);

  const onMessagesEndReached = useCallback(() => {
    if (!channel?.name || loadingMsgs || !hasMoreOlderMessages) return;
    if (!allowOlderEndReachedRef.current) return;
    void loadOlderMessages();
  }, [channel?.name, loadingMsgs, hasMoreOlderMessages, loadOlderMessages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const resolveDisplayName = useCallback(
    (userId?: string | null, memberFullName?: string | null) => {
      const fromDirectory = resolveRavenUserDisplayName(userId, ravenUserProfilesById);
      const short = userId?.trim() ? resolveRavenUserDisplayName(userId, undefined) : 'Unknown';
      if (userId?.trim() && fromDirectory !== short) return fromDirectory;
      const fromMember = memberFullName != null ? String(memberFullName).trim() : '';
      if (fromMember) return fromMember;
      return fromDirectory;
    },
    [ravenUserProfilesById]
  );

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
    for (const mem of members) {
      const u = (mem.user || '').trim();
      if (u) owners.add(u);
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
  }, [messages, members]);

  const presenceActiveSet = useMemo(
    () => new Set(activeUserIds.map((x) => x.trim().toLowerCase()).filter(Boolean)),
    [activeUserIds]
  );
  const presenceInvisibleSet = useMemo(
    () => new Set(invisibleUserIds.map((x) => x.trim().toLowerCase()).filter(Boolean)),
    [invisibleUserIds]
  );

  const viewerFrappeName = (user?.email || user?.user || '').trim() || null;

  const {
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
  } = useRavenMessageActions(setMessages, viewerFrappeName, setReplyTo);

  const { registerSqPaymentAction, resolveSqPayment } = useSqPaymentActionRegistry();

  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const insertComposerEmoji = useCallback((emoji: string) => {
    setDraft((d) => d + emoji);
    setComposerEmojiOpen(false);
  }, []);

  const openMessageActionsForItem = useCallback(
    (item: RavenMessageRow, sqLink?: string | null) => {
      const sq = String(sqLink || '').trim();
      openMessageActions(item, sq ? { sqName: sq } : undefined);
    },
    [openMessageActions]
  );

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
    if (buyerPremiumGate) {
      if (!user?.email) {
        setLoadingBoot(false);
        setWorkspaceRows([]);
        workspacesBootstrappedForUserRef.current = null;
        return;
      }
      if (subscriptionLoading) {
        return;
      }
      if (!subscriptionActive) {
        setLoadingBoot(false);
        setWorkspaceRows([]);
        workspacesBootstrappedForUserRef.current = null;
        return;
      }
    }
    const userKey = (user?.email || '').trim().toLowerCase();
    const isFirstBootstrap = workspacesBootstrappedForUserRef.current !== userKey;
    let cancelled = false;
    (async () => {
      if (isFirstBootstrap) {
        setLoadingBoot(true);
      }
      setError(null);
      try {
        const wsList = await fetchRavenWorkspaces();
        if (cancelled) return;
        const list = Array.isArray(wsList) ? wsList : [];
        setWorkspaceRows(list);
        if (isFirstBootstrap) {
          workspacesBootstrappedForUserRef.current = userKey;
          let initialWs: string | null = null;
          if (isSuppliersBuyerTab) {
            void setRavenLastChat(user?.email, null);
            const p = route.params as
              | {
                  openRavenWorkspaceId?: string;
                  openRavenChannelId?: string;
                  openRavenPeerUserId?: string;
                }
              | undefined;
            const wsFromRoute = String(p?.openRavenWorkspaceId ?? '').trim();
            const chFromRoute = String(p?.openRavenChannelId ?? '').trim();
            const peerFromRoute = String(p?.openRavenPeerUserId ?? '').trim();
            if (wsFromRoute && chFromRoute) {
              initialWs = wsFromRoute;
              pendingOpenFromGlobalRef.current = {
                ws: wsFromRoute,
                channelId: chFromRoute,
                ...(peerFromRoute ? { peerUserId: peerFromRoute } : {}),
              };
              skipSuppliersFocusResetRef.current = true;
            }
          } else if (list.length > 0 && !isHeaderChatInbox) {
            const last = await getRavenLastChat(user?.email);
            if (last?.workspace?.trim()) {
              const match = matchRavenWorkspaceRow(last.workspace, list);
              if (match?.name) initialWs = String(match.name).trim();
            }
          }
          if (!isSuppliersBuyerTab || initialWs) {
            setWorkspace(initialWs);
          }
          if (list.length === 0) {
            setError('No supplier groups found. Ask your administrator to add you to a supplier group.');
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(userFacingError(e, 'Failed to load supplier groups'));
      } finally {
        if (!cancelled && isFirstBootstrap) setLoadingBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    user?.email,
    isHeaderChatInbox,
    isSuppliersBuyerTab,
    buyerPremiumGate,
    subscriptionLoading,
    subscriptionActive,
  ]);

  const resolvedWorkspaceId = useMemo(() => {
    const w = workspace?.trim();
    if (!w) return null;
    return resolveRavenWorkspaceDocId(w, workspaceRows) || w;
  }, [workspace, workspaceRows]);

  useEffect(() => {
    if (!resolvedWorkspaceId) {
      workspaceHydratedRef.current = null;
      setLoadingWorkspaceChannels(false);
      setChannels([]);
      setMembers([]);
      setChannel(null);
      return;
    }

    const wsTarget = resolvedWorkspaceId;
    let cancelled = false;

    const pending = pendingOpenFromGlobalRef.current;
    const hasPendingOpen =
      !!pending && pending.ws.trim().toLowerCase() === wsTarget.trim().toLowerCase();
    const openChannelId = channelIdRef.current?.trim() || '';
    const softRefresh =
      workspaceHydratedRef.current === wsTarget && !!openChannelId && !hasPendingOpen;

    setLoadingWorkspaceChannels(true);
    setError(null);

    if (!softRefresh) {
      setChannels([]);
      setMembers([]);
      setChannel(null);
    }

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

        if (softRefresh) {
          setChannel((cur) => {
            if (!cur?.name) return cur;
            return rows.find((r) => String(r.name) === String(cur.name)) ?? cur;
          });
          setError(null);
          return;
        }

        const last = await getRavenLastChat(user?.email);
        let restored: RavenChannelRow | null = null;
        if (hasPendingOpen && pending) {
          const chId = pending.channelId.trim();
          const peer = pending.peerUserId?.trim();
          const jumpMsg = pending.messageId?.trim();
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
          } else if (jumpMsg) {
            pendingScrollToMessageRef.current = jumpMsg;
          }
        } else if (
          !isHeaderChatInbox &&
          !isSuppliersBuyerTab &&
          last?.workspace?.trim() &&
          last.channelId?.trim()
        ) {
          const lastWs = matchRavenWorkspaceRow(last.workspace, workspaceRows);
          const tw = wsTarget.trim().toLowerCase();
          if (lastWs && String(lastWs.name).trim().toLowerCase() === tw) {
            restored = rows.find((r) => String(r.name) === last.channelId.trim()) ?? null;
          }
        }
        setChannel(restored);
        workspaceHydratedRef.current = wsTarget;
        setError(null);
      } catch (e: any) {
        if (!cancelled && selectedWorkspaceRef.current === wsTarget) {
          if (!softRefresh) {
            setChannels([]);
            setMembers([]);
          }
          setError(userFacingError(e, 'Failed to load supplier group'));
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
  }, [resolvedWorkspaceId, user?.email, isHeaderChatInbox, isSuppliersBuyerTab]);

  useEffect(() => {
    channelIdRef.current = channel?.name ?? null;
  }, [channel?.name]);

  const lastPaintedChannelRef = useRef<string | null>(null);

  useEffect(() => {
    const ch = channel?.name?.trim();
    if (!ch) {
      lastPaintedChannelRef.current = null;
      setMessages([]);
      setLoadingMsgs(false);
      setHasMoreOlderMessages(false);
      return;
    }
    if (lastPaintedChannelRef.current === ch && messagesRef.current.length > 0) {
      setLoadingMsgs(false);
      return;
    }
    lastPaintedChannelRef.current = ch;
    const paint = readChannelMessagesMemoryPaint(user?.email, ch);
    if (paint) {
      setMessages(paint.messages);
      setHasMoreOlderMessages(paint.hasMoreOlder);
      setLoadingMsgs(false);
    } else {
      setMessages([]);
      setLoadingMsgs(true);
      setHasMoreOlderMessages(false);
    }
  }, [channel?.name, user?.email]);

  useEffect(() => {
    if (channel?.name) void loadMessages(channel.name);
  }, [channel?.name, loadMessages]);

  useEffect(() => {
    setReplyTo(null);
    setPendingAttachments([]);
    setShowScrollToLatestBtn(false);
    allowOlderEndReachedRef.current = false;
    loadingOlderRef.current = false;
    jumpToMessageAttemptRef.current = null;
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
      const title = `${titlePrefix}${getRavenChannelDisplayLabel(ch, user?.email, ravenUserProfilesById)}`.toLowerCase();
      const ws = (row.workspaceLabel || '').toLowerCase();
      const prev = (row.preview || '').toLowerCase();
      return title.includes(listSearchQ) || ws.includes(listSearchQ) || prev.includes(listSearchQ);
    });
  }, [globalInboxRows, listSearchQ, user?.email, ravenUserProfilesById]);

  const filteredSortedWorkspaceRows = useMemo(() => {
    if (!listSearchQ) return sortedWorkspaceRows;
    return sortedWorkspaceRows.filter((w) => {
      const primary = workspaceListPrimaryLabel(w).toLowerCase();
      const secondary = (workspaceListSecondaryLabel(w) || '').toLowerCase();
      return primary.includes(listSearchQ) || secondary.includes(listSearchQ);
    });
  }, [sortedWorkspaceRows, listSearchQ]);

  const filteredWorkspaceSuppliersSorted = useMemo(() => {
    if (!listSearchQ) return workspaceSuppliersSorted;
    return workspaceSuppliersSorted.filter((m) => {
      const label = resolveDisplayName(m.user, m.full_name).toLowerCase();
      const uid = (m.user || '').trim().toLowerCase();
      const linked = (ravenWorkspaceMemberLinkedSupplierId(m) || '').trim().toLowerCase();
      return (
        label.includes(listSearchQ) ||
        uid.includes(listSearchQ) ||
        (linked.length > 0 && linked.includes(listSearchQ))
      );
    });
  }, [workspaceSuppliersSorted, listSearchQ, resolveDisplayName]);

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

      if (buyerPremiumGate) {
        const viewer = (user?.user || user?.email || '').trim();
        if (!viewer) {
          if (!silent) setLoadingGlobalInbox(false);
          return;
        }
        if (subscriptionLoading) {
          if (!silent) setLoadingGlobalInbox(true);
          return;
        }
        if (!subscriptionActive) {
          if (!silent) {
            setGlobalInboxRows([]);
            setLoadingGlobalInbox(false);
            setGlobalInboxSettled(true);
          }
          return;
        }
      }

      const myGen = ++globalInboxLoadGenerationRef.current;
      const isCancelled = opts?.isCancelled;
      const stale = () =>
        isCancelled?.() === true || myGen !== globalInboxLoadGenerationRef.current;

      const wsRows = opts?.workspaceRowsSnapshot ?? workspaceRows;
      const viewerId = (user?.user || user?.email || '').trim();

      const channelsPromise = listRavenChannelsForSessionUser(viewerId, { enrichProfiles: false });

      if (!silent) {
        if (globalInboxRowsRef.current.length === 0) {
          setLoadingGlobalInbox(true);
          setGlobalInboxSettled(false);
        }
        void getRavenGlobalInboxSnapshot(user?.email).then((cachedInbox) => {
          if (stale() || !cachedInbox?.length) return;
          globalInboxRowsRef.current = cachedInbox as GlobalInboxRow[];
          setGlobalInboxRows(cachedInbox as GlobalInboxRow[]);
          setLoadingGlobalInbox(false);
          setGlobalInboxSettled(true);
        });
      }

      try {
        let chs: RavenChannelRow[] = [];
        try {
          chs = await channelsPromise;
        } catch {
          chs = [];
        }
        if (stale()) return;
        if (chs.length === 0) {
          if (!stale()) {
            globalInboxRowsRef.current = [];
            setGlobalInboxRows([]);
            void setRavenGlobalInboxSnapshot(user?.email, []);
            if (!silent) setLoadingGlobalInbox(false);
            setGlobalInboxSettled(true);
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
            getRavenChannelDisplayLabel(r.channel, user?.email, ravenUserProfilesById).toLowerCase();
          merged.sort((a, b) => {
            const d = rowScore(b) - rowScore(a);
            if (d !== 0) return d;
            return chLabel(a).localeCompare(chLabel(b), undefined, { sensitivity: 'base' });
          });
          return merged;
        };

        const patchGlobalInboxRow = (channelId: string, row: GlobalInboxRow | null) => {
          setGlobalInboxRows((prev) => {
            const existing = prev.find((r) => r.channel.name?.trim() === channelId);
            const without = prev.filter((r) => r.channel.name?.trim() !== channelId);
            const mergedRow = row && existing ? mergeGlobalInboxRow(existing, row) : row;
            const next = !mergedRow
              ? finalizeGlobalInboxRows(without)
              : finalizeGlobalInboxRows([...without, mergedRow]);
            globalInboxRowsRef.current = next;
            return next;
          });
        };

        const fastRows = chsSorted
          .map((ch) => globalInboxRowFromChannelFast(ch, wsRows, true))
          .filter((row): row is GlobalInboxRow => row != null);

        if (!stale() && fastRows.length > 0) {
          let nextRows: GlobalInboxRow[];
          if (silent && globalInboxRowsRef.current.length > 0) {
            const freshById = new Map(
              fastRows.map((r) => [r.channel.name?.trim() || '', r] as const)
            );
            const seen = new Set<string>();
            const merged: GlobalInboxRow[] = [];
            for (const existing of globalInboxRowsRef.current) {
              const cid = existing.channel.name?.trim() || '';
              if (!cid) continue;
              seen.add(cid);
              const fresh = freshById.get(cid);
              merged.push(fresh ? mergeGlobalInboxRow(existing, fresh) : existing);
            }
            for (const fresh of fastRows) {
              const cid = fresh.channel.name?.trim() || '';
              if (cid && !seen.has(cid)) merged.push(fresh);
            }
            nextRows = finalizeGlobalInboxRows(merged);
          } else {
            nextRows = finalizeGlobalInboxRows(fastRows);
          }
          globalInboxRowsRef.current = nextRows;
          setGlobalInboxRows(nextRows);
          if (!silent) setLoadingGlobalInbox(false);
          setGlobalInboxSettled(true);
        }

        const channelsNeedingFetch = chsSorted.filter((ch) => {
          const cid = ch.name?.trim();
          if (cid) {
            const existing = globalInboxRowsRef.current.find((r) => r.channel.name?.trim() === cid);
            if (existing && existing.preview !== GLOBAL_INBOX_PREVIEW_PLACEHOLDER) return false;
          }
          const fast = globalInboxRowFromChannelFast(ch, wsRows, true);
          return fast?.preview === GLOBAL_INBOX_PREVIEW_PLACEHOLDER;
        });

        if (!stale() && fastRows.length === 0 && channelsNeedingFetch.length === 0) {
          globalInboxRowsRef.current = [];
          setGlobalInboxRows([]);
          if (!silent) setLoadingGlobalInbox(false);
          setGlobalInboxSettled(true);
        }

        if (channelsNeedingFetch.length > 0 && !silent) {
          setInboxPreviewEnriching(true);
        }

        await forEachWithConcurrency(channelsNeedingFetch, RAVEN_GLOBAL_INBOX_PREVIEW_CONCURRENCY, async (ch) => {
          if (stale()) return;
          const cid = ch.name?.trim();
          if (!cid) return;
          const row = await globalInboxRowFromChannelFetched(ch, wsRows);
          if (stale()) return;
          patchGlobalInboxRow(cid, row);
        });

        if (!stale()) {
          setInboxPreviewEnriching(false);
        }

        const dmNeedsProfileImage = (rows: GlobalInboxRow[]) =>
          rows.some((row) => {
            if (!isDmChannel(row.channel)) return false;
            const img =
              row.channel.peer_user_image != null ? String(row.channel.peer_user_image).trim() : '';
            return !img;
          });

        if (dmNeedsProfileImage(globalInboxRowsRef.current)) {
          void enrichRavenChannelsWithPeerProfiles(chsSorted, user?.email).then((enrichedChannels) => {
            if (stale() || enrichedChannels.length === 0) return;
            const byId = new Map(enrichedChannels.map((c) => [String(c.name || '').trim(), c]));
            setGlobalInboxRows((prev) => {
              const next = finalizeGlobalInboxRows(
                prev.map((row) => {
                  const cid = row.channel.name?.trim();
                  const match = cid ? byId.get(cid) : undefined;
                  if (!match) return row;
                  return { ...row, channel: mergeGlobalInboxChannel(row.channel, match) };
                })
              );
              globalInboxRowsRef.current = next;
              return next;
            });
          });
        }
      } catch {
        if (!stale()) {
          setGlobalInboxRows([]);
          void setRavenGlobalInboxSnapshot(user?.email, []);
        }
      } finally {
        if (myGen === globalInboxLoadGenerationRef.current) {
          setGlobalInboxSettled(true);
          setInboxPreviewEnriching(false);
          if (!silent) setLoadingGlobalInbox(false);
        }
      }
    },
    [
      isHeaderChatInbox,
      workspace,
      workspaceRows,
      user?.email,
      user?.user,
      buyerPremiumGate,
      subscriptionLoading,
      subscriptionActive,
    ]
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
      setGlobalInboxSettled(false);
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
    if (buyerPremiumGate) {
      if (!(user?.user || user?.email)?.trim()) return;
      if (subscriptionLoading) return;
      if (!subscriptionActive) return;
    }
    let cancelled = false;
    const silent = globalInboxSettledRef.current && globalInboxRowsRef.current.length > 0;
    void loadGlobalInbox({ silent, isCancelled: () => cancelled });
    return () => {
      cancelled = true;
      globalInboxLoadGenerationRef.current++;
      setInboxPreviewEnriching(false);
    };
  }, [
    isHeaderChatInbox,
    workspace,
    workspaceRows,
    user?.email,
    user?.user,
    loadGlobalInbox,
    buyerPremiumGate,
    subscriptionLoading,
    subscriptionActive,
  ]);

  const refreshWorkspaceMembers = useCallback(async () => {
    const ws = selectedWorkspaceRef.current?.trim();
    if (!ws) return;
    setLoadingWorkspaceMembers(true);
    try {
      const mem = await fetchWorkspaceMembers(ws);
      if (selectedWorkspaceRef.current?.trim() !== ws) return;
      setMembers(mem);
    } catch {
      /* keep existing list */
    } finally {
      setLoadingWorkspaceMembers(false);
    }
  }, []);

  const prevChannelIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevChannelIdRef.current;
    const curr = channel?.name?.trim() || null;
    prevChannelIdRef.current = curr;
    if (prev && !curr && workspace?.trim()) {
      void refreshWorkspaceMembers();
    }
  }, [channel?.name, workspace, refreshWorkspaceMembers]);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      setActiveChannelId(channelIdRef.current);
      void refreshUnreadCounts();
      if (workspace?.trim() && !channelIdRef.current) {
        void loadPresence();
        void refreshWorkspaceMembers();
      } else if (workspace?.trim()) {
        void loadPresence();
      }
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
      refreshWorkspaceMembers,
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
      Alert.error('File', userFacingError(e, 'Could not pick a file.'));
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

  const isSupplierPortalChat = route.name === 'SupplierMessages';
  const isBuyerMessaging = useMemo(
    () =>
      !isSupplierPortalChat &&
      user?.appMode !== 'supplier' &&
      buyerRavenRouteNeedsSubscription(String(route.name)),
    [isSupplierPortalChat, user?.appMode, route.name]
  );

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
      const result = await refreshChannelMessagesAfterSend(
        user?.email,
        channel.name,
        RAVEN_CHAT_FIRST_PAGE_SIZE,
        messagesRef.current,
        (rows) => {
          let next = rows;
          for (const p of mergePayloads) {
            next = ravenMergeMessageRowFromSendResponse(next, p);
          }
          return next;
        }
      );
      setMessages(result.messages);
      setHasMoreOlderMessages(result.hasMoreOlder);
      setError(null);
    } catch (e: any) {
      Alert.error('Message not sent', userFacingError(e, 'Send failed'));
    } finally {
      setSending(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (channel?.name) {
      void loadMessages(channel.name, { force: true });
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
        persistLastChat({ workspace: workspace.trim(), channelId: c.name });
        const wsId = resolvedWorkspaceId ?? workspace.trim();
        workspaceHydratedRef.current = wsId;
      }
    },
    [workspace, persistLastChat, resolvedWorkspaceId]
  );

  const openThreadFromInboxRow = useCallback(
    (row: GlobalInboxRow, jumpMessageId?: string) => {
      const ws = row.workspaceId.trim();
      const chId = row.channel.name.trim();
      if (!ws || !chId) return;

      persistLastChat({ workspace: ws, channelId: chId });
      /** Inbox already has the channel — open the thread directly; workspace loads in the background. */
      pendingOpenFromGlobalRef.current = null;

      const wsResolved = resolveRavenWorkspaceDocId(ws, workspaceRows) || ws;
      workspaceHydratedRef.current = wsResolved;
      channelIdRef.current = chId;

      const jump = jumpMessageId?.trim();
      if (jump) pendingScrollToMessageRef.current = jump;

      setDrawerOpen(false);
      setWorkspace(ws);
      setChannel(row.channel);
    },
    [persistLastChat, workspaceRows]
  );

  const openGlobalInboxChat = useCallback(
    (row: GlobalInboxRow) => {
      openThreadFromInboxRow(row);
    },
    [openThreadFromInboxRow]
  );

  const renderGlobalInboxRow = useCallback(
    ({ item }: { item: GlobalInboxRow }) => {
      const ch = item.channel;
      const unread = unreadByChannelId[ch.name] ?? 0;
      const titlePrefix = isDmChannel(ch) ? '' : channelPrefix(ch.type);
      const peerLine = getRavenDmPeerUserId(ch, user?.email);
      const metaLine = isDmChannel(ch)
        ? peerLine
          ? resolveRavenUserDisplayName(peerLine, ravenUserProfilesById)
          : 'Direct message'
        : ch.type || '';
      const titleText = `${titlePrefix}${getRavenChannelDisplayLabel(ch, user?.email, ravenUserProfilesById)}`;
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
              <RavenChannelPeerAvatar
                channel={ch}
                currentUserEmail={user?.email}
                size={52}
                variant="raven"
                userDisplayProfiles={ravenUserProfilesById}
              />
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
    [openGlobalInboxChat, user?.email, unreadByChannelId, viewerFrappeName, presenceActiveSet, presenceInvisibleSet, ravenUserProfilesById]
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
      persistLastChat({ workspace: workspace.trim(), channelId: opened.name });
      setDrawerOpen(false);
      await loadMessages(chId);
    } catch (e: any) {
      Alert.error('Direct message', userFacingFrappeError(e, 'Could not open this conversation. Both people need an active chat account.'));
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
      skipSuppliersFocusResetRef.current = true;
      persistLastChat({ workspace: wsNorm, channelId: chNorm });
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
          Alert.error('Chat', userFacingError(e, 'Could not load conversation.'));
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
    [workspace, persistLastChat, loadMessages]
  );

  useEffect(() => {
    if (isHeaderChatInbox) return;
    const p = route.params as
      | { openRavenWorkspaceId?: string; openRavenChannelId?: string; openRavenPeerUserId?: string }
      | undefined;
    const wsHint = String(p?.openRavenWorkspaceId ?? '').trim();
    const ch = String(p?.openRavenChannelId ?? '').trim();
    const peer = String(p?.openRavenPeerUserId ?? '').trim();
    if (!ch) return;

    let cancelled = false;
    let raf = 0;
    void (async () => {
      let ws = wsHint;
      if (!ws) {
        const rows = await listRavenChannelsForSessionUser(user?.email ?? null);
        if (cancelled) return;
        const hit = rows.find((c) => String(c.name || '').trim() === ch);
        ws = String(hit?.workspace || '').trim();
      }
      if (!ws) {
        const workspaces = await fetchRavenWorkspaces();
        if (cancelled) return;
        ws = String(pickRavenWorkspaceId(workspaces) || '').trim();
        if (!ws) {
          ws =
            (Array.isArray(workspaces) ? workspaces : [])
              .map((row) => String(row?.name || '').trim())
              .find(Boolean) || '';
        }
      }
      if (!ws || cancelled) return;

      skipSuppliersFocusResetRef.current = true;
      void openChannelFromSuppliersRouteParams(ws, ch, peer || undefined);
      raf = requestAnimationFrame(() => {
        try {
          (navigation as unknown as { setParams: (obj: Record<string, unknown>) => void }).setParams({
            openRavenWorkspaceId: undefined,
            openRavenChannelId: undefined,
            openRavenPeerUserId: undefined,
            shareSalesOrderName: undefined,
          });
        } catch {
          /* noop */
        }
      });
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isHeaderChatInbox, route.params, openChannelFromSuppliersRouteParams, navigation, user?.email]);

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
          'This member is not linked to a supplier profile yet. Ask your administrator to complete the setup.'
        );
        return;
      }
      skipSuppliersFocusResetRef.current = true;
      (navigation as { navigate: (name: string, params: object) => void }).navigate('RavenWorkspaceSupplierProfile', {
        supplierDocName: linked,
        workspaceAdminUser: m.user,
        ...(workspace?.trim() ? { ravenWorkspaceId: workspace.trim() } : {}),
        ...(workspaceScreenTitle ? { ravenWorkspaceName: workspaceScreenTitle } : {}),
        ...(shareSalesOrderName ? { shareSalesOrderName } : {}),
      });
    },
    [navigation, workspace, workspaceScreenTitle, shareSalesOrderName]
  );

  const clearShareSalesOrderIntent = useCallback(() => {
    if (!isSuppliersBuyerTab) return;
    try {
      (navigation as unknown as { setParams: (obj: Record<string, unknown>) => void }).setParams({
        shareSalesOrderName: undefined,
      });
    } catch {
      /* noop */
    }
  }, [navigation, isSuppliersBuyerTab]);

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
                {resolveDisplayName(item.user, item.full_name)}
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
    [openAdminSupplierSheet, viewerFrappeName, presenceActiveSet, presenceInvisibleSet, resolveDisplayName]
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: RavenMessageRow; index: number }) => {
      const mine = ravenMessageOwnerMatchesSession(item.owner, user);
      const isHighlighted =
        highlightedMessageId != null && (item.name || '').trim() === highlightedMessageId.trim();
      const hasAttach = !!(item.file?.trim() || item.file_thumbnail?.trim());
      const linkDtRaw = String(item.link_doctype || '').trim();
      const linkDnRaw = String(item.link_document || '').trim();
      const isSupplierQuotationLink = !hasAttach && ravenRowIsSupplierQuotationDocLink(linkDtRaw, linkDnRaw);
      const sqLink = isSupplierQuotationLink ? linkDnRaw : null;
      const isSalesOrderLink = !hasAttach && ravenRowIsSalesOrderDocLink(linkDtRaw, linkDnRaw);
      const soLink = isSalesOrderLink ? linkDnRaw : null;
      const isSalesInvoiceLink = !hasAttach && ravenRowIsSalesInvoiceDocLink(linkDtRaw, linkDnRaw);
      const siLink = isSalesInvoiceLink ? linkDnRaw : null;
      const genericDocLink =
        !hasAttach && !!linkDtRaw && !!linkDnRaw && !isSupplierQuotationLink && !isSalesOrderLink && !isSalesInvoiceLink
          ? { doctype: linkDtRaw, document: linkDnRaw }
          : null;
      const qDraft =
        !hasAttach && !sqLink && !soLink && !siLink && !genericDocLink ? tryParseQuotationDraftFromMessage(item.text) : null;
      const isSupplierRoute = route.name === 'SupplierMessages';
      const isSupplierPortalUser = user?.appMode === 'supplier' || !!user?.supplierId?.trim();
      const showBuyerQuotationActions =
        (!!qDraft || !!sqLink) && !mine && !isSupplierPortalUser && !isSupplierRoute;
      /** Any linked SQ in supplier inbox: Approve payment / Reply long-press applies to admin or self-posted links once ERP supplier matches session. */
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

      const quotationPayKey = sqLink ?? (qDraft?.name?.trim() || null);
      const openThisMessageActions = () => openMessageActionsForItem(item, quotationPayKey);

      const attachBody = hasAttach ? (
        <RavenMessageAttachmentBody
          item={item}
          mine={mine}
          variant="raven"
          mediaGroupNeighbor={mediaGroupNeighbor}
          onReplyLongPress={openThisMessageActions}
        />
      ) : null;
      const tLine = formatMessageBubbleTime(item.creation || item.modified);
      const showDateSep = shouldShowChatDateSeparator(index, messages);
      const dateSepLabel = formatChatDateSeparator(item.creation || item.modified);
      const wrapWithDateSep = (node: React.ReactNode) => (
        <View>
          {showDateSep && dateSepLabel ? (
            <View style={s.chatDateSepRow}>
              <View style={s.chatDateSepLine} />
              <Text style={s.chatDateSepText}>{dateSepLabel}</Text>
              <View style={s.chatDateSepLine} />
            </View>
          ) : null}
          {node}
        </View>
      );
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
            ravenChannelId={channel?.name}
            linkMessageId={item.name}
            supplierSelfServeUx={supplierSqSelfServeUx}
            showBuyerActions={showBuyerQuotationActions}
            viewerSupplierDocId={user?.supplierId}
            handled={quotationActionByName[sqLink] ?? null}
            busy={quotationActionBusy === sqLink}
            onMessageLongPress={openThisMessageActions}
            onAccept={
              showBuyerQuotationActions
                ? () =>
                    void handleAcceptQuotationDraft(sqLink, {
                      ravenChannelId: channel?.name,
                      linkMessageId: item.name,
                    })
                : undefined
            }
            onReject={
              showBuyerQuotationActions
                ? () =>
                    void handleRejectQuotationDraft(sqLink, {
                      ravenChannelId: channel?.name,
                      linkMessageId: item.name,
                    })
                : undefined
            }
            registerSqPaymentAction={supplierSqSelfServeUx ? registerSqPaymentAction : undefined}
          />
        ) : soLink != null ? (
          <RavenLinkedSalesOrderMessage orderName={soLink} ravenChannelId={channel?.name} />
        ) : siLink != null ? (
          <RavenLinkedSalesInvoiceMessage invoiceName={siLink} />
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
                ? () =>
                    void handleAcceptQuotationDraft(qDraft.name, {
                      ravenChannelId: channel?.name,
                      linkMessageId: item.name,
                    })
                : undefined
            }
            onReject={
              showBuyerQuotationActions && qDraft.buyerReviewEligible !== false
                ? () =>
                    void handleRejectQuotationDraft(qDraft.name, {
                      ravenChannelId: channel?.name,
                      linkMessageId: item.name,
                    })
                : undefined
            }
            onCardLongPress={openThisMessageActions}
          />
        ) : null;

      const showPlainTextBubble = !!item.text?.trim() && !qDraft && !sqLink && !soLink && !siLink && !genericDocLink;

      if (mine) {
        return wrapWithDateSep(
          <Pressable
            style={[s.bubbleRow, s.bubbleRowMine, isHighlighted && s.msgHighlight]}
            onLongPress={openThisMessageActions}
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
                  userDisplayProfiles={ravenUserProfilesById}
                />
              ) : null}
              {!showReplyQuote && !!item.is_reply ? <Text style={[s.replyBadge, s.replyBadgeMine]}>Reply</Text> : null}
              {ravenMessageIsForwarded(item) ? (
                <Text style={[s.forwardedBadge, s.forwardedBadgeMine]}>Forwarded</Text>
              ) : null}
              {attachBody}
              {quotationCard}
              {showPlainTextBubble ? (
                <View style={s.mineTextBubble}>
                  <Text style={[s.bubbleBody, s.bubbleBodyMine]}>{item.text}</Text>
                </View>
              ) : null}
              <RavenMessageReactionsRow
                messageReactions={item.message_reactions}
                currentUserId={viewerFrappeName}
                variant="raven"
                onToggleReaction={(emoji) => void toggleReaction(item, emoji)}
              />
              <Text style={s.msgTimeMine}>{tLine}</Text>
            </View>
          </Pressable>
        );
      }

      const ownerKey = item.owner || '?';
      const ownerProfile =
        ravenUserProfilesById[ownerKey] ?? ravenUserProfilesById[ownerKey.toLowerCase()];
      const ownerAvatarUri = resolveRavenErpAttachImageUri(ownerProfile?.user_image ?? '');
      return wrapWithDateSep(
        <Pressable
          style={[s.msgRowTheirs, isHighlighted && s.msgHighlight]}
          onLongPress={openThisMessageActions}
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
                {resolveDisplayName(item.owner)}
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
                userDisplayProfiles={ravenUserProfilesById}
              />
            ) : null}
            {!showReplyQuote && !!item.is_reply ? <Text style={s.replyBadge}>Reply</Text> : null}
            {ravenMessageIsForwarded(item) ? <Text style={s.forwardedBadge}>Forwarded</Text> : null}
            {attachBody}
            {quotationCard}
            {showPlainTextBubble ? (
              <View style={s.theirsTextBubble}>
                <Text style={s.msgTextTheirs}>{item.text}</Text>
              </View>
            ) : null}
            <RavenMessageReactionsRow
              messageReactions={item.message_reactions}
              currentUserId={viewerFrappeName}
              variant="raven"
              onToggleReaction={(emoji) => void toggleReaction(item, emoji)}
            />
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
      ravenUserProfilesById,
      resolveDisplayName,
      quotationActionByName,
      quotationActionBusy,
      handleAcceptQuotationDraft,
      handleRejectQuotationDraft,
      highlightedMessageId,
      openMessageActionsForItem,
      toggleReaction,
    ]
  );

  if (buyerPremiumGate) {
    if (!user?.email) {
      return (
        <View style={s.safe}>
          <StatusBar style="dark" backgroundColor={RavenLight.panel} translucent />
          <View style={[s.bootCenter, { paddingTop: insets.top, paddingHorizontal: 20 }]}>
            <Text style={[s.bootHint, { fontSize: 17, fontWeight: '700', color: RavenLight.text }]}>
              {t('suppliersPremium.signInTitle')}
            </Text>
            <Text style={[s.bootHint, { marginTop: 10 }]}>{t('suppliersPremium.signInBody')}</Text>
            <TouchableOpacity
              onPress={() => resetToAuthScreen()}
              style={{
                marginTop: 22,
                backgroundColor: RavenLight.accent,
                paddingVertical: 12,
                paddingHorizontal: 24,
                borderRadius: 10,
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('suppliersPremium.signInCta')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    if (subscriptionLoading) {
      return (
        <View style={s.safe}>
          <StatusBar style="dark" backgroundColor={RavenLight.panel} translucent />
          <View style={[s.bootCenter, { paddingTop: insets.top }]}>
            <ActivityIndicator size="large" color={RavenLight.accent} />
          </View>
        </View>
      );
    }
    if (!subscriptionActive) {
      return (
        <View style={s.safe}>
          <StatusBar style="dark" backgroundColor={RavenLight.panel} translucent />
          <View style={[s.bootCenter, { paddingTop: insets.top }]}>
            <ActivityIndicator size="large" color={RavenLight.accent} />
          </View>
        </View>
      );
    }
  }

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

  const chName = channel
    ? getRavenChannelDisplayLabel(channel, user?.email, ravenUserProfilesById)
    : 'Select channel';
  const hubListHeaderTitle = !channel
    ? !workspace?.trim()
      ? isHeaderChatInbox
        ? route.name === 'SupplierMessages'
          ? 'Messages'
          : 'Chats'
        : route.name === 'SupplierMessages'
          ? 'Workspaces'
          : 'Supplier groups'
      : workspaceScreenTitle || 'Supplier group'
    : '';
  const headerDmPeerId = channel ? getRavenDmPeerUserId(channel, user?.email) : null;
  const headerPeerIsActive =
    !!headerDmPeerId &&
    ravenUserIsActiveLikeWeb(headerDmPeerId, viewerFrappeName, presenceActiveSet, presenceInvisibleSet);

  const showListSearchBar = !channel;

  /** Lift layout by measured keyboard height (iOS + Android). Avoids iOS KeyboardAvoidingView `padding` stacking extra empty space above the keyboard. */
  const composerBottomPad =
    keyboardOpen && channel
      ? 0
      : Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 8) + tabBarHeight;

  return (
    <View style={s.safe}>
      <StatusBar style="dark" backgroundColor={RavenLight.panel} translucent />
      <View
        style={[
          s.flex,
          keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : null,
        ]}
      >
        {/* Top bar — paddingTop pulls content below status bar; panel fills notch (see StatusBar). */}
        <View style={[s.header, { paddingTop: insets.top + 10 }]}>
          <View style={s.headerSide}>
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
          </View>
          {channel ? (
            <TouchableOpacity
              style={s.headerCenter}
              onPress={() => setDrawerOpen(true)}
              activeOpacity={0.85}
              accessibilityLabel="Open messages menu"
            >
              <View style={s.headerAvatarCircleWrap}>
                <RavenChannelPeerAvatar
                  channel={channel}
                  currentUserEmail={user?.email}
                  size={40}
                  variant="raven"
                  userDisplayProfiles={ravenUserProfilesById}
                />
                {headerPeerIsActive ? <View style={s.headerOnlineDot} /> : null}
              </View>
              <Text style={s.headerPeerName} numberOfLines={1} ellipsizeMode="tail">
                {chName}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[s.headerCenter, s.headerInboxCenter]} pointerEvents="none">
              <Text style={s.headerInboxTitle} numberOfLines={1} ellipsizeMode="tail">
                {hubListHeaderTitle}
              </Text>
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
              <View style={s.headerSide} />
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

        {isSuppliersBuyerTab && !!shareSalesOrderName && !channel ? (
          <View style={s.shareOrderBanner}>
            <Ionicons name="share-outline" size={18} color={RavenLight.accent} style={{ marginRight: 10 }} />
            <View style={s.shareOrderBannerText}>
              <Text style={s.shareOrderBannerTitle}>{t('salesOrderShare.pickSupplierBannerTitle')}</Text>
              <Text style={s.shareOrderBannerSub} numberOfLines={2}>
                {t('salesOrderShare.pickSupplierBannerSub', { order: shareSalesOrderName })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={clearShareSalesOrderIntent}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('salesOrderShare.cancelSharePick')}
            >
              <Ionicons name="close" size={20} color={RavenLight.textMuted} />
            </TouchableOpacity>
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
                ListFooterComponent={
                  inboxPreviewEnriching ? (
                    <View style={s.inboxListFooter}>
                      <ActivityIndicator color={RavenLight.accent} size="small" />
                    </View>
                  ) : null
                }
                ListEmptyComponent={
                  <View style={s.hubEmpty}>
                    {(!globalInboxSettled && loadingGlobalInbox) ||
                    (refreshing && filteredGlobalInboxRows.length === 0 && globalInboxRows.length === 0) ? (
                      <>
                        <ActivityIndicator color={RavenLight.accent} style={{ marginBottom: 12 }} />
                        <Text style={s.inboxEmptyText}>Loading your chats…</Text>
                      </>
                    ) : globalInboxSettled && globalInboxRows.length === 0 ? (
                      <>
                        <View style={s.hubEmptyIconCircle}>
                          <Ionicons name="chatbubbles-outline" size={36} color={RavenLight.accent} />
                        </View>
                        <Text style={s.inboxEmptyText}>You have no chats yet</Text>
                        <Text style={s.inboxEmptyHint}>
                          {route.name === 'SupplierMessages'
                            ? 'When a buyer messages you or adds you to a channel, conversations will appear here.'
                            : 'Go to Suppliers, open a supplier group, and start a conversation from a supplier profile.'}
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
                data={filteredWorkspaceSuppliersSorted}
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
                    {workspaceSuppliersSorted.length === 0 ? (
                      loadingWorkspaceChannels || loadingWorkspaceMembers ? (
                        <>
                          <ActivityIndicator color={RavenLight.accent} style={{ marginBottom: 12 }} />
                          <Text style={s.inboxEmptyText}>Loading suppliers…</Text>
                        </>
                      ) : (
                      <>
                        <View style={s.hubEmptyIconCircle}>
                          <Ionicons name="people-outline" size={36} color={RavenLight.accent} />
                        </View>
                        <Text style={s.inboxEmptyText}>No suppliers yet</Text>
                        <Text style={s.inboxEmptyHint}>
                          Ask your administrator to add supplier representatives to this group. Use the menu (⋯) in a
                          chat for channels and direct messages.
                        </Text>
                      </>
                      )
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
        <View style={[s.composerBar, { paddingBottom: composerBottomPad }]}>
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
            <RavenChatAttachTrigger
              disabled={!channel || sending}
              buttonStyle={s.plusCircleBtn}
              disabledStyle={s.attachBtnOff}
              isSupplierPortalChat={isSupplierPortalChat}
              isBuyerMessaging={isBuyerMessaging}
              onPickEmoji={() => setComposerEmojiOpen(true)}
              onPickMedia={pickMedia}
              onPickDocument={pickDocument}
              onNewQuotation={openQuotationComposeFromChat}
              onSourcingRequest={openSalesOrderShareFromChat}
            />
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
      </View>

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
                    userDisplayProfiles={ravenUserProfilesById}
                  />
                ) : null}

                {showSuggestedSuppliersInMenu ? (
                  <>
                    <View style={s.drawerSectionRow}>
                      <Text style={s.drawerSectionBold}>Suggested suppliers</Text>
                    </View>
                    <Text style={s.drawerMemberScopeHint}>
                      Workspace administrators in this supplier group you can message. Your own account is not listed. Switch
                      to another supplier group to refresh this list.
                    </Text>
                    {members.length === 0 ? (
                      <Text style={s.drawerEmpty}>
                        No contacts returned. Your account may need permission to view members for this
                        supplier group.
                      </Text>
                    ) : directoryMembers.length === 0 ? (
                      <Text style={s.drawerEmpty}>No other admins to show for this supplier group yet.</Text>
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
                                {resolveDisplayName(m.user, m.full_name)}
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
        inChannelLabel={
          channel ? getRavenChannelDisplayLabel(channel, user?.email, ravenUserProfilesById) : undefined
        }
        userDisplayProfiles={ravenUserProfilesById}
        onChannelPicked={(ws, chId, messageId) => {
          setSearchOpen(false);
          const msgId = messageId?.trim();
          const targetCh = chId.trim();
          const currentCh = channel?.name?.trim();
          if (msgId && currentCh && targetCh === currentCh) {
            void jumpToMessageInChat(msgId);
            return;
          }
          if (msgId) {
            pendingScrollToMessageRef.current = msgId;
          }
          if (ws.trim()) {
            pendingOpenFromGlobalRef.current = { ws, channelId: targetCh, messageId: msgId };
            setDrawerOpen(false);
            setWorkspace(ws);
          }
        }}
      />

      <RavenMessageActionSheet
        visible={!!actionsMessage}
        message={actionsMessage}
        extras={actionsExtras}
        resolveSqPayment={resolveSqPayment}
        onClose={closeMessageActions}
        onReply={onActionReply}
        onForward={onActionForward}
        onReact={onActionReact}
      />
      <RavenForwardMessageModal
        visible={!!forwardMessage}
        message={forwardMessage}
        channels={channels}
        currentUserEmail={user?.email}
        userProfiles={ravenUserProfilesById}
        variant="raven"
        onClose={() => setForwardMessage(null)}
      />
      <RavenComposerEmojiSheet
        visible={composerEmojiOpen}
        onClose={() => setComposerEmojiOpen(false)}
        onPick={insertComposerEmoji}
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
  },
  headerSide: {
    flexShrink: 0,
    width: 76,
    alignItems: 'flex-start',
    justifyContent: 'center',
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
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    width: 76,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginHorizontal: 2,
    overflow: 'hidden',
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
    minWidth: 0,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    color: RavenLight.text,
  },
  headerInboxCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  headerInboxTitle: {
    width: '100%',
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: RavenLight.text,
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
  shareOrderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingVertical: 10,
    backgroundColor: RavenLight.accentSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
  },
  shareOrderBannerText: { flex: 1, minWidth: 0, marginRight: 8 },
  shareOrderBannerTitle: { fontSize: 13, fontWeight: '700', color: RavenLight.text },
  shareOrderBannerSub: { marginTop: 2, fontSize: 12, lineHeight: 17, color: RavenLight.textMuted },
  messageCanvas: { flex: 1, backgroundColor: RavenLight.canvas },
  messagesListShell: { flex: 1, position: 'relative' },
  messagesListFlex: { flex: 1 },
  scrollDownFab: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: RavenLight.panel,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
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
  inboxListFooter: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
  listPad: { paddingHorizontal: Spacing.MD, paddingVertical: 8, paddingBottom: 12 },
  bubbleRow: { flexDirection: 'row', marginBottom: 6, maxWidth: '100%', width: '100%', alignSelf: 'stretch' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  msgHighlight: {
    backgroundColor: RavenLight.accentSoft,
    borderRadius: 10,
  },
  msgRowTheirs: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    maxWidth: '100%',
    width: '100%',
    alignSelf: 'stretch',
  },
  msgAvatarWrap: {
    position: 'relative',
    width: 36,
    marginRight: 8,
    paddingTop: 2,
  },
  msgAvatarSq: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgAvatarSqClip: {
    overflow: 'hidden',
    backgroundColor: RavenLight.canvas,
  },
  msgAvatarImage: {
    width: 32,
    height: 32,
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
    marginBottom: 2,
  },
  msgAuthorName: {
    fontSize: 14,
    fontWeight: '600',
    color: RavenLight.text,
    maxWidth: '72%',
  },
  msgHeaderTime: {
    fontSize: 12,
    fontWeight: '400',
    color: RavenLight.textSubtle,
  },
  chatDateSepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  chatDateSepLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: RavenLight.border,
  },
  chatDateSepText: {
    fontSize: 11,
    fontWeight: '600',
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
    backgroundColor: RavenLight.panel,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginTop: 1,
    marginBottom: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
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
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginBottom: 2,
  },
  msgTimeMine: {
    fontSize: 11,
    color: RavenLight.textSubtle,
    marginTop: 1,
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
  forwardedBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: RavenLight.textSubtle,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  forwardedBadgeMine: { color: 'rgba(255,255,255,0.7)' },
  replyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: RavenLight.accentSoft,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
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
    marginRight: 0,
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
    zIndex: 4,
  },
  inputShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
    backgroundColor: RavenLight.panel,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    paddingLeft: 12,
    paddingRight: 6,
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
    width: 36,
    height: 36,
    borderRadius: 8,
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
