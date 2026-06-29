import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getERPNextClient } from '../../services/erpnext';
import { useUserSession } from '../../context/UserContext';
import { useSessionCustomerId } from '../../hooks/useSessionCustomerId';
import { useSupplierQuotationBuyerReview } from '../../hooks/useSupplierQuotationBuyerReview';
import { navigateToSalesInvoiceDetail } from '../../utils/erpDocumentNavigation';
import {
  supplierQuotationAllowsSupplierEdit,
  supplierQuotationAllowsSupplierResend,
  type SupplierQuotationUiStatusKind,
} from '../../utils/chatQuotationDraftMessage';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { pickLineDisplayImageUri } from '../../utils/erpLineItemImages';
import { erpLineItemTitle } from '../../utils/erpLineItemDisplay';
import { QuotationBuyerActionBar } from '../../components/QuotationBuyerActionBar';
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
    const rows: { label: string; value: string }[] = [{ label: 'Supplier', value: supplierLabel }];
    const valid = formatErpDocDate(doc?.valid_till);
    if (valid) rows.push({ label: 'Valid till', value: valid });
    return rows;
  }, [doc?.valid_till, supplierLabel]);

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
              ) : undefined
            }
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

          {canEdit || canResend ? (
            <View style={styles.actionRow}>
              {canEdit ? (
                <TouchableOpacity style={styles.actionBtn} onPress={onEditQuotation} activeOpacity={0.85}>
                  <Ionicons name="create-outline" size={20} color={Colors.WHITE} />
                  <Text style={styles.actionBtnText}>Edit quotation</Text>
                </TouchableOpacity>
              ) : null}
              {canResend ? (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnSecondary]}
                  onPress={onResendQuotation}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh-outline" size={20} color={Colors.WINE} />
                  <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Revise & resend</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <ErpDocSection title={`Items · ${items.length}`}>
            {items.length === 0 ? (
              <ErpDocEmptyState title="No line items" />
            ) : (
              <ErpDocItemsList>
                {items.map((line, idx) => {
                  const code = String(line.item_code || '').trim();
                  return (
                  <ErpDocLineItem
                    key={String(line.name || idx)}
                    title={erpLineItemTitle(line.item_name, {
                      description: line.description,
                      itemCode: line.item_code,
                    })}
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

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: Spacing.MD,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexGrow: 1,
    flexBasis: '45%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.WINE,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.WINE,
  },
  actionBtnText: {
    color: Colors.WHITE,
    fontSize: 15,
    fontWeight: '700',
  },
  actionBtnTextSecondary: {
    color: Colors.WINE,
  },
});
