import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getERPNextClient } from '../../services/erpnext';
import { useUserSession } from '../../context/UserContext';
import { useSupplierQuotationBuyerReview } from '../../hooks/useSupplierQuotationBuyerReview';
import { navigateToSalesInvoiceDetail } from '../../utils/erpDocumentNavigation';
import {
  supplierQuotationAllowsSupplierEdit,
  supplierQuotationAllowsSupplierResend,
  type SupplierQuotationUiStatusKind,
} from '../../utils/chatQuotationDraftMessage';
import { Colors } from '../../constants/colors';
import { pickLineDisplayImageUri } from '../../utils/erpLineItemImages';
import { erpLineItemTitle } from '../../utils/erpLineItemDisplay';
import { formatErpLineWeight, readErpLineWeightFromRow } from '../../utils/erpLineWeight';
import { QuotationBuyerActionBar } from '../../components/QuotationBuyerActionBar';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocHero,
  ErpDocHeroActionButton,
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

function quotationStatusAccent(
  kind: SupplierQuotationUiStatusKind,
  fallbackStatus: string,
  docstatus?: number
): string {
  switch (kind) {
    case 'rejected':
      return Colors.ERROR;
    case 'pending':
      return Colors.WARNING;
    case 'approved':
      return Colors.SUCCESS;
    default:
      return erpDocStatusAccent(fallbackStatus, docstatus);
  }
}

