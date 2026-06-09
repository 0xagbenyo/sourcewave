import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
  Alert,
  Pressable,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { RavenQuotationDraftCard } from './RavenQuotationDraftCard';
import { SupplierQuotationPaymentModal } from './SupplierQuotationPaymentModal';
import { getERPNextClient } from '../services/erpnext';
import type { SourcewaveQuotationDraftPayload } from '../utils/chatQuotationDraftMessage';
import {
  supplierQuotationDocAllowsChatBuyerReview,
  supplierQuotationWorkflowStateIsApprovedLike,
} from '../utils/chatQuotationDraftMessage';
import { RavenLight } from '../constants/ravenLightTheme';

type Props = {
  sqName: string;
  /**
   * Frappe **`User.name`** / email for the **customer receiving the quotation** (the buying party), **not**
   * the supplier who posted the Raven message. Resolves **Customer** via portal user / email lookup.
   * Omit when the viewer is the supplier collecting payment — then ERP uses **`custom_bill_to_customer`** /
   * **`customer`** on the Supplier Quotation (or env).
   */
  billToFrappeUserId?: string | null;
  /**
   * Supplier-only: payment row + long-press Reply / Approve payment when the linked quotation belongs to the signed-in supplier.
   */
  supplierSelfServeUx?: boolean;
  showBuyerActions: boolean;
  /** ERPNext `Supplier.name` for the signed-in portal user — when it matches the quotation’s `supplier`, hide buyer Accept/Reject (Raven `owner` may not match session after API post). */
  viewerSupplierDocId?: string | null;
  handled?: 'accepted' | 'rejected' | null;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  /** Supplier: long-press “Reply” targets this Raven message. */
  onSupplierReplyToQuotation?: () => void;
};

type LinkedInvoice = {
  name: string;
  outstanding: number;
  grandTotal: number;
  currency: string;
  /** ERPNext Sales Invoice `status` plus docstate hint. */
  statusLabel: string;
  docstatus: number;
};

function formatSalesInvoiceStatusLabel(full: Record<string, unknown>): string {
  const ds = Number(full.docstatus);
  const st = String(full.status ?? '').trim();
  if (ds === 2) return st ? `${st} · Cancelled` : 'Cancelled';
  if (ds === 0) return st ? `${st} · Draft` : 'Draft';
  return st || 'Submitted';
}

/**
 * Raven “Share to channel” uses `link_doctype` / `link_document` on the message (native ERPNext card in Raven web).
 * This row loads the Supplier Quotation for totals and reuses {@link RavenQuotationDraftCard} for in-chat accept/reject.
 * Sales Invoices are linked with **`custom_quotation`** → Supplier Quotation. When the supplier starts **Approve payment**, we
 * ensure an invoice exists (create + submit if missing), then show a compact strip with invoice name + status.
 */
