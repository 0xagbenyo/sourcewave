import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SectionList,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';
import {
  fetchRavenUsersDirectory,
  getRavenChannelDisplayLabel,
  mergeRavenUserProfileMaps,
  ravenChannelLastActivitySortTimeMs,
  type RavenChannelRow,
  type RavenUserProfileMap,
} from '../services/ravenNativeApi';

function isDmChannel(c: RavenChannelRow): boolean {
  return !!c.is_direct_message || String(c.type || '').trim().toLowerCase() === 'direct';
}

function initialsFromDisplayLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase() || '?';
}

function WaShareAvatar({
  channel,
  userEmail,
  userProfiles,
  size,
  selected,
}: {
  channel: RavenChannelRow;
  userEmail: string | null | undefined;
  userProfiles?: RavenUserProfileMap;
  size: number;
  selected?: boolean;
}) {
  const dm = isDmChannel(channel);
  const img = channel.peer_user_image != null ? String(channel.peer_user_image).trim() : '';
  const r = size / 2;
  if (dm && img) {
    return (
      <View
        style={[
          styles.waAvatarRing,
          { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 },
          selected && styles.waAvatarRingSelected,
        ]}
      >
        <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', backgroundColor: '#e0e0e0' }}>
          <ErpAuthenticatedImage uri={img} style={{ width: size, height: size }} resizeMode="cover" />
        </View>
      </View>
    );
  }
  const label = getRavenChannelDisplayLabel(channel, userEmail ?? null, userProfiles);
  const initials = dm ? initialsFromDisplayLabel(label) : '#';
  const bg = dm ? '#6B7C85' : '#00A884';
  return (
    <View
      style={[
        styles.waAvatarRing,
        { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 },
        selected && styles.waAvatarRingSelected,
      ]}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * (dm ? 0.34 : 0.42) }}>{initials}</Text>
      </View>
    </View>
  );
}

export type RavenShareToContactPickerProps = {
  screenTitle?: string;
  heroTitle: string;
  heroName: string;
  heroHint?: string;
  heroIcon?: keyof typeof Ionicons.glyphMap;
  heroIconColor?: string;
  channels: RavenChannelRow[];
  channelsLoading: boolean;
  selectedChannelId: string;
  onSelectChannel: (channelId: string) => void;
  onBack: () => void;
  onSkip: () => void;
  onSend: () => void;
  sharing: boolean;
  userEmail?: string | null;
  /** Raven User directory — same map used for channel titles in chat. */
  userProfiles?: RavenUserProfileMap;
  skipLabel?: string;
  sendLabel?: string;
  emptyText?: string;
  loadingText?: string;
  searchPlaceholder?: string;
  filterEmptyText?: string;
  listFooter?: React.ReactNode;
  showSkip?: boolean;
};

