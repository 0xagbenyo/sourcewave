import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getERPNextClient } from '../../services/erpnext';
import { ErpInvoicePaymentsPanel } from '../../components/ErpInvoicePaymentsPanel';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocHero,
  ErpDocSection,
  ErpDocLineItem,
  ErpDocItemsList,
  ErpDocEmptyState,
  ErpDocTabBar,
  erpDocStatusAccent,
  formatErpDocDate,
  formatErpDocMoney,
} from '../../components/ErpDocumentPreviewLayout';

type InvoiceTab = 'details' | 'payments';

const INVOICE_TABS = [
  { id: 'details' as const, label: 'Details' },
  { id: 'payments' as const, label: 'Payments' },
];

export const SupplierSalesInvoiceDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { name } = route.params as { name: string };
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<InvoiceTab>('details');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getERPNextClient().getInvoice(name);
        if (!cancelled) setDoc(d as Record<string, unknown> | null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const items = Array.isArray(doc?.items) ? (doc!.items as Record<string, unknown>[]) : [];
  const currency = String(doc?.currency || 'GHS');
  const status = String(doc?.status || (Number(doc?.docstatus) === 0 ? 'Draft' : 'Submitted'));
  const statusColor = useMemo(
    () => erpDocStatusAccent(status, doc?.docstatus != null ? Number(doc.docstatus) : undefined),
    [status, doc?.docstatus]
  );
  const grandTotal = formatErpDocMoney(doc?.grand_total, currency);
  const outstanding = getERPNextClient().effectiveSalesInvoiceOutstanding(doc);
  const invoiceName = String(doc?.name || name);
  const customer = String(doc?.customer_name || doc?.customer || '—');

  const facts = useMemo(() => {
    const rows: { label: string; value: string }[] = [{ label: 'Customer', value: customer }];
    if (outstanding > 0.009) {
      rows.push({ label: 'Outstanding', value: formatErpDocMoney(outstanding, currency) });
    }
    return rows;
  }, [customer, currency, outstanding]);

  return (
    <ErpDocumentPreviewLayout
      screenTitle="Invoice"
      printDoctype="Sales Invoice"
      printDocName={name}
      loading={loading}
      errorMessage={!loading && !doc ? 'This invoice could not be found or you may not have access.' : null}
      onBack={() => navigation.goBack()}
    >
      {doc ? (
        <ErpDocSheet>
          <ErpDocHero
            docId={invoiceName}
            statusLabel={status}
            statusColor={statusColor}
            amount={grandTotal}
            amountLabel="Total"
            subtitle={doc.posting_date ? `Posted ${formatErpDocDate(doc.posting_date)}` : undefined}
            facts={facts}
          />

          <ErpDocTabBar tabs={INVOICE_TABS} activeId={tab} onChange={(next) => setTab(next as InvoiceTab)} />

          {tab === 'details' ? (
            <ErpDocSection title={`Items · ${items.length}`}>
              {items.length === 0 ? (
                <ErpDocEmptyState title="No line items" />
              ) : (
                <ErpDocItemsList>
                  {items.map((line, idx) => (
                    <ErpDocLineItem
                      key={String(line.name || idx)}
                      title={String(line.item_name || line.item_code || 'Item')}
                      qty={line.qty}
                      rate={line.rate}
                      amount={line.amount}
                      currency={currency}
                    />
                  ))}
                </ErpDocItemsList>
              )}
            </ErpDocSection>
          ) : (
            <ErpInvoicePaymentsPanel
              invoiceName={invoiceName}
              currency={currency}
              active={tab === 'payments'}
              variant="supplier"
            />
          )}
        </ErpDocSheet>
      ) : null}
    </ErpDocumentPreviewLayout>
  );
};
