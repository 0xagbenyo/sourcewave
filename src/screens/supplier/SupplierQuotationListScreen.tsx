import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';
import { getERPNextClient } from '../../services/erpnext';
import {
  supplierQuotationWorkflowStateAllowsBuyerReview,
  supplierQuotationWorkflowStateIsApprovedLike,
  supplierQuotationWorkflowStateIsRejectedLike,
} from '../../utils/chatQuotationDraftMessage';
import { SupplierQuotationPdfModal } from '../../components/SupplierQuotationPdfModal';
import { SupplierQuotationComposeScreen } from './SupplierQuotationComposeScreen';
import { SupplierComposeLeaveContext } from '../../context/SupplierComposeLeaveContext';
import type { SupplierStackParamList } from '../../types';

type R = RouteProp<SupplierStackParamList, 'SupplierQuotationList'>;

type WfKind = 'rejected' | 'pending' | 'approved' | 'neutral';
type SortMode = 'recent' | 'status_az' | 'status_za';
type StatusFilter = 'all' | WfKind;

function money(cur: string | undefined, n: number | string | undefined): string {
  const v = typeof n === 'number' ? n : parseFloat(String(n || 0)) || 0;
  const c = cur || '';
  return `${c ? `${c} ` : ''}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function workflowListLabelAndKind(row: {
  workflow_state?: string;
  status?: string;
  docstatus?: number;
}): { label: string; kind: WfKind } {
  const wf = String(row.workflow_state ?? '').trim();
  if (wf) {
    if (supplierQuotationWorkflowStateIsRejectedLike(wf)) return { label: wf, kind: 'rejected' };
    if (supplierQuotationWorkflowStateAllowsBuyerReview(wf)) return { label: wf, kind: 'pending' };
    if (supplierQuotationWorkflowStateIsApprovedLike(wf)) return { label: wf, kind: 'approved' };
    return { label: wf, kind: 'neutral' };
  }
  if (row.docstatus === 0) return { label: 'Draft', kind: 'neutral' };
  const st = String(row.status ?? '').trim();
  if (st) return { label: st, kind: 'neutral' };
  return { label: '—', kind: 'neutral' };
}

function chipColors(kind: WfKind): { bg: string; fg: string; bd: string } {
  switch (kind) {
    case 'rejected':
      return { bg: '#FBE9E7', fg: '#BF360C', bd: '#FFCCBC' };
    case 'pending':
      return { bg: '#FFF8E1', fg: '#E65100', bd: '#FFE082' };
    case 'approved':
      return { bg: '#E8F5E9', fg: '#1B5E20', bd: '#A5D6A7' };
    default:
      return { bg: '#ECEFF1', fg: '#455A64', bd: '#CFD8DC' };
  }
}

function accentForKind(kind: WfKind): string {
  switch (kind) {
    case 'rejected':
      return '#C62828';
    case 'pending':
      return '#EF6C00';
    case 'approved':
      return '#2E7D32';
    default:
      return '#78909C';
  }
}

export const SupplierQuotationListScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<R>();
  const { supplierDocId, loading: sidLoading, error: sidError } = useSupplierDocumentId();
  const [tab, setTab] = useState<'list' | 'new'>(() =>
    route.params?.initialTab === 'new' ? 'new' : 'list'
  );
  const [composeKey, setComposeKey] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfModalDoc, setPdfModalDoc] = useState<string>('');
  const [activeRowName, setActiveRowName] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const displayRows = useMemo(() => {
    let r = [...rows];
    if (statusFilter !== 'all') {
      r = r.filter((item) => workflowListLabelAndKind(item).kind === statusFilter);
    }
    const decorated = r.map((item) => {
      const m = workflowListLabelAndKind(item);
      return { item, label: m.label, kind: m.kind };
    });
    if (sortMode === 'status_az') {
      decorated.sort((a, b) => {
        const c = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
        if (c !== 0) return c;
        return String(a.item.name).localeCompare(String(b.item.name));
      });
    } else if (sortMode === 'status_za') {
      decorated.sort((a, b) => {
        const c = b.label.localeCompare(a.label, undefined, { sensitivity: 'base' });
        if (c !== 0) return c;
        return String(a.item.name).localeCompare(String(b.item.name));
      });
    }
    return decorated.map((d) => d.item);
  }, [rows, sortMode, statusFilter]);

  useLayoutEffect(() => {
    if (route.params?.initialTab === 'new') {
      setTab('new');
      setComposeKey((k) => k + 1);
    }
  }, [route.params?.initialTab]);

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
      const data = await client.listSupplierQuotationsForSupplier(supplierDocId, { limit: 50, start: 0 });
      setRows(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load quotations');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supplierDocId, sidLoading, sidError]);

  useEffect(() => {
    if (sidLoading) {
      setLoading(true);
      return;
    }
    void load();
  }, [load, sidLoading]);

  const leaveComposeAndRefresh = useCallback(() => {
    setTab('list');
    void load();
  }, [load]);

  const cycleSort = useCallback(() => {
    setSortMode((m) => (m === 'recent' ? 'status_az' : m === 'status_az' ? 'status_za' : 'recent'));
  }, []);

  const renderListTab = () => {
    const noSupplierLinked = !sidLoading && !supplierDocId && !!error;
    if (noSupplierLinked) {
      return (
        <View style={[styles.listTabRoot, styles.center]}>
          <Ionicons name="business-outline" size={48} color={Colors.TEXT_SECONDARY} style={{ marginBottom: 12 }} />
          <Text style={styles.err}>{error}</Text>
        </View>
      );
    }

    return (
      <View style={styles.listTabRoot}>
        {error && supplierDocId ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#C62828" style={{ marginRight: 8 }} />
            <Text style={styles.errBannerText}>{error}</Text>
          </View>
        ) : null}

        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.WINE} />
            <Text style={styles.loadingCaption}>Loading register…</Text>
          </View>
        ) : (
          <View style={styles.listBody}>
            <View style={styles.registerPanel}>
              <View style={styles.registerToolbar}>
                <Text style={styles.toolbarMeta} numberOfLines={1}>
                  {rows.length === 0
                    ? 'No quotations'
                    : statusFilter !== 'all' || sortMode !== 'recent'
                      ? `${displayRows.length}/${rows.length} shown`
                      : `${rows.length} quotation${rows.length !== 1 ? 's' : ''}`}
                </Text>
                <TouchableOpacity
                  style={styles.sortBtn}
                  onPress={cycleSort}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={rows.length === 0}
                  activeOpacity={0.7}
                >
                  <Ionicons name="swap-vertical" size={15} color={rows.length === 0 ? '#B0BEC5' : Colors.WINE} />
                  <Text style={[styles.sortBtnText, rows.length === 0 && styles.sortBtnTextDisabled]}>
                    {sortMode === 'recent' ? 'Recent' : sortMode === 'status_az' ? 'A–Z' : 'Z–A'}
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScroll}
                style={styles.chipScrollWrap}
              >
                {(
                  [
                    ['all', 'All'],
                    ['pending', 'Pending'],
                    ['approved', 'Approved'],
                    ['rejected', 'Rejected'],
                    ['neutral', 'Other'],
                  ] as const
                ).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterChip, statusFilter === key && styles.filterChipOn]}
                    onPress={() => setStatusFilter(key)}
                  >
                    <Text style={[styles.filterChipText, statusFilter === key && styles.filterChipTextOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <FlatList
                data={displayRows}
                keyExtractor={(it) => String(it.name)}
                style={styles.flat}
                scrollEnabled={displayRows.length > 0}
                contentContainerStyle={displayRows.length === 0 ? styles.emptyList : styles.listPad}
                ItemSeparatorComponent={() => <View style={styles.rowSep} />}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => {
                      setRefreshing(true);
                      void load();
                    }}
                    tintColor={Colors.WINE}
                  />
                }
                ListEmptyComponent={
                  !loading ? (
                    <View style={styles.emptyWrap}>
                      {rows.length > 0 && displayRows.length === 0 ? (
                        <>
                          <Ionicons name="funnel-outline" size={40} color="#B0BEC5" />
                          <Text style={styles.emptyTitle}>No matches</Text>
                          <Text style={styles.empty}>Try All or another status filter.</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="folder-open-outline" size={40} color="#B0BEC5" />
                          <Text style={styles.emptyTitle}>No quotations yet</Text>
                          <Text style={styles.empty}>Open the New tab to create your first draft.</Text>
                        </>
                      )}
                    </View>
                  ) : null
                }
                renderItem={({ item }) => {
                  const name = String(item.name || '');
                  const active = activeRowName === name;
                  const { label, kind } = workflowListLabelAndKind(item);
                  const chip = chipColors(kind);
                  const accent = accentForKind(kind);
                  return (
                    <TouchableOpacity
                      style={[styles.rowTouchable, active && styles.rowTouchableActive]}
                      onPress={() => {
                        setActiveRowName(name);
                        setPdfModalDoc(name);
                      }}
                      activeOpacity={0.72}
                    >
                      <View style={[styles.rowAccent, { backgroundColor: accent }]} />
                      <View style={styles.rowContent}>
                        <View style={styles.rowTop}>
                          <Text style={styles.rowDocName} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={styles.rowAmount}>{money(item.currency, item.grand_total)}</Text>
                        </View>
                        <View style={styles.rowBottom}>
                          <View style={[styles.statusPill, { backgroundColor: chip.bg, borderColor: chip.bd }]}>
                            <Text style={[styles.statusPillText, { color: chip.fg }]} numberOfLines={1}>
                              {label}
                            </Text>
                          </View>
                          <Text style={styles.rowDate}>{item.transaction_date || '—'}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backWrap}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Quotations
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'list' && styles.tabOn]}
          onPress={() => setTab('list')}
          activeOpacity={0.85}
        >
          <Ionicons name="list-outline" size={17} color={tab === 'list' ? Colors.WINE : '#78909C'} />
          <Text style={[styles.tabText, tab === 'list' && styles.tabTextOn]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'new' && styles.tabOn]}
          onPress={() => setTab('new')}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={17} color={tab === 'new' ? Colors.WINE : '#78909C'} />
          <Text style={[styles.tabText, tab === 'new' && styles.tabTextOn]}>New</Text>
        </TouchableOpacity>
      </View>

      {tab === 'list' ? (
        renderListTab()
      ) : (
        <SupplierComposeLeaveContext.Provider value={leaveComposeAndRefresh}>
          <View style={styles.composeWrap}>
            <SupplierQuotationComposeScreen key={composeKey} />
          </View>
        </SupplierComposeLeaveContext.Provider>
      )}

      <SupplierQuotationPdfModal
        visible={!!pdfModalDoc}
        docName={pdfModalDoc}
        onClose={() => setPdfModalDoc('')}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ECEFF1' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 8,
    paddingTop: 2,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E4E8',
  },
  backWrap: { padding: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', letterSpacing: -0.3 },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.MD,
    marginTop: 8,
    marginBottom: 6,
    padding: 2,
    backgroundColor: '#DDE1E6',
    borderRadius: 9,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 7,
  },
  tabOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: { fontSize: 12, fontWeight: '700', color: '#78909C' },
  tabTextOn: { color: Colors.WINE },
  listTabRoot: { flex: 1 },
  listBody: { flex: 1, paddingHorizontal: Spacing.MD },
  registerPanel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E4E8',
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
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECEFF1',
    gap: 8,
  },
  toolbarMeta: { flex: 1, fontSize: 12, fontWeight: '600', color: '#78909C' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  sortBtnText: { fontSize: 12, fontWeight: '800', color: Colors.WINE },
  sortBtnTextDisabled: { color: '#B0BEC5' },
  chipScrollWrap: { maxHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECEFF1' },
  chipScroll: { paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    marginRight: 6,
  },
  filterChipOn: { backgroundColor: Colors.BRAND_SOFT, borderColor: Colors.WINE },
  filterChipText: { fontSize: 11, fontWeight: '700', color: '#546E7A' },
  filterChipTextOn: { color: Colors.WINE },
  flat: { flex: 1 },
  listPad: { paddingBottom: 20 },
  emptyList: { flexGrow: 1, minHeight: 220 },
  rowSep: { height: StyleSheet.hairlineWidth, backgroundColor: '#ECEFF1', marginLeft: 12 },
  rowTouchable: { flexDirection: 'row', backgroundColor: '#FFFFFF' },
  rowTouchableActive: { backgroundColor: '#FAF7F8' },
  rowAccent: { width: 3 },
  rowContent: { flex: 1, paddingVertical: 10, paddingRight: 12, paddingLeft: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
  rowDocName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#263238', fontVariant: ['tabular-nums'] },
  rowAmount: { fontSize: 14, fontWeight: '700', color: Colors.WINE, fontVariant: ['tabular-nums'] },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  statusPill: {
    flexShrink: 1,
    maxWidth: '58%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  rowDate: { fontSize: 11, fontWeight: '600', color: '#90A4AE', fontVariant: ['tabular-nums'] },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.MD,
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errBannerText: { flex: 1, color: '#B71C1C', fontSize: 13, lineHeight: 18 },
  composeWrap: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingCaption: { marginTop: 12, fontSize: 13, color: '#78909C', fontWeight: '600' },
  err: { color: '#C62828', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#546E7A', marginTop: 12 },
  empty: { marginTop: 6, textAlign: 'center', color: '#90A4AE', fontSize: 14, lineHeight: 20 },
});
