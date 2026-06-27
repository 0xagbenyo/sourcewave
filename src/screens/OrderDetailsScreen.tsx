import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { useOrder } from '../hooks/erpnext';
import { useSessionCustomerId } from '../hooks/useSessionCustomerId';
import { getERPNextClient } from '../services/erpnext';
import { navigateToSupplierQuotationDetail } from '../utils/erpDocumentNavigation';
import { OrderItem, OrderStatus, UserAddress } from '../types';
import { formatGhanaCedis } from '../utils/currency';
import { confirmSalesOrderShareable } from '../utils/salesOrderShareGuard';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocCard,
  ErpDocHero,
  ErpDocSection,
  ErpDocLineItem,
  ErpDocItemsList,
  ErpDocEmptyState,
  ErpDocLinkButton,
  ErpDocLinkedSection,
  formatErpDocDate,
  formatErpDocMoney,
} from '../components/ErpDocumentPreviewLayout';

function orderStatusAccent(status: string): string {
  const s = (status || 'pending') as OrderStatus;
  if (s === 'cancelled' || s === 'returned') return Colors.ERROR;
  if (s === 'completed' || s === 'delivered') return '#248A3D';
  if (s === 'pending') return '#C93400';
  return Colors.INFO;
}

function formatAddressLine(address: UserAddress): string {
  const parts = [
    [address.firstName, address.lastName].filter(Boolean).join(' '),
    address.addressLine1,
    address.addressLine2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ].filter(Boolean);
  return parts.join('\n');
}

function orderItemTitle(item: OrderItem): string {
  const base = item.product?.name || item.productId;
  const variant =
    item.color && item.size
      ? `${item.color.name} · ${item.size.name}`
      : item.color
        ? item.color.name
        : item.size
          ? item.size.name
          : null;
  return variant ? `${base} (${variant})` : base;
}

