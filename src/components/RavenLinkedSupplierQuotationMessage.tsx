import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
  Pressable,
} from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RavenQuotationDraftCard } from './RavenQuotationDraftCard';
import { SupplierQuotationPaymentModal } from './SupplierQuotationPaymentModal';
import { getERPNextClient } from '../services/erpnext';
import { userFacingError } from '../utils/userFacingError';
import type { SourcewaveQuotationDraftPayload } from '../utils/chatQuotationDraftMessage';
import {
  supplierQuotationDocAllowsChatBuyerReview,
  supplierQuotationAllowsSupplierResend,
  supplierQuotationWorkflowStateIsApprovedLike,
} from '../utils/chatQuotationDraftMessage';
import { RavenLight } from '../constants/ravenLightTheme';
import { useUserSession } from '../context/UserContext';
import { navigateToSalesInvoiceDetail } from '../utils/erpDocumentNavigation';
import type { RootStackParamList } from '../types';
import { notifyErpDocStatusInChat } from '../utils/erpDocChatStatusReply';

type Props = {
  sqName: string;
  /**
   * Frappe **`User.name`** / email for the **customer receiving the quotation** (the buying party), **not**
   * the supplier who posted the Raven message. Resolves **Customer** via portal user / email lookup.
   * Omit when the viewer is the supplier collecting payment — then ERP uses **`custom_bill_to_customer`** /
   * **`customer`** on the Supplier Quotation (or env).
   */
  billToFrappeUserId?: string | null;
  /** Raven channel when this quotation card is shown in chat. */
  ravenChannelId?: string;
  /** Raven message id of the original quotation share (reply target). */
  linkMessageId?: string;
  /**
   * Supplier-only: payment row + long-press Reply / Approve payment when the linked quotation belongs to the signed-in supplier.
   */
  supplierSelfServeUx?: boolean;
  /** Supplier: register payment handler for parent message long-press menu. */
  registerSqPaymentAction?: (sqName: string, handler: (() => void) | null) => void;
  /** Long-press on quotation card / supplier rows (opens message action sheet). */
  onMessageLongPress?: () => void;
  showBuyerActions: boolean;
  /** ERPNext `Supplier.name` for the signed-in portal user — when it matches the quotation’s `supplier`, hide buyer Accept/Reject (Raven `owner` may not match session after API post). */
  viewerSupplierDocId?: string | null;
  handled?: 'accepted' | 'rejected' | null;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
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
  ravenChannelId,
  linkMessageId,
  supplierSelfServeUx,
  showBuyerActions,
  viewerSupplierDocId,
  handled,
  busy,
  onAccept,
  onReject,
  registerSqPaymentAction,
  onMessageLongPress,
}) => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const isSupplierPortal = user?.appMode === 'supplier' || !!user?.supplierId?.trim();
  const enableSupplierUx = !!supplierSelfServeUx;
  const [payload, setPayload] = useState<SourcewaveQuotationDraftPayload | null>(null);
  const [isDraft, setIsDraft] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [quotationSupplierId, setQuotationSupplierId] = useState<string | null>(null);
  const [supplierResendEligible, setSupplierResendEligible] = useState(false);
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
    setSupplierResendEligible(false);
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
        setSupplierResendEligible(supplierQuotationAllowsSupplierResend(doc as Record<string, unknown>));
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

  useEffect(() => {
    if (!handled) return;
    if (handled === 'accepted') {
      setIsDraft(false);
      setPayload((prev) =>
        prev
          ? {
              ...prev,
              status: 'submitted',
              buyerReviewEligible: false,
              workflowState: prev.workflowState || 'Accepted',
            }
          : prev
      );
    } else if (handled === 'rejected') {
      setPayload((prev) =>
        prev
          ? {
              ...prev,
              buyerReviewEligible: false,
              workflowState: prev.workflowState || 'Rejected',
              erpnextStatus: prev.erpnextStatus || 'Rejected',
            }
          : prev
      );
    }
  }, [handled]);

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
        Alert.error('Invoice', error || 'Could not create or load a sales invoice for this quotation.');
        return;
      }
      const snap = await pullLinkedInvoice(name);
      setLinkedInvoice(snap);
      if (!snap) {
        Alert.error('Invoice', 'Sales invoice was created but could not be loaded. Try Pay again in a moment.');
        return;
      }
      if (snap.outstanding <= 0.009) {
        Alert.alert(
          'Payment',
          snap.grandTotal > 0
            ? 'This invoice has no outstanding balance—it may already be paid.'
            : 'This invoice has no amount due. Contact support if you expected a charge.'
        );
        return;
      }
      setPayModal(true);
    } catch (e: unknown) {
      Alert.error('Invoice', userFacingError(e, 'Could not prepare the sales invoice.'));
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
      const cur = linkedInvoice.currency.trim() || 'GHS';
      const amtLabel = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      notifyErpDocStatusInChat({
        linkDoctype: 'Sales Invoice',
        linkDocument: linkedInvoice.name,
        caption: `Payment of ${cur} ${amtLabel} recorded.`,
        ravenChannelId,
        linkMessageId,
        sessionEmail: user?.email ?? null,
        fallbackLink: { linkDoctype: 'Supplier Quotation', linkDocument: sqName.trim() },
      });
      Alert.success('Payment', 'Payment recorded successfully.');
    } catch (e: unknown) {
      Alert.error('Payment', userFacingError(e, 'Could not record payment.'));
    } finally {
      setPaySubmitting(false);
    }
  };

  const openLinkedInvoice = useCallback(() => {
    if (!linkedInvoice?.name) return;
    try {
      navigateToSalesInvoiceDetail(
        navigation as { navigate: (n: string, p?: object) => void },
        linkedInvoice.name,
        isSupplierPortal
      );
    } catch (e: unknown) {
      Alert.error('Invoice', userFacingError(e, 'Could not open this invoice.'));
    }
  }, [navigation, linkedInvoice?.name, isSupplierPortal]);

  const onReviseResendQuotation = useCallback(() => {
    const n = sqName.trim();
    if (!n) return;
    try {
      (navigation as { navigate: (screen: keyof RootStackParamList, params?: object) => void }).navigate(
        'SupplierQuotationCompose',
        {
          resendFromQuotation: n,
          ...(ravenChannelId ? { ravenChannelId } : {}),
          ...(linkMessageId ? { linkMessageId } : {}),
        }
      );
    } catch (e: unknown) {
      Alert.error('Quotation', userFacingError(e, 'Could not open quotation editor.'));
    }
  }, [navigation, sqName, ravenChannelId, linkMessageId]);

  useEffect(() => {
    if (!registerSqPaymentAction) return;
    const n = sqName.trim();
    if (!n) return;

    if (!payload || loadError) {
      registerSqPaymentAction(n, null);
      return () => registerSqPaymentAction(n, null);
    }

    const submitted = !isDraft;
    const viewerSup = (viewerSupplierDocId || '').trim();
    const showPay =
      enableSupplierUx &&
      viewerSup.length > 0 &&
      quotationSupplierId != null &&
      viewerSup === quotationSupplierId &&
      submitted &&
      handled !== 'rejected';

    if (showPay) {
      registerSqPaymentAction(n, () => {
        void startPaymentFlow();
      });
    } else {
      registerSqPaymentAction(n, null);
    }
    return () => registerSqPaymentAction(n, null);
  }, [
    registerSqPaymentAction,
    sqName,
    payload,
    loadError,
    isDraft,
    enableSupplierUx,
    viewerSupplierDocId,
    quotationSupplierId,
    handled,
    startPaymentFlow,
  ]);

  if (loadError && !payload) {
    return (
      <RavenQuotationDraftCard
        payload={{
          name: sqName.trim(),
          currency: 'USD',
          total: 0,
          title: 'Could not load quotation',
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
    !handled &&
    !submitted &&
    !hideBuyerAsQuotationAuthor &&
    payload.buyerReviewEligible !== false;

  const approvedForSupplierMenu =
    supplierQuotationWorkflowStateIsApprovedLike(payload.workflowState) ||
    supplierQuotationWorkflowStateIsApprovedLike(payload.erpnextStatus) ||
    handled === 'accepted' ||
    (submitted && displayHandled === 'submitted');

  const showSupplierResend =
    enableSupplierUx &&
    viewerSup.length > 0 &&
    quotationSupplierId != null &&
    viewerSup === quotationSupplierId &&
    (supplierResendEligible || handled === 'rejected');

  const supplierSeesPaymentRow =
    enableSupplierUx &&
    viewerSup.length > 0 &&
    quotationSupplierId != null &&
    viewerSup === quotationSupplierId &&
    submitted &&
    (linkedInvoice != null || invoiceBusy);

  const showInvoiceStrip = submitted && linkedInvoice != null;

  const outstanding = linkedInvoice?.outstanding ?? 0;
  const showPaidInFull = supplierSeesPaymentRow && linkedInvoice && outstanding <= 0.009 && linkedInvoice.grandTotal > 0;

  const cardBlock = (
    <>
      <RavenQuotationDraftCard
        payload={payload}
        showBuyerActions={cardShowBuyer}
        handled={displayHandled}
        busy={busy}
        onAccept={cardShowBuyer ? onAccept : undefined}
        onReject={cardShowBuyer ? onReject : undefined}
        onCardLongPress={onMessageLongPress}
      />
      {showSupplierResend ? (
        <Pressable
          onPress={onReviseResendQuotation}
          onLongPress={onMessageLongPress}
          delayLongPress={380}
          style={({ pressed }) => [styles.resendBtn, pressed && styles.resendBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Revise and send a new quotation"
        >
          <Ionicons name="refresh-outline" size={16} color={RavenLight.accent} />
          <Text style={styles.resendBtnText}>Revise & resend</Text>
        </Pressable>
      ) : null}
      {showInvoiceStrip ? (
        <Pressable
          onPress={openLinkedInvoice}
          onLongPress={onMessageLongPress}
          delayLongPress={380}
          style={({ pressed }) => [styles.invoiceStrip, pressed && styles.invoiceStripPressed]}
          accessibilityRole="button"
          accessibilityLabel={`View sales invoice ${linkedInvoice!.name}`}
        >
          <Text style={styles.invoiceStripLabel} numberOfLines={1}>
            Sales invoice
          </Text>
          <View style={styles.invoiceStripRow}>
            <Text style={styles.invoiceStripValue} numberOfLines={1}>
              {linkedInvoice!.name} · {linkedInvoice!.statusLabel}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={RavenLight.accent} />
          </View>
        </Pressable>
      ) : null}
      {(supplierSeesPaymentRow || invoiceBusy) ? (
        <Pressable
          onLongPress={onMessageLongPress}
          delayLongPress={380}
          style={styles.payBar}
          disabled={!onMessageLongPress}
        >
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
    minHeight: 80,
    alignSelf: 'stretch',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RavenLight.panel,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  invoiceStrip: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: RavenLight.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  invoiceStripPressed: { opacity: 0.85 },
  invoiceStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
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
  resendBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RavenLight.radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.accent,
    backgroundColor: RavenLight.accentSoft,
  },
  resendBtnPressed: { opacity: 0.85 },
  resendBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: RavenLight.accent,
  },
});
