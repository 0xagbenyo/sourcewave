import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { useOrders } from '../hooks/erpnext';
import { Order, OrderStatus } from '../types';
import { salesOrderSupplierUiLabel } from '../utils/erpSalesOrderSupplier';
import { isSupplierPortalUser } from '../utils/isSupplierPortalUser';

const PAGE_BG = '#ECEFF1';
const PANEL_BORDER = '#E0E4E8';
const ROW_SEP = '#ECEFF1';
const TEXT_MUTED = '#636366';
const hairline = StyleSheet.hairlineWidth;

type StatusFilterKey = 'all' | 'pending' | 'processing' | 'to_deliver' | 'completed' | 'cancelled';
type SortMode = 'recent' | 'number_az' | 'number_za';
type OrderKind = 'pending' | 'active' | 'done' | 'cancelled' | 'neutral';

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  to_deliver: 'To deliver',
  completed: 'Completed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Canceled',
  returned: 'Returned',
};

const FILTER_CHIPS: { key: StatusFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'to_deliver', label: 'To deliver' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Canceled' },
];

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'recent', label: 'Newest first' },
  { key: 'number_az', label: 'Order A–Z' },
  { key: 'number_za', label: 'Order Z–A' },
];

function toYmd(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function matchesStatusFilter(order: Order, f: StatusFilterKey): boolean {
  const s = (order.status || 'pending') as OrderStatus;
  if (f === 'all') return true;
  if (f === 'pending') return s === 'pending';
  if (f === 'processing') return s === 'processing' || s === 'confirmed';
  if (f === 'to_deliver') return s === 'to_deliver' || s === 'shipped';
  if (f === 'completed') return s === 'completed' || s === 'delivered';
  if (f === 'cancelled') return s === 'cancelled' || s === 'returned';
  return true;
}

function orderUiKind(status: string): OrderKind {
  const s = (status || 'pending') as OrderStatus;
  if (s === 'cancelled' || s === 'returned') return 'cancelled';
  if (s === 'completed' || s === 'delivered') return 'done';
  if (s === 'pending') return 'pending';
  if (s === 'processing' || s === 'confirmed' || s === 'to_deliver' || s === 'shipped') return 'active';
  return 'neutral';
}

function chipColors(kind: OrderKind): { bg: string; fg: string; bd: string } {
  switch (kind) {
    case 'cancelled':
      return { bg: '#FFEBEE', fg: '#B71C1C', bd: '#FFCDD2' };
    case 'done':
      return { bg: '#E8F5E9', fg: '#1B5E20', bd: '#A5D6A7' };
    case 'pending':
      return { bg: '#FFF3E0', fg: '#E65100', bd: '#FFE0B2' };
    case 'active':
      return { bg: 'rgba(0, 122, 255, 0.08)', fg: Colors.INFO, bd: 'rgba(0, 122, 255, 0.22)' };
    default:
      return { bg: '#ECEFF1', fg: '#455A64', bd: '#CFD8DC' };
  }
}

function accentForOrderKind(kind: OrderKind): string {
  switch (kind) {
    case 'cancelled':
      return '#C62828';
    case 'done':
      return '#2E7D32';
    case 'pending':
      return '#EF6C00';
    case 'active':
      return '#1976D2';
    default:
      return '#78909C';
  }
}

function formatMoney(amount: number): string {
  return `GH₵${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateString: string): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

function orderDateYmd(createdAt: string): string {
  if (!createdAt) return '';
  try {
    return new Date(createdAt).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export const OrderHistoryScreen: React.FC = () => {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [resolvedCustomerId, setResolvedCustomerId] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);
  const navigation = useNavigation();
  const { user } = useUserSession();
  const isSupplierPortal = isSupplierPortalUser(user);

  useEffect(() => {
    let isMounted = true;
    const resolveCustomer = async () => {
      const sessionCustomerId = user?.user || '';
      if (sessionCustomerId) {
        if (isMounted) setResolvedCustomerId(sessionCustomerId);
        return;
      }
      if (!user?.email) {
        if (isMounted) setResolvedCustomerId('');
        return;
      }
      try {
        const client = (await import('../services/erpnext')).getERPNextClient();
        const customer = await client.getCustomerByEmail(user.email);
        if (isMounted) setResolvedCustomerId(customer?.name || '');
      } catch {
        if (isMounted) setResolvedCustomerId('');
      }
    };
    void resolveCustomer();
    return () => {
      isMounted = false;
    };
  }, [user?.user, user?.email]);

  const { data: orders, loading, loadingMore, error, hasMore, loadMore, refresh } = useOrders(
    resolvedCustomerId,
    undefined,
    20
  );

  const displayOrders = useMemo(() => {
    const list = orders ?? [];
    let filtered = list.filter((o) => matchesStatusFilter(o, statusFilter));
    if (appliedFrom) {
      filtered = filtered.filter((o) => orderDateYmd(o.createdAt) >= appliedFrom);
    }
    if (appliedTo) {
      filtered = filtered.filter((o) => orderDateYmd(o.createdAt) <= appliedTo);
    }
    const out = [...filtered];
    if (sortMode === 'recent') {
      out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortMode === 'number_az') {
      out.sort((a, b) =>
        String(a.orderNumber || a.id).localeCompare(String(b.orderNumber || b.id), undefined, {
          sensitivity: 'base',
          numeric: true,
        })
      );
    } else {
      out.sort((a, b) =>
        String(b.orderNumber || b.id).localeCompare(String(a.orderNumber || a.id), undefined, {
          sensitivity: 'base',
          numeric: true,
        })
      );
    }
    return out;
  }, [orders, statusFilter, sortMode, appliedFrom, appliedTo]);

  const applyDateFilters = () => {
    setFromPickerOpen(false);
    setToPickerOpen(false);
    setAppliedFrom(toYmd(fromDate));
    setAppliedTo(toYmd(toDate));
  };

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    const statusLabel = FILTER_CHIPS.find((c) => c.key === statusFilter)?.label || 'All';
    parts.push(statusLabel);
    parts.push(SORT_OPTIONS.find((s) => s.key === sortMode)?.label || 'Newest first');
    if (appliedFrom || appliedTo) {
      parts.push(`${appliedFrom || '—'} to ${appliedTo || '—'}`);
    }
    return parts.join(' · ');
  }, [statusFilter, sortMode, appliedFrom, appliedTo]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      loadMore();
    }
  }, [hasMore, loadingMore, loading, loadMore]);

  const nav = navigation as { navigate: (name: string, params?: object) => void; goBack: () => void };

  const orderCount = orders?.length ?? 0;
  const initialLoading = loading && orderCount === 0 && !loadingMore;

  const renderOrderRow = ({ item }: { item: Order }) => {
    if (!item?.id) return null;
    const statusLabel = statusLabels[item.status] || statusLabels.pending;
    const kind = orderUiKind(item.status);
    const chip = chipColors(kind);
    const accent = accentForOrderKind(kind);
    const itemCount = item.items?.length || 0;
    const supplierLabel = salesOrderSupplierUiLabel(item, t);
    const hasSupplier = !!String(item.supplierId || '').trim();

    return (
      <Pressable
        style={({ pressed }) => [styles.rowTouchable, pressed && styles.rowTouchablePressed]}
        onPress={() => nav.navigate('OrderDetails', { orderId: item.id })}
        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      >
        <View style={[styles.rowAccent, { backgroundColor: accent }]} />
        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <Text style={styles.rowDocName} numberOfLines={1}>
              {item.orderNumber || item.id}
            </Text>
            <Text style={styles.rowAmount}>{formatMoney(item.total)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <View style={[styles.statusPill, { backgroundColor: chip.bg, borderColor: chip.bd }]}>
              <Text style={[styles.statusPillText, { color: chip.fg }]} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
            <Text style={styles.rowDate}>{formatDate(item.createdAt)}</Text>
          </View>
          {!isSupplierPortal ? (
            <Text style={[styles.rowParty, !hasSupplier && styles.rowPartyEmpty]} numberOfLines={2}>
              {supplierLabel}
            </Text>
          ) : null}
          <Text style={styles.rowMeta} numberOfLines={1}>
            {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'View breakdown'}
          </Text>
        </View>
      </Pressable>
    );
  };

  const listEmpty = !loading ? (
    <View style={styles.emptyWrap}>
      {!user?.email ? (
        <>
          <Text style={styles.emptyTitle}>Sign in to see orders</Text>
          <Text style={styles.emptySub}>Order history is saved to your account.</Text>
        </>
      ) : !resolvedCustomerId ? (
        <>
          <Text style={styles.emptyTitle}>Account not linked</Text>
          <Text style={styles.emptySub}>We could not match your login to a customer record.</Text>
        </>
      ) : orderCount > 0 && displayOrders.length === 0 ? (
        <>
          <Text style={styles.emptyTitle}>No orders in this filter</Text>
          <Text style={styles.emptySub}>Try choosing “All” or another status.</Text>
        </>
      ) : (
        <>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySub}>When you shop, your orders will appear here.</Text>
        </>
      )}
    </View>
  ) : null;

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.WINE} />
      </View>
    );
  };

  const filtersBlock = (
    <>
      <View style={styles.filterSurface}>
        <TouchableOpacity
          style={styles.filterHead}
          onPress={() => setFiltersOpen((o) => !o)}
          activeOpacity={0.75}
        >
          <Text style={styles.filterHeadTitle}>Status, sort & date range</Text>
          <Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={20} color={TEXT_MUTED} />
        </TouchableOpacity>
        {!filtersOpen ? <Text style={styles.filterSummary}>{activeFilterSummary}</Text> : null}

        {filtersOpen ? (
          <View style={styles.filterBody}>
            <Text style={styles.filterFieldLabel}>Status</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
            >
              {FILTER_CHIPS.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterChip, statusFilter === key && styles.filterChipOn]}
                  onPress={() => setStatusFilter(key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterChipText, statusFilter === key && styles.filterChipTextOn]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.filterFieldLabel, { marginTop: 16 }]}>Sort</Text>
            {SORT_OPTIONS.map(({ key, label }) => {
              const on = sortMode === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.sortRow, on && styles.sortRowOn]}
                  onPress={() => setSortMode(key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.sortRowText, on && styles.sortRowTextOn]}>{label}</Text>
                  {on ? <Ionicons name="checkmark" size={18} color={Colors.WINE} /> : null}
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.filterFieldLabel, { marginTop: 16 }]}>Order date</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <TouchableOpacity style={styles.dateField} onPress={() => setFromPickerOpen(true)} activeOpacity={0.7}>
                  <Text style={styles.dateFieldCap}>From</Text>
                  <Text style={styles.dateFieldVal}>{fromDate ? toYmd(fromDate) : 'Any'}</Text>
                </TouchableOpacity>
                {fromPickerOpen ? (
                  <DateTimePicker
                    value={fromDate || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, d) => {
                      if (Platform.OS === 'android') {
                        setFromPickerOpen(false);
                        if (event.type === 'dismissed') return;
                      }
                      if (d) setFromDate(d);
                    }}
                  />
                ) : null}
                {Platform.OS === 'ios' && fromPickerOpen ? (
                  <TouchableOpacity style={styles.iosDone} onPress={() => setFromPickerOpen(false)}>
                    <Text style={styles.iosDoneTxt}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={[styles.dateCol, { marginLeft: 12 }]}>
                <TouchableOpacity style={styles.dateField} onPress={() => setToPickerOpen(true)} activeOpacity={0.7}>
                  <Text style={styles.dateFieldCap}>To</Text>
                  <Text style={styles.dateFieldVal}>{toDate ? toYmd(toDate) : 'Any'}</Text>
                </TouchableOpacity>
                {toPickerOpen ? (
                  <DateTimePicker
                    value={toDate || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, d) => {
                      if (Platform.OS === 'android') {
                        setToPickerOpen(false);
                        if (event.type === 'dismissed') return;
                      }
                      if (d) setToDate(d);
                    }}
                  />
                ) : null}
                {Platform.OS === 'ios' && toPickerOpen ? (
                  <TouchableOpacity style={styles.iosDone} onPress={() => setToPickerOpen(false)}>
                    <Text style={styles.iosDoneTxt}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <TouchableOpacity style={styles.applyBtn} onPress={applyDateFilters} activeOpacity={0.85}>
              <Text style={styles.applyBtnTxt}>Apply dates</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={styles.inlineErr}>
          <Text style={styles.inlineErrTxt}>{error.message}</Text>
        </View>
      ) : null}
    </>
  );

  const topChrome = (
    <View style={styles.headerBlock}>
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={16} style={styles.backBtn} activeOpacity={0.65}>
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <View style={styles.navTitleBlock}>
          <Text style={styles.screenTitle}>My orders</Text>
          <Text style={styles.screenSubtitle}>
            {orderCount > 0
              ? `${orderCount} order${orderCount !== 1 ? 's' : ''}${
                  statusFilter !== 'all' || sortMode !== 'recent' || appliedFrom || appliedTo
                    ? ` · ${displayOrders.length} shown`
                    : ''
                }`
              : 'Your sourcing requests and purchases'}
          </Text>
        </View>
      </View>

      {filtersBlock}
    </View>
  );

  const toolbarMeta =
    displayOrders.length === 0
      ? 'No orders'
      : `${displayOrders.length} order${displayOrders.length !== 1 ? 's' : ''}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.rootColumn}>
        {topChrome}

        <View style={styles.listBody}>
          <View style={styles.registerPanel}>
            <View style={styles.registerToolbar}>
              <Text style={styles.toolbarMeta} numberOfLines={1}>
                {toolbarMeta}
              </Text>
            </View>

            {initialLoading ? (
              <View style={styles.panelLoading}>
                <ActivityIndicator size="large" color="#78909C" />
                <Text style={styles.loadingCaption}>Loading your orders…</Text>
              </View>
            ) : (
              <FlatList
                data={displayOrders}
                renderItem={renderOrderRow}
                keyExtractor={(item) => item.id}
                style={styles.flat}
                scrollEnabled={displayOrders.length > 0}
                contentContainerStyle={displayOrders.length === 0 ? styles.emptyList : styles.listPad}
                ItemSeparatorComponent={() => <View style={styles.rowSep} />}
                ListEmptyComponent={listEmpty}
                ListFooterComponent={renderFooter}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.45}
                refreshControl={
                  <RefreshControl
                    refreshing={loading && !loadingMore}
                    onRefresh={refresh}
                    tintColor={Colors.WINE}
                    colors={[Colors.WINE]}
                  />
                }
                showsVerticalScrollIndicator={false}
                removeClippedSubviews
                initialNumToRender={10}
              />
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  rootColumn: { flex: 1 },
  headerBlock: {
    paddingHorizontal: Spacing.MD,
    paddingTop: 6,
    paddingBottom: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  backBtn: {
    marginRight: 4,
    marginTop: 2,
    paddingVertical: 4,
    paddingRight: 8,
  },
  navTitleBlock: { flex: 1, minWidth: 0 },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#78909C',
    lineHeight: 18,
  },
  filterSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    marginBottom: 8,
    overflow: 'hidden',
  },
  filterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  filterHeadTitle: { fontSize: 14, fontWeight: '700', color: '#263238' },
  filterSummary: {
    fontSize: 12,
    color: '#78909C',
    paddingHorizontal: 12,
    paddingBottom: 10,
    lineHeight: 17,
    fontWeight: '500',
  },
  filterBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: hairline,
    borderTopColor: ROW_SEP,
  },
  filterFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#78909C',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipScroll: {
    paddingVertical: 2,
    alignItems: 'center',
    flexGrow: 1,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: PAGE_BG,
    marginRight: 8,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
  },
  filterChipOn: {
    backgroundColor: 'rgba(230, 0, 18, 0.07)',
    borderColor: Colors.WINE,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#455A64',
  },
  filterChipTextOn: {
    color: Colors.WINE,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: PAGE_BG,
    marginBottom: 6,
  },
  sortRowOn: {
    backgroundColor: 'rgba(230, 0, 18, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(230, 0, 18, 0.2)',
  },
  sortRowText: { fontSize: 14, fontWeight: '600', color: '#263238' },
  sortRowTextOn: { color: Colors.WINE },
  dateRow: { flexDirection: 'row' },
  dateCol: { flex: 1 },
  dateField: {
    backgroundColor: PAGE_BG,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateFieldCap: { fontSize: 11, color: '#78909C', fontWeight: '600' },
  dateFieldVal: { fontSize: 15, fontWeight: '700', color: '#263238', marginTop: 2 },
  iosDone: { alignSelf: 'flex-end', marginTop: 4 },
  iosDoneTxt: { fontSize: 14, fontWeight: '700', color: Colors.WINE },
  applyBtn: {
    marginTop: 14,
    backgroundColor: '#3A3A3C',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  applyBtnTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  inlineErr: {
    marginTop: 6,
    padding: 10,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  inlineErrTxt: { color: '#B71C1C', fontSize: 13, lineHeight: 18 },
  listBody: { flex: 1, paddingHorizontal: Spacing.MD },
  registerPanel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    overflow: 'hidden',
    marginBottom: Spacing.SM,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  registerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: hairline,
    borderBottomColor: ROW_SEP,
  },
  toolbarMeta: { flex: 1, fontSize: 12, fontWeight: '600', color: '#78909C' },
  flat: { flex: 1 },
  listPad: { paddingBottom: 24 },
  emptyList: { flexGrow: 1, minHeight: 200 },
  rowSep: { height: hairline, backgroundColor: ROW_SEP, marginLeft: 15 },
  rowTouchable: { flexDirection: 'row', backgroundColor: '#FFFFFF' },
  rowTouchablePressed: { backgroundColor: '#FAFAFA' },
  rowAccent: { width: 3 },
  rowContent: { flex: 1, paddingVertical: 10, paddingRight: 12, paddingLeft: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
  rowDocName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#263238',
    fontVariant: ['tabular-nums'],
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#263238',
    fontVariant: ['tabular-nums'],
  },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  statusPill: {
    flexShrink: 1,
    maxWidth: '62%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  rowDate: { fontSize: 11, fontWeight: '600', color: '#90A4AE', fontVariant: ['tabular-nums'] },
  rowParty: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#374151' },
  rowPartyEmpty: { fontWeight: '500', color: '#90A4AE', fontStyle: 'italic' },
  rowMeta: { marginTop: 3, fontSize: 12, fontWeight: '500', color: '#78909C' },
  panelLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, minHeight: 200 },
  loadingCaption: { marginTop: 10, fontSize: 13, color: '#78909C', fontWeight: '600' },
  emptyWrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#546E7A' },
  emptySub: { marginTop: 6, textAlign: 'center', color: '#90A4AE', fontSize: 14, lineHeight: 20 },
  footerLoader: { paddingVertical: 20, alignItems: 'center' },
});
