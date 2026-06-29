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
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useSessionCustomerId } from '../hooks/useSessionCustomerId';
import { getERPNextClient } from '../services/erpnext';
import {
  accentForPayKind,
  chipColors,
  matchesInvoiceStatusFilter,
  money,
  salesInvoicePayKind,
  salesInvoiceStatusLabel,
  toYmd,
  type InvoiceStatusFilter,
} from '../utils/customerErpDocumentListUi';

const FILTER_CHIPS: { key: InvoiceStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'partial', label: 'Partly paid' },
  { key: 'paid', label: 'Paid' },
];

export const CustomerInvoicesScreen: React.FC = () => {
  const navigation = useNavigation();
  const { customerId, loading: cidLoading } = useSessionCustomerId();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('all');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    const cid = customerId.trim();
    if (!cid) {
      setRows([]);
      setError(cidLoading ? null : 'No customer linked to this account.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    try {
      const data = await getERPNextClient().listSalesInvoicesForCustomer(cid, {
        fromDate: appliedFrom.trim() || undefined,
        toDate: appliedTo.trim() || undefined,
        limit: 120,
      });
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load invoices');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, cidLoading, appliedFrom, appliedTo]);

  useEffect(() => {
    if (cidLoading) {
      setLoading(true);
      return;
    }
    void load();
  }, [load, cidLoading]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesInvoiceStatusFilter(row, statusFilter)),
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
    (navigation as { navigate: (name: string, params: object) => void }).navigate('InvoiceDetails', {
      invoiceId: item.name,
    });
  };

  const openPaymentsForInvoice = (item: any) => {
    const name = String(item?.name || '').trim();
    if (!name) return;
    (navigation as { navigate: (name: string, params: object) => void }).navigate('CustomerPayments', {
      salesInvoiceName: name,
    });
  };

  const renderItem = ({ item }: { item: any }) => {
    const kind = salesInvoicePayKind(item);
    const chip = chipColors(kind);
    const accent = accentForPayKind(kind);
    const statusLabel = salesInvoiceStatusLabel(item, kind);

    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => openRow(item)}
        onLongPress={() => openPaymentsForInvoice(item)}
        delayLongPress={420}
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
          {kind === 'unpaid' || kind === 'partial' ? (
            <Text style={styles.rowOutstanding}>
              Outstanding {money(item.currency, getERPNextClient().effectiveSalesInvoiceOutstanding(item))}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>My invoices</Text>
          <Text style={styles.subtitle}>Sales invoices for your account</Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        {FILTER_CHIPS.map((chip) => {
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
          <Text style={styles.filterHeadTitle}>Date range</Text>
          <Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.TEXT_SECONDARY} />
        </TouchableOpacity>
        {!filtersOpen ? (
          <Text style={styles.filterSummary}>
            {appliedFrom || appliedTo ? `${appliedFrom || 'Any'} → ${appliedTo || 'Any'}` : 'All dates'}
          </Text>
        ) : (
          <View style={styles.filterBody}>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateField} onPress={() => setFromPickerOpen(true)} activeOpacity={0.7}>
                <Text style={styles.dateCap}>From</Text>
                <Text style={styles.dateVal}>{fromDate ? toYmd(fromDate) : 'Any'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateField} onPress={() => setToPickerOpen(true)} activeOpacity={0.7}>
                <Text style={styles.dateCap}>To</Text>
                <Text style={styles.dateVal}>{toDate ? toYmd(toDate) : 'Any'}</Text>
              </TouchableOpacity>
            </View>
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
            {Platform.OS === 'ios' && (fromPickerOpen || toPickerOpen) ? (
              <TouchableOpacity
                style={styles.iosDone}
                onPress={() => {
                  setFromPickerOpen(false);
                  setToPickerOpen(false);
                }}
              >
                <Text style={styles.iosDoneText}>Done</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} activeOpacity={0.85}>
              <Text style={styles.applyBtnText}>Apply</Text>
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
        {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''}
        {statusFilter !== 'all' ? ` · ${FILTER_CHIPS.find((c) => c.key === statusFilter)?.label}` : ''}
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
                <Ionicons name="document-text-outline" size={40} color={Colors.TEXT_SECONDARY} />
                <Text style={styles.emptyTitle}>No invoices</Text>
                <Text style={styles.emptySub}>
                  {statusFilter !== 'all'
                    ? 'Try another status filter or clear the date range.'
                    : 'Invoices from your suppliers will appear here.'}
                </Text>
              </View>
            ) : null
          }
        />
      )}
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
    paddingBottom: 8,
  },
  listPad: { paddingHorizontal: Spacing.MD, paddingBottom: 24 },
  emptyList: { flexGrow: 1, paddingHorizontal: Spacing.MD },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    marginBottom: 10,
    overflow: 'hidden',
  },
  rowPressed: { opacity: 0.92 },
  rowAccent: { width: 4, alignSelf: 'stretch' },
  rowBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.BLACK },
  rowAmount: { fontSize: 14, fontWeight: '700', color: Colors.BLACK },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '55%',
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  rowDate: { fontSize: 12, color: Colors.TEXT_SECONDARY },
  rowOutstanding: { fontSize: 12, color: Colors.WINE, fontWeight: '600', marginTop: 6 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBox: { marginHorizontal: Spacing.MD, marginBottom: 8 },
  errorText: { color: Colors.ERROR, textAlign: 'center', fontSize: 13 },
  emptyWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.BLACK },
  emptySub: { fontSize: 14, color: Colors.TEXT_SECONDARY, textAlign: 'center', lineHeight: 20 },
});
