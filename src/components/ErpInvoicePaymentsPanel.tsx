import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
  invoiceName: string;
  currency?: string;
  active: boolean;
  variant?: 'buyer' | 'supplier';
  /** When set, only Payment Entries for this Customer are shown. */
  customerId?: string;
  /** Invoice grand total (optional — fetched when omitted). */
  totalDue?: number | null;
  /** Current outstanding balance (optional — fetched when omitted). */
  outstanding?: number | null;
};

export const ErpInvoicePaymentsPanel: React.FC<Props> = ({
  invoiceName,
  currency = 'GHS',
  active,
  variant = 'buyer',
  customerId,
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

  const invoiceId = invoiceName.trim();

  useEffect(() => {
    if (totalDueProp != null) setTotalDue(totalDueProp);
  }, [totalDueProp]);

  useEffect(() => {
    if (outstandingProp != null) setOutstanding(outstandingProp);
  }, [outstandingProp]);

  useEffect(() => {
    if (!active || !invoiceId) {
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
        const [list, raw] = await Promise.all([
          client.listPaymentEntriesForSalesInvoice(invoiceId, {
            limit: 50,
            customerId: customerId?.trim() || undefined,
          }),
          totalDueProp == null || outstandingProp == null
            ? client.getSalesInvoiceRaw(invoiceId)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setRows(Array.isArray(list) ? list : []);
        if (raw) {
          const gt = Number(raw.grand_total);
          if (totalDueProp == null) {
            setTotalDue(Number.isFinite(gt) && gt > 0 ? gt : 0);
          }
          if (outstandingProp == null) {
            setOutstanding(client.effectiveSalesInvoiceOutstanding(raw as Record<string, unknown>));
          }
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError(t('erpPayments.loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [active, invoiceId, customerId, totalDueProp, outstandingProp, t]);

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
      {showSummary ? (
        <ErpDocPaymentProgressSummary
          totalDue={due}
          outstanding={out}
          currency={currency}
          totalLabel={t('erpPayments.invoiceTotal')}
        />
      ) : null}

      {rows.length === 0 ? (
        <ErpDocEmptyState
          icon="wallet-outline"
          title={t('erpPayments.emptyTitle')}
          subtitle={t('erpPayments.invoiceEmptySub')}
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
});
