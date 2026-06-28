/** Prefix on Raven message `text` for in-chat supplier quotations (draft in ERPNext until buyer submits). */
export const SOURCEWAVE_QUOTATION_DRAFT_PREFIX = '[SOURCEWAVE_QUOTATION_DRAFT]';

export type SourcewaveQuotationDraftPayload = {
  /** Supplier Quotation `name` */
  name: string;
  currency: string;
  total: number;
  title?: string;
  /** `draft` = ERPNext `docstatus === 0`; `submitted` = submitted document (`docstatus` 1+). */
  status: 'draft' | 'submitted';
  /** ERPNext `status` when loaded from API (can still read “Draft” while the doc is submitted on some sites). */
  erpnextStatus?: string;
  /** ERPNext `workflow_state` when loaded from API (e.g. Pending). */
  workflowState?: string;
  /** ERPNext `transaction_date` (or `creation`) for display in chat. */
  transactionDate?: string;
  /**
   * From linked Supplier Quotation load: when `false`, hide buyer Accept/Reject (workflow not in a pending-review state).
   * Omitted / `true` = eligible (legacy drafts with no workflow, or text-draft messages).
   */
  buyerReviewEligible?: boolean;
};

export function buildQuotationDraftChatText(payload: SourcewaveQuotationDraftPayload): string {
  const body: SourcewaveQuotationDraftPayload = {
    name: String(payload.name || '').trim(),
    currency: String(payload.currency || 'USD').trim() || 'USD',
    total: Number(payload.total) || 0,
    title: payload.title?.trim() || undefined,
    status: 'draft',
  };
  return `${SOURCEWAVE_QUOTATION_DRAFT_PREFIX}${JSON.stringify(body)}`;
}

