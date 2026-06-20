import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RavenLight } from '../constants/ravenLightTheme';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import {
  fetchRavenChannelWorkspaceId,
  fetchRavenUserProfilesByIds,
  fetchRavenWorkspaces,
  getRavenSearchResults,
  type RavenSearchFilterType,
  type RavenSearchResultRow,
  type RavenWorkspaceRow,
} from '../services/ravenNativeApi';
import { formatMessageHeaderTime } from '../utils/ravenChatUi';
import { plainTextFromMaybeHtml } from '../utils/chatPlainText';
import { channelPrefix, replySnippet, resolveRavenUserDisplayName, type RavenUserDisplayProfiles } from '../utils/ravenSearchPreview';
import { setRavenLastChat } from '../utils/ravenLastChatStorage';

const RAVEN_SEARCH_TABS: { key: RavenSearchFilterType; label: string }[] = [
  { key: 'Message', label: 'Messages' },
  { key: 'Channel', label: 'Channels' },
  { key: 'File', label: 'Files' },
];

export type RavenGlobalSearchModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Raven Channel document `name` — passed as server `in_channel` to limit Message/File search to this thread. */
  inChannelId?: string | null;
  inChannelLabel?: string | null;
  /** After persisting last-chat; parent opens workspace/channel or navigates. */
  onChannelPicked: (workspaceId: string, channelId: string) => void;
  /** Modal title (e.g. "Search" in chat, "Team search" from main header). */
  title?: string;
  userDisplayProfiles?: RavenUserDisplayProfiles;
};

