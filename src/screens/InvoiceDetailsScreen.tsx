import React, { useCallback, useEffect, useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { appAlert as Alert } from '../services/appAlert';
import { useSalesInvoice } from '../hooks/erpnext';
import { useSessionCustomerId } from '../hooks/useSessionCustomerId';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import { paystackConfigurationError } from '../services/paystack';
import { ErpInvoicePaymentsPanel } from '../components/ErpInvoicePaymentsPanel';
import { InvoicePaystackPaymentSheet } from '../components/InvoicePaystackPaymentSheet';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocHero,
  ErpDocSection,
  ErpDocLineItem,
  ErpDocItemsList,
  ErpDocEmptyState,
  ErpDocTabBar,
  ErpDocLinkButton,
  erpDocStatusAccent,
  formatErpDocDate,
  formatErpDocMoney,
} from '../components/ErpDocumentPreviewLayout';
import { Colors } from '../constants/colors';

type InvoiceTab = 'details' | 'payments';

const INVOICE_TABS = [
  { id: 'details' as const, label: 'Details' },
  { id: 'payments' as const, label: 'Payments' },
];

export const InvoiceDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const { invoiceId } = (route.params as { invoiceId?: string }) || {};
  const id = String(invoiceId || '').trim();
  const [tab, setTab] = useState<InvoiceTab>('details');
  const { customerId: sessionCustomerId } = useSessionCustomerId();

  const { data: invoice, loading, error } = useSalesInvoice(id);
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);

  const customerScope = React.useMemo(() => {
    const fromInvoice = String(invoice?.customer || '').trim();
    if (fromInvoice && sessionCustomerId && fromInvoice === sessionCustomerId) return fromInvoice;
    if (fromInvoice) return fromInvoice;
    return sessionCustomerId || undefined;
  }, [invoice?.customer, sessionCustomerId]);

  const statusColor = React.useMemo(() => {
    if (canPay) return Colors.ERROR;
    return erpDocStatusAccent(invoice?.status || '');
  }, [invoice?.status, canPay]);

  const dateLabel = invoice?.date ? formatErpDocDate(invoice.date) : undefined;

  const loadOutstanding = useCallback(async () => {
    if (!id) {
      setOutstanding(null);
      return;
    }
    try {
      const raw = await getERPNextClient().getSalesInvoiceRaw(id);
      if (!raw) {
        setOutstanding(null);
        return;
      }
      setCurrency(String(raw.currency || 'GHS').trim() || 'GHS');
      setOutstanding(getERPNextClient().effectiveSalesInvoiceOutstanding(raw as Record<string, unknown>));
    } catch {
      setOutstanding(null);
    }
  }, [id]);

  useEffect(() => {
    void loadOutstanding();
  }, [loadOutstanding, invoice?.id]);

  const canPay = outstanding != null && outstanding > 0.009;

  const openPaySheet = () => {
    const paystackErr = paystackConfigurationError();
    if (paystackErr) {
      Alert.alert(t('invoicePayment.failedTitle'), paystackErr);
      return;
    }
    if (!user?.email?.trim()) {
      Alert.alert(t('subscriptionPage.signInRequired'), t('subscriptionPage.signInBody'));
      return;
    }
    if (outstanding == null) {
      Alert.alert(t('invoicePayment.failedTitle'), t('invoicePayment.loadingBalance'));
      void loadOutstanding();
      return;
    }
    if (!canPay) {
      Alert.alert(t('invoicePayment.failedTitle'), t('invoicePayment.noOutstanding'));
      return;
    }
    setPaySheetOpen(true);
  };

  const onPaymentSuccess = () => {
    void loadOutstanding();
    setPaymentsRefreshKey((k) => k + 1);
    setTab('payments');
  };

  return (
    <>
      <ErpDocumentPreviewLayout
        screenTitle="Invoice"
        printDoctype="Sales Invoice"
        printDocName={invoice?.invoiceNumber || id}
        loading={loading}
        errorMessage={
          !loading && (error || !invoice)
            ? error?.message || 'This invoice could not be found or you may not have access.'
            : null
        }
        onBack={() => (navigation as { goBack: () => void }).goBack()}
      >
        {invoice ? (
          <ErpDocSheet>
            <ErpDocHero
              docId={invoice.invoiceNumber}
              statusLabel={invoice.status}
              statusColor={statusColor}
              amount={formatErpDocMoney(invoice.grandTotal)}
              amountLabel="Total"
              subtitle={dateLabel ? `Issued ${dateLabel}` : undefined}
              facts={
                canPay
                  ? [{ label: 'Outstanding', value: formatErpDocMoney(outstanding!, currency) }]
                  : invoice.customer
                    ? [{ label: 'Customer', value: invoice.customer }]
                    : undefined
              }
              statusTrailing={
                canPay ? (
                  <TouchableOpacity style={styles.payHeroBtn} onPress={openPaySheet} activeOpacity={0.85}>
                    <Text style={styles.payHeroBtnText}>{t('invoicePayment.payShort')}</Text>
                  </TouchableOpacity>
                ) : undefined
              }
            />

            <ErpDocTabBar tabs={INVOICE_TABS} activeId={tab} onChange={(next) => setTab(next as InvoiceTab)} />

            {tab === 'details' ? (
              <>
                <ErpDocLinkButton
                  label={t('invoiceDetails.viewPayments')}
                  subtitle={t('invoiceDetails.viewPaymentsSub')}
                  icon="wallet-outline"
                  onPress={() => setTab('payments')}
                />
                <ErpDocSection title={`Items · ${invoice.items?.length ?? 0}`}>
                  {invoice.items?.length ? (
                    <ErpDocItemsList>
                      {invoice.items.map((item, index) => (
                        <ErpDocLineItem
                          key={`${item.itemCode}-${index}`}
                          title={item.itemName || item.itemCode}
                          qty={item.quantity}
                          rate={item.rate}
                          amount={item.amount}
                        />
                      ))}
                    </ErpDocItemsList>
                  ) : (
                    <ErpDocEmptyState title="No line items" />
                  )}
                </ErpDocSection>
              </>
            ) : (
              <ErpInvoicePaymentsPanel
                key={paymentsRefreshKey}
                invoiceName={invoice.invoiceNumber || id}
                currency={currency}
                active={tab === 'payments'}
                variant="buyer"
                customerId={customerScope}
              />
            )}
          </ErpDocSheet>
        ) : null}
      </ErpDocumentPreviewLayout>

      <InvoicePaystackPaymentSheet
        visible={paySheetOpen}
        invoiceName={invoice?.invoiceNumber || id}
        currency={currency}
        maxAmount={outstanding ?? 0}
        onClose={() => setPaySheetOpen(false)}
        onSuccess={onPaymentSuccess}
      />
    </>
  );
};

const styles = StyleSheet.create({
  payHeroBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.WINE,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minHeight: 32,
  },
  payHeroBtnText: {
    color: Colors.WHITE,
    fontSize: 12,
    fontWeight: '700',
  },
});
