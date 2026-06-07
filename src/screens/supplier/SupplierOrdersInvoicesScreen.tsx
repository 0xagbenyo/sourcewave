import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';
import { getERPNextClient } from '../../services/erpnext';

type Segment = 'si' | 'pe';

type CustomerRow = { name: string; customer_name?: string };

type PaymentsInvoiceFocus = {
  name: string;
  customer?: string;
  customer_name?: string;
};

/** Payment position for sales invoices (chip + accent). */
type PayKind = 'paid' | 'unpaid' | 'partial' | 'neutral';

const PAGE_BG = '#ECEFF1';
const PANEL_BORDER = '#E0E4E8';
const ROW_SEP = '#ECEFF1';
const TEXT = '#1C1C1E';
const TEXT_MUTED = '#636366';
const BORDER = 'rgba(60, 60, 67, 0.29)';
const ACCENT_BAR = '#3A3A3C';

function money(cur: string | undefined, n: number | string | undefined): string {
  const v = typeof n === 'number' ? n : parseFloat(String(n || 0)) || 0;
  const c = cur || '';
  return `${c ? `${c} ` : ''}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toYmd(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

const hairline = StyleSheet.hairlineWidth;

function chipColors(kind: PayKind): { bg: string; fg: string; bd: string } {
  switch (kind) {
    case 'paid':
      return { bg: '#E8F5E9', fg: '#1B5E20', bd: '#A5D6A7' };
    case 'unpaid':
      return { bg: '#FFEBEE', fg: '#B71C1C', bd: '#FFCDD2' };
    case 'partial':
      return { bg: '#FFF3E0', fg: '#E65100', bd: '#FFE0B2' };
    default:
      return { bg: '#ECEFF1', fg: '#455A64', bd: '#CFD8DC' };
  }
}

function accentForPayKind(kind: PayKind): string {
  switch (kind) {
    case 'paid':
      return '#2E7D32';
    case 'unpaid':
      return '#C62828';
    case 'partial':
      return '#EF6C00';
    default:
      return '#78909C';
  }
}

function salesInvoicePayKind(row: any): PayKind {
  const docstatus = Number(row?.docstatus);
  const st = String(row?.status ?? '')
    .trim()
    .toLowerCase();
  if (docstatus === 0 || st === 'draft') return 'neutral';
  if (docstatus === 2 || st === 'cancelled') return 'neutral';

  if (st === 'partly paid' || st.includes('partly paid')) return 'partial';

  const out = getERPNextClient().effectiveSalesInvoiceOutstanding(row);
  const gt = Math.max(0, Number(row?.grand_total) || 0);
  const eps = 0.02;

  if (out <= eps) {
    if (gt <= eps) return 'neutral';
    return 'paid';
  }
  if (gt <= eps) return 'neutral';
  if (out >= gt - eps) return 'unpaid';
  return 'partial';
}

function salesInvoiceStatusLabel(row: any, kind: PayKind): string {
  const raw = String(row?.status ?? '').trim();
  if (raw) return raw;
  switch (kind) {
    case 'paid':
      return 'Paid';
    case 'unpaid':
      return 'Unpaid';
    case 'partial':
      return 'Partly paid';
    default:
      return '—';
  }
}

/** Payment entry row: posted = green, draft = orange, cancelled = red (same palette as invoice unpaid). */
function paymentEntryPayKind(row: any): PayKind {
  const ds = Number(row?.docstatus);
  if (ds === 2) return 'unpaid';
  if (ds === 0) return 'partial';
  if (ds === 1) return 'paid';
  return 'neutral';
}

function paymentEntryStatusLabel(row: any, kind: PayKind): string {
  const ds = Number(row?.docstatus);
  if (ds === 2) return 'Cancelled';
  if (ds === 0) return 'Draft';
  const pt = String(row?.payment_type ?? '').trim();
  if (pt) return pt;
  if (kind === 'paid') return 'Posted';
  return '—';
}

export const SupplierOrdersInvoicesScreen: React.FC = () => {
  const navigation = useNavigation();
  const { supplierDocId, loading: sidLoading, error: sidError } = useSupplierDocumentId();
  const [segment, setSegment] = useState<Segment>('si');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [appliedCustomerId, setAppliedCustomerId] = useState('');
  const [appliedCustomerLabel, setAppliedCustomerLabel] = useState('');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  const [paymentsForInvoice, setPaymentsForInvoice] = useState<PaymentsInvoiceFocus | null>(null);

  const [customerModal, setCustomerModal] = useState(false);
  const [customerRows, setCustomerRows] = useState<CustomerRow[]>([]);
  const [customerModalLoading, setCustomerModalLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadCustomersIntoModal = useCallback(async () => {
    setCustomerModalLoading(true);
    try {
      const rows = await getERPNextClient().listCustomerRowsForPicker();
      setCustomerRows(rows);
    } catch {
      setCustomerRows([]);
    } finally {
      setCustomerModalLoading(false);
    }
  }, []);

  const openCustomerModal = () => {
    setCustomerSearch('');
    setCustomerModal(true);
    void loadCustomersIntoModal();
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customerRows;
    return customerRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || (r.customer_name && r.customer_name.toLowerCase().includes(q))
    );
  }, [customerRows, customerSearch]);

  const load = useCallback(async () => {
    if (!supplierDocId) {
      setRows([]);
      setError(sidLoading ? null : sidError || 'No supplier linked to this login.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    try {
      const client = getERPNextClient();
      const opts = {
        customerId: appliedCustomerId.trim() || undefined,
        fromDate: appliedFrom.trim() || undefined,
        toDate: appliedTo.trim() || undefined,
        limit: 150,
      };
      const data =
        segment === 'si'
          ? await client.listSalesInvoicesForSupplier(supplierDocId, opts)
          : await client.listPaymentEntriesForSupplier(supplierDocId, {
              ...opts,
              ...(paymentsForInvoice
                ? {
                    salesInvoiceName: paymentsForInvoice.name,
                    salesInvoiceCustomer: paymentsForInvoice.customer,
                    salesInvoiceCustomerName: paymentsForInvoice.customer_name,
                  }
                : {}),
            });
      setRows(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load documents');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supplierDocId, sidLoading, sidError, segment, appliedCustomerId, appliedFrom, appliedTo, paymentsForInvoice]);

  useEffect(() => {
    if (sidLoading) {
      setLoading(true);
      return;
    }
    void load();
  }, [load, sidLoading]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const applyFilters = () => {
    Keyboard.dismiss();
    setFromPickerOpen(false);
    setToPickerOpen(false);
    setAppliedFrom(toYmd(fromDate));
    setAppliedTo(toYmd(toDate));
    setLoading(true);
  };

  const clearCustomer = () => {
    setAppliedCustomerId('');
    setAppliedCustomerLabel('');
    setLoading(true);
  };

  const pickCustomer = (r: CustomerRow) => {
    setAppliedCustomerId(r.name);
    setAppliedCustomerLabel(r.customer_name ? `${r.customer_name} (${r.name})` : r.name);
    setCustomerModal(false);
    setLoading(true);
  };

  const openRow = (item: any) => {
    if (segment === 'si') {
      (navigation as any).navigate('SupplierSalesInvoiceDetail', { name: item.name });
    } else {
      (navigation as any).navigate('SupplierPaymentEntryDetail', { name: item.name });
    }
  };

  const onInvoiceLongPress = (item: any) => {
    const name = String(item?.name || '').trim();
    if (!name) return;
    setPaymentsForInvoice({
      name,
      customer: item.customer,
      customer_name: item.customer_name,
    });
    setSegment('pe');
    setLoading(true);
  };

  const clearPaymentsInvoiceFocus = () => {
    setPaymentsForInvoice(null);
    setLoading(true);
  };

  const setSegmentInvoices = () => {
    setPaymentsForInvoice(null);
    setSegment('si');
    setLoading(true);
  };

  const setSegmentPayments = () => {
    setSegment('pe');
    setLoading(true);
  };

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (appliedCustomerId) parts.push(appliedCustomerLabel || appliedCustomerId);
    if (appliedFrom || appliedTo) {
      parts.push(`${appliedFrom || '—'} to ${appliedTo || '—'}`);
    }
    return parts.length ? parts.join(' · ') : 'No filters applied';
  }, [appliedCustomerId, appliedCustomerLabel, appliedFrom, appliedTo]);

  const Tab = ({ id, label }: { id: Segment; label: string }) => {
    const on = segment === id;
    return (
      <Pressable
        onPress={id === 'si' ? setSegmentInvoices : setSegmentPayments}
        style={[styles.tabPill, on && styles.tabPillOn]}
        android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      >
        <Text style={[styles.tabPillTxt, on && styles.tabPillTxtOn]}>{label}</Text>
      </Pressable>
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
          <Text style={styles.filterHeadTitle}>Search & date range</Text>
          <Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={20} color={TEXT_MUTED} />
        </TouchableOpacity>
        {!filtersOpen ? <Text style={styles.filterSummary}>{activeFilterSummary}</Text> : null}

        {filtersOpen ? (
          <View style={styles.filterBody}>
            <Text style={styles.filterFieldLabel}>Customer</Text>
            <TouchableOpacity style={styles.customerRow} onPress={openCustomerModal} activeOpacity={0.7}>
              <Ionicons name="person-outline" size={20} color={TEXT_MUTED} style={styles.customerRowIcon} />
              <Text style={styles.customerRowTxt} numberOfLines={1}>
                {appliedCustomerId ? appliedCustomerLabel || appliedCustomerId : 'All customers'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
            </TouchableOpacity>
            {!!appliedCustomerId ? (
              <TouchableOpacity onPress={clearCustomer} style={styles.clearLinkHit}>
                <Text style={styles.clearLink}>Remove customer filter</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={[styles.filterFieldLabel, { marginTop: 18 }]}>Posting date</Text>
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

            <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} activeOpacity={0.85}>
              <Text style={styles.applyBtnTxt}>Apply</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={styles.inlineErr}>
          <Text style={styles.inlineErrTxt}>{error}</Text>
        </View>
      ) : null}
    </>
  );

  const topChrome = (
    <View style={styles.headerBlock}>
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={16} style={styles.backBtn} activeOpacity={0.65}>
          <Ionicons name="chevron-back" size={24} color={TEXT} />
        </TouchableOpacity>
        <View style={styles.navTitleBlock}>
          <Text style={styles.screenTitle}>Invoices & payments</Text>
          <Text style={styles.screenSubtitle}>
            Long-press a sales invoice row to filter payments to that invoice only.
          </Text>
        </View>
      </View>

      <View style={styles.tabBar}>
        <Tab id="si" label="Sales invoices" />
        <Tab id="pe" label="Payments" />
      </View>

      {segment === 'pe' && paymentsForInvoice ? (
        <View style={styles.focusStrip}>
          <View style={styles.focusStripText}>
            <Text style={styles.focusStripLabel}>Filtered by invoice</Text>
            <Text style={styles.focusStripName} numberOfLines={2}>
              {paymentsForInvoice.name}
            </Text>
          </View>
          <TouchableOpacity onPress={clearPaymentsInvoiceFocus} hitSlop={12} activeOpacity={0.7}>
            <Text style={styles.focusStripClear}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {filtersBlock}
    </View>
  );

  const toolbarMeta =
    segment === 'si'
      ? rows.length === 0
        ? 'No invoices'
        : `${rows.length} invoice${rows.length !== 1 ? 's' : ''}`
      : rows.length === 0
        ? 'No payments'
        : `${rows.length} payment${rows.length !== 1 ? 's' : ''}`;

  const renderItem = ({ item }: { item: any }) => {
    const isSi = segment === 'si';
    const kind = isSi ? salesInvoicePayKind(item) : paymentEntryPayKind(item);
    const chip = chipColors(kind);
    const accent = accentForPayKind(kind);
    const statusLabel = isSi ? salesInvoiceStatusLabel(item, kind) : paymentEntryStatusLabel(item, kind);
    const dateStr = item.posting_date || '—';

    return (
      <Pressable
        style={({ pressed }) => [styles.rowTouchable, pressed && styles.rowTouchablePressed]}
        onPress={() => openRow(item)}
        onLongPress={isSi ? () => onInvoiceLongPress(item) : undefined}
        delayLongPress={420}
        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      >
        <View style={[styles.rowAccent, { backgroundColor: accent }]} />
        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <Text style={styles.rowDocName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowAmount}>
              {isSi
                ? money(item.currency, item.grand_total)
                : money(undefined, item.received_amount ?? item.paid_amount)}
            </Text>
          </View>
          <View style={styles.rowBottom}>
            <View style={[styles.statusPill, { backgroundColor: chip.bg, borderColor: chip.bd }]}>
              <Text style={[styles.statusPillText, { color: chip.fg }]} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
            <Text style={styles.rowDate}>{dateStr}</Text>
          </View>
          {isSi && item.customer ? (
            <Text style={styles.rowParty} numberOfLines={1}>
              {item.customer_name || item.customer}
            </Text>
          ) : null}
          {!isSi && item._customer ? (
            <Text style={styles.rowParty} numberOfLines={1}>
              {item._customer_name || item._customer}
            </Text>
          ) : null}
          {!isSi && item._linked_sales_invoice ? (
            <Text style={styles.rowRef}>Ref. {item._linked_sales_invoice}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const listEmpty = !loading ? (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No records</Text>
      <Text style={styles.emptySub}>
        {segment === 'si'
          ? 'Adjust filters or confirm invoices exist for your quotations.'
          : 'Adjust filters or long-press an invoice to narrow payments.'}
      </Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Modal visible={customerModal} animationType="slide" transparent onRequestClose={() => setCustomerModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCustomerModal(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            style={styles.modalKeyboard}
          >
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalGrab} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Customer</Text>
              <TouchableOpacity onPress={() => setCustomerModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search by name or ID"
              placeholderTextColor={TEXT_MUTED}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              autoCapitalize="none"
            />
            {customerModalLoading ? (
              <ActivityIndicator style={{ marginVertical: 28 }} color="#78909C" />
            ) : (
              <FlatList
                data={filteredCustomers}
                keyExtractor={(it) => it.name}
                style={{ maxHeight: 400 }}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  <TouchableOpacity
                    style={styles.modalRow}
                    onPress={() => {
                      clearCustomer();
                      setCustomerModal(false);
                    }}
                  >
                    <Text style={styles.modalRowTitle}>All customers</Text>
                    <Text style={styles.modalRowSub}>No filter</Text>
                  </TouchableOpacity>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.modalRow} onPress={() => pickCustomer(item)}>
                    <Text style={styles.modalRowTitle}>{item.customer_name || item.name}</Text>
                    <Text style={styles.modalRowSub}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <View style={styles.rootColumn}>
        {topChrome}

        <View style={styles.listBody}>
          <View style={styles.registerPanel}>
            <View style={styles.registerToolbar}>
              <Text style={styles.toolbarMeta} numberOfLines={1}>
                {toolbarMeta}
              </Text>
            </View>

            {loading && !refreshing ? (
              <View style={styles.panelLoading}>
                <ActivityIndicator size="large" color="#78909C" />
                <Text style={styles.loadingCaption}>Loading…</Text>
              </View>
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(it) => String(it.name)}
                style={styles.flat}
                scrollEnabled={rows.length > 0}
                contentContainerStyle={rows.length === 0 ? styles.emptyList : styles.listPad}
                ItemSeparatorComponent={() => <View style={styles.rowSep} />}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.WINE} />}
                ListEmptyComponent={listEmpty}
                renderItem={renderItem}
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
  tabBar: {
    flexDirection: 'row',
    marginBottom: 10,
    padding: 2,
    backgroundColor: '#DDE1E6',
    borderRadius: 9,
  },
  tabPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 7,
  },
  tabPillOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabPillTxt: { fontSize: 12, fontWeight: '700', color: '#78909C' },
  tabPillTxtOn: { color: Colors.WINE },
  focusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  focusStripText: { flex: 1, minWidth: 0 },
  focusStripLabel: { fontSize: 11, fontWeight: '600', color: '#78909C' },
  focusStripName: { fontSize: 14, fontWeight: '700', color: '#263238', marginTop: 2 },
  focusStripClear: { fontSize: 14, fontWeight: '700', color: Colors.WINE },
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
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: PAGE_BG,
    borderRadius: 8,
  },
  customerRowIcon: { marginRight: 10 },
  customerRowTxt: { flex: 1, fontSize: 15, color: '#263238', fontWeight: '600' },
  clearLinkHit: { marginTop: 8, alignSelf: 'flex-start' },
  clearLink: { fontSize: 13, fontWeight: '600', color: '#78909C' },
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
    backgroundColor: ACCENT_BAR,
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
  rowParty: { marginTop: 6, fontSize: 12, fontWeight: '500', color: '#78909C' },
  rowRef: { marginTop: 4, fontSize: 11, fontWeight: '600', color: '#78909C' },
  panelLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, minHeight: 200 },
  loadingCaption: { marginTop: 10, fontSize: 13, color: '#78909C', fontWeight: '600' },
  emptyWrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#546E7A' },
  emptySub: { marginTop: 6, textAlign: 'center', color: '#90A4AE', fontSize: 14, lineHeight: 20 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalKeyboard: {
    width: '100%',
    maxHeight: '92%',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 16,
    paddingBottom: 28,
    maxHeight: '100%',
  },
  modalGrab: {
    alignSelf: 'center',
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: BORDER,
    marginTop: 10,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#263238' },
  modalSearch: {
    borderWidth: hairline,
    borderColor: PANEL_BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: TEXT,
    marginBottom: 6,
  },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: hairline,
    borderBottomColor: PANEL_BORDER,
  },
  modalRowTitle: { fontSize: 16, fontWeight: '600', color: '#263238' },
  modalRowSub: { fontSize: 13, color: TEXT_MUTED, marginTop: 2 },
});