export const SupplierQuotationDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const { name } = route.params as { name: string; customerId?: string };
  const isSupplierPortal = user?.appMode === 'supplier' || !!user?.supplierId?.trim();

  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedInvoices, setLinkedInvoices] = useState<Record<string, unknown>[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [lineImages, setLineImages] = useState<Record<string, string>>({});

  const reloadDoc = useCallback(async () => {
    try {
      const d = await getERPNextClient().getSupplierQuotationByName(name);
      setDoc(d as Record<string, unknown> | null);
    } catch {
      setDoc(null);
    }
  }, [name]);

  const buyerReview = useSupplierQuotationBuyerReview(name, {
    billToFrappeUserId: user?.user || user?.email || null,
    onDocRefresh: reloadDoc,
  });

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
  }, [name]);

  const items = useMemo(
    () => (Array.isArray(doc?.items) ? (doc!.items as Record<string, unknown>[]) : []),
    [doc]
  );

  const linkedSalesOrderName = useMemo(() => {
    const orderField =
      String(process.env.EXPO_PUBLIC_ERPNEXT_SQ_ORDER_LINK_FIELD || 'custom_order').trim() || 'custom_order';
    return String(doc?.[orderField] || '').trim();
  }, [doc]);

  useEffect(() => {
    if (!doc || !items.length) {
      setLineImages({});
      return;
    }
    let cancelled = false;
    void getERPNextClient()
      .resolveSupplierQuotationLineImages(name, items, linkedSalesOrderName)
      .then(({ supplier, fallback }) => {
        if (cancelled) return;
        const merged: Record<string, string> = {};
        for (const line of items) {
          const code = String(line.item_code || '').trim();
          if (!code) continue;
          const uri = pickLineDisplayImageUri(supplier[code], fallback[code]);
          if (uri) merged[code] = uri;
        }
        setLineImages(merged);
      })
      .catch(() => {
        if (!cancelled) setLineImages({});
      });
    return () => {
      cancelled = true;
    };
  }, [doc, name, items, linkedSalesOrderName]);

  const currency = String(doc?.currency || 'GHS');
  const quotationStatus = useMemo(
    () => buyerReview.displayStatus(doc),
    [doc, buyerReview.outcome, buyerReview.displayStatus]
  );
  const status = quotationStatus.label;
  const statusColor = useMemo(
    () =>
      quotationStatusAccent(
        quotationStatus.kind,
        status,
        doc?.docstatus != null ? Number(doc.docstatus) : undefined
      ),
    [quotationStatus.kind, status, doc?.docstatus]
  );
  const grandTotal = formatErpDocMoney(doc?.grand_total, currency);
  const supplierLabel = String(doc?.supplier_name || doc?.supplier || '—');

  const facts = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    if (!isSupplierPortal) {
      rows.push({ label: 'Supplier', value: supplierLabel });
    }
    const valid = formatErpDocDate(doc?.valid_till);
    if (valid) rows.push({ label: t('quotationDetails.validTo'), value: valid });
    return rows;
  }, [doc?.valid_till, isSupplierPortal, supplierLabel, t]);

  const primaryInvoice = linkedInvoices[0];
  const primaryInvoiceName = String(primaryInvoice?.name || '').trim();
  const canEdit = isSupplierPortal && supplierQuotationAllowsSupplierEdit(doc);
  const canResend = isSupplierPortal && supplierQuotationAllowsSupplierResend(doc);
  const showBuyerActions = !isSupplierPortal && buyerReview.canReviewDoc(doc);

  const onEditQuotation = () => {
    (navigation as { navigate: (n: string, p?: object) => void }).navigate('SupplierQuotationCompose', {
      quotationName: name,
    });
  };

  const onResendQuotation = () => {
    (navigation as { navigate: (n: string, p?: object) => void }).navigate('SupplierQuotationCompose', {
      resendFromQuotation: name,
    });
  };

  const onShareQuotation = () => {
    (navigation as { navigate: (n: string, p?: object) => void }).navigate('SupplierQuotationShare', {
      quotationName: name,
    });
  };

  const canShare = isSupplierPortal && Number(doc?.docstatus) !== 2;

  return (
    <ErpDocumentPreviewLayout
      screenTitle="Quotation"
      printDoctype="Supplier Quotation"
      printDocName={name}
      loading={loading}
      errorMessage={!loading && !doc ? 'This quotation could not be found or you may not have access.' : null}
      onBack={() => navigation.goBack()}
      onShare={canShare ? onShareQuotation : undefined}
      shareAccessibilityLabel="Share quotation in chat"
    >
      {doc ? (
        <ErpDocSheet>
          <ErpDocHero
            docId={String(doc.name || name)}
            statusLabel={status}
            statusColor={statusColor}
            amount={grandTotal}
            amountLabel="Quote budget"
            subtitle={
              doc.transaction_date ? `Submitted ${formatErpDocDate(doc.transaction_date)}` : undefined
            }
            facts={facts}
            statusTrailing={
              showBuyerActions ? (
                <QuotationBuyerActionBar
                  compact
                  busy={buyerReview.busy}
                  onAccept={() => void buyerReview.accept()}
                  onReject={() => void buyerReview.reject()}
                />
              ) : canEdit ? (
                <ErpDocHeroActionButton label="Edit" onPress={onEditQuotation} variant="outline" />
              ) : canResend ? (
                <ErpDocHeroActionButton
                  label="Revise & resend"
                  onPress={onResendQuotation}
                  variant="outline"
                  accessibilityLabel="Revise and send a new quotation"
                />
              ) : undefined
            }
          />

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
                    isSupplierPortal
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
                      isSupplierPortal
                    )
                  }
                />
              );
            })}
          </ErpDocLinkedSection>

          <ErpDocSection title={`Items · ${items.length}`}>
            {items.length === 0 ? (
              <ErpDocEmptyState title="No line items" />
            ) : (
              <ErpDocItemsList>
                {items.map((line, idx) => {
                  const code = String(line.item_code || '').trim();
                  const weights = readErpLineWeightFromRow(line as Record<string, unknown>);
                  const weightDetail =
                    weights.total_weight != null || weights.weight_per_unit != null
                      ? `${formatErpLineWeight(weights.total_weight ?? 0)} kg total · ${formatErpLineWeight(weights.weight_per_unit ?? 0)} kg/unit`
                      : undefined;
                  return (
                  <ErpDocLineItem
                    key={String(line.name || idx)}
                    title={erpLineItemTitle(line.item_name, {
                      description: line.description,
                      itemCode: line.item_code,
                    })}
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
        </ErpDocSheet>
      ) : null}
    </ErpDocumentPreviewLayout>
  );
};
