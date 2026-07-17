import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appAlert as Alert } from '../services/appAlert';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { ERP_DOC_FLAT } from '../constants/erpDocFlatUi';
import { Spacing } from '../constants/spacing';
import { useOrder } from '../hooks/erpnext';
import { useSessionCustomerId } from '../hooks/useSessionCustomerId';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import { navigateToSupplierQuotationDetail } from '../utils/erpDocumentNavigation';
import { pickLineDisplayImageUri } from '../utils/erpLineItemImages';
import { erpLineItemTitle } from '../utils/erpLineItemDisplay';
import type { OrderItem } from '../types';
import { formatGhanaCedis } from '../utils/currency';
import { salesOrderSupplierUiLabel } from '../utils/erpSalesOrderSupplier';
import { getSalesOrderShareUiState } from '../utils/salesOrderShareState';
import { isSupplierPortalUser } from '../utils/isSupplierPortalUser';
import {
  ErpDocumentPreviewLayout,
  ErpDocSheet,
  ErpDocCard,
  ErpDocHero,
  ErpDocHeroActionButton,
  ErpDocSection,
  ErpDocMetaRow,
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
  if (s === 'completed' || s === 'delivered' || s === 'confirmed') return '#248A3D';
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

function addressRowLabel(row: ErpCustomerAddressRow): string {
  const title = (row.address_title || '').trim();
  const line1 = (row.address_line1 || '').trim();
  const city = (row.city || '').trim();
  const state = (row.state || '').trim();
  if (title) return title;
  return [line1, city, state].filter(Boolean).join(', ') || row.name || 'Address';
}

function addressRowSubtitle(row: ErpCustomerAddressRow): string {
  const parts = [
    (row.address_line1 || '').trim(),
    [(row.city || '').trim(), (row.state || '').trim()].filter(Boolean).join(', '),
    (row.phone || '').trim(),
  ].filter(Boolean);
  return parts.join(' · ');
}

function addressHasContent(address: UserAddress | undefined, addressName?: string): boolean {
  if ((addressName || '').trim()) return true;
  if (!address) return false;
  return !!(
    (address.addressLine1 || '').trim() ||
    (address.city || '').trim() ||
    (address.state || '').trim()
  );
}

function orderItemTitle(item: OrderItem): string {
  return erpLineItemTitle(item.product?.name || item.productId, {
    color: item.color?.name,
    size: item.size?.name,
  });
}

export const OrderDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const isSupplierPortal = isSupplierPortalUser(user);
  const { orderId, orderNumber, ravenChannelId } =
    (route.params as { orderId?: string; orderNumber?: string; ravenChannelId?: string }) || {};
  const chatChannelId = String(ravenChannelId || '').trim();
  const resolvedOrderId = String(orderId || orderNumber || '').trim();

  const { data: order, loading, error, refreshing, refetch } = useOrder(resolvedOrderId);
  const { customerId, loading: customerLoading } = useSessionCustomerId();
  const [linkedQuotations, setLinkedQuotations] = useState<Record<string, unknown>[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [acceptedQuotation, setAcceptedQuotation] = useState<Record<string, unknown> | null>(null);
  const [canShareWithSupplier, setCanShareWithSupplier] = useState(false);
  const [canEditOrder, setCanEditOrder] = useState(false);
  const [shareStateLoading, setShareStateLoading] = useState(true);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<ErpCustomerAddressRow[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [applyingAddress, setApplyingAddress] = useState(false);

  const canEditShipTo = order?.status === 'pending' && !isSupplierPortal;

  const loadShareState = useCallback(async (orderName?: string, fallbackDraft = false) => {
    const key = String(orderName || resolvedOrderId).trim();
    if (!key) {
      setCanShareWithSupplier(false);
      setCanEditOrder(false);
      setShareStateLoading(false);
      return;
    }
    setShareStateLoading(true);
    try {
      const state = await getSalesOrderShareUiState(key, { viewerIsSupplier: isSupplierPortal });
      setCanShareWithSupplier(state.canShare);
      setCanEditOrder(state.canEdit);
    } catch {
      setCanShareWithSupplier(fallbackDraft);
      setCanEditOrder(fallbackDraft);
    } finally {
      setShareStateLoading(false);
    }
  }, [resolvedOrderId, isSupplierPortal]);

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
    const qName = String(order?.acceptedQuotationId || '').trim();
    if (!qName) {
      setAcceptedQuotation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const doc = await getERPNextClient().getSupplierQuotationByName(qName);
        if (!cancelled) setAcceptedQuotation((doc || null) as Record<string, unknown> | null);
      } catch {
        if (!cancelled) setAcceptedQuotation(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.acceptedQuotationId]);

  useEffect(() => {
    void loadShareState();
  }, [loadShareState]);

  useEffect(() => {
    if (!order?.id) return;
    void loadShareState(order.id, order.status === 'pending');
  }, [order?.id, order?.status, loadShareState]);

  useFocusEffect(
    useCallback(() => {
      void loadShareState(order?.id, order?.status === 'pending');
      if (resolvedOrderId) void refetch();
    }, [loadShareState, order?.id, order?.status, resolvedOrderId, refetch])
  );

  useEffect(() => {
    if (!refreshing) return;
    void loadLinkedQuotations();
    void loadShareState(order?.id, order?.status === 'pending');
  }, [refreshing, loadLinkedQuotations, loadShareState, order?.id, order?.status]);

  const acceptedCurrency = String((acceptedQuotation?.currency as string) || 'GHS').trim() || 'GHS';
  const acceptedTotal = acceptedQuotation ? Number(acceptedQuotation.grand_total) || 0 : null;
  const hasAccepted = !!acceptedQuotation && order?.status !== 'pending';
  const acceptedLineRates = useMemo(() => {
    const items = Array.isArray(acceptedQuotation?.items)
      ? (acceptedQuotation!.items as Record<string, unknown>[])
      : [];
    return (order?.items || []).map((it, idx) => {
      const soCode = String(it.productId || '').trim();
      let match: Record<string, unknown> | undefined = items[idx];
      if (!match || (soCode && String(match.item_code || '').trim() !== soCode)) {
        const found = items.find((q) => String(q.item_code || '').trim() === soCode && soCode);
        if (found) match = found;
      }
      if (!match) return null;
      const rate = Number(match.rate);
      return Number.isFinite(rate) ? rate : null;
    });
  }, [acceptedQuotation, order?.items]);

  const statusKey = (order?.status || 'pending') as OrderStatus;
  const statusLabel = t(`orderDetails.status.${statusKey}`, {
    defaultValue: t('orderDetails.status.pending'),
  });
  const accent = useMemo(() => orderStatusAccent(statusKey), [statusKey]);
  const showSendToSupplier = !!order && canShareWithSupplier && !shareStateLoading && !isSupplierPortal;
  const showEditOrder = !!order && canEditOrder && !shareStateLoading && !isSupplierPortal;
  const supplierLabel = order ? salesOrderSupplierUiLabel(order, t) : '';

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
      facts.push({ label: t('orderDetails.tracking'), value: order.trackingNumber });
    }
    return facts.length ? facts : undefined;
  }, [order, t]);

  const onEditOrder = useCallback(() => {
    if (!resolvedOrderId || isSupplierPortal) return;
    (navigation as { navigate: (name: string, params: object) => void }).navigate('SourcingRequest', {
      salesOrderName: resolvedOrderId,
      ...(chatChannelId ? { ravenChannelId: chatChannelId } : {}),
    });
  }, [navigation, resolvedOrderId, chatChannelId, isSupplierPortal]);

  const onShareOrder = useCallback(() => {
    if (!resolvedOrderId) return;
    (navigation as { navigate: (name: string, params?: object) => void }).navigate(
      'BuyerSalesOrderShareCompose',
      { salesOrderName: resolvedOrderId }
    );
  }, [navigation, resolvedOrderId]);

  const openQuotation = useCallback(
    (quotationName: string) => {
      navigateToSupplierQuotationDetail(navigation as { navigate: (n: string, p?: object) => void }, quotationName, customerId);
    },
    [navigation, customerId]
  );

  const loadSavedAddresses = useCallback(async () => {
    const email = (user?.email || '').trim();
    if (!email) {
      setSavedAddresses([]);
      return;
    }
    setAddressesLoading(true);
    try {
      const rows = await getERPNextClient().getAddressesByEmail(email);
      setSavedAddresses(Array.isArray(rows) ? (rows as ErpCustomerAddressRow[]) : []);
    } catch {
      setSavedAddresses([]);
    } finally {
      setAddressesLoading(false);
    }
  }, [user?.email]);

  const openAddressPicker = useCallback(() => {
    setAddressPickerOpen(true);
    void loadSavedAddresses();
  }, [loadSavedAddresses]);

  const applyShipToAddress = useCallback(
    async (addressName: string) => {
      const addr = addressName.trim();
      if (!resolvedOrderId || !addr) return;
      setApplyingAddress(true);
      try {
        await getERPNextClient().updateSalesOrder(resolvedOrderId, {
          shipping_address_name: addr,
        });
        setAddressPickerOpen(false);
        await refetch();
        Alert.alert(t('orderDetails.shippingAddress'), t('orderDetails.shipToUpdated'));
      } catch (e: unknown) {
        Alert.alert(
          t('orderDetails.errorTitle'),
          e instanceof Error ? e.message : t('orderDetails.shipToUpdateFailed')
        );
      } finally {
        setApplyingAddress(false);
      }
    },
    [resolvedOrderId, refetch, t]
  );

  const onAddNewShipToAddress = useCallback(() => {
    setAddressPickerOpen(false);
    (navigation as { navigate: (n: string, p?: object) => void }).navigate('EditAddress', {
      orderId: resolvedOrderId,
    });
  }, [navigation, resolvedOrderId]);

  return (
    <ErpDocumentPreviewLayout
      screenTitle={t('orderDetails.title', { defaultValue: 'Order' })}
      printDoctype="Sales Order"
      printDocName={resolvedOrderId}
      loading={loading && !order}
      errorMessage={errorMessage}
      onBack={() => (navigation as { goBack: () => void }).goBack()}
      onShare={showSendToSupplier ? onShareOrder : undefined}
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
              docId={order.reference || order.orderNumber}
              statusLabel={statusLabel}
              statusColor={accent}
              amount={formatGhanaCedis(order.total)}
              amountLabel={hasAccepted ? t('orderDetails.budget') : t('orderDetails.orderBudget')}
              secondaryAmount={
                hasAccepted && acceptedTotal != null
                  ? formatErpDocMoney(acceptedTotal, acceptedCurrency)
                  : undefined
              }
              secondaryAmountLabel={hasAccepted ? t('orderDetails.acceptedBudget') : undefined}
              subtitle={`${t('orderDetails.orderPlaced')} ${formatErpDocDate(order.createdAt)}`}
              facts={heroFacts}
              statusTrailing={
                showEditOrder ? (
                  <ErpDocHeroActionButton
                    label={t('orderDetails.editOrder')}
                    onPress={onEditOrder}
                    variant="outline"
                    accessibilityLabel={t('orderDetails.editOrder')}
                  />
                ) : undefined
              }
            />

            {order.reference ? (
              <ErpDocSection title={t('orderDetails.detailsSection')}>
                <ErpDocMetaRow label={t('orderDetails.referenceField')} value={order.reference} />
                <ErpDocMetaRow label={t('orderDetails.orderNoField')} value={order.orderNumber} />
              </ErpDocSection>
            ) : null}

            {!isSupplierPortal ? (
              <ErpDocSection title={t('orderDetails.supplier')}>
                <ErpDocMetaRow label={t('orderDetails.supplierField')} value={supplierLabel} />
              </ErpDocSection>
            ) : null}

            <ErpDocSection title={t('common.itemsCount', { count: order.items?.length ?? 0 })}>
              {order.items?.length ? (
                <ErpDocItemsList>
                  {order.items.map((item, idx) => {
                    const acceptedRate = hasAccepted ? acceptedLineRates[idx] : null;
                    return (
                      <ErpDocLineItem
                        key={item.id || `${item.productId}-${item.quantity}`}
                        title={orderItemTitle(item)}
                        detail={
                          hasAccepted
                            ? t('orderDetails.salesOrderLineQty', { qty: item.quantity })
                            : t('orderDetails.salesOrderLineDetail', {
                                qty: item.quantity,
                                budget: formatGhanaCedis(item.price),
                              })
                        }
                        amount={item.price}
                        currency={acceptedCurrency}
                        amountLabel={hasAccepted ? t('orderDetails.budget') : undefined}
                        secondaryAmount={
                          hasAccepted && acceptedRate != null ? acceptedRate : undefined
                        }
                        secondaryAmountLabel={
                          hasAccepted && acceptedRate != null
                            ? t('orderDetails.acceptedBudget')
                            : undefined
                        }
                        imageUri={pickLineDisplayImageUri(null, item.product?.images?.[0])}
                      />
                    );
                  })}
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
                  const subtitle = isSupplierPortal
                    ? total || undefined
                    : [supplier, total].filter(Boolean).join(' · ') || undefined;
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

          <ErpDocCard>
            <ErpDocSection title={t('orderDetails.shippingAddress')}>
              {addressHasContent(order.shippingAddress, order.shippingAddressName) ? (
                <>
                  <Text style={styles.addressText}>
                    {formatAddressLine(order.shippingAddress).trim() || order.shippingAddressName}
                  </Text>
                  {order.shippingAddress.phone ? (
                    <Text style={styles.addressPhone}>{order.shippingAddress.phone}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.addressEmpty}>{t('orderDetails.shipToRequired')}</Text>
              )}
              {canEditShipTo ? (
                <TouchableOpacity
                  style={styles.addressActionBtn}
                  onPress={openAddressPicker}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Ionicons name="location-outline" size={18} color={Colors.WINE} />
                  <Text style={styles.addressActionText}>
                    {addressHasContent(order.shippingAddress, order.shippingAddressName)
                      ? t('orderDetails.changeShipTo')
                      : t('orderDetails.selectShipTo')}
                  </Text>
                </TouchableOpacity>
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
        </>
      ) : null}

      <Modal
        visible={addressPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAddressPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setAddressPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('orderDetails.selectShipTo')}</Text>
              <TouchableOpacity onPress={() => setAddressPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color={Colors.BLACK} />
              </TouchableOpacity>
            </View>

            {addressesLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={Colors.WINE} />
              </View>
            ) : (
              <FlatList
                data={savedAddresses}
                keyExtractor={(item) => String(item.name)}
                style={styles.modalList}
                contentContainerStyle={savedAddresses.length === 0 ? styles.modalListEmpty : undefined}
                ListEmptyComponent={
                  <Text style={styles.modalEmptyText}>{t('orderDetails.noSavedAddresses')}</Text>
                }
                renderItem={({ item }) => {
                  const nm = String(item.name || '').trim();
                  return (
                    <TouchableOpacity
                      style={styles.addressPickRow}
                      onPress={() => void applyShipToAddress(nm)}
                      disabled={applyingAddress || !nm}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="home-outline" size={22} color={Colors.WINE} style={{ marginRight: 12 }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.addressPickTitle} numberOfLines={1}>
                          {addressRowLabel(item)}
                        </Text>
                        <Text style={styles.addressPickSub} numberOfLines={2}>
                          {addressRowSubtitle(item)}
                        </Text>
                      </View>
                      {applyingAddress ? (
                        <ActivityIndicator size="small" color={Colors.WINE} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity
              style={styles.addAddressBtn}
              onPress={onAddNewShipToAddress}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={22} color={Colors.WINE} />
              <Text style={styles.addAddressBtnText}>{t('orderDetails.addNewAddress')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  addressEmpty: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 20,
  },
  addressActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addressActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.WINE,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.WHITE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '78%',
    paddingBottom: Spacing.LG,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.BLACK,
    flex: 1,
    marginRight: 8,
  },
  modalLoading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  modalList: {
    maxHeight: 360,
  },
  modalListEmpty: {
    paddingVertical: 28,
    paddingHorizontal: Spacing.LG,
  },
  modalEmptyText: {
    textAlign: 'center',
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
  },
  addressPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.MD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  addressPickTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.BLACK,
  },
  addressPickSub: {
    marginTop: 3,
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 18,
  },
  addAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Spacing.MD,
    marginTop: Spacing.MD,
    paddingVertical: 14,
    borderWidth: ERP_DOC_FLAT.hairline,
    borderColor: ERP_DOC_FLAT.accent,
    backgroundColor: ERP_DOC_FLAT.surface,
  },
  addAddressBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: ERP_DOC_FLAT.accent,
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
