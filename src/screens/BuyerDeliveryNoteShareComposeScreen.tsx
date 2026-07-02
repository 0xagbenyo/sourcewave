import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { sharePickerFlatStyles as flat } from '../constants/sharePickerFlatUi';
import { useUserSession } from '../context/UserContext';
import { useTranslation } from 'react-i18next';
import { getERPNextClient } from '../services/erpnext';
import {
  createDirectMessageChannel,
  getRavenDmPeerUserId,
  listRavenChannelsForSessionUser,
  type RavenChannelRow,
} from '../services/ravenNativeApi';
import { userFacingError } from '../utils/userFacingError';
import {
  assertDeliveryNoteShareable,
  buildDeliveryNoteShareCaption,
  shareDeliveryNoteInRavenChat,
} from '../utils/shareDeliveryNoteInChat';
import { showDeliveryNoteShareSentAndOpenChat } from '../utils/openRavenChatAfterShare';
import type { RootStackParamList } from '../types';

type R = RouteProp<RootStackParamList, 'BuyerDeliveryNoteShareCompose'>;

function isDmChannel(c: RavenChannelRow): boolean {
  return !!c.is_direct_message || String(c.type || '').trim().toLowerCase() === 'direct';
}

export const BuyerDeliveryNoteShareComposeScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<R>();
  const { t } = useTranslation();
  const { user } = useUserSession();

  const paramChannelId = (route.params?.ravenChannelId || '').trim();
  const paramPeerUserId = (route.params?.peerUserId || '').trim();
  const paramDeliveryNoteName = (route.params?.deliveryNoteName || '').trim();
  const supplierLabel = (route.params?.supplierLabel || '').trim();
  const paramWorkspaceId = (route.params?.ravenWorkspaceId || '').trim();

  const [targetChannelId, setTargetChannelId] = useState(paramChannelId);
  const [resolvingChannel, setResolvingChannel] = useState(!paramChannelId && !!paramPeerUserId);
  const [sharing, setSharing] = useState(false);
  const [dnCaption, setDnCaption] = useState(paramDeliveryNoteName);
  const [channelResolveFailed, setChannelResolveFailed] = useState(false);

  const autoSendDoneRef = useRef(false);
  const shareSentRef = useRef(false);

  const shareDeliveryNote = useCallback(async () => {
    if (shareSentRef.current || sharing) return;
    const dnName = paramDeliveryNoteName;
    const chId = targetChannelId.trim();
    if (!dnName) {
      Alert.alert(t('deliveryNoteShare.title'), t('deliveryNoteShare.missingNote'));
      return;
    }
    if (!chId) {
      Alert.alert(t('deliveryNoteShare.title'), t('deliveryNoteShare.pickRecipient'));
      return;
    }
    setSharing(true);
    let succeeded = false;
    try {
      await assertDeliveryNoteShareable(dnName);
      const raw = await getERPNextClient().getDeliveryNoteRaw(dnName);
      const caption = raw ? await buildDeliveryNoteShareCaption(raw, dnName) : dnName;
      await shareDeliveryNoteInRavenChat(chId, dnName, caption);

      const channelRow = (await listRavenChannelsForSessionUser(user?.email ?? null)).find(
        (c) => String(c.name || '').trim() === chId
      );
      const workspaceId = paramWorkspaceId || String(channelRow?.workspace || '').trim();
      const peerUserId = paramPeerUserId || getRavenDmPeerUserId(channelRow, user?.email) || '';

      succeeded = true;
      shareSentRef.current = true;
      await showDeliveryNoteShareSentAndOpenChat({
        t,
        navigation: navigation as { dispatch: (action: unknown) => void },
        sessionEmail: user?.email,
        channelId: chId,
        peerUserId,
        workspaceId,
      });
    } catch (e: unknown) {
      shareSentRef.current = false;
      Alert.error(t('deliveryNoteShare.title'), userFacingError(e, t('deliveryNoteShare.shareFailed')));
    } finally {
      if (!succeeded) setSharing(false);
    }
  }, [
    paramDeliveryNoteName,
    targetChannelId,
    sharing,
    t,
    navigation,
    user?.email,
    paramPeerUserId,
    paramWorkspaceId,
  ]);

  useEffect(() => {
    if (!paramDeliveryNoteName) return;
    let cancelled = false;
    void getERPNextClient()
      .getDeliveryNoteRaw(paramDeliveryNoteName)
      .then(async (raw) => {
        if (!cancelled && raw) {
          setDnCaption(await buildDeliveryNoteShareCaption(raw, paramDeliveryNoteName));
        }
      })
      .catch(() => {
        if (!cancelled) setDnCaption(paramDeliveryNoteName);
      });
    return () => {
      cancelled = true;
    };
  }, [paramDeliveryNoteName]);

  useEffect(() => {
    if (paramChannelId) {
      setTargetChannelId(paramChannelId);
      setResolvingChannel(false);
      setChannelResolveFailed(false);
      return;
    }
    if (!paramPeerUserId) return;
    let cancelled = false;
    void (async () => {
      setResolvingChannel(true);
      setChannelResolveFailed(false);
      try {
        const rows = await listRavenChannelsForSessionUser(user?.email ?? null);
        const dms = rows.filter(isDmChannel);
        const peerLower = paramPeerUserId.toLowerCase();
        const match = dms.find((c) => {
          const p = getRavenDmPeerUserId(c, user?.email);
          return (p || '').trim().toLowerCase() === peerLower;
        });
        if (match) {
          if (!cancelled) setTargetChannelId(String(match.name || '').trim());
          return;
        }
        const chId = await createDirectMessageChannel(paramPeerUserId);
        const resolved = String(chId || '').trim();
        if (!resolved) throw new Error('Could not open chat with this logistics company.');
        if (!cancelled) setTargetChannelId(resolved);
      } catch (e: unknown) {
        if (!cancelled) {
          setChannelResolveFailed(true);
          Alert.alert(
            t('deliveryNoteShare.title'),
            userFacingError(e, t('deliveryNoteShare.shareFailed')),
            [{ text: t('contactUs.ok'), onPress: () => navigation.goBack() }]
          );
        }
      } finally {
        if (!cancelled) setResolvingChannel(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramChannelId, paramPeerUserId, user?.email, t, navigation]);

  useEffect(() => {
    if (!paramDeliveryNoteName || !paramPeerUserId) return;
    if (autoSendDoneRef.current || resolvingChannel || channelResolveFailed || !targetChannelId.trim()) return;
    autoSendDoneRef.current = true;
    void shareDeliveryNote();
  }, [paramDeliveryNoteName, paramPeerUserId, resolvingChannel, channelResolveFailed, targetChannelId, shareDeliveryNote]);

  const pickSubtitle = supplierLabel
    ? t('deliveryNoteShare.pickForLogistics', { name: supplierLabel })
    : t('deliveryNoteShare.sendToOpenChat');

  const showSendingOverlay =
    sharing || (resolvingChannel && !!paramPeerUserId && !targetChannelId.trim());

  return (
    <SafeAreaView style={flat.screen} edges={['top', 'bottom']}>
      <View style={flat.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={flat.backWrap}>
          <Ionicons name="arrow-back" size={24} color={Colors.BRAND_NAVY} />
        </TouchableOpacity>
        <Text style={flat.topTitle} numberOfLines={1}>
          {t('deliveryNoteShare.title')}
        </Text>
        <View style={{ width: 32 }} />
      </View>
      {pickSubtitle ? <Text style={flat.topSubtitle}>{pickSubtitle}</Text> : null}
      {resolvingChannel ? (
        <View style={styles.resolvingRow}>
          <ActivityIndicator size="small" color={Colors.WINE} />
          <Text style={styles.resolvingText}>{t('deliveryNoteShare.preparingChat')}</Text>
        </View>
      ) : null}
      <View style={flat.center}>
        <Ionicons name="airplane-outline" size={40} color={Colors.WINE} style={{ marginBottom: 12 }} />
        <Text style={styles.dnName}>{dnCaption || paramDeliveryNoteName}</Text>
      </View>
      {showSendingOverlay ? (
        <View style={styles.sendingOverlay}>
          <ActivityIndicator size="large" color={Colors.WINE} />
          <Text style={styles.sendingText}>{t('deliveryNoteShare.sending')}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  resolvingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing.MD,
    marginBottom: Spacing.SM,
    paddingVertical: 8,
  },
  resolvingText: { fontSize: 14, color: Colors.MEDIUM_GRAY },
  dnName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BRAND_NAVY,
    textAlign: 'center',
    paddingHorizontal: Spacing.LG,
  },
  sendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(236, 239, 241, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  sendingText: { fontSize: 15, fontWeight: '600', color: Colors.BRAND_NAVY },
});
