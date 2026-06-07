import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { getERPNextClient } from '../../services/erpnext';
import type { SupplierStackParamList } from '../../types';

type R = RouteProp<SupplierStackParamList, 'SupplierSalesInvoiceDetail'>;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export const SupplierSalesInvoiceDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<R>();
  const { name } = route.params;
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getERPNextClient().getInvoice(name);
        if (!cancelled) setDoc(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const items: any[] = Array.isArray(doc?.items) ? doc.items : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backWrap}>
          <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          Sales invoice
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.WINE} />
        </View>
      ) : !doc ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Could not load this document.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.docName}>{doc.name}</Text>
          <Field label="Customer" value={String(doc.customer || '—')} />
          <Field label="Posting date" value={String(doc.posting_date || '—')} />
          <Field label="Status" value={String(doc.status || '—')} />
          <Field label="Outstanding" value={`${doc.currency || ''} ${doc.outstanding_amount ?? '—'}`.trim()} />
          <Field label="Grand total" value={`${doc.currency || ''} ${doc.grand_total ?? '—'}`.trim()} />

          <Text style={styles.section}>Items</Text>
          {items.length === 0 ? (
            <Text style={styles.muted}>No line items.</Text>
          ) : (
            items.map((line: any, idx: number) => (
              <View key={String(line.name || idx)} style={styles.line}>
                <Text style={styles.lineMain}>
                  {String(line.item_code || line.item_name || '—')} × {String(line.qty ?? '—')}
                </Text>
                <Text style={styles.lineSub}>{String(line.description || '').slice(0, 120)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.BACKGROUND },
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: Colors.TEXT_SECONDARY },
  scroll: { padding: 16, paddingBottom: 40 },
  docName: { fontSize: 20, fontWeight: '800', color: Colors.BLACK, marginBottom: 12 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: Colors.TEXT_SECONDARY, marginBottom: 2 },
  fieldValue: { fontSize: 15, color: Colors.BLACK, fontWeight: '600' },
  section: { fontSize: 14, fontWeight: '800', marginTop: 16, marginBottom: 8, color: Colors.BLACK },
  line: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.BORDER },
  lineMain: { fontSize: 14, fontWeight: '600', color: Colors.BLACK },
  lineSub: { fontSize: 12, color: Colors.TEXT_SECONDARY, marginTop: 2 },
});
