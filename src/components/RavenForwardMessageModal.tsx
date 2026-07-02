import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from 'react-native';
import { Colors } from '../constants/colors';
import { RavenShareToContactPicker } from './RavenShareToContactPicker';
import {
  forwardRavenMessage,
  getRavenDmPeerUserId,
  listRavenChannelsForSessionUser,
  type RavenChannelRow,
  type RavenForwardReceiver,
  type RavenMessageRow,
  type RavenUserProfileMap,
} from '../services/ravenNativeApi';
import { appAlert as Alert } from '../services/appAlert';
import { userFacingError } from '../utils/userFacingError';

function isDmChannel(c: RavenChannelRow): boolean {
  return !!c.is_direct_message || String(c.type || '').trim().toLowerCase() === 'direct';
}

function channelToForwardReceiver(
  channel: RavenChannelRow,
  currentUserEmail?: string | null
): RavenForwardReceiver | null {
  if (isDmChannel(channel)) {
    const peer = getRavenDmPeerUserId(channel, currentUserEmail);
    if (!peer) return null;
    return { name: peer, type: 'User' };
  }
  const chType = String(channel.type || 'Private').trim() || 'Private';
  return { name: String(channel.name || '').trim(), type: chType };
}

function forwardPreviewText(message: RavenMessageRow | null): string {
  if (!message) return '';
  const text = String(message.text || message.content || '').trim();
  if (text) return text;
  const type = String(message.message_type || '').toLowerCase();
  if (type === 'image') return 'Photo';
  if (type === 'file') return 'File';
  if (type === 'poll') return 'Poll';
  return 'Message';
}

type Props = {
  visible: boolean;
  message: RavenMessageRow | null;
  channels: RavenChannelRow[];
  currentUserEmail?: string | null;
  userProfiles?: RavenUserProfileMap;
  onClose: () => void;
  /** Called after a successful forward — parent can switch/open the destination chat. */
  onSent?: (channelIds: string[]) => void;
};

export const RavenForwardMessageModal: React.FC<Props> = ({
  visible,
  message,
  channels,
  currentUserEmail,
  userProfiles,
  onClose,
  onSent,
}) => {
  const [sending, setSending] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [sessionChannels, setSessionChannels] = useState<RavenChannelRow[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  const channelPool = sessionChannels.length > 0 ? sessionChannels : channels;

  useEffect(() => {
    if (!visible) {
      setSelectedChannelIds([]);
      setSessionChannels([]);
      setLoadingChannels(false);
      setSending(false);
      return;
    }
    let cancelled = false;
    setLoadingChannels(true);
    void (async () => {
      try {
        const rows = await listRavenChannelsForSessionUser(currentUserEmail ?? null);
        if (!cancelled) setSessionChannels(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setSessionChannels(channels);
      } finally {
        if (!cancelled) setLoadingChannels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, currentUserEmail, channels]);

  const onToggleChannelId = useCallback((channelId: string) => {
    const id = channelId.trim();
    if (!id) return;
    setSelectedChannelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const sendLabel = useMemo(
    () => (selectedChannelIds.length > 1 ? `Send (${selectedChannelIds.length})` : 'Send'),
    [selectedChannelIds.length]
  );

  const onSend = async () => {
    if (!message || selectedChannelIds.length === 0) return;
    const receivers: RavenForwardReceiver[] = [];
    for (const id of selectedChannelIds) {
      const ch = channelPool.find((c) => c.name === id);
      if (!ch) continue;
      const receiver = channelToForwardReceiver(ch, currentUserEmail);
      if (receiver) receivers.push(receiver);
    }
    if (!receivers.length) {
      Alert.alert('Forward', 'Could not resolve the selected chats.');
      return;
    }
    setSending(true);
    try {
      await forwardRavenMessage(receivers, message);
      const sentTo = [...selectedChannelIds];
      Alert.success('Forwarded', 'Message sent.');
      onSent?.(sentTo);
      onClose();
    } catch (e) {
      Alert.error('Forward', userFacingError(e, 'Could not forward this message.'));
    } finally {
      setSending(false);
    }
  };

  if (!visible || !message) return null;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <RavenShareToContactPicker
        inModal
        screenTitle="Send to…"
        heroTitle="Forward message"
        heroName={forwardPreviewText(message)}
        heroHint="Choose who should receive this message in chat."
        heroIcon="arrow-redo-outline"
        heroIconColor={Colors.WINE}
        channels={channelPool}
        channelsLoading={loadingChannels}
        includeGroupChannels
        selectionMode="multiple"
        selectedChannelId=""
        selectedChannelIds={selectedChannelIds}
        onSelectChannel={() => {}}
        onToggleChannelId={onToggleChannelId}
        onBack={onClose}
        onSkip={onClose}
        onSend={() => void onSend()}
        sharing={sending}
        userEmail={currentUserEmail}
        userProfiles={userProfiles}
        skipLabel="Cancel"
        sendLabel={sendLabel}
        emptyText="No direct messages found. Start a one-to-one conversation in Messages first."
        loadingText="Loading your conversations…"
        searchPlaceholder="Search people"
        filterEmptyText="No people or channels match your search."
      />
    </Modal>
  );
};
