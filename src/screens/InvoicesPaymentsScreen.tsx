import React, { useCallback, useEffect, useState } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';

type Segment = 'si' | 'pe';

function money(cur: string | undefined, n: number | string | undefined): string {
  const v = typeof n === 'number' ? n : parseFloat(String(n || 0)) || 0;
  const c = cur || '';
  return `${c ? `${c} ` : ''}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Buyer: **Sales Invoices** and **Payment Entries** for the signed-in customer (same party as orders).
 */
export const InvoicesPaymentsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const [segment, setSegment] = useState<Segment>('si');
  const [resolvedCustomerId, setResolvedCustomerId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      const sid = String(user?.user || '').trim();
      if (sid) {
        if (mounted) setResolvedCustomerId(sid);
        return;
      }
      if (!user?.email) {
        if (mounted) setResolvedCustomerId('');
        return;
      }
      try {
        const c = await getERPNextClient().getCustomerByEmail(user.email);
        if (mounted) setResolvedCustomerId(String(c?.name || '').trim());
      } catch {
        if (mounted) setResolvedCustomerId('');
      }
    };
    void resolve();
    return () => {
      mounted = false;
    };
  }, [user?.user, user?.email]);

  const load = useCallback(async () => {
    const cid = resolvedCustomerId.trim();
    if (!cid) {
      setRows([]);
      setError('No customer linked to this account.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    try {
      const client = getERPNextClient();
      const opts = {
        fromDate: appliedFrom.trim() || undefined,
        toDate: appliedTo.trim() || undefined,
        limit: 100,
      };
      const data =
        segment === 'si'
          ? await client.listSalesInvoicesForCustomer(cid, opts)
          : await client.listPaymentEntriesForCustomer(cid, opts);
      setRows(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resolvedCustomerId, segment, appliedFrom, appliedTo]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const applyDateFilters = () => {
    Keyboard.dismiss();
    setAppliedFrom(fromDate.trim());
    setAppliedTo(toDate.trim());
    setLoading(true);
  };

  const openRow = (item: any) => {
    if (segment === 'si') {
      (navigation as any).navigate('InvoiceDetails', { invoiceId: item.name });
    } else {
      (navigation as any).navigate('PaymentEntryDetail', { name: item.name });
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.row} onPress={() => openRow(item)} activeOpacity={0.8}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowTitle}>{item.name}</Text>
        <Text style={styles.rowMeta}>
          {item.posting_date || '—'} · {item.status || item.payment_type || '—'}
        </Text>
      </View>
      <Text style={styles.rowAmt}>
        {segment === 'si' ? money(item.currency, item.grand_total) : money(undefined, item.received_amount ?? item.paid_amount)}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backWrap}>
          <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Invoices & payments</Text>
        <View style={{ width: 32 }} />
      </View>
      <Text style={styles.hint}>Your sales invoices and payment history.</Text>

      <View style={styles.filterBox}>
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.filterLabel}>From (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              value={fromDate}
              onChangeText={setFromDate}
              autoCapitalize="none"
            />
          </View>
          <View style={[styles.dateCol, { marginLeft: 8 }]}>
            <Text style={styles.filterLabel}>To (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              value={toDate}
              onChangeText={setToDate}
              autoCapitalize="none"
            />
          </View>
        </View>
        <TouchableOpacity style={styles.applyBtn} onPress={applyDateFilters} activeOpacity={0.85}>
          <Text style={styles.applyBtnTxt}>Apply dates</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.seg}>
        <TouchableOpacity
          style={[styles.segBtn, segment === 'si' && styles.segBtnOn]}
          onPress={() => setSegment('si')}
        >
          <Text style={[styles.segTxt, segment === 'si' && styles.segTxtOn]}>Invoices</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, segment === 'pe' && styles.segBtnOn]}
          onPress={() => setSegment('pe')}
        >
          <Text style={[styles.segTxt, segment === 'pe' && styles.segTxtOn]}>Payments</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <View style={[styles.center, styles.fill]}>
          <ActivityIndicator size="large" color={Colors.WINE} />
        </View>
      ) : (
        <FlatList
          style={styles.fill}
          data={rows}
          keyExtractor={(it) => String(it.name)}
          renderItem={renderItem}
          contentContainerStyle={rows.length === 0 ? styles.emptyList : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.WINE} />}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>No {segment === 'si' ? 'invoices' : 'payments'} yet.</Text>
            ) : null
          }
        />
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.BACKGROUND },
  keyboardFlex: { flex: 1 },
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  backWrap: { padding: 8 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: Colors.BLACK },
  hint: { fontSize: 12, color: Colors.TEXT_SECONDARY, paddingHorizontal: 16, paddingVertical: 8 },
  filterBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  filterLabel: { fontSize: 11, fontWeight: '700', color: Colors.TEXT_SECONDARY, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.BLACK,
  },
  dateRow: { flexDirection: 'row' },
  dateCol: { flex: 1 },
  applyBtn: {
    backgroundColor: Colors.WINE,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  applyBtnTxt: { color: Colors.WHITE, fontWeight: '800', fontSize: 14 },
  seg: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 10,
    padding: 4,
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segBtnOn: { backgroundColor: Colors.WHITE },
  segTxt: { fontSize: 12, fontWeight: '600', color: Colors.TEXT_SECONDARY },
  segTxtOn: { color: Colors.BLACK },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyList: { flexGrow: 1, padding: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    padding: 14,
    marginBottom: 10,
  },
  rowLeft: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: Colors.BLACK },
  rowMeta: { fontSize: 12, color: Colors.TEXT_SECONDARY, marginTop: 4 },
  rowAmt: { fontSize: 14, fontWeight: '700', color: Colors.BLACK, marginRight: 6 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  err: { color: Colors.ERROR, textAlign: 'center' },
  empty: { textAlign: 'center', color: Colors.TEXT_SECONDARY, marginTop: 24 },
});