export const RavenLinkedSupplierQuotationMessage: React.FC<Props> = ({
  sqName,
  billToFrappeUserId,
  supplierSelfServeUx,
  showBuyerActions,
  viewerSupplierDocId,
  handled,
  busy,
  onAccept,
  onReject,
  onSupplierReplyToQuotation,
}) => {
  const enableSupplierUx = !!supplierSelfServeUx;
  const [payload, setPayload] = useState<SourcewaveQuotationDraftPayload | null>(null);
  const [isDraft, setIsDraft] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [quotationSupplierId, setQuotationSupplierId] = useState<string | null>(null);
  const [linkedInvoice, setLinkedInvoice] = useState<LinkedInvoice | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);

  /** Fetch SI linked via `custom_quotation` (no create). */
  const pullLinkedInvoice = useCallback(async (quotationName: string): Promise<LinkedInvoice | null> => {
    const n = quotationName.trim();
    if (!n) return null;
    try {
      const rows = await getERPNextClient().listSalesInvoicesByCustomQuotation(n);
      const nonCancelled = rows.filter((r) => Number(r?.docstatus) !== 2);
      const row =
        nonCancelled.find((r) => Number(r?.docstatus) === 1) ??
        nonCancelled.find((r) => Number(r?.docstatus) === 0) ??
        null;
      if (!row?.name) return null;
      const full = await getERPNextClient().getSalesInvoiceRaw(String(row.name));
      if (!full) return null;
      const rec = full as Record<string, unknown>;
      const out = getERPNextClient().effectiveSalesInvoiceOutstanding(rec);
      const gt = Number(full.grand_total) || 0;
      const ds = full.docstatus != null ? Number(full.docstatus) : 0;
      return {
        name: String(full.name),
        outstanding: Number.isFinite(out) ? Math.max(0, out) : 0,
        grandTotal: Number.isFinite(gt) ? gt : 0,
        currency: String(full.currency || 'GHS').trim() || 'GHS',
        statusLabel: formatSalesInvoiceStatusLabel(rec),
        docstatus: Number.isFinite(ds) ? ds : 0,
      };
    } catch {
      return null;
    }
  }, []);

  const refreshLinkedInvoice = useCallback(
    async (quotationName: string) => {
      setInvoiceBusy(true);
      try {
        const snap = await pullLinkedInvoice(quotationName);
        setLinkedInvoice(snap);
      } finally {
        setInvoiceBusy(false);
      }
    },
    [pullLinkedInvoice]
  );

  useEffect(() => {
    let cancelled = false;
    const name = sqName.trim();
    if (!name) return;
    setPayload(null);
    setLoadError(false);
    setQuotationSupplierId(null);
    (async () => {
      try {
        const doc = await getERPNextClient().getSupplierQuotationByName(name);
        if (cancelled) return;
        if (!doc) {
          setLoadError(true);
          return;
        }
        const docstatus = doc.docstatus != null ? Number(doc.docstatus) : 0;
        setIsDraft(docstatus === 0);
        const sup = String(doc.supplier || '').trim();
        setQuotationSupplierId(sup || null);
        const erpS = String(doc.status || '').trim();
        const wf = String(doc.workflow_state ?? '').trim();
        const txRaw = doc.transaction_date ?? doc.creation;
        const transactionDate = txRaw != null ? String(txRaw).trim() : '';
        const eligible = supplierQuotationDocAllowsChatBuyerReview(doc as Record<string, unknown>);
        setPayload({
          name,
          currency: String(doc.currency || 'USD').trim() || 'USD',
          total: doc.grand_total != null ? Number(doc.grand_total) : 0,
          title:
            String(doc.title || doc.supplier_name || doc.supplier || '').trim() || undefined,
          status: docstatus === 0 ? 'draft' : 'submitted',
          ...(erpS ? { erpnextStatus: erpS } : {}),
          ...(wf ? { workflowState: wf } : {}),
          ...(transactionDate ? { transactionDate } : {}),
          buyerReviewEligible: eligible,
        });
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sqName]);

  /** Load existing invoice for UI strip only — creation happens when supplier starts payment. */
  useEffect(() => {
    const name = sqName.trim();
    if (!name || !payload) return;
    if (payload.status !== 'submitted') {
      setLinkedInvoice(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const snap = await pullLinkedInvoice(name);
        if (!cancelled) setLinkedInvoice(snap);
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [sqName, payload?.status, payload?.name, pullLinkedInvoice]);

  const startPaymentFlow = useCallback(async () => {
    const name = sqName.trim();
    if (!name) return;
    setInvoiceBusy(true);
    try {
      const billTo = String(billToFrappeUserId || '').trim();
      const { invoice, error } = await getERPNextClient().ensureSalesInvoiceForSupplierQuotation(
        name,
        billTo ? { billToFrappeUserId: billTo } : undefined
      );
      if (!invoice) {
        Alert.alert('Invoice', error || 'Could not create or load a sales invoice for this quotation.');
        return;
      }
      const snap = await pullLinkedInvoice(name);
      setLinkedInvoice(snap);
      if (!snap) {
        Alert.alert('Invoice', 'Sales invoice was created but could not be loaded. Try Pay again in a moment.');
        return;
      }
      if (snap.outstanding <= 0.009) {
        Alert.alert(
          'Payment',
          snap.grandTotal > 0
            ? 'This invoice has no outstanding balance (it may already be paid in ERPNext).'
            : 'This invoice has no billable total. Check the sales invoice in ERPNext.'
        );
        return;
      }
      setPayModal(true);
    } catch (e: unknown) {
      Alert.alert('Invoice', e instanceof Error ? e.message : 'Could not prepare the sales invoice.');
    } finally {
      setInvoiceBusy(false);
    }
  }, [pullLinkedInvoice, sqName, billToFrappeUserId]);

  const onConfirmPayment = async (amount: number) => {
    if (!linkedInvoice) return;
    setPaySubmitting(true);
    try {
      await getERPNextClient().recordReceivePaymentAgainstSalesInvoice({
        salesInvoiceName: linkedInvoice.name,
        amount,
      });
      setPayModal(false);
      await refreshLinkedInvoice(sqName.trim());
      Alert.alert('Payment', 'Payment was recorded in ERPNext.');
    } catch (e: unknown) {
      Alert.alert('Payment', e instanceof Error ? e.message : 'Could not record payment.');
    } finally {
      setPaySubmitting(false);
    }
  };

  if (loadError && !payload) {
    return (
      <RavenQuotationDraftCard
        payload={{
          name: sqName.trim(),
          currency: 'USD',
          total: 0,
          title: 'Could not load quotation from ERPNext',
          status: 'draft',
        }}
        showBuyerActions={false}
      />
    );
  }

  if (!payload) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={RavenLight.accent} />
      </View>
    );
  }

  const submitted = !isDraft;
  const displayHandled: 'accepted' | 'rejected' | 'submitted' | null | undefined =
    submitted && handled !== 'accepted' && handled !== 'rejected' ? 'submitted' : handled;
  const viewerSup = (viewerSupplierDocId || '').trim();
  const hideBuyerAsQuotationAuthor =
    viewerSup.length > 0 &&
    !!quotationSupplierId &&
    viewerSup === quotationSupplierId;
  const cardShowBuyer =
    showBuyerActions &&
    !submitted &&
    !hideBuyerAsQuotationAuthor &&
    payload.buyerReviewEligible !== false;

  const approvedForSupplierMenu =
    supplierQuotationWorkflowStateIsApprovedLike(payload.workflowState) ||
    supplierQuotationWorkflowStateIsApprovedLike(payload.erpnextStatus) ||
    handled === 'accepted' ||
    (submitted && displayHandled === 'submitted');

  const showSupplierLongPressMenu =
    enableSupplierUx &&
    viewerSup.length > 0 &&
    quotationSupplierId != null &&
    viewerSup === quotationSupplierId &&
    submitted &&
    handled !== 'rejected' &&
    approvedForSupplierMenu &&
    typeof onSupplierReplyToQuotation === 'function';

  const supplierSeesPaymentRow =
    enableSupplierUx &&
    viewerSup.length > 0 &&
    quotationSupplierId != null &&
    viewerSup === quotationSupplierId &&
    submitted &&
    (linkedInvoice != null || invoiceBusy);

  const showInvoiceStrip =
    submitted &&
    linkedInvoice != null &&
    enableSupplierUx &&
    viewerSup.length > 0 &&
    quotationSupplierId != null &&
    viewerSup === quotationSupplierId;

  const outstanding = linkedInvoice?.outstanding ?? 0;
  const showPaidInFull = supplierSeesPaymentRow && linkedInvoice && outstanding <= 0.009 && linkedInvoice.grandTotal > 0;

  const openSupplierActionsMenu = () => {
    if (!onSupplierReplyToQuotation) return;
    const reply = () => onSupplierReplyToQuotation();
    const pay = () => {
      void startPaymentFlow();
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Reply', 'Confirm payment'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) reply();
          if (idx === 2) pay();
        }
      );
    } else {
      Alert.alert('Quotation', 'What would you like to do?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reply', onPress: reply },
        { text: 'Confirm payment', onPress: pay },
      ]);
    }
  };

  const onQuotationCardLongPress =
    showSupplierLongPressMenu && typeof onSupplierReplyToQuotation === 'function'
      ? openSupplierActionsMenu
      : enableSupplierUx && typeof onSupplierReplyToQuotation === 'function'
        ? () => onSupplierReplyToQuotation()
        : undefined;

  const cardBlock = (
    <>
      <RavenQuotationDraftCard
        payload={payload}
        showBuyerActions={cardShowBuyer}
        handled={displayHandled}
        busy={busy}
        onAccept={cardShowBuyer ? onAccept : undefined}
        onReject={cardShowBuyer ? onReject : undefined}
        onCardLongPress={onQuotationCardLongPress}
      />
      {showInvoiceStrip ? (
        <View style={styles.invoiceStrip} accessibilityLabel={`Sales invoice ${linkedInvoice!.name}, ${linkedInvoice!.statusLabel}`}>
          <Text style={styles.invoiceStripLabel} numberOfLines={1}>
            Sales invoice
          </Text>
          <Text style={styles.invoiceStripValue} numberOfLines={1}>
            {linkedInvoice!.name} · {linkedInvoice!.statusLabel}
          </Text>
        </View>
      ) : null}
      {(supplierSeesPaymentRow || (showSupplierLongPressMenu && invoiceBusy)) &&
        (showSupplierLongPressMenu ? (
          <Pressable onLongPress={openSupplierActionsMenu} delayLongPress={380}>
            <View style={styles.payBar}>
              {invoiceBusy ? (
                <ActivityIndicator color={RavenLight.accent} />
              ) : linkedInvoice ? (
                <Text style={styles.payMeta} numberOfLines={3}>
                  {showPaidInFull
                    ? `${linkedInvoice.name} — paid in full`
                    : `${linkedInvoice.name} · Outstanding ${linkedInvoice.currency} ${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </Text>
              ) : (
                <Text style={styles.payMeta}>Preparing sales invoice…</Text>
              )}
            </View>
          </Pressable>
        ) : (
          <View style={styles.payBar}>
            {invoiceBusy ? (
              <ActivityIndicator color={RavenLight.accent} />
            ) : linkedInvoice ? (
              <Text style={styles.payMeta} numberOfLines={3}>
                {showPaidInFull
                  ? `${linkedInvoice.name} — paid in full`
                  : `${linkedInvoice.name} · Outstanding ${linkedInvoice.currency} ${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Text>
            ) : (
              <Text style={styles.payMeta}>Preparing sales invoice…</Text>
            )}
          </View>
        ))}
      {showSupplierLongPressMenu ? (
        <Pressable onLongPress={openSupplierActionsMenu} delayLongPress={380}>
          <Text style={styles.longPressHint}>Long press quotation to reply or Confirm payment</Text>
        </Pressable>
      ) : null}
    </>
  );

  return (
    <View>
      {cardBlock}

      <SupplierQuotationPaymentModal
        visible={payModal && !!linkedInvoice && outstanding > 0.009}
        currency={linkedInvoice?.currency ?? 'GHS'}
        maxAmount={outstanding}
        loading={paySubmitting}
        onClose={() => !paySubmitting && setPayModal(false)}
        onSubmit={onConfirmPayment}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  loading: {
    minHeight: 88,
    alignSelf: 'stretch',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RavenLight.panel,
    borderRadius: RavenLight.radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  invoiceStrip: {
    marginTop: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: RavenLight.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  invoiceStripLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: RavenLight.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  invoiceStripValue: {
    fontSize: 11,
    fontWeight: '600',
    color: RavenLight.textMuted,
  },
  payBar: {
    marginTop: 8,
    padding: 10,
    borderRadius: RavenLight.radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
    flexDirection: 'row',
    alignItems: 'center',
  },
  payMeta: { flex: 1, fontSize: 12, fontWeight: '600', color: RavenLight.textMuted },
  longPressHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: RavenLight.textSubtle,
    textAlign: 'center',
  },
});
