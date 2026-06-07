import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Pressable,
  SectionList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';
import { useUserSession } from '../../context/UserContext';
import { getERPNextClient } from '../../services/erpnext';
import {
  getRavenChannelDisplayLabel,
  listRavenChannelsForSessionUser,
  ravenChannelLastActivitySortTimeMs,
  sendRavenChannelDocumentLinkMessage,
  type RavenChannelRow,
} from '../../services/ravenNativeApi';
import { setPendingRavenDocLinkMessageMerge } from '../../utils/ravenDocLinkMessageMergeBridge';
import type { RootStackParamList } from '../../types';
import { ErpAuthenticatedImage } from '../../components/ErpAuthenticatedImage';
import { useSupplierComposeLeave } from '../../context/SupplierComposeLeaveContext';

type R = RouteProp<RootStackParamList, 'SupplierQuotationCompose'>;

/** `image` is the Item master **image** attach field (not website image). */
type ItemSearchHit = { name: string; item_code: string; item_name: string; stock_uom?: string; image?: string };

type QuotationLine = {
  key: string;
  item_code: string;
  item_name: string;
  stock_uom?: string;
  /** Item `image` for UI only (not sent to ERPNext on save). */
  item_image?: string;
  qty: string;
  rate: string;
};

function newLine(): QuotationLine {
  return {
    key: `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    item_code: '',
    item_name: '',
    stock_uom: undefined,
    qty: '1',
    rate: '',
  };
}

function isDmChannel(c: RavenChannelRow): boolean {
  return !!c.is_direct_message || String(c.type || '').trim().toLowerCase() === 'direct';
}

function initialsFromDisplayLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase() || '?';
}

/** WhatsApp-style avatar: DM photo when available, else initials (or # if not a DM). */
function WaShareAvatar({
  channel,
  userEmail,
  size,
  selected,
}: {
  channel: RavenChannelRow;
  userEmail: string | null | undefined;
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
  const label = getRavenChannelDisplayLabel(channel, userEmail ?? null);
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

export const SupplierQuotationComposeScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<R>();
  const insets = useSafeAreaInsets();
  const composeLeave = useSupplierComposeLeave();
  const exitCompose = useCallback(() => {
    if (composeLeave) composeLeave();
    else navigation.goBack();
  }, [composeLeave, navigation]);
  const { user } = useUserSession();
  const paramChannelId = (route.params?.ravenChannelId || '').trim();
  const { supplierDocId, loading: supplierLinkLoading, error: supplierLinkError } = useSupplierDocumentId();

  /** After ERPNext create — user picks a DM and taps Send. */
  const [createdQuotation, setCreatedQuotation] = useState<{ name: string; cardTitle: string } | null>(null);
  const [channels, setChannels] = useState<RavenChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedShareChannelId, setSelectedShareChannelId] = useState<string>('');
  const [sharing, setSharing] = useState(false);
  const [shareContactQuery, setShareContactQuery] = useState('');

  const [referenceTitle, setReferenceTitle] = useState('');
  const [currency, setCurrency] = useState('GHS');
  const [lines, setLines] = useState<QuotationLine[]>(() => [newLine()]);
  const [saving, setSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLineKey, setPickerLineKey] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<ItemSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runItemSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const sup = String(supplierDocId || '').trim();
      if (!sup) {
        setSearchHits([]);
        return;
      }
      const rows = await getERPNextClient().searchItemsForQuotation({
        supplier: sup,
        q: q.trim(),
        limit: 30,
      });
      setSearchHits(rows);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load items.';
      setSearchHits([]);
      Alert.alert('Items', msg);
    } finally {
      setSearchLoading(false);
    }
  }, [supplierDocId]);

  useEffect(() => {
    if (!pickerOpen) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      void runItemSearch(searchQ);
    }, 280);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [pickerOpen, searchQ, runItemSearch]);

  const loadRavenChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const rows = await listRavenChannelsForSessionUser(user?.email ?? null);
      setChannels(rows);
    } catch {
      setChannels([]);
    } finally {
      setChannelsLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!createdQuotation) return;
    const pre = paramChannelId;
    setSelectedShareChannelId(pre ? pre : '');
    setShareContactQuery('');
    void loadRavenChannels();
  }, [createdQuotation?.name, paramChannelId, loadRavenChannels]);

  useEffect(() => {
    if (!createdQuotation || channelsLoading || channels.length === 0) return;
    const id = selectedShareChannelId.trim();
    if (!id) return;
    const row = channels.find((c) => c.name === id);
    if (row && !isDmChannel(row)) setSelectedShareChannelId('');
  }, [createdQuotation, channels, channelsLoading, selectedShareChannelId]);

  /** Direct messages only — no workspace / group channels in the share picker. */
  const shareSections = useMemo(() => {
    const dms = channels
      .filter(isDmChannel)
      .sort((a, b) => ravenChannelLastActivitySortTimeMs(b) - ravenChannelLastActivitySortTimeMs(a));
    const sections: { title: string; data: RavenChannelRow[] }[] = [];
    if (dms.length) sections.push({ title: 'People', data: dms });
    return sections;
  }, [channels]);

  const recentChats = useMemo(() => {
    return [...channels]
      .filter(isDmChannel)
      .sort((a, b) => ravenChannelLastActivitySortTimeMs(b) - ravenChannelLastActivitySortTimeMs(a))
      .slice(0, 14);
  }, [channels]);

  const recentChatsFiltered = useMemo(() => {
    const q = shareContactQuery.trim().toLowerCase();
    if (!q) return recentChats;
    return recentChats.filter((c) => {
      const label = getRavenChannelDisplayLabel(c, user?.email ?? null).toLowerCase();
      return (
        label.includes(q) ||
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.channel_name || '').toLowerCase().includes(q)
      );
    });
  }, [recentChats, shareContactQuery, user?.email]);

  const shareSectionsFiltered = useMemo(() => {
    const q = shareContactQuery.trim().toLowerCase();
    const match = (c: RavenChannelRow): boolean => {
      if (!q) return true;
      const label = getRavenChannelDisplayLabel(c, user?.email ?? null).toLowerCase();
      return (
        label.includes(q) ||
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.channel_name || '').toLowerCase().includes(q)
      );
    };
    return shareSections.map((s) => ({ ...s, data: s.data.filter(match) })).filter((s) => s.data.length > 0);
  }, [shareSections, shareContactQuery, user?.email]);

  const selectShareChannel = useCallback((channelId: string) => {
    const id = channelId.trim();
    if (!id) return;
    setSelectedShareChannelId((cur) => (cur === id ? '' : id));
  }, []);

  const openPickerForLine = (lineKey: string) => {
    setPickerLineKey(lineKey);
    setSearchQ('');
    setSearchHits([]);
    setPickerOpen(true);
    void runItemSearch('');
  };

  const applyItemToLine = (hit: ItemSearchHit) => {
    if (!pickerLineKey) return;
    setLines((prev) =>
      prev.map((ln) =>
        ln.key === pickerLineKey
          ? {
              ...ln,
              item_code: hit.item_code,
              item_name: hit.item_name,
              stock_uom: hit.stock_uom,
              item_image: hit.image,
            }
          : ln
      )
    );
    setPickerOpen(false);
    setPickerLineKey(null);
  };

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const updateLine = (key: string, patch: Partial<Pick<QuotationLine, 'qty' | 'rate'>>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const lineTotal = (ln: QuotationLine): number => {
    const q = parseFloat(String(ln.qty).replace(/,/g, ''));
    const r = parseFloat(String(ln.rate).replace(/,/g, ''));
    if (!Number.isFinite(q) || !Number.isFinite(r)) return 0;
    return q * r;
  };

  const grandPreview = useMemo(() => lines.reduce((s, ln) => s + lineTotal(ln), 0), [lines]);

  const onCreateQuotation = async () => {
    if (supplierLinkLoading) {
      Alert.alert('Supplier', 'Still resolving your Supplier link — try again in a moment.');
      return;
    }
    if (!supplierDocId) {
      Alert.alert(
        'Supplier',
        supplierLinkError ||
          'Your login is not linked to a Supplier in ERPNext. Add this user under Supplier → Portal Users (or link email on the Supplier).'
      );
      return;
    }

    const payloadLines: Array<{ item_code: string; qty: number; rate: number; uom?: string | null }> = [];
    for (const ln of lines) {
      const code = ln.item_code.trim();
      if (!code) continue;
      const qty = parseFloat(String(ln.qty).replace(/,/g, ''));
      const rate = parseFloat(String(ln.rate).replace(/,/g, ''));
      if (!Number.isFinite(qty) || qty <= 0) {
        Alert.alert('Quotation', `Enter a valid quantity for item ${code}.`);
        return;
      }
      if (!Number.isFinite(rate) || rate < 0) {
        Alert.alert('Quotation', `Enter a valid rate for item ${code}.`);
        return;
      }
      payloadLines.push({
        item_code: code,
        qty,
        rate,
        uom: ln.stock_uom?.trim() || null,
      });
    }

    if (payloadLines.length === 0) {
      Alert.alert('Quotation', 'Add at least one line and choose an item from the catalogue for each line.');
      return;
    }

    setSaving(true);
    try {
      const client = getERPNextClient();
      const created = await client.createSupplierQuotationFromChat({
        supplier: supplierDocId,
        currency: currency.trim() || 'GHS',
        referenceTitle: referenceTitle.trim() || undefined,
        lines: payloadLines,
      });

      const cardTitle =
        referenceTitle.trim() ||
        (lines.find((l) => l.item_name.trim())?.item_name ?? '').trim() ||
        `${payloadLines.length} item(s)`;

      setCreatedQuotation({ name: created.name, cardTitle });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save quotation.';
      Alert.alert('Quotation', msg);
    } finally {
      setSaving(false);
    }
  };

  const onShareToSelected = async () => {
    const chId = selectedShareChannelId.trim();
    if (!createdQuotation || !chId) {
      Alert.alert('Share', 'Select one person to send the link to.');
      return;
    }
    setSharing(true);
    try {
      let sentRaw = await sendRavenChannelDocumentLinkMessage(chId, {
        linkDoctype: 'Supplier Quotation',
        linkDocument: createdQuotation.name,
        caption: createdQuotation.cardTitle,
      });
      if (sentRaw != null && typeof sentRaw === 'object' && !Array.isArray(sentRaw)) {
        sentRaw = {
          ...(sentRaw as Record<string, unknown>),
          link_doctype: 'Supplier Quotation',
          link_document: createdQuotation.name,
        };
      }
      setPendingRavenDocLinkMessageMerge(chId, sentRaw);
      Alert.alert('Shared', 'Your quotation link was sent in that conversation.', [
        { text: 'OK', onPress: () => exitCompose() },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not send the message.';
      Alert.alert('Share', msg);
    } finally {
      setSharing(false);
    }
  };

  const onShareSkip = () => {
    if (!createdQuotation) {
      exitCompose();
      return;
    }
    Alert.alert(
      'Skip sharing?',
      `Quotation ${createdQuotation.name} is saved in ERPNext. You can share a link from Raven later.`,
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => exitCompose() },
      ]
    );
  };

  const onShareBack = () => {
    if (!createdQuotation) {
      exitCompose();
      return;
    }
    Alert.alert('Leave?', 'Your quotation is saved. You can share it later from Raven.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', onPress: () => exitCompose() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={composeLeave ? [] : ['top']}>
      {createdQuotation ? (
        <View style={styles.flex}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onShareBack} hitSlop={12} style={styles.backWrap}>
              <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
            </TouchableOpacity>
            <Text style={styles.topTitle} numberOfLines={1}>
              Send to…
            </Text>
            <View style={{ width: 32 }} />
          </View>

          {channelsLoading ? (
            <View style={styles.shareLoading}>
              <ActivityIndicator size="large" color={Colors.WINE} />
              <Text style={styles.shareLoadingText}>Loading your conversations…</Text>
            </View>
          ) : shareSections.length === 0 ? (
            <View style={styles.shareEmpty}>
              <Text style={styles.shareEmptyText}>
                No direct messages found. Start a one-to-one conversation in Messages, or sign in with email/password
                for Raven.
              </Text>
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
                    <Ionicons name="checkmark-circle" size={26} color="#2E7D32" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.shareHeroCompactTitle}>Quotation saved</Text>
                      <Text style={styles.shareHeroCompactName} numberOfLines={1}>
                        {createdQuotation.name}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.shareHeroHint}>
                    Pick one person. Tap the same row again to clear. Search filters the list below.
                  </Text>
                  <View style={styles.waSearchWrap}>
                    <Ionicons name="search" size={18} color="#8696A0" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.waSearchInput}
                      value={shareContactQuery}
                      onChangeText={setShareContactQuery}
                      placeholder="Search people"
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
                          const nm = getRavenChannelDisplayLabel(ch, user?.email ?? null);
                          const sel = selectedShareChannelId === ch.name;
                          return (
                            <TouchableOpacity
                              key={ch.name}
                              style={styles.waRecentItem}
                              onPress={() => selectShareChannel(ch.name)}
                              activeOpacity={0.75}
                            >
                              <WaShareAvatar channel={ch} userEmail={user?.email} size={56} selected={sel} />
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
              ListEmptyComponent={
                shareContactQuery.trim() ? (
                  <Text style={styles.shareFilterEmpty}>No people match your search.</Text>
                ) : null
              }
              renderSectionHeader={({ section: { title } }) => (
                <Text style={styles.shareSectionTitle}>{title}</Text>
              )}
              renderItem={({ item }) => {
                const label = getRavenChannelDisplayLabel(item, user?.email ?? null);
                const selected = selectedShareChannelId === item.name;
                return (
                  <TouchableOpacity
                    style={[styles.shareRow, selected && styles.shareRowSelected]}
                    onPress={() => selectShareChannel(item.name)}
                    activeOpacity={0.75}
                  >
                    <WaShareAvatar channel={item} userEmail={user?.email} size={48} selected={selected} />
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
            <TouchableOpacity style={styles.skipBtn} onPress={onShareSkip} disabled={sharing}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.shareBtn,
                styles.shareBtnWa,
                (sharing || !selectedShareChannelId.trim()) && styles.shareBtnOff,
              ]}
              onPress={() => void onShareToSelected()}
              disabled={sharing || !selectedShareChannelId.trim()}
            >
              {sharing ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Text style={styles.shareBtnText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {composeLeave && !createdQuotation ? null : (
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => exitCompose()} hitSlop={12} style={styles.backWrap}>
              <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
            </TouchableOpacity>
            <Text style={styles.topTitle} numberOfLines={1}>
              New quotation
            </Text>
            <View style={{ width: 32 }} />
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {supplierLinkLoading ? (
            <View style={styles.linkBanner}>
              <ActivityIndicator color="#636366" size="small" />
              <Text style={styles.linkBannerText}>Linking your account to a Supplier…</Text>
            </View>
          ) : supplierLinkError && !supplierDocId ? (
            <View style={[styles.linkBanner, styles.linkBannerErr]}>
              <Ionicons name="warning-outline" size={20} color={Colors.WINE} style={{ marginRight: 8 }} />
              <Text style={styles.linkBannerText}>{supplierLinkError}</Text>
            </View>
          ) : null}

          <View style={styles.composeSheet}>
            {supplierDocId ? (
              <View style={styles.supplierRow}>
                <Ionicons name="briefcase-outline" size={15} color="#8E8E93" style={{ marginRight: 8 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.supplierRowLabel}>Supplier</Text>
                  <Text style={styles.supplierRowId} numberOfLines={2}>
                    {supplierDocId}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.refCurrRow}>
              <View style={styles.refField}>
                <Text style={styles.fieldLabel}>Reference</Text>
                <TextInput
                  style={styles.inputBox}
                  value={referenceTitle}
                  onChangeText={setReferenceTitle}
                  placeholder="Optional"
                  placeholderTextColor="#AEAEB2"
                />
              </View>
              <View style={styles.currField}>
                <Text style={styles.fieldLabel}>Currency</Text>
                <TextInput
                  style={[styles.inputBox, styles.inputBoxCurr]}
                  value={currency}
                  onChangeText={setCurrency}
                  placeholder="GHS"
                  autoCapitalize="characters"
                  maxLength={6}
                  placeholderTextColor="#AEAEB2"
                />
              </View>
            </View>

            <View style={styles.sheetDivider} />

            <View style={styles.itemsHeader}>
              <Text style={styles.itemsTitle}>Line items</Text>
              <TouchableOpacity onPress={addLine} hitSlop={10} style={styles.addLineBtn} activeOpacity={0.6}>
                <Text style={styles.addLineBtnText}>+ Add line</Text>
              </TouchableOpacity>
            </View>

            {lines.map((ln, lineIdx) => (
              <View key={ln.key} style={styles.lineBlock}>
                <View style={styles.lineBlockTop}>
                  <Text style={styles.lineIndex}>Line {lineIdx + 1}</Text>
                  <TouchableOpacity
                    onPress={() => removeLine(ln.key)}
                    hitSlop={10}
                    disabled={lines.length <= 1}
                    accessibilityLabel="Remove line"
                  >
                    <Text style={[styles.lineRemoveText, lines.length <= 1 && styles.lineRemoveTextOff]}>Remove</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.itemRow}
                  onPress={() => openPickerForLine(ln.key)}
                  accessibilityLabel="Select item"
                  activeOpacity={0.65}
                >
                  <View style={styles.itemRowThumb}>
                    {ln.item_image ? (
                      <ErpAuthenticatedImage uri={ln.item_image} style={styles.itemRowThumbImg} resizeMode="cover" />
                    ) : (
                      <Ionicons name="cube-outline" size={20} color="#C7C7CC" />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemRowCode} numberOfLines={1}>
                      {ln.item_code || 'Select item'}
                    </Text>
                    {ln.item_name ? (
                      <Text style={styles.itemRowName} numberOfLines={2}>
                        {ln.item_name}
                      </Text>
                    ) : (
                      <Text style={styles.itemRowPlaceholder}>Search catalogue</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </TouchableOpacity>

                <View style={styles.qtyRateRow}>
                  <View style={styles.qtyRateCell}>
                    <Text style={styles.qtyRateLabel}>Quantity</Text>
                    <TextInput
                      style={styles.qtyRateInput}
                      value={ln.qty}
                      onChangeText={(t) => updateLine(ln.key, { qty: t })}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#AEAEB2"
                    />
                  </View>
                  <View style={styles.qtyRateGap} />
                  <View style={styles.qtyRateCell}>
                    <Text style={styles.qtyRateLabel}>Rate ({currency.trim() || '—'})</Text>
                    <TextInput
                      style={styles.qtyRateInput}
                      value={ln.rate}
                      onChangeText={(t) => updateLine(ln.key, { rate: t })}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#AEAEB2"
                    />
                  </View>
                </View>
                {ln.stock_uom ? <Text style={styles.uomText}>Unit of measure: {ln.stock_uom}</Text> : null}
                <View style={styles.lineSubtotal}>
                  <Text style={styles.lineSubtotalLabel}>Amount</Text>
                  <Text style={styles.lineSubtotalValue}>
                    {currency.trim() || '—'}{' '}
                    {lineTotal(ln).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
            ))}

            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand total</Text>
              <Text style={styles.grandTotalValue}>
                {currency.trim()}{' '}
                {grandPreview.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.SM) + Spacing.SM }]}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnOff]}
            onPress={() => void onCreateQuotation()}
            disabled={saving || supplierLinkLoading || !supplierDocId}
          >
            {saving ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <Text style={styles.saveText}>Save quotation</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      )}

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Select item</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color={Colors.BLACK} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Search by code or name…"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchLoading ? (
              <View style={styles.searchLoading}>
                <ActivityIndicator color="#636366" />
              </View>
            ) : (
              <FlatList
                data={searchHits}
                keyExtractor={(it) => `${it.name}::${it.item_code}`}
                keyboardShouldPersistTaps="handled"
                style={styles.hitList}
                ListEmptyComponent={
                  <Text style={styles.emptyHits}>
                    {!String(supplierDocId || '').trim()
                      ? 'Your account must be linked to a Supplier to browse items.'
                      : 'No items found for your supplier. Try another search.'}
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.hitRow} onPress={() => applyItemToLine(item)} activeOpacity={0.7}>
                    <View style={styles.hitThumb}>
                      {item.image ? (
                        <ErpAuthenticatedImage uri={item.image} style={styles.hitThumbImg} resizeMode="cover" />
                      ) : (
                        <Ionicons name="cube-outline" size={22} color={Colors.TEXT_SECONDARY} />
                      )}
                    </View>
                    <View style={styles.hitTextCol}>
                      <Text style={styles.hitCode} numberOfLines={1}>
                        {item.item_code}
                      </Text>
                      <Text style={styles.hitName} numberOfLines={2}>
                        {item.item_name}
                      </Text>
                      {item.stock_uom ? <Text style={styles.hitUom}>{item.stock_uom}</Text> : null}
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  scroll: { paddingHorizontal: Spacing.MD, paddingTop: 12, paddingBottom: 120 },
  linkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  linkBannerErr: { borderColor: '#C62828', backgroundColor: '#FEF2F2' },
  linkBannerText: { flex: 1, fontSize: 14, color: '#3A3A3C', lineHeight: 19 },
  composeSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    marginBottom: Spacing.MD,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  supplierRowLabel: { fontSize: 12, fontWeight: '500', color: '#636366', marginBottom: 4 },
  supplierRowId: { fontSize: 14, fontWeight: '500', color: '#1C1C1E', lineHeight: 20 },
  refCurrRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  refField: { flex: 1, marginRight: 12 },
  currField: { width: 88 },
  fieldLabel: { fontSize: 12, fontWeight: '500', color: '#636366', marginBottom: 6 },
  inputBox: {
    borderWidth: 1,
    borderColor: '#C6C6C8',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 15,
    fontWeight: '400',
    color: '#1C1C1E',
    backgroundColor: '#FFFFFF',
  },
  inputBoxCurr: { textAlign: 'center', fontWeight: '500' },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#C6C6C8',
    marginVertical: 16,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  itemsTitle: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  addLineBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  addLineBtnText: { fontSize: 14, fontWeight: '500', color: '#3A3A3C' },
  lineBlock: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  lineBlockTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  lineIndex: { fontSize: 12, fontWeight: '500', color: '#636366' },
  lineRemoveText: { fontSize: 14, fontWeight: '500', color: '#636366' },
  lineRemoveTextOff: { color: '#C7C7CC' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 10,
  },
  itemRowThumb: {
    width: 44,
    height: 44,
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D1D6',
  },
  itemRowThumbImg: { width: 44, height: 44 },
  itemRowCode: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  itemRowName: { fontSize: 14, fontWeight: '400', color: '#3A3A3C', marginTop: 3, lineHeight: 19 },
  itemRowPlaceholder: { fontSize: 14, color: '#8E8E93', marginTop: 3 },
  qtyRateRow: { flexDirection: 'row', alignItems: 'stretch' },
  qtyRateCell: { flex: 1 },
  qtyRateGap: { width: 12 },
  qtyRateLabel: { fontSize: 12, fontWeight: '500', color: '#636366', marginBottom: 6 },
  qtyRateInput: {
    borderWidth: 1,
    borderColor: '#C6C6C8',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 15,
    fontWeight: '400',
    color: '#1C1C1E',
    backgroundColor: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  uomText: { fontSize: 12, color: '#636366', marginTop: 8 },
  lineSubtotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  lineSubtotalLabel: { fontSize: 13, fontWeight: '500', color: '#636366' },
  lineSubtotalValue: { fontSize: 15, fontWeight: '600', color: '#1C1C1E', fontVariant: ['tabular-nums'] },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#C6C6C8',
  },
  grandTotalLabel: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  grandTotalValue: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', fontVariant: ['tabular-nums'] },
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
    flex: 2,
    backgroundColor: Colors.WINE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnWa: { backgroundColor: '#25D366' },
  shareBtnOff: { opacity: 0.55 },
  shareBtnText: { color: Colors.WHITE, fontSize: 16, fontWeight: '800' },
  footer: {
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
    backgroundColor: '#FFFFFF',
  },
  saveBtn: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnOff: { opacity: 0.6 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    maxHeight: '78%',
    paddingBottom: Spacing.LG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
    borderBottomWidth: 0,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  searchInput: {
    marginHorizontal: Spacing.MD,
    marginTop: Spacing.SM,
    borderWidth: 1,
    borderColor: '#C6C6C8',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 15,
    color: '#1C1C1E',
    backgroundColor: '#FFFFFF',
  },
  searchLoading: { paddingVertical: Spacing.XL, alignItems: 'center' },
  hitList: { paddingHorizontal: Spacing.MD, marginTop: Spacing.SM },
  emptyHits: { textAlign: 'center', color: Colors.TEXT_SECONDARY, paddingVertical: Spacing.XL, fontSize: 14 },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  hitThumb: {
    width: 48,
    height: 48,
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D1D6',
  },
  hitThumbImg: { width: 48, height: 48 },
  hitTextCol: { flex: 1, minWidth: 0 },
  hitCode: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  hitName: { fontSize: 14, color: '#636366', marginTop: 2, lineHeight: 19 },
  hitUom: { fontSize: 11, color: Colors.TEXT_SECONDARY, marginTop: 4 },
});
