import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getERPNextClient } from '../../services/erpnext';
import { useUserSession } from '../../context/UserContext';
import { useSessionCustomerId } from '../../hooks/useSessionCustomerId';
import { navigateToSalesInvoiceDetail } from '../../utils/erpDocumentNavigation';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocHero,
  ErpDocSection,
  ErpDocLineItem,
  ErpDocItemsList,
  ErpDocEmptyState,
  ErpDocLinkButton,
  ErpDocLinkedSection,
  erpDocStatusAccent,
  formatErpDocDate,
  formatErpDocMoney,
} from '../../components/ErpDocumentPreviewLayout';

export const SupplierQuotationDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const { name, customerId: routeCustomerId } = route.params as { name: string; customerId?: string };
  const { customerId: sessionCustomerId } = useSessionCustomerId();
  const isSupplierPortal = user?.appMode === 'supplier' || !!user?.supplierId?.trim();
  const customerScope = isSupplierPortal
    ? undefined
    : String(routeCustomerId || sessionCustomerId || '').trim() || undefined;

  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedInvoices, setLinkedInvoices] = useState<Record<string, unknown>[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getERPNextClient().getSupplierQuotationByName(name);
        if (!cancelled) setDoc(d as Record<string, unknown> | null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLinksLoading(true);
      try {
        const rows = await getERPNextClient().listSalesInvoicesByCustomQuotation(name, {
          customerId: customerScope,
          limit: 10,
        });
        const nonCancelled = (Array.isArray(rows) ? rows : []).filter((r) => Number(r?.docstatus) !== 2);
        if (!cancelled) setLinkedInvoices(nonCancelled);
      } catch {
        if (!cancelled) setLinkedInvoices([]);
      } finally {
        if (!cancelled) setLinksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name, customerScope]);

  const items = Array.isArray(doc?.items) ? (doc!.items as Record<string, unknown>[]) : [];
  const currency = String(doc?.currency || 'GHS');
  const status = String(doc?.status || (Number(doc?.docstatus) === 0 ? 'Draft' : 'Submitted'));
  const statusColor = useMemo(
    () => erpDocStatusAccent(status, doc?.docstatus != null ? Number(doc.docstatus) : undefined),
    [status, doc?.docstatus]
  );
  const grandTotal = formatErpDocMoney(doc?.grand_total, currency);
  const supplierLabel = String(doc?.supplier_name || doc?.supplier || '—');

  const facts = useMemo(() => {
    const rows: { label: string; value: string }[] = [{ label: 'Supplier', value: supplierLabel }];
    const valid = formatErpDocDate(doc?.valid_till);
    if (valid) rows.push({ label: 'Valid till', value: valid });
    return rows;
  }, [doc?.valid_till, supplierLabel]);

  const primaryInvoice = linkedInvoices[0];
  const primaryInvoiceName = String(primaryInvoice?.name || '').trim();

  return (
    <ErpDocumentPreviewLayout
      screenTitle="Quotation"
      printDoctype="Supplier Quotation"
      printDocName={name}
      loading={loading}
      errorMessage={!loading && !doc ? 'This quotation could not be found or you may not have access.' : null}
      onBack={() => navigation.goBack()}
    >
      {doc ? (
        <ErpDocSheet>
          <ErpDocHero
            docId={String(doc.name || name)}
            statusLabel={status}
            statusColor={statusColor}
            amount={grandTotal}
            amountLabel="Quoted total"
            subtitle={
              doc.transaction_date ? `Submitted ${formatErpDocDate(doc.transaction_date)}` : undefined
            }
            facts={facts}
          />

          {!isSupplierPortal ? (
            <ErpDocLinkedSection
              title={t('quotationDetails.linkedInvoice')}
              loading={linksLoading}
              emptyTitle={t('quotationDetails.noLinkedInvoice')}
            >
              {primaryInvoiceName ? (
                <ErpDocLinkButton
                  label={t('quotationDetails.viewInvoice', { name: primaryInvoiceName })}
                  subtitle={[
                    String(primaryInvoice?.status || '').trim(),
                    formatErpDocMoney(primaryInvoice?.grand_total, String(primaryInvoice?.currency || currency)),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  icon="receipt-outline"
                  onPress={() =>
                    navigateToSalesInvoiceDetail(
                      navigation as { navigate: (n: string, p?: object) => void },
                      primaryInvoiceName,
                      false
                    )
                  }
                />
              ) : null}
              {linkedInvoices.slice(1).map((inv) => {
                const invName = String(inv.name || '').trim();
                if (!invName) return null;
                return (
                  <ErpDocLinkButton
                    key={invName}
                    label={t('quotationDetails.viewInvoice', { name: invName })}
                    subtitle={formatErpDocMoney(inv.grand_total, String(inv.currency || currency))}
                    icon="receipt-outline"
                    onPress={() =>
                      navigateToSalesInvoiceDetail(
                        navigation as { navigate: (n: string, p?: object) => void },
                        invName,
                        false
                      )
                    }
                  />
                );
              })}
            </ErpDocLinkedSection>
          ) : null}

          <ErpDocSection title={`Items · ${items.length}`}>
            {items.length === 0 ? (
              <ErpDocEmptyState title="No line items" />
            ) : (
              <ErpDocItemsList>
                {items.map((line, idx) => (
                  <ErpDocLineItem
                    key={String(line.name || idx)}
                    title={String(line.item_name || line.description || line.item_code || 'Item')}
                    qty={line.qty}
                    rate={line.rate}
                    amount={line.amount}
                    currency={currency}
                  />
                ))}
              </ErpDocItemsList>
            )}
          </ErpDocSection>
        </ErpDocSheet>
      ) : null}
    </ErpDocumentPreviewLayout>
  );
};
