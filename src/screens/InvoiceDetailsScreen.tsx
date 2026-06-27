import React, { useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSalesInvoice } from '../hooks/erpnext';
import { useSessionCustomerId } from '../hooks/useSessionCustomerId';
import { ErpInvoicePaymentsPanel } from '../components/ErpInvoicePaymentsPanel';
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

type InvoiceTab = 'details' | 'payments';

const INVOICE_TABS = [
  { id: 'details' as const, label: 'Details' },
  { id: 'payments' as const, label: 'Payments' },
];

export const InvoiceDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { invoiceId } = (route.params as { invoiceId?: string }) || {};
  const id = String(invoiceId || '').trim();
  const [tab, setTab] = useState<InvoiceTab>('details');
  const { customerId: sessionCustomerId } = useSessionCustomerId();

  const { data: invoice, loading, error } = useSalesInvoice(id);

  const customerScope = useMemo(() => {
    const fromInvoice = String(invoice?.customer || '').trim();
    if (fromInvoice && sessionCustomerId && fromInvoice === sessionCustomerId) return fromInvoice;
    if (fromInvoice) return fromInvoice;
    return sessionCustomerId || undefined;
  }, [invoice?.customer, sessionCustomerId]);

  const statusColor = useMemo(
    () => erpDocStatusAccent(invoice?.status || ''),
    [invoice?.status]
  );

  const dateLabel = invoice?.date ? formatErpDocDate(invoice.date) : undefined;

  return (
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
            facts={invoice.customer ? [{ label: 'Customer', value: invoice.customer }] : undefined}
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
              invoiceName={invoice.invoiceNumber || id}
              currency="GHS"
              active={tab === 'payments'}
              variant="buyer"
              customerId={customerScope}
            />
          )}
        </ErpDocSheet>
      ) : null}
    </ErpDocumentPreviewLayout>
  );
};
