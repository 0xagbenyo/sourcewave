import React, { useCallback, useEffect, useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { appAlert as Alert } from '../services/appAlert';
import { useSalesInvoice } from '../hooks/erpnext';
import { useSessionCustomerId } from '../hooks/useSessionCustomerId';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import { paystackConfigurationError } from '../services/paystack';
import { isSupplierPortalUser } from '../utils/isSupplierPortalUser';
import {
  readSalesInvoiceSupplier,
  resolveErpSupplierDisplayName,
  salesInvoiceSupplierUiLabel,
} from '../utils/erpSalesInvoiceSupplier';
import { ErpInvoicePaymentsPanel } from '../components/ErpInvoicePaymentsPanel';
import { InvoicePaystackPaymentSheet } from '../components/InvoicePaystackPaymentSheet';
import { InvoiceShippingOptionSheet } from '../components/InvoiceShippingOptionSheet';
import { shippingOptionById, shippingOptionGoodsPaymentOnArrival, type ShippingOptionId } from '../constants/shippingOptions';
import { userFacingError } from '../utils/userFacingError';
import {
  erpDocTotalWeightDetailKg,
  erpDocTotalWeightDetailWithCbm,
  erpLineMeasureDetailKg,
  erpLineMeasureDetailWithCbm,
  sumErpDocItemsTotalWeight,
} from '../utils/erpLineWeight';
import { navigateToDeliveryNoteDetail } from '../utils/erpDocumentNavigation';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocHero,
  ErpDocHeroActionButton,
  ErpDocSection,
  ErpDocMetaRow,
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
import { ERP_DOC_FLAT } from '../constants/erpDocFlatUi';

type InvoiceTab = 'details' | 'payments';

export const InvoiceDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const INVOICE_TABS = React.useMemo(
    () => [
      { id: 'details' as const, label: t('invoiceDetails.tabDetails') },
      { id: 'payments' as const, label: t('invoiceDetails.tabPayments') },
    ],
    [t]
  );
  const { user } = useUserSession();
  const isSupplierPortal = isSupplierPortalUser(user);
  const { invoiceId } = (route.params as { invoiceId?: string }) || {};
  const id = String(invoiceId || '').trim();
  const [tab, setTab] = useState<InvoiceTab>('details');
  const { customerId: sessionCustomerId } = useSessionCustomerId();

  const { data: invoice, loading, error, refreshing, refetch } = useSalesInvoice(id);
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
  const [shippingSheetOpen, setShippingSheetOpen] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState<
    Array<{ name: string; status?: string; docstatus?: number; shippingOption?: string }>
  >([]);
  const [deliveryNotesLoading, setDeliveryNotesLoading] = useState(false);
  const [linkedDnShippingOption, setLinkedDnShippingOption] = useState('');
  const [lineImages, setLineImages] = useState<Record<string, string>>({});
  const [invoiceSupplierId, setInvoiceSupplierId] = useState('');
  const [invoiceSupplierName, setInvoiceSupplierName] = useState('');

  const customerScope = React.useMemo(() => {
    const fromInvoice = String(invoice?.customer || '').trim();
    if (fromInvoice && sessionCustomerId && fromInvoice === sessionCustomerId) return fromInvoice;
    if (fromInvoice) return fromInvoice;
    return sessionCustomerId || undefined;
  }, [invoice?.customer, sessionCustomerId]);

  const canPay = outstanding != null && outstanding > 0.009;
  const isPaid = outstanding != null && !canPay && (invoice?.grandTotal ?? 0) > 0;
  const primaryDeliveryNote = deliveryNotes[0]?.name?.trim() || '';
  const freightGoodsPayOnArrival = shippingOptionGoodsPaymentOnArrival(
    linkedDnShippingOption || deliveryNotes[0]?.shippingOption
  );
  /** Freight Cargo: goods are collected on arrival — hide immediate Pay CTA once that option is active. */
  const showGoodsPayOnArrival = canPay && freightGoodsPayOnArrival && !!primaryDeliveryNote;
  const showPayGoodsCta = canPay && !showGoodsPayOnArrival;
  /** Buyer can arrange delivery when paid, or while unpaid (to pick Freight Cargo pay-on-arrival). */
  const canArrangeDelivery = !!invoice && (isPaid || canPay) && !primaryDeliveryNote && !deliveryNotesLoading;

  const statusColor = React.useMemo(() => {
    if (showGoodsPayOnArrival) return Colors.INFO;
    if (canPay) return Colors.ERROR;
    return erpDocStatusAccent(invoice?.status || '');
  }, [invoice?.status, canPay, showGoodsPayOnArrival]);

  const dateLabel = invoice?.date ? formatErpDocDate(invoice.date) : undefined;
  const supplierLabel = salesInvoiceSupplierUiLabel(invoiceSupplierId, invoiceSupplierName, t);

  const loadDeliveryNotes = useCallback(async () => {
    if (!id) {
      setDeliveryNotes([]);
      setLinkedDnShippingOption('');
      return;
    }
    setDeliveryNotesLoading(true);
    try {
      const rows = await getERPNextClient().listDeliveryNotesForSalesInvoice(id);
      const mapped = rows
        .map((row) => ({
          name: String(row?.name || '').trim(),
          status: String(row?.status || '').trim() || undefined,
          docstatus: Number(row?.docstatus ?? 0),
          shippingOption: undefined as string | undefined,
        }))
        .filter((row) => row.name.length > 0);
      setDeliveryNotes(mapped);

      const primary = mapped[0]?.name?.trim() || '';
      if (primary) {
        try {
          const dn = await getERPNextClient().getDeliveryNoteRaw(primary);
          const option = getERPNextClient().readDeliveryNoteShippingOption(dn);
          setLinkedDnShippingOption(option);
          if (option) {
            setDeliveryNotes((prev) =>
              prev.map((row, idx) => (idx === 0 ? { ...row, shippingOption: option } : row))
            );
          }
        } catch {
          setLinkedDnShippingOption('');
        }
      } else {
        setLinkedDnShippingOption('');
      }
    } catch {
      setDeliveryNotes([]);
      setLinkedDnShippingOption('');
    } finally {
      setDeliveryNotesLoading(false);
    }
  }, [id]);

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
      const supplierId = readSalesInvoiceSupplier(raw as Record<string, unknown>);
      setInvoiceSupplierId(supplierId);
      if (supplierId) {
        const displayName = await resolveErpSupplierDisplayName(supplierId);
        setInvoiceSupplierName(displayName);
      } else {
        setInvoiceSupplierName('');
      }
    } catch {
      setOutstanding(null);
    }
  }, [id]);

  useEffect(() => {
    void loadOutstanding();
  }, [loadOutstanding, invoice?.id]);

  useEffect(() => {
    void loadDeliveryNotes();
  }, [loadDeliveryNotes]);

  useEffect(() => {
    if (!id || !invoice?.items?.length) {
      setLineImages({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = await getERPNextClient().getSalesInvoiceRaw(id);
        if (!raw || cancelled) return;
        const rows = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
        const linkedQ = getERPNextClient().linkedQuotationFromSalesInvoice(raw as Record<string, unknown>);
        const merged = await getERPNextClient().resolveSalesInvoiceLineImages(rows, linkedQ);
        if (!cancelled) setLineImages(merged);
      } catch {
        if (!cancelled) setLineImages({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, invoice?.items?.length]);

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
    void loadDeliveryNotes();
  };

  const onCreateDeliveryNote = async (optionId: ShippingOptionId) => {
    const option = shippingOptionById(optionId);
    if (!option || !id) return;
    if (!option.goodsPaymentOnArrival && canPay) {
      Alert.alert(
        t('invoiceDelivery.failedTitle'),
        t('invoiceDelivery.airCargoRequiresPayment')
      );
      return;
    }
    setDeliveryBusy(true);
    try {
      const result = await getERPNextClient().createDeliveryNoteFromSalesInvoice(id, {
        shippingOptionLabel: option.erpValue,
        shippingInstructions: `${option.label} — ${option.subtitle}`,
      });
      setShippingSheetOpen(false);
      await loadDeliveryNotes();
      Alert.alert(
        t('invoiceDelivery.successTitle'),
        option.goodsPaymentOnArrival
          ? t('invoiceDelivery.successBodyFreight', { name: result.name, shipping: option.label })
          : t('invoiceDelivery.successBody', { name: result.name, shipping: option.label })
      );
    } catch (e: unknown) {
      Alert.alert(t('invoiceDelivery.failedTitle'), userFacingError(e, t('invoiceDelivery.failedBody')));
    } finally {
      setDeliveryBusy(false);
    }
  };

  const lineWeightDetail = (item: {
    weightPerUnit?: number;
    totalWeight?: number;
  }): string | undefined => {
    const weights = {
      weight_per_unit: item.weightPerUnit,
      total_weight: item.totalWeight,
    };
    return isSupplierPortal
      ? erpLineMeasureDetailWithCbm(t, weights)
      : erpLineMeasureDetailKg(t, weights);
  };

  const totalWeightKg = React.useMemo(() => {
    if (!invoice?.items?.length) return 0;
    return sumErpDocItemsTotalWeight({
      items: invoice.items.map((item) => ({
        qty: item.quantity,
        total_weight: item.totalWeight,
        weight_per_unit: item.weightPerUnit,
      })),
    });
  }, [invoice?.items]);
  const totalWeightDetail = isSupplierPortal
    ? erpDocTotalWeightDetailWithCbm(t, totalWeightKg)
    : erpDocTotalWeightDetailKg(t, totalWeightKg);

  return (
    <>
      <ErpDocumentPreviewLayout
        screenTitle={t('invoiceDetails.screenTitle')}
        printDoctype="Sales Invoice"
        printDocName={invoice?.invoiceNumber || id}
        loading={loading}
        errorMessage={
          !loading && (error || !invoice)
            ? error?.message || t('invoiceDetails.notFound')
            : null
        }
        onBack={() => (navigation as { goBack: () => void }).goBack()}
        refreshControl={
          invoice ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void refetch();
                void loadOutstanding();
                void loadDeliveryNotes();
              }}
              tintColor={Colors.TEXT_SECONDARY}
            />
          ) : undefined
        }
      >
        {invoice ? (
          <ErpDocSheet>
            <ErpDocHero
              docId={invoice.invoiceNumber}
              statusLabel={invoice.status}
              statusColor={statusColor}
              amount={formatErpDocMoney(invoice.grandTotal)}
              amountLabel={t('invoiceDetails.total')}
              subtitle={dateLabel ? t('invoiceDetails.issued', { date: dateLabel }) : undefined}
              facts={
                showGoodsPayOnArrival
                  ? [
                      {
                        label: t('invoiceDetails.outstanding'),
                        value: formatErpDocMoney(outstanding!, currency),
                      },
                      {
                        label: t('invoicePayment.paymentOption'),
                        value: t('invoicePayment.uponArrival'),
                      },
                    ]
                  : canPay
                    ? [{ label: t('invoiceDetails.outstanding'), value: formatErpDocMoney(outstanding!, currency) }]
                    : invoice.customer
                      ? [{ label: t('invoiceDetails.customer'), value: invoice.customer }]
                      : undefined
              }
              statusTrailing={
                showPayGoodsCta ? (
                  <TouchableOpacity style={styles.payHeroBtn} onPress={openPaySheet} activeOpacity={0.85}>
                    <Text style={styles.payHeroBtnText}>{t('invoicePayment.payShort')}</Text>
                  </TouchableOpacity>
                ) : canArrangeDelivery ? (
                  <ErpDocHeroActionButton
                    label={t('invoiceDelivery.arrangeDelivery')}
                    onPress={() => setShippingSheetOpen(true)}
                  />
                ) : undefined
              }
            />

            <ErpDocTabBar tabs={INVOICE_TABS} activeId={tab} onChange={(next) => setTab(next as InvoiceTab)} />

            {tab === 'details' ? (
              <>
                <ErpDocLinkButton
                  label={t('invoiceDetails.viewPayments')}
                  subtitle={
                    showGoodsPayOnArrival
                      ? t('invoicePayment.uponArrivalHint')
                      : t('invoiceDetails.viewPaymentsSub')
                  }
                  icon="wallet-outline"
                  onPress={() => setTab('payments')}
                />
                {primaryDeliveryNote ? (
                  <ErpDocLinkButton
                    label={t('invoiceDelivery.linkedDeliveryNote', { name: primaryDeliveryNote })}
                    subtitle={
                      freightGoodsPayOnArrival && canPay
                        ? t('invoiceDelivery.linkedDeliveryNoteFreightSub')
                        : deliveryNotes[0]?.docstatus === 0
                          ? t('invoiceDelivery.linkedDeliveryNoteDraftSub')
                          : [deliveryNotes[0]?.status, t('invoiceDelivery.linkedDeliveryNoteSub')]
                              .filter(Boolean)
                              .join(' · ') || t('invoiceDelivery.linkedDeliveryNoteSub')
                    }
                    icon="airplane-outline"
                    onPress={() =>
                      navigateToDeliveryNoteDetail(
                        navigation as { navigate: (n: string, p?: object) => void },
                        primaryDeliveryNote,
                        false
                      )
                    }
                  />
                ) : canArrangeDelivery ? (
                  <ErpDocLinkButton
                    label={t('invoiceDelivery.arrangeDelivery')}
                    subtitle={t('invoiceDelivery.arrangeDeliverySub')}
                    icon="airplane-outline"
                    onPress={() => setShippingSheetOpen(true)}
                  />
                ) : null}
                {!isSupplierPortal ? (
                  <ErpDocSection title={t('erpDocumentParty.supplierSection')}>
                    <ErpDocMetaRow
                      label={t('erpDocumentParty.supplierField')}
                      value={supplierLabel}
                    />
                  </ErpDocSection>
                ) : null}
                {totalWeightDetail ? (
                  <ErpDocSection title={t('invoiceDetails.totalWeight')}>
                    <ErpDocMetaRow label={t('invoiceDetails.totalWeight')} value={totalWeightDetail} />
                  </ErpDocSection>
                ) : null}
                <ErpDocSection title={t('common.itemsCount', { count: invoice.items?.length ?? 0 })}>
                  {invoice.items?.length ? (
                    <ErpDocItemsList>
                      {invoice.items.map((item, index) => (
                        <ErpDocLineItem
                          key={`${item.itemCode}-${index}`}
                          title={item.itemName || item.itemCode}
                          detail={lineWeightDetail(item)}
                          qty={item.quantity}
                          rate={item.rate}
                          amount={item.amount}
                          imageUri={lineImages[item.itemCode] || item.lineImage}
                        />
                      ))}
                    </ErpDocItemsList>
                  ) : (
                    <ErpDocEmptyState title={t('common.noLineItems')} />
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
                totalDue={invoice.grandTotal ?? 0}
                outstanding={outstanding ?? 0}
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

      <InvoiceShippingOptionSheet
        visible={shippingSheetOpen}
        busy={deliveryBusy}
        onClose={() => setShippingSheetOpen(false)}
        onConfirm={(optionId) => void onCreateDeliveryNote(optionId)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  payHeroBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ERP_DOC_FLAT.accent,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 36,
  },
  payHeroBtnText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
});
