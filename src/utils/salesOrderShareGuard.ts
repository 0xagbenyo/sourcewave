import type { TFunction } from 'i18next';
import { getERPNextClient } from '../services/erpnext';
import { userFacingError } from './userFacingError';
import { appAlert as Alert } from '../services/appAlert';

type Nav = { navigate: (name: string, params?: object) => void };

function isAlreadySubmittedError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  if (code === 'SALES_ORDER_ALREADY_SUBMITTED') return true;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return msg.includes('SALES_ORDER_ALREADY_SUBMITTED') || /already submitted/i.test(msg);
}

/** Returns true when the order can be shared; otherwise shows an alert and returns false. */
export async function confirmSalesOrderShareable(
  orderName: string,
  t: TFunction,
  navigation?: Nav
): Promise<boolean> {
  const n = orderName.trim();
  if (!n) return false;
  try {
    await getERPNextClient().assertSalesOrderShareable(n);
    return true;
  } catch (e: unknown) {
    if (isAlreadySubmittedError(e)) {
      Alert.alert(t('salesOrderShare.alreadySubmittedTitle'), t('salesOrderShare.alreadySubmittedBody'), [
        { text: t('contactUs.ok'), style: 'cancel' },
        navigation
          ? {
              text: t('salesOrderShare.createNew'),
              onPress: () => navigation.navigate('SourcingRequest'),
            }
          : { text: t('salesOrderShare.createNew'), style: 'default' },
      ]);
      return false;
    }
    Alert.alert(t('salesOrderShare.title'), userFacingError(e, t('salesOrderShare.shareFailed')));
    return false;
  }
}
