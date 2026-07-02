import { type NavigationAction } from '@react-navigation/native';
import type { TFunction } from 'i18next';
import { rootNavigationRef } from '../navigation/rootNavigation';
import { requestSkipSuppliersTabFocusReset } from './suppliersTabFocusReset';
import { buildMainSuppliersTabReset } from './openRavenChatAfterShare';
import { confirmSalesOrderShareable } from './salesOrderShareGuard';

type Nav = { dispatch: (action: NavigationAction) => void };

function dispatchNav(navigation: Nav, action: NavigationAction): void {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(action);
    return;
  }
  navigation.dispatch(action);
}

/** Buyer: open Suppliers tab to pick a supplier workspace and share a sales order. */
export async function navigateShareSalesOrderToSuppliers(opts: {
  navigation: Nav;
  salesOrderName: string;
  t: TFunction;
}): Promise<void> {
  const order = opts.salesOrderName.trim();
  if (!order) return;

  const ok = await confirmSalesOrderShareable(
    order,
    opts.t,
    opts.navigation as { navigate: (name: string, params?: object) => void }
  );
  if (!ok) return;

  requestSkipSuppliersTabFocusReset();

  dispatchNav(
    opts.navigation,
    buildMainSuppliersTabReset({
      shareSalesOrderName: order,
    })
  );
}
