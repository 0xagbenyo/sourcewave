import { CommonActions, type NavigationProp } from '@react-navigation/native';
import {
  createDirectMessageChannel,
  getRavenDmPeerUserId,
  listRavenChannelsForSessionUser,
  type RavenChannelRow,
} from '../services/ravenNativeApi';
import { hasFrappeRavenSession, ravenCallFrappeMethod } from '../services/frappeRavenSession';
import { sourcewaveSupportRavenUserId } from '../constants/contactUs';
import { userFacingError } from './userFacingError';
import type { RootStackParamList } from '../types';

type Nav = NavigationProp<RootStackParamList>;

type SupportChatTarget = {
  channelId: string;
  workspaceId?: string;
  peerUserId: string;
};

function dmChannelNameIncludesPeer(channelName: string | undefined, peerUserId: string): boolean {
  const peerLower = peerUserId.trim().toLowerCase();
  const cn = String(channelName || '').trim();
  if (!peerLower || !cn) return false;
  if (cn.includes(' _ ')) {
    return cn
      .split(' _ ')
      .some((part) => part.trim().toLowerCase() === peerLower);
  }
  return cn.toLowerCase() === peerLower || cn.toLowerCase().includes(peerLower);
}

function findDirectMessageWithPeer(
  channels: RavenChannelRow[],
  peerUserId: string,
  viewerEmail: string
): RavenChannelRow | null {
  const peerLower = peerUserId.trim().toLowerCase();
  if (!peerLower) return null;
  for (const c of channels) {
    const peer = String(c.peer_user_id || getRavenDmPeerUserId(c, viewerEmail) || '')
      .trim()
      .toLowerCase();
    if (peer === peerLower) return c;
    if (dmChannelNameIncludesPeer(c.channel_name, peerUserId)) return c;
  }
  return null;
}

/** Resolve the support DM — reuse Raven's get-or-create so an existing Administrator thread is always found. */
async function resolveSupportChatTarget(viewerEmail: string): Promise<SupportChatTarget> {
  const supportUserId = sourcewaveSupportRavenUserId();
  const viewerLower = viewerEmail.toLowerCase();

  if (supportUserId.toLowerCase() === viewerLower) {
    throw new Error('You are signed in as the support account.');
  }

  let channels = await listRavenChannelsForSessionUser(viewerEmail, { enrichProfiles: false });
  const existingDm = findDirectMessageWithPeer(channels, supportUserId, viewerEmail);

  let channelId = String(existingDm?.name || '').trim();
  if (!channelId) {
    channelId = String(await createDirectMessageChannel(supportUserId) || '').trim();
  }
  if (!channelId) {
    throw new Error('Could not start a chat with support.');
  }

  if (!existingDm || existingDm.name !== channelId) {
    channels = await listRavenChannelsForSessionUser(viewerEmail, { enrichProfiles: false });
  }
  const row =
    channels.find((c) => String(c.name || '').trim() === channelId) ??
    findDirectMessageWithPeer(channels, supportUserId, viewerEmail);

  return {
    channelId,
    workspaceId: String(row?.workspace || '').trim() || undefined,
    peerUserId: supportUserId,
  };
}

/** Open SourceWave support chat — always the Administrator DM (existing or new). */
export async function openSupportAdministratorRavenChat(
  navigation: Nav,
  opts?: { sessionEmail?: string | null; onNeedSignIn?: () => void }
): Promise<void> {
  const viewer = String(opts?.sessionEmail || '').trim();
  if (!viewer) {
    opts?.onNeedSignIn?.();
    return;
  }
  if (!hasFrappeRavenSession()) {
    throw new Error('Sign in again to open support chat.');
  }

  const target = await resolveSupportChatTarget(viewer);
  const workspaceId = target.workspaceId?.trim() || '';

  if (workspaceId) {
    try {
      await ravenCallFrappeMethod('raven.api.workspaces.join_workspace', { workspace: workspaceId });
    } catch {
      /* Already a workspace member */
    }
  }

  navigation.dispatch(
    CommonActions.navigate({
      name: 'RavenChatInbox',
      params: {
        openWorkspaceId: workspaceId || undefined,
        openChannelId: target.channelId,
        openPeerUserId: target.peerUserId,
        openChannelNonce: Date.now(),
      },
    })
  );
}

export function supportAdministratorChatErrorMessage(e: unknown): string {
  return userFacingError(e, 'Could not open the support chat. Try again later.');
}
