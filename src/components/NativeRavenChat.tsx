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
  AppState,
  type AppStateStatus,
  Image,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import { pickChatDocuments, pickChatMediaFromLibrary } from '../utils/ravenChatAttachPickers';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useChatComposerInsets } from '../hooks/useChatComposerInsets';
import { useChatMessageJumpHighlight } from '../hooks/useChatMessageJumpHighlight';
import { ChatMessageJumpHighlightBar } from './ChatMessageJumpHighlightBar';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { useRavenUnread } from '../context/RavenUnreadContext';
import { buildRavenUrlWithWorkspace, getRavenWebUrl } from '../config/ravenChat';
import { RavenMessageAttachmentBody } from './RavenMessageAttachmentBody';
import { ChatImageGalleryModal } from './ChatImageGalleryModal';
import { RavenChannelPeerAvatar } from './RavenChannelPeerAvatar';
import { RavenInlineReplyQuote } from './RavenInlineReplyQuote';
import { RavenSharedInChatList } from './RavenSharedInChatList';
import { RavenMessageReactionsRow } from './RavenMessageReactionsRow';
import { RavenMessageActionSheet } from './RavenMessageActionSheet';
import { RavenForwardMessageModal } from './RavenForwardMessageModal';
import { RavenComposerEmojiSheet } from './RavenComposerEmojiSheet';
import { RavenChatAttachTrigger } from './RavenChatAttachTrigger';
import { useRavenMessageActions } from '../hooks/useRavenMessageActions';
import { useSqPaymentActionRegistry } from '../hooks/useSqPaymentActionRegistry';
import { ravenMessageIsForwarded } from '../utils/ravenMessageReactions';
import { ravenMessageHasVisualMedia, ravenSameMessageOwner } from '../utils/ravenAttachment';
import {
  formatChatDateSeparator,
  formatMessageBubbleTime,
  isDmChannel,
  initialsFromUserId,
  pastelAvatarBg,
  shouldShowChatDateSeparator,
  shouldShowChatMessageSenderHeader,
  shouldShowChatMessageTextBubble,
  isChatMessageGroupedWithNewer,
} from '../utils/ravenChatUi';
import { resolveRavenUserDisplayName } from '../utils/ravenSearchPreview';
import { ravenMessageShortPreview } from '../utils/ravenMessageShortPreview';
import { collectChatImageGalleryItems } from '../utils/ravenChatImageGallery';
import {
  listChannelsForWorkspace,
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
  ravenRowIsSupplierQuotationDocLink,
  ravenRowIsSalesOrderDocLink,
  ravenRowIsSalesInvoiceDocLink,
  ravenMessageOwnerMatchesSession,
} from '../services/ravenNativeApi';
import {
  getRavenWorkspaceChannelsSnapshot,
  setRavenChannelMessagesSnapshot,
  setRavenWorkspaceChannelsSnapshot,
} from '../utils/ravenMessagingLocalCache';
import {
  channelMessagesMemoryIsFresh,
  fetchChannelMessagesFirstPage,
  fetchChannelOlderMessagesPage,
  readChannelMessagesDiskPaint,
  readChannelMessagesMemoryPaint,
  refreshChannelMessagesAfterSend,
  saveChannelMessagesMemoryCache,
} from '../utils/ravenChannelMessagesLoad';
import {
  type RavenPendingAttachment,
} from '../utils/ravenMediaPick';
import { tryParseQuotationDraftFromMessage } from '../utils/chatQuotationDraftMessage';
import {
  acceptSupplierQuotationAsBuyer,
  rejectSupplierQuotationAsBuyer,
} from '../utils/supplierQuotationBuyerReviewActions';
import type { ErpDocChatContext } from '../utils/erpDocChatStatusReply';
import { RavenQuotationDraftCard } from './RavenQuotationDraftCard';
import { RavenLinkedSupplierQuotationMessage } from './RavenLinkedSupplierQuotationMessage';
import { RavenLinkedSalesOrderMessage } from './RavenLinkedSalesOrderMessage';
import { RavenLinkedSalesInvoiceMessage } from './RavenLinkedSalesInvoiceMessage';
import { RavenLinkedGenericDocMessage } from './RavenLinkedGenericDocMessage';
import { getERPNextClient } from '../services/erpnext';
import { userFacingError } from '../utils/userFacingError';
import { userFacingFrappeError } from '../utils/frappeHttpError';
import type { RootStackParamList } from '../types';
import type { NavigationProp } from '@react-navigation/native';

