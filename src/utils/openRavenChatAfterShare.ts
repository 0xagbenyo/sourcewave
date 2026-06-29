import { CommonActions, type NavigationAction } from '@react-navigation/native';
import type { TFunction } from 'i18next';
import {
  fetchRavenWorkspaces,
  listRavenChannelsForSessionUser,
  pickRavenWorkspaceId,
  type RavenChannelRow,
} from '../services/ravenNativeApi';
import { rootNavigationRef } from '../navigation/rootNavigation';
import { appAlert } from '../services/appAlert';
import { requestSkipSuppliersTabFocusReset } from './suppliersTabFocusReset';

type Nav = { dispatch: (action: NavigationAction) => void };

async function resolveWorkspaceForChannel(
  sessionEmail: string | null | undefined,
  channelId: string,
  hintWorkspaceId?: string
): Promise<string> {
  const hinted = (hintWorkspaceId || '').trim();
  if (hinted) return hinted;

  const chId = channelId.trim();
  if (!chId) return '';

  const rows = await listRavenChannelsForSessionUser(sessionEmail ?? null);
  const hit = rows.find((c: RavenChannelRow) => String(c.name || '').trim() === chId);
  const fromChannel = String(hit?.workspace || '').trim();
  if (fromChannel) return fromChannel;

  const workspaces = await fetchRavenWorkspaces();
  const picked = String(pickRavenWorkspaceId(workspaces) || '').trim();
  if (picked) return picked;

  const first = (Array.isArray(workspaces) ? workspaces : [])
    .map((w) => String(w?.name || '').trim())
    .find(Boolean);
  return first || '';
}

/** After sharing a Sales Order in chat, open the supplier DM on the Suppliers tab. */
export async function openRavenSupplierChatAfterSalesOrderShare(opts: {
  navigation: Nav;
  sessionEmail?: string | null;
  channelId: string;
  peerUserId?: string;
  workspaceId?: string;
}): Promise<void> {
  const channelId = opts.channelId.trim();
  if (!channelId) return;

  const workspaceId = await resolveWorkspaceForChannel(
    opts.sessionEmail,
    channelId,
    opts.workspaceId
  );
  const peerUserId = (opts.peerUserId || '').trim();

  requestSkipSuppliersTabFocusReset();

  const suppliersParams: Record<string, string> = {
    openRavenChannelId: channelId,
  };
  if (workspaceId) suppliersParams.openRavenWorkspaceId = workspaceId;
  if (peerUserId) suppliersParams.openRavenPeerUserId = peerUserId;

  const resetAction = CommonActions.reset({
    index: 0,
    routes: [
      {
        name: 'Main',
        state: {
          routes: [
            { name: 'Home' },
            { name: 'Sourcing' },
            { name: 'Categories' },
            { name: 'Suppliers', params: suppliersParams },
            { name: 'Profile' },
          ],
          index: 3,
        },
      },
    ],
  });

  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(resetAction);
    return;
  }
  opts.navigation.dispatch(resetAction);
}

/** After share succeeds, open the supplier chat and show a brief confirmation. */
export function showSalesOrderShareSentAndOpenChat(opts: {
  t: TFunction;
  navigation: Nav;
  sessionEmail?: string | null;
  channelId: string;
  peerUserId?: string;
  workspaceId?: string;
}): void {
  const channelId = opts.channelId.trim();
  if (!channelId) return;

  void openRavenSupplierChatAfterSalesOrderShare({
    navigation: opts.navigation,
    sessionEmail: opts.sessionEmail,
    channelId,
    peerUserId: opts.peerUserId,
    workspaceId: opts.workspaceId,
  });

  appAlert.success(opts.t('salesOrderShare.sharedTitle'), opts.t('salesOrderShare.sharedBody'), [
    { text: opts.t('contactUs.ok') },
  ]);
}
