import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useUserSession } from '../context/UserContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useSessionCustomerId } from '../hooks/useSessionCustomerId';
import { getERPNextClient } from '../services/erpnext';
import { appAlert as Alert } from '../services/appAlert';
import { shareDeliveryNoteToLogisticsPeer } from '../utils/shareDeliveryNoteInChat';
import { showDeliveryNoteShareSentAndOpenChat } from '../utils/openRavenChatAfterShare';
import { userFacingError } from '../utils/userFacingError';
import type { RootStackParamList } from '../types';
import {
  accentForDeliveryNoteKind,
  chipColorsForDeliveryNote,
  deliveryNoteStatusLabel,
  deliveryNoteUiKind,
  matchesDeliveryNoteStatusFilter,
  money,
  toYmd,
  type DeliveryNoteStatusFilter,
} from '../utils/customerErpDocumentListUi';

export const CustomerDeliveryNotesScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'CustomerDeliveryNotes'>>();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const pickForLogisticsShare = route.params?.pickForLogisticsShare;
  const [pickingShare, setPickingShare] = useState(false);
  const { customerId, loading: cidLoading } = useSessionCustomerId();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DeliveryNoteStatusFilter>('all');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterChips = useMemo(
    (): { key: DeliveryNoteStatusFilter; label: string }[] => [
      { key: 'all', label: t('deliveryNoteList.filterAll') },
      { key: 'draft', label: t('deliveryNoteList.filterDraft') },
      { key: 'submitted', label: t('deliveryNoteList.filterSubmitted') },
    ],
    [t]
  );

  const load = useCallback(async () => {
    const cid = customerId.trim();
    if (!cid) {
      setRows([]);
      setError(cidLoading ? null : t('deliveryNoteList.noCustomer'));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    try {
      const data = await getERPNextClient().listDeliveryNotesForCustomer(cid, {
        fromDate: appliedFrom.trim() || undefined,
        toDate: appliedTo.trim() || undefined,
        limit: 120,
      });
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('deliveryNoteList.loadFailed'));
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, cidLoading, appliedFrom, appliedTo, t]);

  useEffect(() => {
    if (cidLoading) {
      setLoading(true);
      return;
    }
    void load();
  }, [load, cidLoading]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesDeliveryNoteStatusFilter(row, statusFilter)),
    [rows, statusFilter]
  );

  const applyFilters = () => {
    setFromPickerOpen(false);
    setToPickerOpen(false);
    setAppliedFrom(toYmd(fromDate));
    setAppliedTo(toYmd(toDate));
    setLoading(true);
  };

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const openRow = (item: any) => {
    const name = String(item?.name || '').trim();
    if (!name) return;
    const pick = pickForLogisticsShare;
    if (pick?.peerUserId?.trim() && pick?.ravenWorkspaceId?.trim()) {
      if (pickingShare) return;
      setPickingShare(true);
      void (async () => {
        try {
          const { channelId, peerUserId, workspaceId } = await shareDeliveryNoteToLogisticsPeer({
            deliveryNoteName: name,
            peerUserId: pick.peerUserId.trim(),
            workspaceId: pick.ravenWorkspaceId.trim(),
            sessionEmail: user?.email,
            logisticsSupplierDocName: String(pick.logisticsSupplierDocName || '').trim() || undefined,
          });
          await showDeliveryNoteShareSentAndOpenChat({
            t,
            navigation: navigation as { dispatch: (action: unknown) => void },
            sessionEmail: user?.email,
            channelId,
            peerUserId,
            workspaceId,
          });
        } catch (e: unknown) {
          Alert.error(
            t('deliveryNoteShare.title'),
            userFacingError(e, t('deliveryNoteShare.shareFailed'))
          );
        } finally {
          setPickingShare(false);
        }
      })();
      return;
    }
    (navigation as { navigate: (route: string, params: object) => void }).navigate('DeliveryNoteDetail', {
      deliveryNoteId: name,
    });
  };

  const renderItem = ({ item }: { item: any }) => {
    const kind = deliveryNoteUiKind(item);
    const chip = chipColorsForDeliveryNote(kind);
    const accent = accentForDeliveryNoteKind(kind);
    const statusLabel = deliveryNoteStatusLabel(item);
    const company = String(item?.company || '').trim();

    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => openRow(item)}
      >
        <View style={[styles.rowAccent, { backgroundColor: accent }]} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowAmount}>{money(item.currency, item.grand_total)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <View style={[styles.statusPill, { backgroundColor: chip.bg, borderColor: chip.bd }]}>
              <Text style={[styles.statusPillText, { color: chip.fg }]} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
            <Text style={styles.rowDate}>{item.posting_date || '—'}</Text>
          </View>
          {company ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {company}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
      </Pressable>
    );
  };

  const activeFilterLabel = filterChips.find((c) => c.key === statusFilter)?.label;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {pickForLogisticsShare ? t('supplierProfile.attachDeliveryNote') : t('deliveryNoteList.title')}
          </Text>
          <Text style={styles.subtitle}>
            {pickForLogisticsShare?.supplierLabel
              ? t('deliveryNoteShare.pickDeliveryNoteForLogistics', {
                  name: pickForLogisticsShare.supplierLabel,
                })
              : t('deliveryNoteList.subtitle')}
          </Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        {filterChips.map((chip) => {
          const on = statusFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setStatusFilter(chip.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.filterCard}>
        <TouchableOpacity style={styles.filterHead} onPress={() => setFiltersOpen((o) => !o)} activeOpacity={0.75}>
          <Text style={styles.filterHeadTitle}>{t('deliveryNoteList.dateRange')}</Text>
          <Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.TEXT_SECONDARY} />
        </TouchableOpacity>
        {!filtersOpen ? (
          <Text style={styles.filterSummary}>
            {appliedFrom || appliedTo
              ? `${appliedFrom || t('deliveryNoteList.anyDate')} → ${appliedTo || t('deliveryNoteList.anyDate')}`
              : t('deliveryNoteList.allDates')}
          </Text>
        ) : (
          <View style={styles.filterBody}>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateField} onPress={() => setFromPickerOpen(true)} activeOpacity={0.8}>
                <Text style={styles.dateCap}>{t('deliveryNoteList.from')}</Text>
                <Text style={styles.dateVal}>{fromDate ? toYmd(fromDate) : t('deliveryNoteList.anyDate')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateField} onPress={() => setToPickerOpen(true)} activeOpacity={0.8}>
                <Text style={styles.dateCap}>{t('deliveryNoteList.to')}</Text>
                <Text style={styles.dateVal}>{toDate ? toYmd(toDate) : t('deliveryNoteList.anyDate')}</Text>
              </TouchableOpacity>
            </View>
            {fromPickerOpen ? (
              <DateTimePicker
                value={fromDate || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => {
                  if (Platform.OS === 'android') setFromPickerOpen(false);
                  if (d) setFromDate(d);
                }}
              />
            ) : null}
            {toPickerOpen ? (
              <DateTimePicker
                value={toDate || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => {
                  if (Platform.OS === 'android') setToPickerOpen(false);
                  if (d) setToDate(d);
                }}
              />
            ) : null}
            {Platform.OS === 'ios' && (fromPickerOpen || toPickerOpen) ? (
              <TouchableOpacity
                style={styles.iosDone}
                onPress={() => {
                  setFromPickerOpen(false);
                  setToPickerOpen(false);
                }}
              >
                <Text style={styles.iosDoneText}>{t('deliveryNoteList.done')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} activeOpacity={0.85}>
              <Text style={styles.applyBtnText}>{t('deliveryNoteList.apply')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.meta}>
        {t('deliveryNoteList.count', { count: filteredRows.length })}
        {statusFilter !== 'all' && activeFilterLabel ? ` · ${activeFilterLabel}` : ''}
      </Text>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.WINE} />
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(it) => String(it.name)}
          renderItem={renderItem}
          contentContainerStyle={filteredRows.length === 0 ? styles.emptyList : styles.listPad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.WINE} />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="airplane-outline" size={40} color={Colors.TEXT_SECONDARY} />
                <Text style={styles.emptyTitle}>{t('deliveryNoteList.emptyTitle')}</Text>
                <Text style={styles.emptySub}>
                  {statusFilter !== 'all' ? t('deliveryNoteList.emptyFilter') : t('deliveryNoteList.emptySub')}
                </Text>
              </View>
            ) : null
          }
        />
      )}
      {pickingShare ? (
        <View style={styles.pickOverlay}>
          <ActivityIndicator size="large" color={Colors.WINE} />
          <Text style={styles.pickOverlayText}>{t('deliveryNoteShare.openingChat')}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.BACKGROUND },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.SM,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.BLACK },
  subtitle: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 2 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  chipOn: { backgroundColor: Colors.WINE, borderColor: Colors.WINE },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.TEXT_SECONDARY },
  chipTextOn: { color: Colors.WHITE },
  filterCard: {
    marginHorizontal: Spacing.MD,
    marginBottom: 8,
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    padding: 12,
  },
  filterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterHeadTitle: { fontSize: 14, fontWeight: '700', color: Colors.BLACK },
  filterSummary: { fontSize: 12, color: Colors.TEXT_SECONDARY, marginTop: 6 },
  filterBody: { marginTop: 12 },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.BACKGROUND,
  },
  dateCap: { fontSize: 11, fontWeight: '700', color: Colors.TEXT_SECONDARY },
  dateVal: { fontSize: 14, fontWeight: '600', color: Colors.BLACK, marginTop: 4 },
  iosDone: { alignSelf: 'flex-end', paddingVertical: 8 },
  iosDoneText: { color: Colors.WINE, fontWeight: '700' },
  applyBtn: {
    backgroundColor: Colors.WINE,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  applyBtnText: { color: Colors.WHITE, fontWeight: '800', fontSize: 14 },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    paddingHorizontal: Spacing.MD,
    marginBottom: 6,
  },
  errorBox: {
    marginHorizontal: Spacing.MD,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFEBEE',
  },
  errorText: { color: '#B71C1C', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listPad: { paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingBottom: 48 },
  emptyWrap: { alignItems: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.BLACK, marginTop: 8 },
  emptySub: { fontSize: 14, color: Colors.TEXT_SECONDARY, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.MD,
    marginBottom: 8,
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    overflow: 'hidden',
  },
  rowPressed: { opacity: 0.92 },
  rowAccent: { width: 4, alignSelf: 'stretch' },
  rowBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.BLACK },
  rowAmount: { fontSize: 14, fontWeight: '700', color: Colors.BLACK, fontVariant: ['tabular-nums'] },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: '62%',
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  rowDate: { fontSize: 12, color: Colors.TEXT_SECONDARY },
  rowMeta: { fontSize: 12, color: Colors.TEXT_SECONDARY, marginTop: 6 },
  pickOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(236, 239, 241, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pickOverlayText: { fontSize: 15, fontWeight: '600', color: Colors.BRAND_NAVY },
});
