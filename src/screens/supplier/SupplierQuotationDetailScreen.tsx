import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { getERPNextClient } from '../../services/erpnext';
import type { SupplierStackParamList } from '../../types';

type R = RouteProp<SupplierStackParamList, 'SupplierQuotationDetail'>;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export const SupplierQuotationDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<R>();
  const { name } = route.params;
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getERPNextClient().getSupplierQuotationByName(name);
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
          Quotation
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
          <Field label="Supplier" value={String(doc.supplier || '—')} />
          <Field label="Date" value={String(doc.transaction_date || '—')} />
          <Field label="Valid till" value={String(doc.valid_till || '—')} />
          <Field label="Status" value={String(doc.status || '—')} />
          <Field label="Grand total" value={`${doc.currency || ''} ${doc.grand_total ?? '—'}`.trim()} />

          <Text style={styles.section}>Items & prices</Text>
          {items.length === 0 ? (
            <Text style={styles.muted}>No line items.</Text>
          ) : (
            items.map((line, idx) => (
              <View key={`${line.name || idx}`} style={styles.line}>
                <Text style={styles.lineTitle}>{line.item_code || line.item_name || 'Item'}</Text>
                <Text style={styles.lineMeta}>
                  Qty {line.qty ?? '—'} · Rate {line.rate ?? '—'} · Amount {line.amount ?? '—'}
                </Text>
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
  topTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: Colors.BLACK },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  docName: { fontSize: 22, fontWeight: '800', color: Colors.BLACK, marginBottom: 16 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.TEXT_SECONDARY, marginBottom: 4 },
  fieldValue: { fontSize: 16, color: Colors.BLACK },
  section: { fontSize: 15, fontWeight: '800', marginTop: 20, marginBottom: 10, color: Colors.BLACK },
  line: {
    backgroundColor: Colors.WHITE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    padding: 12,
    marginBottom: 8,
  },
  lineTitle: { fontSize: 15, fontWeight: '700', color: Colors.BLACK },
  lineMeta: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 4 },
  muted: { color: Colors.TEXT_SECONDARY },
});
