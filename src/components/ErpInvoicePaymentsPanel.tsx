import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { getERPNextClient } from '../services/erpnext';
import {
  ErpDocSection,
  ErpDocItemsList,
  ErpDocEmptyState,
  erpDocPaymentStatusLabel,
  formatErpDocDate,
  formatErpDocMoney,
  erpDocStatusAccent,
} from './ErpDocumentPreviewLayout';

type Props = {
  invoiceName: string;
  currency?: string;
  active: boolean;
  variant?: 'buyer' | 'supplier';
  /** When set, only Payment Entries for this Customer are shown. */
  customerId?: string;
};

function paymentAmount(row: Record<string, unknown>, currency: string): string {
  const received = row.received_amount;
  const paid = row.paid_amount;
  const raw = received != null && Number(received) !== 0 ? received : paid;
  return formatErpDocMoney(raw, currency);
}

export const ErpInvoicePaymentsPanel: React.FC<Props> = ({
  invoiceName,
  currency = 'GHS',
  active,
  variant = 'buyer',
  customerId,
}) => {
  const navigation = useNavigation();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invoiceId = invoiceName.trim();

  useEffect(() => {
    if (!active || !invoiceId) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getERPNextClient()
      .listPaymentEntriesForSalesInvoice(invoiceId, { limit: 50, customerId: customerId?.trim() || undefined })
      .then((list) => {
        if (!cancelled) setRows(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setError('Could not load payments for this invoice.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, invoiceId, customerId]);

  const openPayment = (name: string) => {
    const id = name.trim();
    if (!id) return;
    if (variant === 'supplier') {
      (navigation as { navigate: (n: string, p?: object) => void }).navigate('SupplierPaymentEntryDetail', {
        name: id,
      });
      return;
    }
    (navigation as { navigate: (n: string, p?: object) => void }).navigate('PaymentEntryDetail', { name: id });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.TEXT_SECONDARY} />
      </View>
    );
  }

  if (error) {
    return <ErpDocEmptyState icon="alert-circle-outline" title={error} />;
  }

  if (rows.length === 0) {
    return (
      <ErpDocEmptyState
        icon="wallet-outline"
        title="No payments yet"
        subtitle="Payments linked to this invoice will show here."
      />
    );
  }

  return (
    <ErpDocSection title={`Payments · ${rows.length}`}>
      <ErpDocItemsList>
        {rows.map((row, idx) => {
          const name = String(row.name || '').trim();
          const status = erpDocPaymentStatusLabel(row);
          const statusColor = erpDocStatusAccent(status, row.docstatus != null ? Number(row.docstatus) : undefined);
          const date = formatErpDocDate(row.posting_date);
          return (
            <TouchableOpacity
              key={name || idx}
              style={[styles.row, idx < rows.length - 1 && styles.rowBorder]}
              onPress={() => openPayment(name)}
              activeOpacity={0.7}
              disabled={!name}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.rowAmount}>{paymentAmount(row, currency)}</Text>
                <View style={styles.rowMeta}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
                  {date ? <Text style={styles.rowDate}> · {date}</Text> : null}
                </View>
                <Text style={styles.rowId} numberOfLines={1}>
                  {name}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
            </TouchableOpacity>
          );
        })}
      </ErpDocItemsList>
    </ErpDocSection>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.XL,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  rowLeft: { flex: 1, minWidth: 0 },
  rowAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BLACK,
    fontVariant: ['tabular-nums'],
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  rowDate: { fontSize: 12, color: Colors.TEXT_SECONDARY },
  rowId: { fontSize: 11, color: Colors.TEXT_SECONDARY, marginTop: 4 },
});
