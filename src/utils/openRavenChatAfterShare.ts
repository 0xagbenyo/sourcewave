import { CommonActions, type NavigationAction } from '@react-navigation/native';
import type { TFunction } from 'i18next';
import {
  fetchRavenWorkspaces,
  getRavenDmPeerUserId,
  listRavenChannelsForSessionUser,
  matchRavenWorkspaceRow,
  pickRavenWorkspaceId,
  type RavenChannelRow,
} from '../services/ravenNativeApi';
import { LOGISTICS_RAVEN_WORKSPACE_NAME } from '../constants/logisticsRavenWorkspace';
import { rootNavigationRef } from '../navigation/rootNavigation';
import { appAlert } from '../services/appAlert';
import { requestSkipSuppliersTabFocusReset } from './suppliersTabFocusReset';
import { setPendingSuppliersChatOpen } from './ravenPendingSuppliersChatOpen';

type Nav = { dispatch: (action: NavigationAction) => void };

export type RavenChatOpenParams = {
  openChannelId?: string;
  openPeerUserId?: string;
  openWorkspaceId?: string;
  openChannelNonce?: number;
};

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

export async function resolveWorkspaceIdForSuppliersChat(opts: {
  sessionEmail?: string | null;
  channelId: string;
  workspaceId?: string;
}): Promise<string> {
  const hinted = (opts.workspaceId || '').trim();
  if (hinted) return hinted;

  const fromChannel = await resolveWorkspaceForChannel(opts.sessionEmail, opts.channelId, hinted);
  if (fromChannel.trim()) return fromChannel.trim();

  const rows = await fetchRavenWorkspaces();
  const logistics = matchRavenWorkspaceRow(LOGISTICS_RAVEN_WORKSPACE_NAME, rows);
  if (logistics?.name) return String(logistics.name).trim();

  const picked = String(pickRavenWorkspaceId(rows) || '').trim();
  if (picked) return picked;

  return (
    (Array.isArray(rows) ? rows : [])
      .map((w) => String(w?.name || '').trim())
      .find(Boolean) || ''
  );
}

function resolvePeerForChannel(
  channelId: string,
  sessionEmail: string | null | undefined,
  channelRows: RavenChannelRow[] | undefined,
  hintPeerUserId?: string
): string {
  const hinted = (hintPeerUserId || '').trim();
  if (hinted) return hinted;
  const hit = channelRows?.find((c) => String(c.name || '').trim() === channelId.trim());
  return hit ? String(getRavenDmPeerUserId(hit, sessionEmail) || '').trim() : '';
}

function dispatchNav(navigation: Nav, action: NavigationAction): void {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(action);
    return;
  }
  navigation.dispatch(action);
}

function buildInboxOpenParams(
  channelId: string,
  workspaceId: string,
  peerUserId: string
): RavenChatOpenParams {
  return {
    openChannelId: channelId,
    ...(workspaceId ? { openWorkspaceId: workspaceId } : {}),
    ...(peerUserId ? { openPeerUserId: peerUserId } : {}),
    openChannelNonce: Date.now(),
  };
}

/** Open a DM/channel on the header Messages inbox (buyer / general). */
export async function openRavenChatInboxChannel(opts: {
  navigation: Nav;
  sessionEmail?: string | null;
  channelId: string;
  peerUserId?: string;
  workspaceId?: string;
  channelRows?: RavenChannelRow[];
}): Promise<void> {
  const channelId = opts.channelId.trim();
  if (!channelId) return;

  const workspaceId = await resolveWorkspaceForChannel(
    opts.sessionEmail,
    channelId,
    opts.workspaceId
  );
  const peerUserId = resolvePeerForChannel(
    channelId,
    opts.sessionEmail ?? null,
    opts.channelRows,
    opts.peerUserId
  );

  dispatchNav(
    opts.navigation,
    CommonActions.navigate({
      name: 'RavenChatInbox',
      params: buildInboxOpenParams(channelId, workspaceId, peerUserId),
    })
  );
}

/** Suppliers tab index in `MainTabNavigator` (Home, Sourcing, Categories, Suppliers, Profile). */
const MAIN_SUPPLIERS_TAB_INDEX = 3;

export function buildMainSuppliersTabReset(suppliersParams: Record<string, string>) {
  return CommonActions.reset({
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
          index: MAIN_SUPPLIERS_TAB_INDEX,
        },
      },
    ],
  });
}

function buildSuppliersChatResetAction(suppliersParams: Record<string, string>) {
  return buildMainSuppliersTabReset(suppliersParams);
}