export const RavenShareToContactPicker: React.FC<RavenShareToContactPickerProps> = ({
  screenTitle = 'Send to…',
  heroTitle,
  heroName,
  heroHint = 'Pick one person. Tap the same row again to clear. Search filters the list below.',
  heroIcon = 'checkmark-circle',
  heroIconColor = '#2E7D32',
  channels,
  channelsLoading,
  selectedChannelId,
  onSelectChannel,
  onBack,
  onSkip,
  onSend,
  sharing,
  userEmail,
  userProfiles: userProfilesProp,
  skipLabel = 'Skip',
  sendLabel = 'Send',
  emptyText = 'No direct messages found. Start a one-to-one conversation in Messages first.',
  loadingText = 'Loading your conversations…',
  searchPlaceholder = 'Search people',
  filterEmptyText = 'No people match your search.',
  listFooter,
  showSkip = true,
}) => {
  const [shareContactQuery, setShareContactQuery] = useState('');
  const [loadedProfiles, setLoadedProfiles] = useState<RavenUserProfileMap>({});

  useEffect(() => {
    if (!channels.length) return;
    let cancelled = false;
    void fetchRavenUsersDirectory().then((dir) => {
      if (!cancelled) setLoadedProfiles(dir);
    });
    return () => {
      cancelled = true;
    };
  }, [channels]);

  const userProfiles = useMemo(
    () => mergeRavenUserProfileMaps(loadedProfiles, userProfilesProp ?? {}),
    [loadedProfiles, userProfilesProp]
  );

  const shareSections = useMemo(() => {
    const dms = channels
      .filter(isDmChannel)
      .sort((a, b) => ravenChannelLastActivitySortTimeMs(b) - ravenChannelLastActivitySortTimeMs(a));
    const sections: { title: string; data: RavenChannelRow[] }[] = [];
    if (dms.length) sections.push({ title: 'People', data: dms });
    return sections;
  }, [channels]);

  const recentChats = useMemo(
    () =>
      [...channels]
        .filter(isDmChannel)
        .sort((a, b) => ravenChannelLastActivitySortTimeMs(b) - ravenChannelLastActivitySortTimeMs(a))
        .slice(0, 14),
    [channels]
  );

  const recentChatsFiltered = useMemo(() => {
    const q = shareContactQuery.trim().toLowerCase();
    if (!q) return recentChats;
    return recentChats.filter((c) => {
      const label = getRavenChannelDisplayLabel(c, userEmail ?? null, userProfiles).toLowerCase();
      return (
        label.includes(q) ||
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.channel_name || '').toLowerCase().includes(q)
      );
    });
  }, [recentChats, shareContactQuery, userEmail, userProfiles]);

  const shareSectionsFiltered = useMemo(() => {
    const q = shareContactQuery.trim().toLowerCase();
    const match = (c: RavenChannelRow): boolean => {
      if (!q) return true;
      const label = getRavenChannelDisplayLabel(c, userEmail ?? null, userProfiles).toLowerCase();
      return (
        label.includes(q) ||
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.channel_name || '').toLowerCase().includes(q)
      );
    };
    return shareSections.map((s) => ({ ...s, data: s.data.filter(match) })).filter((s) => s.data.length > 0);
  }, [shareSections, shareContactQuery, userEmail, userProfiles]);

  const toggleChannel = useCallback(
    (channelId: string) => {
      const id = channelId.trim();
      if (!id) return;
      onSelectChannel(selectedChannelId === id ? '' : id);
    },
    [onSelectChannel, selectedChannelId]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.flex}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backWrap}>
            <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>
            {screenTitle}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        {channelsLoading ? (
          <View style={styles.shareLoading}>
            <ActivityIndicator size="large" color={Colors.WINE} />
            <Text style={styles.shareLoadingText}>{loadingText}</Text>
          </View>
        ) : shareSections.length === 0 ? (
          <View style={styles.shareEmpty}>
            <Text style={styles.shareEmptyText}>{emptyText}</Text>
          </View>
        ) : (
          <SectionList
            sections={shareSectionsFiltered}
            keyExtractor={(item) => item.name}
            style={styles.shareList}
            contentContainerStyle={styles.shareListContent}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View>
                <View style={styles.shareHeroCompact}>
                  <Ionicons name={heroIcon} size={26} color={heroIconColor} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.shareHeroCompactTitle}>{heroTitle}</Text>
                    <Text style={styles.shareHeroCompactName} numberOfLines={1}>
                      {heroName}
                    </Text>
                  </View>
                </View>
                <Text style={styles.shareHeroHint}>{heroHint}</Text>
                <View style={styles.waSearchWrap}>
                  <Ionicons name="search" size={18} color="#8696A0" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.waSearchInput}
                    value={shareContactQuery}
                    onChangeText={setShareContactQuery}
                    placeholder={searchPlaceholder}
                    placeholderTextColor="#8696A0"
                    autoCorrect={false}
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                  />
                </View>
                {recentChatsFiltered.length > 0 ? (
                  <View style={styles.waRecentBlock}>
                    <Text style={styles.waRecentLabel}>Recent</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.waRecentRow}
                      keyboardShouldPersistTaps="handled"
                    >
                      {recentChatsFiltered.map((ch) => {
                        const nm = getRavenChannelDisplayLabel(ch, userEmail ?? null, userProfiles);
                        const sel = selectedChannelId === ch.name;
                        return (
                          <TouchableOpacity
                            key={ch.name}
                            style={styles.waRecentItem}
                            onPress={() => toggleChannel(ch.name)}
                            activeOpacity={0.75}
                          >
                            <WaShareAvatar channel={ch} userEmail={userEmail} userProfiles={userProfiles} size={56} selected={sel} />
                            <Text style={styles.waRecentName} numberOfLines={2}>
                              {nm}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            }
            ListFooterComponent={listFooter ?? null}
            ListEmptyComponent={
              shareContactQuery.trim() ? (
                <Text style={styles.shareFilterEmpty}>{filterEmptyText}</Text>
              ) : null
            }
            renderSectionHeader={({ section: { title } }) => (
              <Text style={styles.shareSectionTitle}>{title}</Text>
            )}
            renderItem={({ item }) => {
              const label = getRavenChannelDisplayLabel(item, userEmail ?? null, userProfiles);
              const selected = selectedChannelId === item.name;
              return (
                <TouchableOpacity
                  style={[styles.shareRow, selected && styles.shareRowSelected]}
                  onPress={() => toggleChannel(item.name)}
                  activeOpacity={0.75}
                >
                  <WaShareAvatar channel={item} userEmail={userEmail} userProfiles={userProfiles} size={48} selected={selected} />
                  <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                    <Text style={styles.shareRowTitle} numberOfLines={2}>
                      {label}
                    </Text>
                  </View>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={selected ? '#25D366' : Colors.TEXT_SECONDARY}
                  />
                </TouchableOpacity>
              );
            }}
          />
        )}

        <View style={styles.shareFooter}>
          {showSkip ? (
            <TouchableOpacity style={styles.skipBtn} onPress={onSkip} disabled={sharing}>
              <Text style={styles.skipBtnText}>{skipLabel}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              styles.shareBtn,
              styles.shareBtnWa,
              showSkip ? styles.shareBtnWithSkip : styles.shareBtnFull,
              (sharing || !selectedChannelId.trim()) && styles.shareBtnOff,
            ]}
            onPress={onSend}
            disabled={sharing || !selectedChannelId.trim()}
          >
            {sharing ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <Text style={styles.shareBtnText}>{sendLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#E8E8ED' },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 10,
    paddingTop: 2,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  backWrap: { padding: 8 },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    letterSpacing: -0.2,
  },
  shareHeroCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.SM,
    paddingBottom: 4,
  },
  shareHeroCompactTitle: { fontSize: 12, fontWeight: '700', color: Colors.TEXT_SECONDARY },
  shareHeroCompactName: { fontSize: 15, fontWeight: '800', color: Colors.BLACK, marginTop: 2 },
  shareHeroHint: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 17,
    paddingHorizontal: Spacing.MD,
    marginBottom: Spacing.SM,
  },
  waSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    marginHorizontal: Spacing.MD,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginBottom: Spacing.SM,
  },
  waSearchInput: { flex: 1, fontSize: 16, color: Colors.BLACK, paddingVertical: Platform.OS === 'android' ? 8 : 0 },
  waRecentBlock: { marginBottom: Spacing.SM },
  waRecentLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginHorizontal: Spacing.MD,
  },
  waRecentRow: { paddingHorizontal: Spacing.MD, paddingBottom: 4, gap: 14 },
  waRecentItem: { width: 76, alignItems: 'center' },
  waRecentName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.BLACK,
    textAlign: 'center',
    width: '100%',
  },
  waAvatarRing: { alignItems: 'center', justifyContent: 'center' },
  waAvatarRingSelected: {
    borderWidth: 2,
    borderColor: '#25D366',
    borderRadius: 999,
    padding: 1,
  },
  shareFilterEmpty: {
    textAlign: 'center',
    color: Colors.TEXT_SECONDARY,
    paddingVertical: Spacing.LG,
    paddingHorizontal: Spacing.MD,
    fontSize: 14,
  },
  shareLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.LG },
  shareLoadingText: { marginTop: 10, color: Colors.TEXT_SECONDARY, fontSize: 14 },
  shareEmpty: { flex: 1, padding: Spacing.LG, justifyContent: 'center' },
  shareEmptyText: { textAlign: 'center', color: Colors.TEXT_SECONDARY, lineHeight: 20, fontSize: 14 },
  shareList: { flex: 1 },
  shareListContent: { paddingBottom: Spacing.MD },
  shareSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    marginTop: Spacing.SM,
    marginBottom: 6,
    marginHorizontal: Spacing.MD,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.MD,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  shareRowSelected: { backgroundColor: 'rgba(37, 211, 102, 0.08)' },
  shareRowTitle: { fontSize: 16, fontWeight: '700', color: Colors.BLACK },
  shareFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: Spacing.MD,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.WHITE,
  },
  skipBtnText: { fontSize: 16, fontWeight: '700', color: Colors.BLACK },
  shareBtn: {
    backgroundColor: Colors.WINE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnWithSkip: { flex: 2 },
  shareBtnFull: { flex: 1 },
  shareBtnWa: { backgroundColor: '#25D366' },
  shareBtnOff: { opacity: 0.55 },
  shareBtnText: { color: Colors.WHITE, fontSize: 16, fontWeight: '800' },
});
