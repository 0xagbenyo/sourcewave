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
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { getERPNextClient } from '../services/erpnext';
import {
  ErpDocSection,
  ErpDocEmptyState,
} from './ErpDocumentPreviewLayout';
import {
  ErpDocPaymentEntryList,
  ErpDocPaymentProgressSummary,
} from './ErpDocPaymentsUi';

type Props = {
  deliveryNoteName: string;
  currency?: string;
  active: boolean;
  variant?: 'buyer' | 'supplier';
  customerId?: string;
  onRecordPayment?: () => void;
  recordDisabled?: boolean;
  /** Delivery (shipping) fee total due. */
  totalDue?: number | null;
  /** Delivery fee still outstanding. */
  outstanding?: number | null;
};

export const ErpDeliveryNotePaymentsPanel: React.FC<Props> = ({
  deliveryNoteName,
  currency = 'GHS',
  active,
  variant = 'buyer',
  customerId,
  onRecordPayment,
  recordDisabled,
  totalDue: totalDueProp,
  outstanding: outstandingProp,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalDue, setTotalDue] = useState<number | null>(totalDueProp ?? null);
  const [outstanding, setOutstanding] = useState<number | null>(outstandingProp ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dnId = deliveryNoteName.trim();

  useEffect(() => {
    if (totalDueProp != null) setTotalDue(totalDueProp);
  }, [totalDueProp]);

  useEffect(() => {
    if (outstandingProp != null) setOutstanding(outstandingProp);
  }, [outstandingProp]);

  useEffect(() => {
    if (!active || !dnId) {
      setRows([]);
      setLoading(false);
      setError(null);
      if (totalDueProp == null) setTotalDue(null);
      if (outstandingProp == null) setOutstanding(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const client = getERPNextClient();
        const list = await client.listPaymentEntriesForDeliveryNote(dnId, {
          limit: 50,
          customerId: customerId?.trim() || undefined,
        });
        if (cancelled) return;
        setRows(Array.isArray(list) ? list : []);

        if (outstandingProp == null) {
          const out = await client.effectiveDeliveryNoteShippingOutstanding(dnId);
          if (!cancelled) setOutstanding(out);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError(t('deliveryPayment.loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [active, dnId, customerId, outstandingProp, t]);

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

  const due = totalDue ?? 0;
  const out = outstanding ?? 0;
  const showSummary = due > 0.009 || out > 0.009 || rows.length > 0;

  return (
    <View>
      {variant === 'supplier' && onRecordPayment ? (
        <TouchableOpacity
          style={[styles.recordBtn, recordDisabled && styles.recordBtnDisabled]}
          onPress={onRecordPayment}
          disabled={recordDisabled}
          activeOpacity={0.85}
        >
          <Ionicons name="cash-outline" size={20} color={Colors.WHITE} />
          <Text style={styles.recordBtnText}>{t('deliveryPayment.recordCta')}</Text>
        </TouchableOpacity>
      ) : null}

      {showSummary ? (
        <ErpDocPaymentProgressSummary
          totalDue={due}
          outstanding={out}
          currency={currency}
          totalLabel={t('erpPayments.deliveryFeeTotal')}
        />
      ) : null}

      {rows.length === 0 ? (
        <ErpDocEmptyState
          icon="wallet-outline"
          title={t('deliveryPayment.emptyTitle')}
          subtitle={t('deliveryPayment.emptySub')}
        />
      ) : (
        <ErpDocSection title={t('erpPayments.historyCount', { count: rows.length })}>
          <ErpDocPaymentEntryList rows={rows} currency={currency} onOpen={openPayment} />
        </ErpDocSection>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.XL,
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: Colors.WINE,
  },
  recordBtnDisabled: { opacity: 0.5 },
  recordBtnText: { color: Colors.WHITE, fontSize: 15, fontWeight: '700' },
});
