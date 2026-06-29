import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RavenLight } from '../constants/ravenLightTheme';
import { Colors } from '../constants/colors';
import {
  forwardRavenMessage,
  getRavenChannelDisplayLabel,
  getRavenDmPeerUserId,
  listRavenChannelsForSessionUser,
  type RavenChannelRow,
  type RavenForwardReceiver,
  type RavenMessageRow,
} from '../services/ravenNativeApi';
import { appAlert as Alert } from '../services/appAlert';
import { userFacingError } from '../utils/userFacingError';

type ForwardTarget = {
  key: string;
  label: string;
  receiver: RavenForwardReceiver;
};

function isDmChannel(c: RavenChannelRow): boolean {
  return !!c.is_direct_message || String(c.type || '').trim().toLowerCase() === 'direct';
}

function buildForwardTargetsFromChannels(
  channelRows: RavenChannelRow[],
  currentUserEmail?: string | null,
  userProfiles?: Record<string, { full_name?: string; user_image?: string | null }>
): ForwardTarget[] {
  const list: ForwardTarget[] = [];
  const seen = new Set<string>();

  for (const ch of channelRows) {
    if (!ch?.name) continue;
    if (isDmChannel(ch)) {
      const peer = getRavenDmPeerUserId(ch, currentUserEmail);
      if (!peer) continue;
      const key = `user:${peer.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        key,
        label: getRavenChannelDisplayLabel(ch, currentUserEmail, userProfiles),
        receiver: { name: peer, type: 'User' },
      });
    } else {
      const key = `ch:${ch.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const chType = String(ch.type || 'Private').trim() || 'Private';
      list.push({
        key,
        label: getRavenChannelDisplayLabel(ch, currentUserEmail, userProfiles),
        receiver: { name: ch.name, type: chType },
      });
    }
  }

  list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return list;
}

type Props = {
  visible: boolean;
  message: RavenMessageRow | null;
  /** Only channels / DMs the signed-in user already has (same pool as share). */
  channels: RavenChannelRow[];
  currentUserEmail?: string | null;
  userProfiles?: Record<string, { full_name?: string; user_image?: string | null }>;
  variant?: 'wine' | 'raven';
  onClose: () => void;
};

export const RavenForwardMessageModal: React.FC<Props> = ({
  visible,
  message,
  channels,
  currentUserEmail,
  userProfiles,
  variant = 'raven',
  onClose,
}) => {
  const accent = variant === 'wine' ? Colors.WINE : RavenLight.accent;
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, ForwardTarget>>({});
  const [sessionChannels, setSessionChannels] = useState<RavenChannelRow[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  const channelPool = sessionChannels.length > 0 ? sessionChannels : channels;

  const targets = useMemo(
    () => buildForwardTargetsFromChannels(channelPool, currentUserEmail, userProfiles),
    [channelPool, currentUserEmail, userProfiles]
  );

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setSelected({});
      setSessionChannels([]);
      setLoadingChannels(false);
      return;
    }
    let cancelled = false;
    setLoadingChannels(true);
    void (async () => {
      try {
        const rows = await listRavenChannelsForSessionUser(currentUserEmail ?? null);
        if (!cancelled) setSessionChannels(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setSessionChannels(channels);
      } finally {
        if (!cancelled) setLoadingChannels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, currentUserEmail, channels]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((t) => t.label.toLowerCase().includes(q) || t.receiver.name.toLowerCase().includes(q));
  }, [targets, search]);

  const toggle = useCallback((t: ForwardTarget) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[t.key]) delete next[t.key];
      else next[t.key] = t;
      return next;
    });
  }, []);

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const onSend = async () => {
    if (!message || selectedList.length === 0) return;
    setSending(true);
    try {
      await forwardRavenMessage(
        selectedList.map((t) => t.receiver),
        message
      );
      Alert.success('Forwarded', 'Message sent.');
      onClose();
    } catch (e) {
      Alert.error('Forward', userFacingError(e, 'Could not forward this message.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible && !!message} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={[styles.headerAction, { color: accent }]}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Forward message</Text>
          <Pressable onPress={() => void onSend()} disabled={sending || selectedList.length === 0} hitSlop={12}>
            <Text
              style={[
                styles.headerAction,
                styles.headerSend,
                { color: accent },
                (sending || selectedList.length === 0) && styles.headerSendOff,
              ]}
            >
              {sending ? '…' : 'Send'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>Choose from your existing chats and channels.</Text>

        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search chats"
          placeholderTextColor={RavenLight.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {selectedList.length > 0 ? (
          <Text style={styles.selectedHint}>{selectedList.length} selected</Text>
        ) : null}

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isOn = !!selected[item.key];
            return (
              <Pressable
                onPress={() => toggle(item)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed, isOn && styles.rowOn]}
              >
                <Ionicons
                  name={item.receiver.type === 'User' ? 'chatbubble-ellipses-outline' : 'people-outline'}
                  size={22}
                  color={isOn ? accent : RavenLight.textMuted}
                />
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                <Ionicons
                  name={isOn ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={isOn ? accent : RavenLight.textSubtle}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            loadingChannels ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={accent} />
                <Text style={styles.empty}>Loading your chats…</Text>
              </View>
            ) : (
              <Text style={styles.empty}>No chats available to forward to.</Text>
            )
          }
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECECEC',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: RavenLight.text },
  headerAction: { fontSize: 16, fontWeight: '600' },
  headerSend: { fontWeight: '800' },
  headerSendOff: { opacity: 0.35 },
  hint: {
    fontSize: 13,
    color: RavenLight.textMuted,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  search: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4E4E7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: RavenLight.text,
  },
  selectedHint: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: RavenLight.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  rowPressed: { opacity: 0.85 },
  rowOn: { backgroundColor: '#F8FAFF' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: RavenLight.text },
  empty: { textAlign: 'center', color: RavenLight.textMuted, padding: 24 },
  loadingWrap: { alignItems: 'center', padding: 24, gap: 12 },
});