export const OrderDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { orderId, orderNumber } = (route.params as { orderId?: string; orderNumber?: string }) || {};
  const resolvedOrderId = String(orderId || orderNumber || '').trim();

  const { data: order, loading, error, refreshing, refetch } = useOrder(resolvedOrderId);
  const { customerId, loading: customerLoading } = useSessionCustomerId();
  const [linkedQuotations, setLinkedQuotations] = useState<Record<string, unknown>[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  const loadLinkedQuotations = useCallback(async () => {
    if (!resolvedOrderId) {
      setLinkedQuotations([]);
      return;
    }
    setLinksLoading(true);
    try {
      if (customerId) {
        const raw = await getERPNextClient().getSalesOrder(resolvedOrderId);
        const orderCustomer = String(raw?.customer || '').trim();
        if (orderCustomer && orderCustomer !== customerId) {
          setLinkedQuotations([]);
          return;
        }
      }
      const rows = await getERPNextClient().listSupplierQuotationsBySalesOrder(resolvedOrderId, {
        customerId: customerId || undefined,
        limit: 20,
      });
      setLinkedQuotations(Array.isArray(rows) ? rows : []);
    } catch {
      setLinkedQuotations([]);
    } finally {
      setLinksLoading(false);
    }
  }, [resolvedOrderId, customerId]);

  useEffect(() => {
    if (customerLoading) return;
    void loadLinkedQuotations();
  }, [customerLoading, loadLinkedQuotations]);

  useEffect(() => {
    if (!refreshing) return;
    void loadLinkedQuotations();
  }, [refreshing, loadLinkedQuotations]);

  const statusKey = (order?.status || 'pending') as OrderStatus;
  const statusLabel = t(`orderDetails.status.${statusKey}`, {
    defaultValue: t('orderDetails.status.pending'),
  });
  const accent = useMemo(() => orderStatusAccent(statusKey), [statusKey]);

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

  const errorMessage = !resolvedOrderId
    ? t('orderDetails.errorHint')
    : !loading && (error || !order)
      ? error?.message || t('orderDetails.errorHint')
      : null;

  const heroFacts = useMemo(() => {
    if (!order) return undefined;
    const facts: { label: string; value: string }[] = [];
    if (order.trackingNumber) {
      facts.push({ label: 'Tracking', value: order.trackingNumber });
    }
    if (order.estimatedDelivery) {
      facts.push({ label: 'Est. delivery', value: formatErpDocDate(order.estimatedDelivery) });
    }
    return facts.length ? facts : undefined;
  }, [order]);

  const onShareOrder = useCallback(async () => {
    if (!resolvedOrderId) return;
    const ok = await confirmSalesOrderShareable(
      resolvedOrderId,
      t,
      navigation as { navigate: (name: string, params?: object) => void }
    );
    if (!ok) return;
    (navigation as { navigate: (name: string, params: object) => void }).navigate('BuyerSalesOrderShareCompose', {
      salesOrderName: resolvedOrderId,
    });
  }, [navigation, resolvedOrderId, t]);

  const openQuotation = useCallback(
    (quotationName: string) => {
      navigateToSupplierQuotationDetail(navigation as { navigate: (n: string, p?: object) => void }, quotationName, customerId);
    },
    [navigation, customerId]
  );

  return (
    <ErpDocumentPreviewLayout
      screenTitle={t('orderDetails.title', { defaultValue: 'Order' })}
      printDoctype="Sales Order"
      printDocName={resolvedOrderId}
      loading={loading && !order}
      errorMessage={errorMessage}
      onBack={() => (navigation as { goBack: () => void }).goBack()}
      onShare={order ? onShareOrder : undefined}
      shareAccessibilityLabel={t('orderDetails.shareToSupplier')}
      refreshControl={
        order ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refetch()}
            tintColor={Colors.TEXT_SECONDARY}
          />
        ) : undefined
      }
    >
      {order ? (
        <>
          <ErpDocSheet>
            <ErpDocHero
              docId={order.orderNumber}
              statusLabel={statusLabel}
              statusColor={accent}
              amount={formatGhanaCedis(order.total)}
              amountLabel="Order total"
              subtitle={`${t('orderDetails.orderPlaced')} ${formatErpDocDate(order.createdAt)}`}
              facts={heroFacts}
            />

            <ErpDocSection title={`Items · ${order.items?.length ?? 0}`}>
              {order.items?.length ? (
                <ErpDocItemsList>
                  {order.items.map((item) => (
                    <ErpDocLineItem
                      key={item.id || `${item.productId}-${item.quantity}`}
                      title={orderItemTitle(item)}
                      qty={item.quantity}
                      rate={item.price}
                      amount={item.price * item.quantity}
                    />
                  ))}
                </ErpDocItemsList>
              ) : (
                <ErpDocEmptyState title={t('orderDetails.emptyItems')} />
              )}
            </ErpDocSection>

            <ErpDocLinkedSection
              title={t('orderDetails.linkedQuotations')}
              loading={linksLoading || customerLoading}
              emptyTitle={t('orderDetails.noLinkedQuotation')}
            >
              {linkedQuotations.length ? (
                linkedQuotations.map((row) => {
                  const qName = String(row.name || '').trim();
                  if (!qName) return null;
                  const currency = String(row.currency || 'GHS');
                  const total = formatErpDocMoney(row.grand_total, currency);
                  const supplier = String(row.supplier_name || row.supplier || '').trim();
                  const subtitle = [supplier, total].filter(Boolean).join(' · ');
                  return (
                    <ErpDocLinkButton
                      key={qName}
                      label={t('orderDetails.viewQuotation', { name: qName })}
                      subtitle={subtitle || undefined}
                      icon="document-text-outline"
                      onPress={() => openQuotation(qName)}
                    />
                  );
                })
              ) : null}
            </ErpDocLinkedSection>
          </ErpDocSheet>

          {order.shippingAddress ? (
            <ErpDocCard>
              <ErpDocSection title={t('orderDetails.shippingAddress')}>
                <Text style={styles.addressText}>{formatAddressLine(order.shippingAddress)}</Text>
                {order.shippingAddress.phone ? (
                  <Text style={styles.addressPhone}>{order.shippingAddress.phone}</Text>
                ) : null}
              </ErpDocSection>
              {order.trackingNumber ? (
                <TouchableOpacity
                  onPress={() => void copyTracking(order.trackingNumber!)}
                  style={styles.copyBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.copyBtnText}>{t('orderDetails.copyTracking')}</Text>
                </TouchableOpacity>
              ) : null}
            </ErpDocCard>
          ) : null}
        </>
      ) : null}
    </ErpDocumentPreviewLayout>
  );
};

const styles = StyleSheet.create({
  addressText: {
    fontSize: 14,
    color: Colors.BLACK,
    lineHeight: 21,
  },
  addressPhone: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.BLACK,
    marginTop: 8,
  },
  copyBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  copyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.WINE,
  },
});
