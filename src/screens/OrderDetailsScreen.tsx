import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useOrder } from '../hooks/erpnext';
import { OrderItem, OrderStatus, UserAddress } from '../types';
import { formatGhanaCedis } from '../utils/currency';

const hairline = StyleSheet.hairlineWidth;

/** Accent for status dot + label (no heavy pill). */
function statusAccent(status: string): string {
  const s = (status || 'pending') as OrderStatus;
  if (s === 'cancelled' || s === 'returned') return Colors.ERROR;
  if (s === 'completed' || s === 'delivered') return '#248A3D';
  if (s === 'pending') return '#C93400';
  return Colors.INFO;
}

function formatOrderDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

function addressesLookSame(a: UserAddress, b: UserAddress): boolean {
  const norm = (u: UserAddress) =>
    [
      u.firstName,
      u.lastName,
      u.addressLine1,
      u.addressLine2 || '',
      u.city,
      u.state,
      u.postalCode,
      u.country,
      u.phone || '',
    ]
      .join('|')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  return norm(a) === norm(b);
}

function AddressBlock({ address }: { address: UserAddress }) {
  const line1 = [address.firstName, address.lastName].filter(Boolean).join(' ').trim();
  const hasBody =
    address.addressLine1 ||
    address.city ||
    address.state ||
    address.postalCode ||
    address.country;

  if (!line1 && !hasBody) {
    return <Text style={styles.bodyMuted}>—</Text>;
  }

  return (
    <View>
      {line1 ? <Text style={styles.body}>{line1}</Text> : null}
      {address.addressLine1 ? <Text style={styles.body}>{address.addressLine1}</Text> : null}
      {address.addressLine2 ? <Text style={styles.body}>{address.addressLine2}</Text> : null}
      {(address.city || address.state || address.postalCode) && (
        <Text style={styles.body}>
          {[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}
        </Text>
      )}
      {address.country ? <Text style={styles.body}>{address.country}</Text> : null}
      {address.phone ? <Text style={[styles.body, styles.bodyStrong]}>{address.phone}</Text> : null}
    </View>
  );
}

function ItemReceiptRow({ item, t }: { item: OrderItem; t: (k: string, o?: object) => string }) {
  const title = item.product?.name || item.productId;
  const variant =
    item.color && item.size
      ? `${item.color.name} · ${item.size.name}`
      : item.color
        ? item.color.name
        : item.size
          ? item.size.name
          : null;
  const sku =
    item.product?.name && item.productId !== item.product?.name ? String(item.productId) : null;
  const metaExtra = [sku, variant].filter(Boolean).join(' · ');
  const lineTotal = item.price * item.quantity;
  const qtyPrice = t('orderDetails.lineQtyPrice', {
    qty: item.quantity,
    price: formatGhanaCedis(item.price),
  });

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemRowLeft}>
        <Text style={styles.itemName} numberOfLines={3}>
          {title}
        </Text>
        <Text style={styles.itemSub} numberOfLines={2}>
          {qtyPrice}
          {metaExtra ? ` · ${metaExtra}` : ''}
        </Text>
      </View>
      <Text style={styles.itemAmount}>{formatGhanaCedis(lineTotal)}</Text>
    </View>
  );
}