export const RavenGlobalSearchModal: React.FC<RavenGlobalSearchModalProps> = ({
  visible,
  onClose,
  inChannelId,
  inChannelLabel,
  onChannelPicked,
  title = 'Search',
  userDisplayProfiles,
}) => {
  const { user } = useUserSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTab, setSearchTab] = useState<RavenSearchFilterType>('Message');
  const [searchResults, setSearchResults] = useState<RavenSearchResultRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [workspaceRows, setWorkspaceRows] = useState<RavenWorkspaceRow[]>([]);
  const [localUserProfiles, setLocalUserProfiles] = useState<
    Record<string, { full_name?: string; user_image?: string | null }>
  >({});
  const searchReqGenRef = useRef(0);
  const searchInputRef = useRef<TextInput>(null);

  const searchTabsVisible = useMemo(() => {
    if (inChannelId?.trim()) {
      return RAVEN_SEARCH_TABS.filter((t) => t.key !== 'Channel');
    }
    return RAVEN_SEARCH_TABS;
  }, [inChannelId]);

  useEffect(() => {
    if (visible && inChannelId?.trim() && searchTab === 'Channel') {
      setSearchTab('Message');
    }
  }, [visible, inChannelId, searchTab]);

  const scopedToChannel = Boolean(inChannelId?.trim());

  useEffect(() => {
    if (!visible || scopedToChannel) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchRavenWorkspaces();
        if (!cancelled) setWorkspaceRows(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setWorkspaceRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, scopedToChannel]);

  useEffect(() => {
    const owners = new Set<string>();
    for (const row of searchResults) {
      const o = String(row.owner || '').trim();
      if (o) owners.add(o);
    }
    if (owners.size === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const profiles = await fetchRavenUserProfilesByIds([...owners]);
        if (cancelled) return;
        setLocalUserProfiles((prev) => {
          const next = { ...prev };
          for (const [id, p] of profiles) {
            const lo = id.toLowerCase();
            const prevP = next[id] ?? next[lo] ?? {};
            const fn =
              p.full_name != null && String(p.full_name).trim()
                ? String(p.full_name).trim()
                : prevP.full_name;
            const img =
              p.user_image != null && String(p.user_image).trim()
                ? String(p.user_image).trim()
                : prevP.user_image ?? null;
            const entry = { full_name: fn, user_image: img };
            next[id] = entry;
            if (lo !== id) next[lo] = entry;
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
  }, [searchResults]);

  const mergedUserProfiles = useMemo(
    () => ({ ...(userDisplayProfiles ?? {}), ...localUserProfiles }),
    [userDisplayProfiles, localUserProfiles]
  );

  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      setSearchTab('Message');
      searchReqGenRef.current += 1;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 320);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchReqGenRef.current += 1;
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    const requestId = ++searchReqGenRef.current;
    const inch = inChannelId != null ? String(inChannelId).trim() : '';
    const scopedChannelOpts =
      inch && (searchTab === 'Message' || searchTab === 'File') ? { in_channel: inch } : undefined;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await getRavenSearchResults(searchTab, q, scopedChannelOpts);
          if (requestId !== searchReqGenRef.current) return;
          setSearchResults(rows);
        } catch (e: unknown) {
          if (requestId !== searchReqGenRef.current) return;
          const msg =
            e instanceof Error
              ? e.message
              : typeof e === 'object' && e !== null && 'message' in e
                ? String((e as { message?: unknown }).message)
                : 'Search failed';
          setSearchError(msg);
          setSearchResults([]);
        } finally {
          if (requestId === searchReqGenRef.current) setSearchLoading(false);
        }
      })();
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [visible, searchQuery, searchTab, inChannelId]);

  const workspaceLabelForId = useCallback(
    (id: string) => {
      const tid = id.trim();
      if (!tid) return '';
      const row = workspaceRows.find((w) => String(w.name).toLowerCase() === tid.toLowerCase());
      const lab = (row?.workspace_name || row?.name || tid).trim();
      return lab || tid;
    },
    [workspaceRows]
  );

  const resolveAndPick = useCallback(
    async (workspaceId: string, channelId: string) => {
      const ws = workspaceId.trim();
      const ch = channelId.trim();
      if (!ws || !ch) return;
      void setRavenLastChat(user?.email, { workspace: ws, channelId: ch });
      onChannelPicked(ws, ch);
      onClose();
    },
    [user?.email, onClose, onChannelPicked]
  );

  const openSearchRowFromHit = useCallback(
    async (row: RavenSearchResultRow, tab: RavenSearchFilterType) => {
      if (tab === 'Channel') {
        const chId = String(row.name || '').trim();
        if (!chId) return;
        const ws = await fetchRavenChannelWorkspaceId(chId);
        if (!ws) {
          Alert.alert('Search', 'Could not resolve which supplier group this channel belongs to.');
          return;
        }
        await resolveAndPick(ws, chId);
        return;
      }
      const chId = String(row.channel_id || '').trim();
      let ws = String(row.workspace || '').trim();
      if (!chId) {
        Alert.alert('Search', 'This result has no channel.');
        return;
      }
      if (!ws) {
        const resolved = await fetchRavenChannelWorkspaceId(chId);
        ws = resolved || '';
      }
      if (!ws) {
        Alert.alert('Search', 'Could not resolve supplier group for this result.');
        return;
      }
      await resolveAndPick(ws, chId);
    },
    [resolveAndPick]
  );

  const renderSearchItem = useCallback(
    ({ item }: { item: RavenSearchResultRow }) => {
      const tab = searchTab;
      if (tab === 'Channel') {
        const title = String(item.channel_name || item.name || 'Channel').trim();
        const typ = String(item.type || '').trim();
        const arch = item.is_archived === 1 || item.is_archived === true;
        const prefix = channelPrefix(typ);
        return (
          <TouchableOpacity
            style={styles.searchRow}
            onPress={() => void openSearchRowFromHit(item, 'Channel')}
            activeOpacity={0.75}
          >
            <Ionicons name="chatbubbles-outline" size={22} color={RavenLight.accent} style={{ marginRight: 10 }} />
            <View style={styles.flex}>
              <Text style={styles.searchRowTitle} numberOfLines={2}>
                {prefix}
                {title}
              </Text>
              {typ ? <Text style={styles.searchRowMeta}>{typ}</Text> : null}
              {arch ? <Text style={styles.searchRowMeta}>Archived</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={RavenLight.textMuted} />
          </TouchableOpacity>
        );
      }
      const wsId = String(item.workspace || '').trim();
      const chId = String(item.channel_id || '').trim();
      const wsLab = wsId ? workspaceLabelForId(wsId) : '';
      if (tab === 'File') {
        const filePath = String(item.file || '').trim();
        const base = filePath.split('/').filter(Boolean).pop() || filePath || 'File';
        const mt = String(item.message_type || '').trim();
        return (
          <TouchableOpacity
            style={styles.searchRow}
            onPress={() => void openSearchRowFromHit(item, 'File')}
            activeOpacity={0.75}
          >
            <Ionicons name="document-attach-outline" size={22} color={RavenLight.accent} style={{ marginRight: 10 }} />
            <View style={styles.flex}>
              <Text style={styles.searchRowTitle} numberOfLines={1}>
                {base}
              </Text>
              <Text style={styles.searchRowMeta} numberOfLines={1}>
                {[mt, wsLab, chId ? `${chId.slice(0, 10)}…` : ''].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={RavenLight.textMuted} />
          </TouchableOpacity>
        );
      }
      const raw = (item.text ?? item.content) as string | undefined;
      const preview = replySnippet(plainTextFromMaybeHtml(raw));
      const owner = String(item.owner || '').trim();
      const time = formatMessageHeaderTime(String(item.creation || '')) || '';
      return (
        <TouchableOpacity
          style={styles.searchRow}
          onPress={() => void openSearchRowFromHit(item, 'Message')}
          activeOpacity={0.75}
        >
          <Ionicons name="chatbox-ellipses-outline" size={22} color={RavenLight.accent} style={{ marginRight: 10 }} />
          <View style={styles.flex}>
            <Text style={styles.searchRowTitle} numberOfLines={3}>
              {preview}
            </Text>
            <Text style={styles.searchRowMeta} numberOfLines={1}>
              {[owner ? resolveRavenUserDisplayName(owner, mergedUserProfiles) : '', time, wsLab].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={RavenLight.textMuted} />
        </TouchableOpacity>
      );
    },
    [searchTab, openSearchRowFromHit, workspaceLabelForId, mergedUserProfiles]
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <SafeAreaView style={styles.searchModalSafe} edges={['top', 'bottom']}>
        <View style={styles.searchModalTop}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.searchModalCancelWrap}>
            <Text style={styles.searchModalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.searchModalTitle}>{title}</Text>
          <View style={styles.searchModalTopSpacer} />
        </View>
        {inChannelId ? (
          <Text style={styles.searchScopedHint} numberOfLines={2}>
            Searching messages and files in {inChannelLabel?.trim() || 'this channel'} only.
          </Text>
        ) : null}
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder={inChannelId ? 'Search in this channel…' : 'Search messages, channels, files…'}
          placeholderTextColor={RavenLight.textSubtle}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <View style={styles.searchTabsRow}>
          {searchTabsVisible.map(({ key, label }) => {
            const on = searchTab === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.searchTabPill, on && styles.searchTabPillOn]}
                onPress={() => setSearchTab(key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.searchTabPillText, on && styles.searchTabPillTextOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {searchError ? <Text style={styles.searchErr}>{searchError}</Text> : null}
        {searchLoading ? <ActivityIndicator style={styles.searchSpinner} color={RavenLight.accent} /> : null}
        <FlatList
          style={styles.searchList}
          data={searchResults}
          keyExtractor={(item, index) => `${String(item.name ?? item.channel_name ?? 'row')}-${index}`}
          renderItem={renderSearchItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.searchListContent}
          ListEmptyComponent={
            searchQuery.trim().length < 2 ? (
              <Text style={styles.searchEmpty}>
                Type at least 2 characters. Results use the same Raven server search as the web app (up to 20
                matches).
              </Text>
            ) : !searchLoading && !searchError ? (
              <Text style={styles.searchEmpty}>No results</Text>
            ) : null
          }
        />
      </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchModalSafe: { flex: 1, backgroundColor: RavenLight.panel },
  searchModalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
  },
  searchModalCancelWrap: { minWidth: 56 },
  searchModalCancel: { fontSize: 17, color: RavenLight.accent, fontWeight: '600' },
  searchModalTitle: { fontSize: 17, fontWeight: '800', color: RavenLight.text },
  searchModalTopSpacer: { width: 56 },
  searchScopedHint: {
    fontSize: 13,
    color: RavenLight.textMuted,
    fontWeight: '600',
    paddingHorizontal: Spacing.MD,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchInput: {
    marginHorizontal: Spacing.MD,
    marginTop: 10,
    borderWidth: 1,
    borderColor: RavenLight.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: RavenLight.text,
    backgroundColor: RavenLight.canvas,
  },
  searchTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: Spacing.MD,
    marginTop: 12,
  },
  searchTabPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: RavenLight.border,
    backgroundColor: RavenLight.canvas,
  },
  searchTabPillOn: { borderColor: RavenLight.accent, backgroundColor: RavenLight.accentSoft },
  searchTabPillText: { fontSize: 13, fontWeight: '600', color: RavenLight.text },
  searchTabPillTextOn: { color: RavenLight.accent },
  searchErr: {
    marginHorizontal: Spacing.MD,
    marginTop: 10,
    fontSize: 13,
    color: RavenLight.danger,
  },
  searchSpinner: { marginTop: 16 },
  searchList: { flex: 1, marginTop: 8 },
  searchListContent: { paddingBottom: 24, flexGrow: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.MD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
  },
  searchRowTitle: { fontSize: 15, fontWeight: '600', color: RavenLight.text },
  searchRowMeta: { fontSize: 12, color: RavenLight.textMuted, marginTop: 4 },
  searchEmpty: {
    marginHorizontal: Spacing.MD,
    marginTop: 24,
    fontSize: 14,
    color: RavenLight.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
