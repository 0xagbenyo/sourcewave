import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SectionList,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { sharePickerFlatStyles as styles } from '../constants/sharePickerFlatUi';
import { RavenChannelPeerAvatar } from './RavenChannelPeerAvatar';
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
  const ringSize = size + 4;
  const ringStyle = {
    width: ringSize,
    height: ringSize,
    borderRadius: ringSize / 2,
  };

  return (
    <View style={[styles.avatarRing, ringStyle, selected && styles.avatarRingSelected]}>
      <RavenChannelPeerAvatar
        channel={channel}
        currentUserEmail={userEmail}
        size={size}
        variant="wine"
        userDisplayProfiles={userProfiles}
      />
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
  /** `embedded` fills the parent (no extra safe area) — use inside quotation hub after save. */
  layout?: 'screen' | 'embedded';
  /** `multiple` allows picking several DMs/channels (forward). Default `single` for share. */
  selectionMode?: 'single' | 'multiple';
  selectedChannelIds?: string[];
  onToggleChannelId?: (channelId: string) => void;
  /** Include group/private channels below People (forward). Share keeps DMs only. */
  includeGroupChannels?: boolean;
  /** Inside a React Native Modal — apply safe-area padding manually (SafeAreaView is unreliable there). */
  inModal?: boolean;
};

export const RavenShareToContactPicker: React.FC<RavenShareToContactPickerProps> = ({
  screenTitle = 'Send to…',
  heroTitle,
  heroName,
  heroHint = 'Pick one person. Tap the same row again to clear. Search filters the list below.',
  heroIcon = 'checkmark-circle',
  heroIconColor = Colors.WINE,
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
  layout = 'screen',
  selectionMode = 'single',
  selectedChannelIds = [],
  onToggleChannelId,
  includeGroupChannels = false,
  inModal = false,
}) => {
  const insets = useSafeAreaInsets();
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
    if (includeGroupChannels) {
      const groups = channels
        .filter((c) => !isDmChannel(c))
        .sort((a, b) =>
          getRavenChannelDisplayLabel(a, userEmail ?? null, userProfiles).localeCompare(
            getRavenChannelDisplayLabel(b, userEmail ?? null, userProfiles),
            undefined,
            { sensitivity: 'base' }
          )
        );
      if (groups.length) sections.push({ title: 'Channels', data: groups });
    }
    return sections;
  }, [channels, includeGroupChannels, userEmail, userProfiles]);

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

  const isChannelSelected = useCallback(
    (channelId: string) => {
      const id = channelId.trim();
      if (!id) return false;
      if (selectionMode === 'multiple') return selectedChannelIds.includes(id);
      return selectedChannelId === id;
    },
    [selectionMode, selectedChannelIds, selectedChannelId]
  );

  const hasSelection =
    selectionMode === 'multiple' ? selectedChannelIds.length > 0 : !!selectedChannelId.trim();

  const toggleChannel = useCallback(
    (channelId: string) => {
      const id = channelId.trim();
      if (!id) return;
      if (selectionMode === 'multiple') {
        onToggleChannelId?.(id);
        return;
      }
      onSelectChannel(selectedChannelId === id ? '' : id);
    },
    [onSelectChannel, onToggleChannelId, selectedChannelId, selectionMode]
  );

  const topBarStyle = inModal
    ? [styles.topBar, { paddingTop: Math.max(insets.top, 8) }]
    : styles.topBar;
  const footerStyle = inModal
    ? [styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]
    : styles.footer;

  const body = (
    <View style={styles.flex}>
      <View style={topBarStyle}>
        <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backWrap}>
          <Ionicons name="arrow-back" size={24} color={Colors.BRAND_NAVY} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {screenTitle}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {channelsLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.WINE} />
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
      ) : shareSections.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <SectionList
          sections={shareSectionsFiltered}
          keyExtractor={(item) => item.name}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <View style={styles.heroCard}>
                <View style={styles.heroRow}>
                  <View style={styles.heroIconWrap}>
                    <Ionicons name={heroIcon} size={22} color={heroIconColor} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.heroEyebrow}>{heroTitle}</Text>
                    <Text style={styles.heroTitle} numberOfLines={1}>
                      {heroName}
                    </Text>
                  </View>
                </View>
                {heroHint ? <Text style={styles.heroHint}>{heroHint}</Text> : null}
              </View>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={Colors.MEDIUM_GRAY} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  value={shareContactQuery}
                  onChangeText={setShareContactQuery}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={Colors.MEDIUM_GRAY}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />
              </View>
              {recentChatsFiltered.length > 0 ? (
                <View style={styles.recentBlock}>
                  <Text style={styles.recentLabel}>Recent</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recentRow}
                    keyboardShouldPersistTaps="handled"
                  >
                    {recentChatsFiltered.map((ch) => {
                      const nm = getRavenChannelDisplayLabel(ch, userEmail ?? null, userProfiles);
                      const sel = isChannelSelected(ch.name);
                      return (
                        <TouchableOpacity
                          key={ch.name}
                          style={styles.recentItem}
                          onPress={() => toggleChannel(ch.name)}
                          activeOpacity={0.75}
                        >
                          <View style={styles.recentAvatarSlot}>
                            <WaShareAvatar
                              channel={ch}
                              userEmail={userEmail}
                              userProfiles={userProfiles}
                              size={56}
                              selected={sel}
                            />
                          </View>
                          <Text style={styles.recentName} numberOfLines={2} ellipsizeMode="tail">
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
              <Text style={styles.filterEmpty}>{filterEmptyText}</Text>
            ) : null
          }
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionTitle}>{title}</Text>
          )}
          renderItem={({ item }) => {
            const label = getRavenChannelDisplayLabel(item, userEmail ?? null, userProfiles);
            const selected = isChannelSelected(item.name);
            return (
              <TouchableOpacity
                style={[styles.contactRow, selected && styles.contactRowSelected]}
                onPress={() => toggleChannel(item.name)}
                activeOpacity={0.75}
              >
                <View style={styles.contactAvatarSlot}>
                  <WaShareAvatar
                    channel={item}
                    userEmail={userEmail}
                    userProfiles={userProfiles}
                    size={48}
                    selected={selected}
                  />
                </View>
                <View style={styles.contactRowMain}>
                  <Text style={styles.contactRowLabel} numberOfLines={2} ellipsizeMode="tail">
                    {label}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selected ? Colors.WINE : Colors.MEDIUM_GRAY}
                />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <View style={footerStyle}>
        {showSkip ? (
          <TouchableOpacity style={styles.footerSecondaryBtn} onPress={onSkip} disabled={sharing}>
            <Text style={styles.footerSecondaryText}>{skipLabel}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[
            styles.footerPrimaryBtn,
            showSkip ? styles.footerPrimaryBtnWide : styles.footerPrimaryBtnFull,
            (sharing || !hasSelection) && styles.footerPrimaryBtnOff,
          ]}
          onPress={onSend}
          disabled={sharing || !hasSelection}
        >
          {sharing ? (
            <ActivityIndicator color={Colors.WHITE} />
          ) : (
            <Text style={styles.footerPrimaryText}>{sendLabel}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (layout === 'embedded' || inModal) {
    return <View style={styles.embeddedRoot}>{body}</View>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {body}
    </SafeAreaView>
  );
};

