import { useCallback, useState } from 'react';
import {
  supplierQuotationDocAllowsChatBuyerReview,
  supplierQuotationStatusLabelAndKind,
  type SupplierQuotationUiStatusKind,
} from '../utils/chatQuotationDraftMessage';
import {
  acceptSupplierQuotationAsBuyer,
  rejectSupplierQuotationAsBuyer,
  type QuotationBuyerOutcome,
} from '../utils/supplierQuotationBuyerReviewActions';
import type { ErpDocChatContext } from '../utils/erpDocChatStatusReply';

export function useSupplierQuotationBuyerReview(
  sqName: string,
  options?: {
    billToFrappeUserId?: string | null;
    chat?: ErpDocChatContext;
    onDocRefresh?: () => void | Promise<void>;
  }
) {
  const [outcome, setOutcome] = useState<QuotationBuyerOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const canReviewDoc = useCallback(
    (doc: Record<string, unknown> | null | undefined) => {
      if (outcome) return false;
      return supplierQuotationDocAllowsChatBuyerReview(doc);
    },
    [outcome]
  );

  const displayStatus = useCallback(
    (doc: Record<string, unknown> | null | undefined): { label: string; kind: SupplierQuotationUiStatusKind } => {
      if (outcome === 'accepted') {
        const wf = String(doc?.workflow_state ?? '').trim();
        return { label: wf || 'Accepted', kind: 'approved' };
      }
      if (outcome === 'rejected') {
        const wf = String(doc?.workflow_state ?? '').trim();
        return { label: wf || 'Rejected', kind: 'rejected' };
      }
      return supplierQuotationStatusLabelAndKind(doc);
    },
    [outcome]
  );

  const accept = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await acceptSupplierQuotationAsBuyer(sqName, {
      billToFrappeUserId: options?.billToFrappeUserId,
      chat: options?.chat,
      onOptimistic: setOutcome,
      onRollback: () => setOutcome(null),
      onSettled: async () => {
        setBusy(false);
        await options?.onDocRefresh?.();
      },
    });
  }, [sqName, busy, options?.billToFrappeUserId, options?.chat, options?.onDocRefresh]);

  const reject = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await rejectSupplierQuotationAsBuyer(sqName, {
      chat: options?.chat,
      onOptimistic: setOutcome,
      onRollback: () => setOutcome(null),
      onSettled: async () => {
        setBusy(false);
        await options?.onDocRefresh?.();
      },
    });
  }, [sqName, busy, options?.chat, options?.onDocRefresh]);

  return { outcome, busy, accept, reject, canReviewDoc, displayStatus };
}
