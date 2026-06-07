import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { getERPNextClient } from '../../services/erpnext';
import type { SupplierStackParamList } from '../../types';

type R = RouteProp<SupplierStackParamList, 'SupplierPaymentEntryDetail'>;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export const SupplierPaymentEntryDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<R>();
  const { name } = route.params;
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getERPNextClient().getPaymentEntry(name);
        if (!cancelled) setDoc(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const refs: any[] = Array.isArray(doc?.references) ? doc.references : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backWrap}>
          <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          Payment
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
          <Field label="Posting date" value={String(doc.posting_date || '—')} />
          <Field label="Party type" value={String(doc.party_type || '—')} />
          <Field label="Party" value={String(doc.party || '—')} />
          <Field label="Payment type" value={String(doc.payment_type || '—')} />
          <Field label="Paid amount" value={String(doc.paid_amount ?? '—')} />
          <Field label="Received amount" value={String(doc.received_amount ?? '—')} />
          <Field label="Status / docstatus" value={`${doc.status || '—'} (${doc.docstatus ?? '—'})`} />

          <Text style={styles.section}>References</Text>
          {refs.length === 0 ? (
            <Text style={styles.muted}>No references.</Text>
          ) : (
            refs.map((r: any, idx: number) => (
              <Text key={String(r.name || idx)} style={styles.refLine}>
                {String(r.reference_doctype || '—')} · {String(r.reference_name || '—')} ·{' '}
                {String(r.allocated_amount ?? '—')}
              </Text>
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
  refLine: { fontSize: 13, color: Colors.BLACK, marginBottom: 6 },
});
