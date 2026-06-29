import { getERPNextClient } from '../services/erpnext';
import { appAlert as Alert } from '../services/appAlert';
import { userFacingError } from './userFacingError';
import { userFacingFrappeError } from './frappeHttpError';
import {
  notifyQuotationAcceptedInChat,
  notifyQuotationRejectedInChat,
  type ErpDocChatContext,
} from './erpDocChatStatusReply';

export type QuotationBuyerOutcome = 'accepted' | 'rejected';

type ActionCallbacks = {
  onOptimistic: (outcome: QuotationBuyerOutcome) => void;
  onRollback: () => void;
  onSettled?: () => void;
};

/** Buyer accepts a pending supplier quotation (optimistic UI via callbacks). */
export async function acceptSupplierQuotationAsBuyer(
  sqName: string,
  options: {
    billToFrappeUserId?: string | null;
    chat?: ErpDocChatContext;
  } & ActionCallbacks
): Promise<void> {
  const n = sqName.trim();
  if (!n) return;

  options.onOptimistic('accepted');
  const billTo = String(options.billToFrappeUserId || '').trim();

  try {
    await getERPNextClient().submitSupplierQuotation(
      n,
      billTo ? { billToFrappeUserId: billTo } : undefined
    );
    notifyQuotationAcceptedInChat(n, options.chat);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'SALES_INVOICE_AFTER_ACCEPT_FAILED') {
      notifyQuotationAcceptedInChat(n, options.chat);
      Alert.error(
        'Invoice',
        userFacingFrappeError(e, userFacingError(e, 'Quotation accepted but sales invoice could not be created.'))
      );
      return;
    }
    options.onRollback();
    Alert.error('Quotation', userFacingFrappeError(e, userFacingError(e, 'Could not submit.')));
  } finally {
    options.onSettled?.();
  }
}

/** Buyer rejects a pending supplier quotation (optimistic UI via callbacks). */
export async function rejectSupplierQuotationAsBuyer(
  sqName: string,
  options: {
    chat?: ErpDocChatContext;
  } & ActionCallbacks
): Promise<void> {
  const n = sqName.trim();
  if (!n) return;

  options.onOptimistic('rejected');

  try {
    await getERPNextClient().rejectSupplierQuotationDraft(n);
    notifyQuotationRejectedInChat(n, options.chat);
  } catch (e: unknown) {
    options.onRollback();
    Alert.error('Quotation', userFacingFrappeError(e, userFacingError(e, 'Could not reject.')));
  } finally {
    options.onSettled?.();
  }
}