const POLL_MS = 3000;

/** Inverted messages list: show jump-to-latest when scrolled past this offset from newest. */
const NATIVE_RAVEN_MESSAGES_SCROLL_DOWN_SHOW_PX = 160;

const NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE = 36;
const NATIVE_RAVEN_CHAT_OLDER_PAGE_SIZE = 50;

type Props = {
  /** Optional Raven Workspace.name; otherwise env or API default. */
  workspaceId?: string;
};

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
  const { composerBottomPad, rootKeyboardPad } = useChatComposerInsets(true);
  const { flashMessageHighlight, isMessageHighlighted } = useChatMessageJumpHighlight();
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
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false);
  const [imageGalleryIndex, setImageGalleryIndex] = useState(0);
  const [sharedMenuTitle, setSharedMenuTitle] = useState('Files shared in this channel');
  const [error, setError] = useState<string | null>(null);
  const [quotationActionByName, setQuotationActionByName] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [quotationActionBusy, setQuotationActionBusy] = useState<string | null>(null);
  const viewerFrappeName = String(user?.user || user?.email || '').trim();
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
      flashMessageHighlight(item.name);
      openMessageActions(item, sq ? { sqName: sq } : undefined);
    },
    [flashMessageHighlight, openMessageActions]
  );

  const isSupplierPortalChat = user?.appMode === 'supplier' || !!user?.supplierId?.trim();
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
              NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE,
              memPaint.messages,
              { silent: true }
            );
            setMessages(result.messages);
            setHasMoreOlderMessages(result.hasMoreOlder);
            saveChannelMessagesMemoryCache(user?.email, cid, result.messages, result.hasMoreOlder);
            setError(null);
          } catch {
            /* keep cached thread */
          }
          setRefreshing(false);
          return;
        }
      } else {
        const diskPaint = await readChannelMessagesDiskPaint(user?.email, cid, NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE);
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
        NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE,
        silent ? messagesRef.current : prevForMerge,
        { silent }
      );
      setMessages(result.messages);
      setHasMoreOlderMessages(result.hasMoreOlder);
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
        NATIVE_RAVEN_CHAT_OLDER_PAGE_SIZE,
        messagesRef.current
      );
      if (!result) return;
      setMessages(result.messages);
      setHasMoreOlderMessages(result.hasMoreOlder);
      saveChannelMessagesMemoryCache(user?.email, ch, result.messages, result.hasMoreOlder);
    } catch {
      /* keep hasMore */
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMsgs(false);
    }
  }, [channel?.name, hasMoreOlderMessages, user?.email]);

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

  const scrollToMessageById = useCallback(
    (messageId: string) => {
      const id = String(messageId || '').trim();
      if (!id) return;
      const index = messages.findIndex((m) => (m.name || '').trim() === id);
      if (index < 0) return;
      flashMessageHighlight(id);
      requestAnimationFrame(() => {
        messagesListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.35,
        });
      });
    },
    [messages, flashMessageHighlight]
  );

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
    if (!channel?.name) {
      setMessages([]);
      setLoadingMsgs(false);
      setHasMoreOlderMessages(false);
      return;
    }
    const paint = readChannelMessagesMemoryPaint(user?.email, channel.name);
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
    try {
      const result = await pickChatMediaFromLibrary();
      if (!result.ok) {
        if (!result.canceled) Alert.alert('Media', result.message);
        return;
      }
      setPendingAttachments((prev) => [...prev, ...result.data]);
    } catch (e: unknown) {
      Alert.error('Media', userFacingError(e, 'Could not open photo library.'));
    }
  }, [channel?.name]);

  const handleAcceptQuotationDraft = useCallback(
    async (sqName: string, chat?: ErpDocChatContext) => {
      const n = sqName.trim();
      if (!n) return;
      setQuotationActionBusy(n);
      const billTo = (user?.user || user?.email || '').trim();
      const refreshChat = () => {
        const ch = channel?.name;
        if (ch) void loadMessages(ch, { silent: true });
      };
      await acceptSupplierQuotationAsBuyer(n, {
        billToFrappeUserId: billTo || null,
        chat: {
          ravenChannelId: chat?.ravenChannelId ?? channel?.name,
          linkMessageId: chat?.linkMessageId,
          sessionEmail: user?.email ?? null,
        },
        onOptimistic: () => setQuotationActionByName((prev) => ({ ...prev, [n]: 'accepted' })),
        onRollback: () =>
          setQuotationActionByName((prev) => {
            const next = { ...prev };
            delete next[n];
            return next;
          }),
        onSettled: () => {
          setQuotationActionBusy(null);
          refreshChat();
        },
      });
    },
    [channel?.name, loadMessages, user?.email, user?.user]
  );

  const handleRejectQuotationDraft = useCallback(
    async (sqName: string, chat?: ErpDocChatContext) => {
      const n = sqName.trim();
      if (!n) return;
      setQuotationActionBusy(n);
      await rejectSupplierQuotationAsBuyer(n, {
        chat: {
          ravenChannelId: chat?.ravenChannelId ?? channel?.name,
          linkMessageId: chat?.linkMessageId,
          sessionEmail: user?.email ?? null,
        },
        onOptimistic: () => setQuotationActionByName((prev) => ({ ...prev, [n]: 'rejected' })),
        onRollback: () =>
          setQuotationActionByName((prev) => {
            const next = { ...prev };
            delete next[n];
            return next;
          }),
        onSettled: () => {
          setQuotationActionBusy(null);
          const ch = channel?.name;
          if (ch) void loadMessages(ch, { silent: true });
        },
      });
    },
    [channel?.name, loadMessages, user?.email]
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
      const result = await pickChatDocuments();
      if (!result.ok) {
        if (!result.canceled) Alert.error('File', result.message);
        return;
      }
      setPendingAttachments((prev) => [...prev, ...result.data]);
    } catch (e: unknown) {
      Alert.error('File', userFacingError(e, 'Could not pick a file.'));
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
      const result = await refreshChannelMessagesAfterSend(
        user?.email,
        channel.name,
        NATIVE_RAVEN_CHAT_FIRST_PAGE_SIZE,
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
    } catch (e: any) {
      const msg = e?.message || 'Send failed';
      Alert.error('Message not sent', msg);
    } finally {
      setSending(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (channel?.name) void loadMessages(channel.name, { force: true });
    else setRefreshing(false);
  };

  const chatImageGalleryItems = useMemo(() => collectChatImageGalleryItems(messages), [messages]);

  const onOpenChatImagePreview = useCallback(
    (payload: { uri: string; title: string; messageId: string }) => {
      const msgId = payload.messageId.trim();
      const idx = msgId ? chatImageGalleryItems.findIndex((row) => row.id === msgId) : -1;
      setImageGalleryIndex(idx >= 0 ? idx : 0);
      setImageGalleryOpen(true);
    },
    [chatImageGalleryItems]
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: RavenMessageRow; index: number }) => {
      const mine = ravenMessageOwnerMatchesSession(item.owner, user);
      const isHighlighted = isMessageHighlighted(item.name);
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
      const tLine = formatMessageBubbleTime(item.creation || item.modified);
      const showDateSep = shouldShowChatDateSeparator(index, messages);
      const dateSepLabel = formatChatDateSeparator(item.creation || item.modified);
      const groupedWithNewer = isChatMessageGroupedWithNewer(index, messages, ravenSameMessageOwner);
      const rowGap = groupedWithNewer ? 2 : 10;
      const showSenderHeader = shouldShowChatMessageSenderHeader(index, messages, ravenSameMessageOwner);
      const showPlainTextBubble = shouldShowChatMessageTextBubble(
        item,
        hasAttach,
        !!(qDraft || sqLink || soLink || siLink || genericDocLink)
      );

      const quotationPayKey = sqLink ?? (qDraft?.name?.trim() || null);
      const openThisMessageActions = () => openMessageActionsForItem(item, quotationPayKey);

      /**
       * Frappe User for SI **customer** resolution (Raven User.custom_customer, portal, etc.).
       * Use signed-in user for **both** buyer chat and supplier approve-payment.
       */
      const customerPartyFrappeUserForSq = String(user?.user || user?.email || '').trim() || null;

      const linkedOrQuotationCard =
        sqLink != null ? (
          <RavenLinkedSupplierQuotationMessage
            sqName={sqLink}
            billToFrappeUserId={customerPartyFrappeUserForSq}
            ravenChannelId={channel?.name}
            linkMessageId={item.name}
            supplierSelfServeUx={supplierSqLinkSelfServeUx}
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
            registerSqPaymentAction={supplierSqLinkSelfServeUx ? registerSqPaymentAction : undefined}
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
          {ravenMessageIsForwarded(item) ? (
            <Text style={[styles.forwardedBadge, mine && styles.forwardedBadgeMine]}>Forwarded</Text>
          ) : null}
          {hasAttach ? (
            <RavenMessageAttachmentBody
              item={item}
              mine={mine}
              variant="wine"
              mediaGroupNeighbor={mediaGroupNeighbor}
              onReplyLongPress={openThisMessageActions}
              onOpenImagePreview={onOpenChatImagePreview}
            />
          ) : null}
          {linkedOrQuotationCard}
          {showPlainTextBubble ? (
            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.text}</Text>
          ) : !hasAttach && !qDraft && !sqLink && !genericDocLink ? (
            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}> </Text>
          ) : null}
          <RavenMessageReactionsRow
            messageReactions={item.message_reactions}
            currentUserId={viewerFrappeName}
            variant="wine"
            onToggleReaction={(emoji) => void toggleReaction(item, emoji)}
          />
          <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{tLine}</Text>
        </>
      );

      return (
        <View>
          {showDateSep && dateSepLabel ? (
            <View style={styles.chatDateSepRow}>
              <View style={styles.chatDateSepPill}>
                <Text style={styles.chatDateSepText}>{dateSepLabel}</Text>
              </View>
            </View>
          ) : null}
          <ChatMessageJumpHighlightBar active={isHighlighted} alignEnd={mine}>
            <Pressable
              style={[
                styles.bubbleWrap,
                mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs,
                { marginBottom: rowGap },
              ]}
              onLongPress={openThisMessageActions}
              delayLongPress={380}
            >
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {!mine && !!item.owner && showSenderHeader ? (
                  <Text style={styles.bubbleMeta}>{resolveRavenUserDisplayName(item.owner, ravenUserProfilesById)}</Text>
                ) : null}
                {inner}
              </View>
            </Pressable>
          </ChatMessageJumpHighlightBar>
        </View>
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
      isMessageHighlighted,
      ravenUserProfilesById,
      quotationActionByName,
      quotationActionBusy,
      handleAcceptQuotationDraft,
      handleRejectQuotationDraft,
      openMessageActionsForItem,
      toggleReaction,
      onOpenChatImagePreview,
      viewerFrappeName,
      registerSqPaymentAction,
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

  return (
    <View
      style={[
        styles.root,
        rootKeyboardPad > 0 ? { paddingBottom: rootKeyboardPad } : null,
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
            <View style={styles.replyStripAccent} />
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
            <RavenChatAttachTrigger
              disabled={!channel || sending}
              isSupplierPortalChat={isSupplierPortalChat}
              onPickEmoji={() => setComposerEmojiOpen(true)}
              onPickMedia={() => void pickMedia()}
              onPickDocument={() => void pickDocument()}
              onNewQuotation={openQuotationComposeFromChat}
              onSourcingRequest={() => {}}
            />
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
              <Ionicons
                name="send"
                size={20}
                color={
                  (!draft.trim() && pendingAttachments.length === 0) || !channel
                    ? Colors.TEXT_SECONDARY
                    : Colors.WHITE
                }
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerModalHead}>
              <Text style={styles.pickerModalTitle}>{sharedMenuTitle}</Text>
              <TouchableOpacity
                onPress={() => setPickerOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
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
                  showInlineTitle={false}
                  onSectionTitleChange={setSharedMenuTitle}
                />
              ) : (
                <Text style={[styles.channelRowMeta, { paddingHorizontal: Spacing.LG, paddingVertical: Spacing.MD }]}>
                  Select a channel to view files shared in this channel.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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
        variant="wine"
        onClose={() => setForwardMessage(null)}
      />
      <RavenComposerEmojiSheet
        visible={composerEmojiOpen}
        onClose={() => setComposerEmojiOpen(false)}
        onPick={insertComposerEmoji}
      />
      <ChatImageGalleryModal
        visible={imageGalleryOpen}
        items={chatImageGalleryItems}
        initialIndex={imageGalleryIndex}
        onClose={() => setImageGalleryOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.BRAND_SOFT },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.LG },
  hint: { marginTop: Spacing.SM, color: Colors.TEXT_SECONDARY, fontSize: 14 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM + 2,
    backgroundColor: Colors.WHITE,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(28, 32, 36, 0.08)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      default: {},
    }),
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
  messagesListShell: { flex: 1, position: 'relative', overflow: 'hidden' },
  messagesListFlex: { flex: 1 },
  scrollDownFab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
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
        shadowColor: 'rgba(28, 32, 36, 0.12)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  messagesOlderLoader: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingHorizontal: Spacing.MD, paddingVertical: 10, paddingBottom: 16 },
  bubbleWrap: { maxWidth: '88%' },
  bubbleWrapMine: { alignSelf: 'flex-end' },
  bubbleWrapTheirs: { alignSelf: 'flex-start' },
  bubble: { borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleMine: {
    backgroundColor: Colors.WINE,
    alignItems: 'stretch',
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: Colors.WHITE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E8E8',
    borderBottomLeftRadius: 4,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(28, 32, 36, 0.06)',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 1,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  bubbleMeta: { fontSize: 12, fontWeight: '700', color: Colors.TEXT_SECONDARY, marginBottom: 4 },
  bubbleText: { fontSize: 15, color: Colors.BLACK, lineHeight: 22 },
  bubbleTextMine: { color: Colors.WHITE, alignSelf: 'stretch', textAlign: 'right' },
  bubbleTime: { fontSize: 10, marginTop: 4, color: Colors.TEXT_SECONDARY, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.85)' },
  chatDateSepRow: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  chatDateSepPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.WHITE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E8E8',
  },
  chatDateSepLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E8E8E8',
  },
  chatDateSepText: { fontSize: 12, fontWeight: '600', color: Colors.TEXT_SECONDARY },
  replyBadge: { fontSize: 11, fontWeight: '700', color: Colors.WINE, marginBottom: 4 },
  replyBadgeMine: { color: 'rgba(255,255,255,0.9)' },
  forwardedBadge: { fontSize: 10, fontWeight: '700', color: Colors.TEXT_SECONDARY, marginBottom: 4, textTransform: 'uppercase' },
  forwardedBadgeMine: { color: 'rgba(255,255,255,0.75)' },
  replyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
  },
  replyStripAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: Colors.WINE,
    marginRight: 10,
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
  attachRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginRight: 2,
    flexShrink: 0,
    zIndex: 30,
    ...Platform.select({
      android: { elevation: 12 },
      default: {},
    }),
  },
  attachBtn: { paddingRight: 4, paddingVertical: 4, justifyContent: 'center' },
  attachBtnOff: { opacity: 0.35 },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E8E8',
    backgroundColor: Colors.WHITE,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.SM + 2,
    zIndex: 20,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(28, 32, 36, 0.08)',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 1,
        shadowRadius: 10,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    zIndex: 20,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    backgroundColor: Colors.BRAND_SOFT,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    color: Colors.BLACK,
    marginRight: Spacing.SM,
    zIndex: 1,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.WINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#E8E8E8' },
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
