import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
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
import { pickLineDisplayImageUri } from '../../utils/erpLineItemImages';
import { erpLineItemTitle } from '../../utils/erpLineItemDisplay';
import {
  erpDocTotalWeightDetailKg,
  erpDocTotalWeightDetailWithCbm,
  sumErpDocItemsTotalWeight,
} from '../../utils/erpLineWeight';
import { QuotationBuyerActionBar } from '../../components/QuotationBuyerActionBar';
import { ErpInvoicePaymentsPanel } from '../../components/ErpInvoicePaymentsPanel';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocHero,
  type ErpDocHeroFactPair,
  ErpDocHeroActionButton,
  ErpDocSection,
  ErpDocLineItem,
  ErpDocItemsList,
  ErpDocEmptyState,
  ErpDocLinkButton,
  ErpDocLinkedSection,
  ErpDocTabBar,
  erpDocStatusAccent,
  formatErpDocDate,
  formatErpDocMoney,
} from '../../components/ErpDocumentPreviewLayout';

type QuotationTab = 'details' | 'payments';

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
  const { customerId: sessionCustomerId } = useSessionCustomerId();
  const { name } = route.params as { name: string; customerId?: string };
  const isSupplierPortal = user?.appMode === 'supplier' || !!user?.supplierId?.trim();

  const QUOTATION_TABS = useMemo(
    () => [
      { id: 'details' as const, label: t('invoiceDetails.tabDetails') },
      { id: 'payments' as const, label: t('invoiceDetails.tabPayments') },
    ],
    [t]
  );

  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedInvoices, setLinkedInvoices] = useState<Record<string, unknown>[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [lineImages, setLineImages] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<QuotationTab>('details');
  const [invoiceOutstanding, setInvoiceOutstanding] = useState<number | null>(null);
  const [invoiceTotalDue, setInvoiceTotalDue] = useState<number | null>(null);
  const [invoiceCurrency, setInvoiceCurrency] = useState('GHS');
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);

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

  const loadLinkedInvoices = useCallback(async () => {
    try {
      setLinksLoading(true);
      const rows = await getERPNextClient().listSalesInvoicesByCustomQuotation(name, {
        limit: 10,
      });
      const nonCancelled = (Array.isArray(rows) ? rows : []).filter((r) => Number(r?.docstatus) !== 2);
      setLinkedInvoices(nonCancelled);
    } catch {
      setLinkedInvoices([]);
    } finally {
      setLinksLoading(false);
    }
  }, [name]);

  useEffect(() => {
    let cancelled = false;
    void loadLinkedInvoices().catch(() => {
      if (!cancelled) setLinkedInvoices([]);
    });
    return () => {
      cancelled = true;
    };
  }, [loadLinkedInvoices]);

  useFocusEffect(
    useCallback(() => {
      if (isSupplierPortal) return;
      void loadLinkedInvoices();
    }, [isSupplierPortal, loadLinkedInvoices])
  );

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
  const customerLabel = String(
    doc?.customer_name || doc?.custom_bill_to_customer || doc?.customer || '—'
  );
  const totalWeightKg = useMemo(() => sumErpDocItemsTotalWeight(doc), [doc]);
  const totalWeightDetail = isSupplierPortal
    ? erpDocTotalWeightDetailWithCbm(t, totalWeightKg)
    : erpDocTotalWeightDetailKg(t, totalWeightKg);

  const heroFactPairs = useMemo((): ErpDocHeroFactPair[] => {
    const rows: ErpDocHeroFactPair[] = [
      {
        left: { label: t('invoiceDetails.customer'), value: customerLabel },
        right: totalWeightDetail
          ? { label: t('invoiceDetails.totalWeight'), value: totalWeightDetail }
          : undefined,
      },
    ];
    if (!isSupplierPortal) {
      rows.push({ left: { label: t('quotationDetails.supplier'), value: supplierLabel } });
    }
    const valid = formatErpDocDate(doc?.valid_till);
    if (valid) {
      rows.push({ left: { label: t('quotationDetails.validTo'), value: valid } });
    }
    return rows;
  }, [customerLabel, doc?.valid_till, isSupplierPortal, supplierLabel, t, totalWeightDetail]);

  const primaryInvoice = linkedInvoices[0];
  const primaryInvoiceName = String(primaryInvoice?.name || '').trim();
  const showPaymentsTab = !isSupplierPortal && !!primaryInvoiceName;
  const customerScope = useMemo(() => {
    const fromInvoice = String(primaryInvoice?.customer || '').trim();
    if (fromInvoice && sessionCustomerId && fromInvoice === sessionCustomerId) return fromInvoice;
    if (fromInvoice) return fromInvoice;
    return sessionCustomerId || undefined;
  }, [primaryInvoice?.customer, sessionCustomerId]);

  useEffect(() => {
    if (!showPaymentsTab) {
      setTab('details');
      setInvoiceOutstanding(null);
      setInvoiceTotalDue(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const client = getERPNextClient();
        const inv = await client.getSalesInvoiceRaw(primaryInvoiceName);
        if (cancelled || !inv) return;
        setInvoiceCurrency(String(inv.currency || primaryInvoice?.currency || 'GHS'));
        setInvoiceTotalDue(Number(inv.grand_total) || Number(primaryInvoice?.grand_total) || 0);
        setInvoiceOutstanding(client.effectiveSalesInvoiceOutstanding(inv as Record<string, unknown>));
      } catch {
        if (cancelled) return;
        setInvoiceCurrency(String(primaryInvoice?.currency || 'GHS'));
        setInvoiceTotalDue(Number(primaryInvoice?.grand_total) || 0);
        const out = Number(primaryInvoice?.outstanding_amount);
        setInvoiceOutstanding(Number.isFinite(out) ? out : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    showPaymentsTab,
    primaryInvoiceName,
    primaryInvoice?.currency,
    primaryInvoice?.grand_total,
    primaryInvoice?.outstanding_amount,
    paymentsRefreshKey,
  ]);

  const canEdit = isSupplierPortal && supplierQuotationAllowsSupplierEdit(doc);
  const canResend = isSupplierPortal && supplierQuotationAllowsSupplierResend(doc);
  const showBuyerActions = !isSupplierPortal && buyerReview.canReviewDoc(doc);
  const buyerAcceptedAwaitingInvoice =
    !isSupplierPortal && buyerReview.outcome === 'accepted' && !primaryInvoiceName;

  const [invoiceFlowComplete, setInvoiceFlowComplete] = useState(false);

  useEffect(() => {
    if (isSupplierPortal || !primaryInvoiceName) {
      setInvoiceFlowComplete(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const client = getERPNextClient();
        let invoicePaid = false;

        // Prefer a fresh invoice read — list rows can lag behind payments.
        try {
          const inv = await client.getSalesInvoiceRaw(primaryInvoiceName);
          if (inv) {
            const outstanding = client.effectiveSalesInvoiceOutstanding(
              inv as Record<string, unknown>
            );
            const st = String(inv.status || '')
              .trim()
              .toLowerCase();
            invoicePaid =
              outstanding <= 0.009 ||
              st === 'paid' ||
              st === 'completed' ||
              st === 'credit note issued';
          }
        } catch {
          const outstanding = Number(primaryInvoice?.outstanding_amount);
          const st = String(primaryInvoice?.status || '')
            .trim()
            .toLowerCase();
          invoicePaid =
            (Number.isFinite(outstanding) && outstanding <= 0.009) ||
            st === 'paid' ||
            st === 'completed';
        }

        let orderCompleted = false;
        if (linkedSalesOrderName) {
          try {
            const so = await client.getSalesOrder(linkedSalesOrderName);
            const soStatus = String(so?.status || '')
              .trim()
              .toLowerCase();
            orderCompleted =
              soStatus === 'completed' ||
              soStatus === 'closed' ||
              (Number(so?.per_delivered) >= 99.99 && Number(so?.per_billed) >= 99.99);
          } catch {
            orderCompleted = false;
          }
        }

        if (!cancelled) {
          // Hide pay/delivery CTA once the invoice is paid (or the sales order is completed).
          setInvoiceFlowComplete(invoicePaid || orderCompleted);
        }
      } catch {
        if (!cancelled) setInvoiceFlowComplete(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isSupplierPortal,
    primaryInvoiceName,
    primaryInvoice?.outstanding_amount,
    primaryInvoice?.status,
    linkedSalesOrderName,
  ]);

  const canBuyerPayInvoice =
    !isSupplierPortal && !!primaryInvoiceName && !invoiceFlowComplete;

  useEffect(() => {
    if (!buyerAcceptedAwaitingInvoice) return;
    const timer = setInterval(() => {
      void loadLinkedInvoices();
    }, 4000);
    return () => clearInterval(timer);
  }, [buyerAcceptedAwaitingInvoice, loadLinkedInvoices]);

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

  const onViewInvoiceAndPay = () => {
    if (!primaryInvoiceName) return;
    navigateToSalesInvoiceDetail(
      navigation as { navigate: (n: string, p?: object) => void },
      primaryInvoiceName,
      isSupplierPortal
    );
  };

  const canShare = isSupplierPortal && Number(doc?.docstatus) !== 2;
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([reloadDoc(), loadLinkedInvoices()]).finally(() => {
      setRefreshing(false);
      setPaymentsRefreshKey((k) => k + 1);
    });
  }, [reloadDoc, loadLinkedInvoices]);

  return (
    <ErpDocumentPreviewLayout
      screenTitle={t('quotationDetails.screenTitle')}
      printDoctype="Supplier Quotation"
      printDocName={name}
      loading={loading}
      errorMessage={!loading && !doc ? t('quotationDetails.notFound') : null}
      onBack={() => navigation.goBack()}
      onShare={canShare ? onShareQuotation : undefined}
      shareAccessibilityLabel={t('quotationDetails.shareInChat')}
      refreshControl={
        doc ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.TEXT_SECONDARY}
          />
        ) : undefined
      }
    >
      {doc ? (
        <ErpDocSheet>
          <ErpDocHero
            docId={String(doc.name || name)}
            statusLabel={status}
            statusColor={statusColor}
            amount={grandTotal}
            amountLabel={t('quotationDetails.quoteBudget')}
            subtitle={
              doc.transaction_date
                ? t('quotationDetails.submitted', { date: formatErpDocDate(doc.transaction_date) })
                : undefined
            }
            factPairs={heroFactPairs}
            statusTrailing={
              showBuyerActions ? (
                <QuotationBuyerActionBar
                  compact
                  busy={buyerReview.busy}
                  onAccept={() => void buyerReview.accept()}
                  onReject={() => void buyerReview.reject()}
                />
              ) : buyerAcceptedAwaitingInvoice ? (
                <ErpDocHeroActionButton
                  label={t('quotationDetails.processingInvoice')}
                  onPress={() => {}}
                  variant="outline"
                  size="compact"
                  accessibilityLabel={t('quotationDetails.processingInvoice')}
                />
              ) : canBuyerPayInvoice ? (
                <ErpDocHeroActionButton
                  label={t('quotationDetails.viewInvoiceAndMakePayment')}
                  onPress={onViewInvoiceAndPay}
                  variant="primary"
                  size="compact"
                  accessibilityLabel={t('quotationDetails.viewInvoiceAndMakePayment')}
                />
              ) : canEdit ? (
                <ErpDocHeroActionButton label={t('quotationDetails.edit')} onPress={onEditQuotation} variant="outline" />
              ) : canResend ? (
                <ErpDocHeroActionButton
                  label={t('quotationDetails.reviseResend')}
                  onPress={onResendQuotation}
                  variant="outline"
                  accessibilityLabel={t('quotationDetails.reviseResendA11y')}
                />
              ) : undefined
            }
          />

          {showPaymentsTab ? (
            <ErpDocTabBar
              tabs={QUOTATION_TABS}
              activeId={tab}
              onChange={(next) => setTab(next as QuotationTab)}
            />
          ) : null}

          {showPaymentsTab && tab === 'payments' ? (
            <ErpInvoicePaymentsPanel
              key={paymentsRefreshKey}
              invoiceName={primaryInvoiceName}
              currency={invoiceCurrency || currency}
              active={tab === 'payments'}
              variant="buyer"
              customerId={customerScope}
              totalDue={invoiceTotalDue ?? Number(primaryInvoice?.grand_total) ?? 0}
              outstanding={invoiceOutstanding ?? 0}
            />
          ) : (
            <>
              {showPaymentsTab ? (
                <ErpDocLinkButton
                  label={t('invoiceDetails.viewPayments')}
                  subtitle={t('invoiceDetails.viewPaymentsSub')}
                  icon="wallet-outline"
                  onPress={() => setTab('payments')}
                />
              ) : null}

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
                      formatErpDocMoney(
                        primaryInvoice?.grand_total,
                        String(primaryInvoice?.currency || currency)
                      ),
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

              <ErpDocSection title={t('common.itemsCount', { count: items.length })}>
                {items.length === 0 ? (
                  <ErpDocEmptyState title={t('common.noLineItems')} />
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
                          detail={undefined}
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
          )}
        </ErpDocSheet>
      ) : null}
    </ErpDocumentPreviewLayout>
  );
};