export function tryParseQuotationDraftFromMessage(text: string | undefined | null): SourcewaveQuotationDraftPayload | null {
  const raw = (text || '').trim();
  if (!raw.startsWith(SOURCEWAVE_QUOTATION_DRAFT_PREFIX)) return null;
  const jsonPart = raw.slice(SOURCEWAVE_QUOTATION_DRAFT_PREFIX.length).trim();
  try {
    const o = JSON.parse(jsonPart) as Record<string, unknown>;
    const name = String(o.name || '').trim();
    if (!name) return null;
    const currency = String(o.currency || 'USD').trim() || 'USD';
    const total = Number(o.total);
    if (!Number.isFinite(total)) return null;
    const title = o.title != null ? String(o.title).trim() : undefined;
    const docstatusRaw = o.docstatus;
    const docstatus = docstatusRaw != null ? Number(docstatusRaw) : NaN;
    const status: 'draft' | 'submitted' =
      o.status === 'submitted' || (Number.isFinite(docstatus) && docstatus !== 0) ? 'submitted' : 'draft';
    const erpnextStatus = o.erpnextStatus != null ? String(o.erpnextStatus).trim() : undefined;
    const workflowState =
      o.workflowState != null
        ? String(o.workflowState).trim()
        : o.workflow_state != null
          ? String(o.workflow_state).trim()
          : undefined;
    const buyerReviewEligible =
      o.buyerReviewEligible === false ? false : o.buyerReviewEligible === true ? true : undefined;
    const transactionDateRaw = o.transactionDate ?? o.transaction_date ?? o.creation;
    const transactionDate =
      transactionDateRaw != null && String(transactionDateRaw).trim()
        ? String(transactionDateRaw).trim()
        : undefined;
    return {
      name,
      currency,
      total,
      title,
      status,
      ...(erpnextStatus ? { erpnextStatus } : {}),
      ...(workflowState ? { workflowState } : {}),
      ...(transactionDate ? { transactionDate } : {}),
      ...(buyerReviewEligible !== undefined ? { buyerReviewEligible } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * True when ERPNext **`workflow_state`** indicates the doc is in a buyer-review / pending-approval style step.
 * Document **`status`** is not used here — only workflow (single source of truth when the site runs a workflow).
 */
export function supplierQuotationWorkflowStateAllowsBuyerReview(workflowState: string | null | undefined): boolean {
  const w = String(workflowState ?? '').trim().toLowerCase();
  if (!w) return false;
  return w === 'pending' || w.includes('pending') || w.includes('awaiting');
}

/** Workflow / status text is clearly a rejected step. */
export function supplierQuotationWorkflowStateIsRejectedLike(workflowState: string | null | undefined): boolean {
  const w = String(workflowState ?? '').trim().toLowerCase();
  if (!w) return false;
  return w.includes('reject') || w.includes('cancelled') || w.includes('canceled');
}

/**
 * Workflow / status text looks like an approved or completed step (green in chat UI).
 * Checked after pending and rejected classifiers.
 */
export function supplierQuotationWorkflowStateIsApprovedLike(workflowState: string | null | undefined): boolean {
  const s = String(workflowState ?? '').trim().toLowerCase();
  if (!s) return false;
  if (supplierQuotationWorkflowStateIsRejectedLike(workflowState)) return false;
  if (supplierQuotationWorkflowStateAllowsBuyerReview(workflowState)) return false;
  if (/\bunapproved\b/.test(s) || /\bnot\s+approved\b/.test(s) || /\bnot\s+accepted\b/.test(s)) return false;
  return (
    /\bapproved\b/.test(s) ||
    /\baccepted\b/.test(s) ||
    /\bordered\b/.test(s) ||
    /\bcompleted\b/.test(s) ||
    /\bwon\b/.test(s)
  );
}

export type SupplierQuotationUiStatusKind = 'rejected' | 'pending' | 'approved' | 'neutral';

/** Display label for list, detail preview, etc. Prefers `workflow_state` when set. */
export function supplierQuotationStatusLabelAndKind(
  doc: Record<string, unknown> | null | undefined
): { label: string; kind: SupplierQuotationUiStatusKind } {
  if (!doc) return { label: '—', kind: 'neutral' };
  const wf = String(doc.workflow_state ?? '').trim();
  if (wf) {
    if (supplierQuotationWorkflowStateIsRejectedLike(wf)) return { label: wf, kind: 'rejected' };
    if (supplierQuotationWorkflowStateAllowsBuyerReview(wf)) return { label: wf, kind: 'pending' };
    if (supplierQuotationWorkflowStateIsApprovedLike(wf)) return { label: wf, kind: 'approved' };
    return { label: wf, kind: 'neutral' };
  }
  const ds = doc.docstatus != null ? Number(doc.docstatus) : 0;
  if (Number.isFinite(ds) && ds === 0) return { label: 'Draft', kind: 'neutral' };
  const st = String(doc.status ?? '').trim();
  if (st) {
    const sl = st.toLowerCase();
    if (sl.includes('reject') || sl.includes('cancel')) return { label: st, kind: 'rejected' };
    if (sl === 'pending' || sl.includes('pending') || sl.includes('await')) return { label: st, kind: 'pending' };
    if (supplierQuotationWorkflowStateIsApprovedLike(st)) return { label: st, kind: 'approved' };
    return { label: st, kind: 'neutral' };
  }
  return { label: 'Submitted', kind: 'neutral' };
}

/**
 * Whether the buyer should see in-chat Accept / Reject for this Supplier Quotation document.
 * - Submitted docs (`docstatus !== 0`): never.
 * - If **`workflow_state`** is set: **only** {@link supplierQuotationWorkflowStateAllowsBuyerReview} — `doc.status` is ignored.
 * - If **`workflow_state`** is empty (no workflow on the doctype or not yet set): fall back to **`status`** pending-like, else allow (legacy drafts).
 */
/** Supplier may edit this draft quotation in-app (same document, not yet accepted). */
export function supplierQuotationAllowsSupplierEdit(doc: Record<string, unknown> | null | undefined): boolean {
  if (!doc) return false;
  const ds = doc.docstatus != null ? Number(doc.docstatus) : 0;
  if (!Number.isFinite(ds) || ds !== 0) return false;
  const wf = String(doc.workflow_state ?? '').trim();
  if (wf && supplierQuotationWorkflowStateIsApprovedLike(wf)) return false;
  if (wf && supplierQuotationWorkflowStateIsRejectedLike(wf)) return false;
  const st = String(doc.status ?? '').trim().toLowerCase();
  if (st.includes('reject') || st.includes('cancel')) return false;
  return true;
}

/** Rejected quotation — supplier creates a new quote against the same order (original is no longer editable). */
export function supplierQuotationAllowsSupplierResend(doc: Record<string, unknown> | null | undefined): boolean {
  if (!doc) return false;
  const ds = doc.docstatus != null ? Number(doc.docstatus) : 0;
  if (!Number.isFinite(ds)) return false;
  const wf = String(doc.workflow_state ?? '').trim();
  const st = String(doc.status ?? '').trim().toLowerCase();
  const rejected =
    (wf.length > 0 && supplierQuotationWorkflowStateIsRejectedLike(wf)) ||
    st.includes('reject') ||
    st.includes('cancel');
  if (!rejected) return false;
  // Draft, submitted, or cancelled rejections — supplier always creates a new quotation.
  return ds === 0 || ds === 1 || ds === 2;
}

export function supplierQuotationDocAllowsChatBuyerReview(doc: Record<string, unknown> | null | undefined): boolean {
  if (!doc) return false;
  const ds = doc.docstatus != null ? Number(doc.docstatus) : 0;
  if (!Number.isFinite(ds) || ds !== 0) return false;
  const wf = String(doc.workflow_state ?? '').trim();
  if (wf.length > 0) {
    return supplierQuotationWorkflowStateAllowsBuyerReview(wf);
  }
  const st = String(doc.status ?? '').trim();
  if (st.length > 0) {
    const s = st.toLowerCase();
    if (s === 'pending' || s.includes('pending')) return true;
  }
  return true;
}
