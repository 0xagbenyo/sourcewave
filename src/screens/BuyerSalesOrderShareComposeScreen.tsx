import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ScrollView,
} from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { useUserSession } from '../context/UserContext';
import { useTranslation } from 'react-i18next';
import { getERPNextClient } from '../services/erpnext';
import {
  createDirectMessageChannel,
  getRavenChannelDisplayLabel,
  getRavenDmPeerUserId,
  listRavenChannelsForSessionUser,
  ravenChannelLastActivitySortTimeMs,
  sendRavenChannelDocumentLinkMessage,
  type RavenChannelRow,
} from '../services/ravenNativeApi';
import { setPendingRavenDocLinkMessageMerge } from '../utils/ravenDocLinkMessageMergeBridge';
import { userFacingError } from '../utils/userFacingError';
import { confirmSalesOrderShareable } from '../utils/salesOrderShareGuard';
import type { RootStackParamList } from '../types';

type R = RouteProp<RootStackParamList, 'BuyerSalesOrderShareCompose'>;

type SalesOrderRow = {
  name: string;
  status?: string;
  docstatus?: number;
  grand_total?: number;
  transaction_date?: string;
};

function isDmChannel(c: RavenChannelRow): boolean {
  return !!c.is_direct_message || String(c.type || '').trim().toLowerCase() === 'direct';
}

async function resolveCustomerId(email: string | undefined, userId: string | undefined): Promise<string> {
  const client = getERPNextClient();
  const sessionEmail = (email || '').trim();
  const sessionUser = (userId || '').trim();
  if (sessionEmail) {
    const customerByEmail = await client.getCustomerByEmail(sessionEmail);
    if (customerByEmail?.name) return String(customerByEmail.name).trim();
  }
  if (sessionUser && !sessionUser.includes('@')) return sessionUser;
  return '';
}

function orderCaption(row: SalesOrderRow): string {
  const gt = Number(row.grand_total) || 0;
  const date = row.transaction_date ? String(row.transaction_date) : '';
  const parts = [row.name];
  if (gt > 0) parts.push(`GH₵${gt.toFixed(2)}`);
  if (date) parts.push(date);
  return parts.join(' · ');
}

export const BuyerSalesOrderShareComposeScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<R>();
  const { t } = useTranslation();
  const { user } = useUserSession();

  const paramChannelId = (route.params?.ravenChannelId || '').trim();
  const paramPeerUserId = (route.params?.peerUserId || '').trim();
  const paramOrderName = (route.params?.salesOrderName || '').trim();
  const supplierLabel = (route.params?.supplierLabel || '').trim();

  const lockedRecipient = !!(paramChannelId || paramPeerUserId);
  const orderPreselected = !!paramOrderName && !lockedRecipient;

  const [loadingOrders, setLoadingOrders] = useState(!orderPreselected);
  const [orders, setOrders] = useState<SalesOrderRow[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrderRow | null>(
    orderPreselected ? { name: paramOrderName } : null
  );

  const [channels, setChannels] = useState<RavenChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState(paramChannelId);
  const [targetChannelId, setTargetChannelId] = useState(paramChannelId);
  const [resolvingChannel, setResolvingChannel] = useState(lockedRecipient && !paramChannelId);
  const [sharing, setSharing] = useState(false);

  const autoSendDoneRef = useRef(false);

  const showShareStep = !lockedRecipient && !!selectedOrder;

  const loadOrders = useCallback(async () => {
    if (!orderPreselected) setLoadingOrders(true);
    try {
      const customerId = await resolveCustomerId(user?.email, user?.user);
      if (!customerId) {
        setOrders([]);
        return;
      }
      const rows = await getERPNextClient().getSalesOrders(customerId, undefined, 40);
      const list = (Array.isArray(rows) ? rows : [])
        .map((r) => ({
          name: String(r?.name ?? '').trim(),
          status: r?.status != null ? String(r.status) : undefined,
          docstatus: r?.docstatus != null ? Number(r.docstatus) : undefined,
          grand_total: r?.grand_total != null ? Number(r.grand_total) : undefined,
          transaction_date: r?.transaction_date != null ? String(r.transaction_date) : undefined,
        }))
        .filter((r) => r.name.length > 0 && Number(r.docstatus) !== 1 && Number(r.docstatus) !== 2);
      setOrders(list);
    } catch (e: unknown) {
      setOrders([]);
      Alert.alert(t('salesOrderShare.title'), userFacingError(e, t('salesOrderShare.loadOrdersFailed')));
    } finally {
      if (!orderPreselected) setLoadingOrders(false);
    }
  }, [user?.email, user?.user, t, orderPreselected]);

  useEffect(() => {
    if (!paramOrderName || lockedRecipient) return;
    const hit = orders.find((o) => o.name === paramOrderName);
    if (hit) {
      setSelectedOrder(hit);
      return;
    }
    setSelectedOrder((prev) => (prev?.name === paramOrderName ? prev : { name: paramOrderName }));
  }, [paramOrderName, orders, lockedRecipient]);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const rows = await listRavenChannelsForSessionUser(user?.email ?? null);
      setChannels(rows.filter(isDmChannel));
    } catch {
      setChannels([]);
    } finally {
      setChannelsLoading(false);
    }
  }, [user?.email]);

  const shareOrder = useCallback(
    async (order: SalesOrderRow) => {
      const orderName = order.name.trim();
      const chId = (lockedRecipient ? targetChannelId : selectedChannelId).trim();
      if (!orderName) {
        Alert.alert(t('salesOrderShare.title'), t('salesOrderShare.pickOrderFirst'));
        return;
      }
      if (!chId) {
        Alert.alert(t('salesOrderShare.title'), t('salesOrderShare.pickRecipient'));
        return;
      }
      setSharing(true);
      try {
        const ok = await confirmSalesOrderShareable(orderName, t, navigation as { navigate: (n: string, p?: object) => void });
        if (!ok) return;

        const caption = orderCaption(order);
        let sentRaw = await sendRavenChannelDocumentLinkMessage(chId, {
          linkDoctype: 'Sales Order',
          linkDocument: orderName,
          caption,
        });
        if (sentRaw != null && typeof sentRaw === 'object' && !Array.isArray(sentRaw)) {
          sentRaw = {
            ...(sentRaw as Record<string, unknown>),
            link_doctype: 'Sales Order',
            link_document: orderName,
          };
        }
        setPendingRavenDocLinkMessageMerge(chId, sentRaw);
        Alert.alert(t('salesOrderShare.sharedTitle'), t('salesOrderShare.sharedBody'), [
          { text: t('contactUs.ok'), onPress: () => navigation.goBack() },
        ]);
      } catch (e: unknown) {
        Alert.alert(t('salesOrderShare.title'), userFacingError(e, t('salesOrderShare.shareFailed')));
      } finally {
        setSharing(false);
      }
    },
    [lockedRecipient, targetChannelId, selectedChannelId, t, navigation]
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!lockedRecipient) return;
    if (paramChannelId) {
      setTargetChannelId(paramChannelId);
      setResolvingChannel(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setResolvingChannel(true);
      try {
        const rows = await listRavenChannelsForSessionUser(user?.email ?? null);
        const dms = rows.filter(isDmChannel);
        const peerLower = paramPeerUserId.toLowerCase();
        const match = dms.find((c) => {
          const p = getRavenDmPeerUserId(c, user?.email);
          return (p || '').trim().toLowerCase() === peerLower;
        });
        if (match) {
          if (!cancelled) setTargetChannelId(match.name);
          return;
        }
        const chId = await createDirectMessageChannel(paramPeerUserId);
        if (!cancelled) setTargetChannelId(String(chId || '').trim());
      } catch (e: unknown) {
        if (!cancelled) {
          Alert.alert(
            t('salesOrderShare.title'),
            userFacingError(e, t('salesOrderShare.shareFailed')),
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
  }, [lockedRecipient, paramChannelId, paramPeerUserId, user?.email, t, navigation]);

  useEffect(() => {
    if (!paramOrderName || loadingOrders || !lockedRecipient) return;
    if (autoSendDoneRef.current || resolvingChannel || !targetChannelId.trim()) return;
    const hit = orders.find((o) => o.name === paramOrderName);
    const order = hit ?? { name: paramOrderName };
    autoSendDoneRef.current = true;
    void (async () => {
      const ok = await confirmSalesOrderShareable(
        order.name,
        t,
        navigation as { navigate: (n: string, p?: object) => void }
      );
      if (!ok) {
        autoSendDoneRef.current = false;
        return;
      }
      void shareOrder(order);
    })();
  }, [paramOrderName, orders, loadingOrders, lockedRecipient, resolvingChannel, targetChannelId, shareOrder, t, navigation]);

  useEffect(() => {
    if (!showShareStep) return;
    void loadChannels();
  }, [showShareStep, loadChannels]);

  useEffect(() => {
    if (!showShareStep || channelsLoading || channels.length === 0) return;
    if (selectedChannelId) return;
    const sorted = [...channels].sort(
      (a, b) => ravenChannelLastActivitySortTimeMs(b) - ravenChannelLastActivitySortTimeMs(a)
    );
    if (sorted[0]) setSelectedChannelId(sorted[0].name);
  }, [showShareStep, channelsLoading, channels, selectedChannelId]);

  const dmChannelsSorted = useMemo(
    () =>
      [...channels].sort(
        (a, b) => ravenChannelLastActivitySortTimeMs(b) - ravenChannelLastActivitySortTimeMs(a)
      ),
    [channels]
  );

  const onPickOrder = (item: SalesOrderRow) => {
    if (lockedRecipient) {
      if (resolvingChannel || sharing) return;
      if (!targetChannelId.trim()) {
        Alert.alert(t('salesOrderShare.title'), t('salesOrderShare.pickRecipient'));
        return;
      }
      void shareOrder(item);
      return;
    }
    setSelectedOrder(item);
  };

  const onCreateNew = () => {
    (navigation as { navigate: (name: string) => void }).navigate('SourcingRequest');
  };

  const onFindNewSupplier = () => {
    const orderName = (selectedOrder?.name || paramOrderName).trim();
    if (!orderName) {
      Alert.alert(t('salesOrderShare.title'), t('salesOrderShare.pickOrderFirst'));
      return;
    }
    (navigation as { navigate: (name: string, params: object) => void }).navigate('Main', {
      screen: 'Suppliers',
      params: { shareSalesOrderName: orderName },
    });
  };

  const onShareBack = () => {
    if (orderPreselected) {
      navigation.goBack();
      return;
    }
    setSelectedOrder(null);
  };

  const pickSubtitle = lockedRecipient
    ? supplierLabel
      ? t('salesOrderShare.pickForSupplier', { name: supplierLabel })
      : t('salesOrderShare.sendToOpenChat')
    : t('salesOrderShare.pickSubtitle');

  if (!showShareStep) {
    const showSendingOverlay = sharing || (lockedRecipient && paramOrderName && (resolvingChannel || !targetChannelId));

    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <Header showBackButton title={t('salesOrderShare.title')} subtitle={pickSubtitle} />
        {lockedRecipient && resolvingChannel ? (
          <View style={styles.resolvingRow}>
            <ActivityIndicator size="small" color={Colors.WINE} />
            <Text style={styles.resolvingText}>{t('salesOrderShare.preparingChat')}</Text>
          </View>
        ) : null}
        {!lockedRecipient ? (
          <TouchableOpacity style={styles.createRow} onPress={onCreateNew} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={22} color={Colors.WINE} />
            <Text style={styles.createText}>{t('salesOrderShare.createNew')}</Text>
          </TouchableOpacity>
        ) : null}
        {loadingOrders ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.WINE} />
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.empty}>{t('salesOrderShare.noOrders')}</Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(item) => item.name}
            contentContainerStyle={styles.listPad}
            scrollEnabled={!sharing}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.orderRow, sharing && styles.orderRowDisabled]}
                onPress={() => onPickOrder(item)}
                disabled={sharing || (lockedRecipient && resolvingChannel)}
                activeOpacity={0.75}
              >
                <View style={styles.orderMain}>
                  <Text style={styles.orderName}>{item.name}</Text>
                  <Text style={styles.orderMeta} numberOfLines={1}>
                    {orderCaption(item)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>
            )}
          />
        )}
        {showSendingOverlay ? (
          <View style={styles.sendingOverlay}>
            <ActivityIndicator size="large" color={Colors.WINE} />
            <Text style={styles.sendingText}>{t('salesOrderShare.sending')}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header
        showBackButton
        title={t('salesOrderShare.sendTitle')}
        subtitle={t('salesOrderShare.sendSubtitle')}
        onBackPress={onShareBack}
      />
      <ScrollView contentContainerStyle={styles.sharePad} keyboardShouldPersistTaps="handled">
        <View style={styles.savedHero}>
          <Ionicons name="document-text-outline" size={24} color={Colors.WINE} style={{ marginRight: 10 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.savedLabel}>{t('salesOrderShare.selectedOrder')}</Text>
            <Text style={styles.savedName} numberOfLines={1}>
              {selectedOrder?.name}
            </Text>
            {selectedOrder?.grand_total != null && Number(selectedOrder.grand_total) > 0 ? (
              <Text style={styles.savedMeta} numberOfLines={1}>
                {orderCaption(selectedOrder)}
              </Text>
            ) : null}
          </View>
          {!orderPreselected ? (
            <TouchableOpacity onPress={() => setSelectedOrder(null)} hitSlop={10}>
              <Text style={styles.changeLink}>{t('salesOrderShare.change')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>{t('salesOrderShare.recentSuppliers')}</Text>
        {channelsLoading ? (
          <ActivityIndicator color={Colors.WINE} style={{ marginVertical: 16 }} />
        ) : dmChannelsSorted.length === 0 ? (
          <Text style={styles.emptyInline}>{t('salesOrderShare.noChats')}</Text>
        ) : (
          dmChannelsSorted.map((ch) => {
            const label = getRavenChannelDisplayLabel(ch, user?.email ?? null);
            const selected = selectedChannelId === ch.name;
            return (
              <TouchableOpacity
                key={ch.name}
                style={[styles.channelRow, selected && styles.channelRowOn]}
                onPress={() => setSelectedChannelId(ch.name)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selected ? Colors.WINE : Colors.TEXT_SECONDARY}
                />
                <Text style={styles.channelLabel} numberOfLines={2}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity style={styles.findSupplierRow} onPress={onFindNewSupplier} activeOpacity={0.85}>
          <View style={styles.findSupplierIcon}>
            <Ionicons name="people-outline" size={22} color={Colors.WINE} />
          </View>
          <View style={styles.findSupplierText}>
            <Text style={styles.findSupplierTitle}>{t('salesOrderShare.findNewSupplier')}</Text>
            <Text style={styles.findSupplierSub}>{t('salesOrderShare.findNewSupplierSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.TEXT_SECONDARY} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sendBtn, (sharing || !selectedChannelId.trim()) && styles.sendBtnOff]}
          onPress={() => selectedOrder && void shareOrder(selectedOrder)}
          disabled={sharing || !selectedOrder || !selectedChannelId.trim()}
          activeOpacity={0.9}
        >
          {sharing ? (
            <ActivityIndicator color={Colors.WHITE} />
          ) : (
            <Text style={styles.sendBtnText}>{t('salesOrderShare.sendCta')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.BACKGROUND },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.LG },
  empty: { fontSize: 15, color: Colors.TEXT_SECONDARY, textAlign: 'center', paddingHorizontal: Spacing.LG },
  emptyInline: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 20,
    marginBottom: Spacing.SM,
  },
  listPad: { paddingBottom: Spacing.XL },
  resolvingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing.SCREEN_PADDING,
    marginBottom: Spacing.SM,
    paddingVertical: 8,
  },
  resolvingText: { fontSize: 14, color: Colors.TEXT_SECONDARY },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing.SCREEN_PADDING,
    marginBottom: Spacing.MD,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.WHITE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
  },
  createText: { fontSize: 15, fontWeight: '600', color: Colors.WINE },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.SCREEN_PADDING,
    marginBottom: 10,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.WHITE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
  },
  orderRowDisabled: { opacity: 0.55 },
  orderMain: { flex: 1, minWidth: 0, marginRight: 8 },
  orderName: { fontSize: 15, fontWeight: '700', color: Colors.BLACK },
  orderMeta: { marginTop: 4, fontSize: 13, color: Colors.TEXT_SECONDARY },
  sendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  sendingText: { fontSize: 15, fontWeight: '600', color: Colors.BLACK },
  sharePad: { padding: Spacing.SCREEN_PADDING, paddingBottom: Spacing.XL },
  savedHero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.WHITE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
    marginBottom: Spacing.MD,
  },
  savedLabel: { fontSize: 12, fontWeight: '600', color: Colors.TEXT_SECONDARY },
  savedName: { fontSize: 16, fontWeight: '700', color: Colors.BLACK, marginTop: 2 },
  savedMeta: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 4 },
  changeLink: { fontSize: 14, fontWeight: '600', color: Colors.WINE },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: Colors.WHITE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
  },
  channelRowOn: { borderColor: Colors.WINE, backgroundColor: '#FFF5F7' },
  channelLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.BLACK },
  findSupplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: Spacing.MD,
    marginBottom: Spacing.SM,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.WHITE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
  },
  findSupplierIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  findSupplierText: { flex: 1, minWidth: 0 },
  findSupplierTitle: { fontSize: 15, fontWeight: '700', color: Colors.BLACK },
  findSupplierSub: { marginTop: 3, fontSize: 13, color: Colors.TEXT_SECONDARY, lineHeight: 18 },
  sendBtn: {
    marginTop: Spacing.LG,
    backgroundColor: Colors.BLACK,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendBtnOff: { opacity: 0.6 },
  sendBtnText: { color: Colors.WHITE, fontSize: 15, fontWeight: '700' },
});
