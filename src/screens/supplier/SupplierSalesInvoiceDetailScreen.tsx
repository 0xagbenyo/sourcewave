import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getERPNextClient } from '../../services/erpnext';
import { navigateToDeliveryNoteDetail } from '../../utils/erpDocumentNavigation';
import {
  erpDocTotalWeightDetailWithCbm,
  erpLineMeasureDetailWithCbm,
  readErpLineWeightFromRow,
  sumErpDocItemsTotalWeight,
} from '../../utils/erpLineWeight';
import { useUserSession } from '../../context/UserContext';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';
import { isSupplierPortalUser } from '../../utils/isSupplierPortalUser';
import {
  erpDocOwnedByOtherSupplier,
  readSalesInvoiceSupplier,
} from '../../utils/erpSalesInvoiceSupplier';
import { ErpInvoicePaymentsPanel } from '../../components/ErpInvoicePaymentsPanel';
import { SupplierQuotationPaymentModal } from '../../components/SupplierQuotationPaymentModal';
import { appAlert as Alert } from '../../services/appAlert';
import { userFacingError } from '../../utils/userFacingError';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocHero,
  ErpDocSection,
  ErpDocMetaRow,
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

export const SupplierSalesInvoiceDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const INVOICE_TABS = useMemo(
    () => [
      { id: 'details' as const, label: t('invoiceDetails.tabDetails') },
      { id: 'payments' as const, label: t('invoiceDetails.tabPayments') },
    ],
    [t]
  );
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
  const [recordPayModal, setRecordPayModal] = useState(false);
  const [recordPaySubmitting, setRecordPaySubmitting] = useState(false);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);

  const reloadDoc = useCallback(async () => {
    try {
      const d = await getERPNextClient().getInvoice(name);
      setDoc(d as Record<string, unknown> | null);
    } catch {
      /* keep prior doc */
    }
  }, [name]);

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
  const status = String(
    doc?.status ||
      (Number(doc?.docstatus) === 0
        ? t('invoiceDetails.statusDraft')
        : t('invoiceDetails.statusSubmitted'))
  );
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
    const rows: { label: string; value: string }[] = [
      { label: t('invoiceDetails.customer'), value: customer },
    ];
    if (outstanding > 0.009) {
      rows.push({ label: t('invoiceDetails.outstanding'), value: formatErpDocMoney(outstanding, currency) });
    }
    return rows;
  }, [customer, currency, outstanding, t]);

  const onShareInvoice = () => {
    (navigation as { navigate: (n: string, p?: object) => void }).navigate('SupplierInvoiceShare', {
      documentName: name,
    });
  };

  const canShare = doc != null && Number(doc.docstatus) !== 2;

  const totalWeightKg = useMemo(() => sumErpDocItemsTotalWeight(doc), [doc]);
  const totalWeightDetail = erpDocTotalWeightDetailWithCbm(t, totalWeightKg);

  const canRecordPayment =
    isSupplierPortal &&
    !invoiceOwnedByOther &&
    Number(doc?.docstatus) === 1 &&
    outstanding > 0.009;

  const onConfirmRecordPayment = async (amount: number) => {
    if (!invoiceName.trim()) return;
    setRecordPaySubmitting(true);
    try {
      await getERPNextClient().recordReceivePaymentAgainstSalesInvoice({
        salesInvoiceName: invoiceName.trim(),
        amount,
      });
      setRecordPayModal(false);
      await reloadDoc();
      setPaymentsRefreshKey((k) => k + 1);
      setTab('payments');
      Alert.alert(
        t('invoicePayment.recordSuccessTitle'),
        t('invoicePayment.recordSuccessBody')
      );
    } catch (e: unknown) {
      Alert.alert(
        t('invoicePayment.failedTitle'),
        userFacingError(e, t('invoicePayment.recordFailedBody'))
      );
    } finally {
      setRecordPaySubmitting(false);
    }
  };

  return (
    <ErpDocumentPreviewLayout
      screenTitle={t('invoiceDetails.screenTitle')}
      printDoctype="Sales Invoice"
      printDocName={name}
      loading={loading}
      errorMessage={!loading && !doc ? t('invoiceDetails.notFound') : null}
      onBack={() => navigation.goBack()}
      onShare={canShare ? onShareInvoice : undefined}
      shareAccessibilityLabel={t('invoiceDetails.shareInChat')}
    >
      {doc ? (
        <ErpDocSheet>
          <ErpDocHero
            docId={invoiceName}
            statusLabel={status}
            statusColor={statusColor}
            amount={grandTotal}
            amountLabel={t('invoiceDetails.total')}
            subtitle={doc.posting_date ? t('invoiceDetails.posted', { date: formatErpDocDate(doc.posting_date) }) : undefined}
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
                  icon="airplane-outline"
                  onPress={() =>
                    navigateToDeliveryNoteDetail(
                      navigation as { navigate: (n: string, p?: object) => void },
                      primaryDeliveryNote,
                      true
                    )
                  }
                />
              ) : deliveryNotesLoading ? null : null}
              {totalWeightDetail ? (
                <ErpDocSection title={t('invoiceDetails.totalWeight')}>
                  <ErpDocMetaRow label={t('invoiceDetails.totalWeight')} value={totalWeightDetail} />
                </ErpDocSection>
              ) : null}
              <ErpDocSection title={t('common.itemsCount', { count: items.length })}>
              {items.length === 0 ? (
                <ErpDocEmptyState title={t('common.noLineItems')} />
              ) : (
                <ErpDocItemsList>
                  {items.map((line, idx) => {
                    const code = String(line.item_code || '').trim();
                    const weights = readErpLineWeightFromRow(line);
                    const weightDetail = erpLineMeasureDetailWithCbm(t, weights);
                    return (
                    <ErpDocLineItem
                      key={String(line.name || idx)}
                      title={String(line.item_name || line.item_code || t('common.itemFallback'))}
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
              key={paymentsRefreshKey}
              invoiceName={invoiceName}
              currency={currency}
              active={tab === 'payments'}
              variant="supplier"
              totalDue={Number(doc.grand_total) || 0}
              outstanding={outstanding}
              onRecordPayment={canRecordPayment ? () => setRecordPayModal(true) : undefined}
              recordDisabled={!canRecordPayment || recordPaySubmitting}
            />
          )}
        </ErpDocSheet>
      ) : null}

      <SupplierQuotationPaymentModal
        visible={recordPayModal}
        currency={currency}
        maxAmount={outstanding}
        loading={recordPaySubmitting}
        onClose={() => setRecordPayModal(false)}
        onSubmit={onConfirmRecordPayment}
      />
    </ErpDocumentPreviewLayout>
  );
};