function dispatchRootResetToSuppliersChat(
  navigation: Nav | undefined,
  suppliersParams: Record<string, string>
): void {
  const action = buildSuppliersChatResetAction(suppliersParams);
  if (navigation) {
    dispatchNav(navigation, action);
    return;
  }
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(action);
    return;
  }
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.dispatch(action);
      clearInterval(timer);
      return;
    }
    if (attempts >= 24) clearInterval(timer);
  }, 50);
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

  const peerUserId = (opts.peerUserId || '').trim();

  requestSkipSuppliersTabFocusReset();

  const workspaceId = await resolveWorkspaceIdForSuppliersChat({
    sessionEmail: opts.sessionEmail,
    channelId,
    workspaceId: opts.workspaceId,
  });

  setPendingSuppliersChatOpen({
    ...(workspaceId ? { workspaceId } : {}),
    channelId,
    ...(peerUserId ? { peerUserId } : {}),
  });

  const suppliersParams: Record<string, string> = {
    openRavenChannelId: channelId,
  };
  if (workspaceId) suppliersParams.openRavenWorkspaceId = workspaceId;
  if (peerUserId) suppliersParams.openRavenPeerUserId = peerUserId;

  dispatchRootResetToSuppliersChat(opts.navigation, suppliersParams);
}

/** Supplier portal: reset to Chat tab and open the destination channel. */
export async function openSupplierPortalMessagesChannel(opts: {
  navigation: Nav;
  sessionEmail?: string | null;
  channelId: string;
  peerUserId?: string;
  workspaceId?: string;
  channelRows?: RavenChannelRow[];
}): Promise<void> {
  const channelId = opts.channelId.trim();
  if (!channelId) return;

  const workspaceId = await resolveWorkspaceForChannel(
    opts.sessionEmail,
    channelId,
    opts.workspaceId
  );
  const peerUserId = resolvePeerForChannel(
    channelId,
    opts.sessionEmail ?? null,
    opts.channelRows,
    opts.peerUserId
  );

  const messagesParams = buildInboxOpenParams(channelId, workspaceId, peerUserId);

  dispatchNav(
    opts.navigation,
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'SupplierTabs',
          state: {
            routes: [
              { name: 'SupplierHome' },
              { name: 'SupplierMessages', params: messagesParams },
              { name: 'SupplierProfile' },
            ],
            index: 1,
          },
        },
      ],
    })
  );
}

/** After sharing a Delivery Note in chat, open the logistics DM on the Suppliers tab. */
export async function showDeliveryNoteShareSentAndOpenChat(opts: {
  t: TFunction;
  navigation: Nav;
  sessionEmail?: string | null;
  channelId: string;
  peerUserId?: string;
  workspaceId?: string;
}): Promise<void> {
  const channelId = opts.channelId.trim();
  if (!channelId) return;

  await openRavenSupplierChatAfterSalesOrderShare({
    navigation: opts.navigation,
    sessionEmail: opts.sessionEmail,
    channelId,
    peerUserId: opts.peerUserId,
    workspaceId: opts.workspaceId,
  });

  appAlert.success(opts.t('deliveryNoteShare.sharedTitle'), opts.t('deliveryNoteShare.sharedBody'), [
    { text: opts.t('contactUs.ok') },
  ]);
}

/** After share succeeds, open the supplier chat and show a brief confirmation. */
export async function showSalesOrderShareSentAndOpenChat(opts: {
  t: TFunction;
  navigation: Nav;
  sessionEmail?: string | null;
  channelId: string;
  peerUserId?: string;
  workspaceId?: string;
}): Promise<void> {
  const channelId = opts.channelId.trim();
  if (!channelId) return;

  await openRavenSupplierChatAfterSalesOrderShare({
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

/** After a supplier shares a quotation in chat, open that conversation on the Chat tab. */
export function showQuotationShareSentAndOpenChat(opts: {
  navigation: Nav;
  sessionEmail?: string | null;
  channelId: string;
  channelRows?: RavenChannelRow[];
  peerUserId?: string;
  workspaceId?: string;
  title?: string;
  body?: string;
}): void {
  const channelId = opts.channelId.trim();
  if (!channelId) return;

  void openSupplierPortalMessagesChannel({
    navigation: opts.navigation,
    sessionEmail: opts.sessionEmail,
    channelId,
    channelRows: opts.channelRows,
    peerUserId: opts.peerUserId,
    workspaceId: opts.workspaceId,
  });

  appAlert.success(
    opts.title ?? 'Shared',
    opts.body ?? 'Your quotation link was sent in that conversation.',
    [{ text: 'OK' }]
  );
}

/** Pick the last destination when forwarding to several chats. */
export function primaryChannelIdAfterShare(channelIds: string[]): string {
  for (let i = channelIds.length - 1; i >= 0; i--) {
    const id = String(channelIds[i] || '').trim();
    if (id) return id;
  }
  return '';
}
