import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getERPNextClient } from '../../services/erpnext';
import { navigateToDeliveryNoteDetail } from '../../utils/erpDocumentNavigation';
import { readErpLineWeightFromRow, formatErpLineWeight } from '../../utils/erpLineWeight';
import { useUserSession } from '../../context/UserContext';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';
import { isSupplierPortalUser } from '../../utils/isSupplierPortalUser';
import {
  erpDocOwnedByOtherSupplier,
  readSalesInvoiceSupplier,
} from '../../utils/erpSalesInvoiceSupplier';
import { ErpInvoicePaymentsPanel } from '../../components/ErpInvoicePaymentsPanel';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocHero,
  ErpDocSection,
  ErpDocNotice,
  ErpDocLineItem,
  ErpDocItemsList,
  ErpDocEmptyState,
  ErpDocTabBar,
  ErpDocLinkButton,
  erpDocStatusAccent,
  formatErpDocDate,
  formatErpDocMoney,
} from '../../components/ErpDocumentPreviewLayout';
import { useTranslation } from 'react-i18next';

type InvoiceTab = 'details' | 'payments';

const INVOICE_TABS = [
  { id: 'details' as const, label: 'Details' },
  { id: 'payments' as const, label: 'Payments' },
];

export const SupplierSalesInvoiceDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const { supplierDocId } = useSupplierDocumentId();
  const isSupplierPortal = isSupplierPortalUser(user);
  const { name } = route.params as { name: string };
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<InvoiceTab>('details');
  const [deliveryNotes, setDeliveryNotes] = useState<Array<{ name: string; docstatus?: number }>>([]);
  const [deliveryNotesLoading, setDeliveryNotesLoading] = useState(false);
  const [lineImages, setLineImages] = useState<Record<string, string>>({});

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

  const invoiceName = String(doc?.name || name);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!invoiceName.trim()) return;
      setDeliveryNotesLoading(true);
      try {
        const rows = await getERPNextClient().listDeliveryNotesForSalesInvoice(invoiceName);
        if (!cancelled) {
          setDeliveryNotes(
            rows
              .map((row) => ({
                name: String(row?.name || '').trim(),
                docstatus: Number(row?.docstatus ?? 0),
              }))
              .filter((row) => row.name.length > 0)
          );
        }
      } catch {
        if (!cancelled) setDeliveryNotes([]);
      } finally {
        if (!cancelled) setDeliveryNotesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceName]);

  const items = useMemo(
    () => (Array.isArray(doc?.items) ? (doc.items as Record<string, unknown>[]) : []),
    [doc]
  );
  const linkedQuotation = useMemo(
    () => getERPNextClient().linkedQuotationFromSalesInvoice(doc),
    [doc]
  );

  useEffect(() => {
    if (!doc || items.length === 0) {
      setLineImages({});
      return;
    }
    let cancelled = false;
    void getERPNextClient()
      .resolveSalesInvoiceLineImages(items, linkedQuotation)
      .then((merged) => {
        if (!cancelled) setLineImages(merged);
      })
      .catch(() => {
        if (!cancelled) setLineImages({});
      });
    return () => {
      cancelled = true;
    };
  }, [doc, items, linkedQuotation]);

  const currency = String(doc?.currency || 'GHS');
  const status = String(doc?.status || (Number(doc?.docstatus) === 0 ? 'Draft' : 'Submitted'));
  const statusColor = useMemo(
    () => erpDocStatusAccent(status, doc?.docstatus != null ? Number(doc.docstatus) : undefined),
    [status, doc?.docstatus]
  );
  const grandTotal = formatErpDocMoney(doc?.grand_total, currency);
  const outstanding = getERPNextClient().effectiveSalesInvoiceOutstanding(doc);
  const primaryDeliveryNote = deliveryNotes[0]?.name?.trim() || '';
  const customer = String(doc?.customer_name || doc?.customer || '—');
  const linkedInvoiceSupplier = readSalesInvoiceSupplier(doc);
  const invoiceOwnedByOther = erpDocOwnedByOtherSupplier(linkedInvoiceSupplier, supplierDocId || undefined);
  const showApprovedByOtherNotice =
    isSupplierPortal && invoiceOwnedByOther && Number(doc?.docstatus) !== 0;

  const facts = useMemo(() => {
    const rows: { label: string; value: string }[] = [{ label: 'Customer', value: customer }];
    if (outstanding > 0.009) {
      rows.push({ label: 'Outstanding', value: formatErpDocMoney(outstanding, currency) });
    }
    return rows;
  }, [customer, currency, outstanding]);

  const onShareInvoice = () => {
    (navigation as { navigate: (n: string, p?: object) => void }).navigate('SupplierInvoiceShare', {
      documentName: name,
    });
  };

  const canShare = doc != null && Number(doc.docstatus) !== 2;

  return (
    <ErpDocumentPreviewLayout
      screenTitle="Invoice"
      printDoctype="Sales Invoice"
      printDocName={name}
      loading={loading}
      errorMessage={!loading && !doc ? 'This invoice could not be found or you may not have access.' : null}
      onBack={() => navigation.goBack()}
      onShare={canShare ? onShareInvoice : undefined}
      shareAccessibilityLabel="Share invoice in chat"
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

          {showApprovedByOtherNotice ? (
            <ErpDocNotice>{t('erpDocumentParty.approvedByOtherNotice')}</ErpDocNotice>
          ) : null}

          {tab === 'details' ? (
            <>
              {primaryDeliveryNote ? (
                <ErpDocLinkButton
                  label={t('deliveryNoteDetails.linkedFromInvoice', { name: primaryDeliveryNote })}
                  subtitle={
                    deliveryNotes[0]?.docstatus === 0
                      ? t('invoiceDelivery.linkedDeliveryNoteDraftSub')
                      : t('deliveryNoteDetails.viewDeliveryNoteSub')
                  }
                  icon="cube-outline"
                  onPress={() =>
                    navigateToDeliveryNoteDetail(
                      navigation as { navigate: (n: string, p?: object) => void },
                      primaryDeliveryNote,
                      true
                    )
                  }
                />
              ) : deliveryNotesLoading ? null : null}
              <ErpDocSection title={`Items · ${items.length}`}>
              {items.length === 0 ? (
                <ErpDocEmptyState title="No line items" />
              ) : (
                <ErpDocItemsList>
                  {items.map((line, idx) => {
                    const code = String(line.item_code || '').trim();
                    const weights = readErpLineWeightFromRow(line);
                    const weightDetail =
                      weights.total_weight != null || weights.weight_per_unit != null
                        ? `${formatErpLineWeight(weights.total_weight ?? 0)} kg total · ${formatErpLineWeight(weights.weight_per_unit ?? 0)} kg/unit`
                        : undefined;
                    return (
                    <ErpDocLineItem
                      key={String(line.name || idx)}
                      title={String(line.item_name || line.item_code || 'Item')}
                      detail={weightDetail}
                      qty={line.qty}
                      rate={line.rate}
                      amount={line.amount}
                      currency={currency}
                      imageUri={code ? lineImages[code] : undefined}
                    />
                    );
                  })}
                </ErpDocItemsList>
              )}
            </ErpDocSection>
            </>
          ) : (
            <ErpInvoicePaymentsPanel
              invoiceName={invoiceName}
              currency={currency}
              active={tab === 'payments'}
              variant="supplier"
              totalDue={Number(doc.grand_total) || 0}
              outstanding={outstanding}
            />
          )}
        </ErpDocSheet>
      ) : null}
    </ErpDocumentPreviewLayout>
  );
};
