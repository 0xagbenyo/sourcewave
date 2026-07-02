import { type NavigationAction } from '@react-navigation/native';
import type { TFunction } from 'i18next';
import { LOGISTICS_RAVEN_WORKSPACE_NAME } from '../constants/logisticsRavenWorkspace';
import { fetchRavenWorkspaces, matchRavenWorkspaceRow } from '../services/ravenNativeApi';
import { rootNavigationRef } from '../navigation/rootNavigation';
import { appAlert } from '../services/appAlert';
import { requestSkipSuppliersTabFocusReset } from './suppliersTabFocusReset';
import { buildMainSuppliersTabReset } from './openRavenChatAfterShare';

type Nav = { dispatch: (action: NavigationAction) => void };

function dispatchNav(navigation: Nav, action: NavigationAction): void {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(action);
    return;
  }
  navigation.dispatch(action);
}

/** Resolve the Logistics Raven workspace document `name`. */
export async function resolveLogisticsRavenWorkspaceId(): Promise<string> {
  const rows = await fetchRavenWorkspaces();
  const hit = matchRavenWorkspaceRow(LOGISTICS_RAVEN_WORKSPACE_NAME, rows);
  return String(hit?.name || '').trim();
}

/** Buyer: open Suppliers tab locked to Logistics to pick a logistics company. */
export async function navigateShareDeliveryNoteToLogistics(opts: {
  navigation: Nav;
  deliveryNoteName: string;
  t: TFunction;
}): Promise<void> {
  const dn = opts.deliveryNoteName.trim();
  if (!dn) return;

  const logisticsWsId = await resolveLogisticsRavenWorkspaceId();
  if (!logisticsWsId) {
    appAlert.error(
      opts.t('deliveryNoteShare.title'),
      opts.t('deliveryNoteShare.logisticsWorkspaceMissing')
    );
    return;
  }

  requestSkipSuppliersTabFocusReset();

  dispatchNav(
    opts.navigation,
    buildMainSuppliersTabReset({
      shareDeliveryNoteName: dn,
      openRavenWorkspaceId: logisticsWsId,
    })
  );
}