export const OrderDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { orderId, orderNumber } = (route.params as { orderId?: string; orderNumber?: string }) || {};
  const resolvedOrderId = String(orderId || orderNumber || '').trim();

  const { data: order, loading, error, refreshing, refetch } = useOrder(resolvedOrderId);

  const statusKey = (order?.status || 'pending') as OrderStatus;
  const statusLabel = t(`orderDetails.status.${statusKey}`, {
    defaultValue: t('orderDetails.status.pending'),
  });
  const accent = useMemo(() => statusAccent(statusKey), [statusKey]);

  const showBilling = useMemo(() => {
    if (!order?.shippingAddress || !order?.billingAddress) return false;
    return !addressesLookSame(order.shippingAddress, order.billingAddress);
  }, [order]);

  const copyTracking = useCallback(
    async (value: string) => {
      try {
        await Clipboard.setStringAsync(value);
        Alert.alert(t('orderDetails.copied'));
      } catch {
        Alert.alert(t('orderDetails.errorTitle'), t('orderDetails.errorHint'));
      }
    },
    [t]
  );

  const renderHeader = () => (
    <View style={styles.topBar}>
      <TouchableOpacity
        style={styles.backHit}
        onPress={() => (navigation as { goBack: () => void }).goBack()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="chevron-back" size={26} color={Colors.BLACK} />
      </TouchableOpacity>
    </View>
  );

  const renderItems = () => {
    const items = order?.items;
    if (!items?.length) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.bodyMuted}>{t('orderDetails.emptyItems')}</Text>
        </View>
      );
    }
    return (
      <View>
        <Text style={styles.groupHeading}>
          {t('orderDetails.itemsCount', { count: items.length })}
        </Text>
        {items.map((item) => (
          <ItemReceiptRow key={item.id || `${item.productId}-${item.quantity}`} item={item} t={t} />
        ))}
      </View>
    );
  };

  if (!resolvedOrderId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        {renderHeader()}
        <View style={styles.centerBlock}>
          <Text style={styles.centerTitle}>{t('orderDetails.errorTitle')}</Text>
          <Text style={styles.centerSub}>{t('orderDetails.errorHint')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        {renderHeader()}
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color={Colors.TEXT_SECONDARY} />
          <Text style={styles.centerSub}>{t('orderDetails.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        {renderHeader()}
        <View style={styles.centerBlock}>
          <Text style={styles.centerTitle}>{t('orderDetails.errorTitle')}</Text>
          {error ? <Text style={styles.centerSub}>{error.message}</Text> : null}
          <TouchableOpacity style={styles.textButton} onPress={() => void refetch()} activeOpacity={0.7}>
            <Text style={styles.textButtonLabel}>{t('orderDetails.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {renderHeader()}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refetch()} tintColor={Colors.TEXT_SECONDARY} />
        }
      >
        <View style={styles.sheet}>
          <Text style={styles.orderId}>{order.orderNumber}</Text>
          <View style={styles.statusLine}>
            <View style={[styles.statusDot, { backgroundColor: accent }]} />
            <Text style={[styles.statusLabel, { color: accent }]}>{statusLabel}</Text>
          </View>
          <Text style={styles.orderMeta}>
            {t('orderDetails.orderPlaced')} {formatOrderDate(order.createdAt)}
          </Text>

          <View style={styles.rule} />
          {renderItems()}

          <View style={styles.rule} />

          <Text style={styles.groupHeading}>{t('orderDetails.summary')}</Text>
          <View style={styles.kv}>
            <Text style={styles.kvKey}>{t('orderDetails.subtotal')}</Text>
            <Text style={styles.kvVal}>{formatGhanaCedis(order.subtotal)}</Text>
          </View>
          {order.tax > 0 ? (
            <View style={styles.kv}>
              <Text style={styles.kvKey}>{t('orderDetails.tax')}</Text>
              <Text style={styles.kvVal}>{formatGhanaCedis(order.tax)}</Text>
            </View>
          ) : null}
          {order.shipping > 0 ? (
            <View style={styles.kv}>
              <Text style={styles.kvKey}>{t('orderDetails.shipping')}</Text>
              <Text style={styles.kvVal}>{formatGhanaCedis(order.shipping)}</Text>
            </View>
          ) : null}
          {order.discount > 0 ? (
            <View style={styles.kv}>
              <Text style={styles.kvKey}>{t('orderDetails.discount')}</Text>
              <Text style={[styles.kvVal, styles.kvDiscount]}>-{formatGhanaCedis(order.discount)}</Text>
            </View>
          ) : null}
          <View style={[styles.kv, styles.kvTotal]}>
            <Text style={styles.totalKey}>{t('orderDetails.total')}</Text>
            <Text style={styles.totalVal}>{formatGhanaCedis(order.total)}</Text>
          </View>
        </View>

        <View style={styles.below}>
          <Text style={styles.sectionCaption}>{t('orderDetails.payment')}</Text>
          <Text style={styles.bodyMuted}>{t('orderDetails.paymentCard')}</Text>

          {order.shippingAddress ? (
            <>
              <Text style={[styles.sectionCaption, styles.sectionSpacer]}>{t('orderDetails.shippingAddress')}</Text>
              <AddressBlock address={order.shippingAddress} />
            </>
          ) : null}

          {showBilling && order.billingAddress ? (
            <>
              <Text style={[styles.sectionCaption, styles.sectionSpacer]}>{t('orderDetails.billingAddress')}</Text>
              <AddressBlock address={order.billingAddress} />
            </>
          ) : null}

          {order.trackingNumber ? (
            <>
              <Text style={[styles.sectionCaption, styles.sectionSpacer]}>{t('orderDetails.tracking')}</Text>
              <Text style={styles.trackingMono} selectable>
                {order.trackingNumber}
              </Text>
              <TouchableOpacity onPress={() => void copyTracking(order.trackingNumber!)} style={styles.linkRow}>
                <Text style={styles.linkText}>{t('orderDetails.copyTracking')}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {order.estimatedDelivery ? (
            <>
              <Text style={[styles.sectionCaption, styles.sectionSpacer]}>{t('orderDetails.estimatedDelivery')}</Text>
              <Text style={styles.body}>{formatOrderDate(order.estimatedDelivery)}</Text>
            </>
          ) : null}
        </View>

        <View style={{ height: Spacing.XXL }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  topBar: {
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.SM,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  backHit: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollInner: {
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.XL,
  },
  sheet: {
    backgroundColor: Colors.WHITE,
    borderRadius: 14,
    padding: Spacing.LG,
  },
  orderId: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.BLACK,
    letterSpacing: -0.4,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  orderMeta: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  rule: {
    height: hairline,
    backgroundColor: Colors.MEDIUM_GRAY,
    marginVertical: Spacing.MD,
    opacity: 0.6,
  },
  groupHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: Spacing.SM,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.SM,
    gap: Spacing.MD,
  },
  itemRowLeft: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.BLACK,
    lineHeight: 22,
  },
  itemSub: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 18,
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    fontVariant: ['tabular-nums'],
  },
  emptyWrap: {
    paddingVertical: Spacing.MD,
  },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  kvKey: {
    fontSize: 15,
    color: Colors.TEXT_SECONDARY,
  },
  kvVal: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.BLACK,
    fontVariant: ['tabular-nums'],
  },
  kvDiscount: {
    color: '#248A3D',
  },
  kvTotal: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: hairline,
    borderTopColor: Colors.MEDIUM_GRAY,
  },
  totalKey: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  totalVal: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.BLACK,
    fontVariant: ['tabular-nums'],
  },
  below: {
    marginTop: Spacing.LG,
    paddingHorizontal: 4,
  },
  sectionCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionSpacer: {
    marginTop: Spacing.LG,
  },
  body: {
    fontSize: 15,
    color: Colors.BLACK,
    lineHeight: 22,
  },
  bodyStrong: {
    fontWeight: '600',
    marginTop: 4,
  },
  bodyMuted: {
    fontSize: 15,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 22,
  },
  trackingMono: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.BLACK,
  },
  linkRow: {
    marginTop: Spacing.SM,
    alignSelf: 'flex-start',
  },
  linkText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ELECTRIC_BLUE,
  },
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.XL,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.BLACK,
    textAlign: 'center',
  },
  centerSub: {
    marginTop: Spacing.SM,
    fontSize: 15,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
  },
  textButton: {
    marginTop: Spacing.LG,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  textButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ELECTRIC_BLUE,
  },
});
