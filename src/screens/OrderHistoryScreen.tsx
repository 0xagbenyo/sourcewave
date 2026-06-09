import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { useOrders } from '../hooks/erpnext';
import { Order, OrderStatus } from '../types';

const hairline = StyleSheet.hairlineWidth;

type StatusFilterKey = 'all' | 'pending' | 'processing' | 'to_deliver' | 'completed' | 'cancelled';
type SortMode = 'recent' | 'number_az' | 'number_za';

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  to_deliver: 'To deliver',
  completed: 'Completed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Canceled',
  returned: 'Returned',
};

/** Muted pill colors aligned with app status tokens (not full rainbow). */
function statusPillStyle(status: string): { bg: string; text: string; border: string } {
  const s = (status || 'pending') as OrderStatus;
  if (s === 'cancelled' || s === 'returned') {
    return { bg: 'rgba(255, 59, 48, 0.08)', text: Colors.ERROR, border: 'rgba(255, 59, 48, 0.25)' };
  }
  if (s === 'completed' || s === 'delivered') {
    return { bg: 'rgba(52, 199, 89, 0.1)', text: '#248A3D', border: 'rgba(52, 199, 89, 0.28)' };
  }
  if (s === 'pending') {
    return { bg: 'rgba(255, 149, 0, 0.12)', text: '#C93400', border: 'rgba(255, 149, 0, 0.35)' };
  }
  return { bg: 'rgba(0, 122, 255, 0.08)', text: Colors.INFO, border: 'rgba(0, 122, 255, 0.22)' };
}

function matchesStatusFilter(order: Order, f: StatusFilterKey): boolean {
  const s = (order.status || 'pending') as OrderStatus;
  if (f === 'all') return true;
  if (f === 'pending') return s === 'pending';
  if (f === 'processing') return s === 'processing' || s === 'confirmed';
  if (f === 'to_deliver') return s === 'to_deliver' || s === 'shipped';
  if (f === 'completed') return s === 'completed' || s === 'delivered';
  if (f === 'cancelled') return s === 'cancelled' || s === 'returned';
  return true;
}

function formatMoney(amount: number): string {
  return `GH₵${amount.toFixed(2)}`;
}

function formatDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

const FILTER_CHIPS: { key: StatusFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'to_deliver', label: 'To deliver' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Canceled' },
];

export const OrderHistoryScreen: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [resolvedCustomerId, setResolvedCustomerId] = useState('');
  const navigation = useNavigation();
  const { user } = useUserSession();

  useEffect(() => {
    let isMounted = true;
    const resolveCustomer = async () => {
      const sessionCustomerId = user?.user || '';
      if (sessionCustomerId) {
        if (isMounted) setResolvedCustomerId(sessionCustomerId);
        return;
      }
      if (!user?.email) {
        if (isMounted) setResolvedCustomerId('');
        return;
      }
      try {
        const client = (await import('../services/erpnext')).getERPNextClient();
        const customer = await client.getCustomerByEmail(user.email);
        if (isMounted) setResolvedCustomerId(customer?.name || '');
      } catch {
        if (isMounted) setResolvedCustomerId('');
      }
    };
    void resolveCustomer();
    return () => {
      isMounted = false;
    };
  }, [user?.user, user?.email]);

  const { data: orders, loading, loadingMore, error, hasMore, loadMore, refresh } = useOrders(
    resolvedCustomerId,
    undefined,
    20
  );

  const displayOrders = useMemo(() => {
    const list = orders ?? [];
    const filtered = list.filter((o) => matchesStatusFilter(o, statusFilter));
    const out = [...filtered];
    if (sortMode === 'recent') {
      out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortMode === 'number_az') {
      out.sort((a, b) =>
        String(a.orderNumber || a.id).localeCompare(String(b.orderNumber || b.id), undefined, {
          sensitivity: 'base',
          numeric: true,
        })
      );
    } else {
      out.sort((a, b) =>
        String(b.orderNumber || b.id).localeCompare(String(a.orderNumber || a.id), undefined, {
          sensitivity: 'base',
          numeric: true,
        })
      );
    }
    return out;
  }, [orders, statusFilter, sortMode]);

  const cycleSort = useCallback(() => {
    setSortMode((m) => (m === 'recent' ? 'number_az' : m === 'number_az' ? 'number_za' : 'recent'));
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      loadMore();
    }
  }, [hasMore, loadingMore, loading, loadMore]);

  const nav = navigation as { navigate: (name: string, params?: object) => void; goBack: () => void };

  const orderCount = orders?.length ?? 0;
  const initialLoading = loading && orderCount === 0 && !loadingMore;

  const sortLabel = sortMode === 'recent' ? 'Newest' : sortMode === 'number_az' ? 'Order A–Z' : 'Order Z–A';

  const renderOrderCard = ({ item }: { item: Order }) => {
    if (!item?.id) return null;
    const statusLabel = statusLabels[item.status] || statusLabels.pending;
    const pill = statusPillStyle(item.status);
    const itemCount = item.items?.length || 0;

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => nav.navigate('OrderDetails', { orderId: item.id })}
        activeOpacity={0.85}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <Text style={styles.orderId} numberOfLines={1}>
              {item.orderNumber || item.id}
            </Text>
            <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text style={styles.orderTotal}>{formatMoney(item.total)}</Text>
        </View>
        <View style={styles.cardBottom}>
          <View style={[styles.statusPill, { backgroundColor: pill.bg, borderColor: pill.border }]}>
            <Text style={[styles.statusPillText, { color: pill.text }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
          <Text style={styles.itemLine} numberOfLines={1}>
            {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'View breakdown'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const listEmpty = !loading ? (
    <View style={styles.emptyWrap}>
      {!user?.email ? (
        <>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="bag-outline" size={32} color={Colors.TEXT_SECONDARY} />
          </View>
          <Text style={styles.emptyTitle}>Sign in to see orders</Text>
          <Text style={styles.emptySub}>Order history is saved to your account.</Text>
        </>
      ) : !resolvedCustomerId ? (
        <>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="person-outline" size={32} color={Colors.TEXT_SECONDARY} />
          </View>
          <Text style={styles.emptyTitle}>Account not linked</Text>
          <Text style={styles.emptySub}>We could not match your login to a customer record.</Text>
        </>
      ) : orderCount > 0 && displayOrders.length === 0 ? (
        <>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="search-outline" size={32} color={Colors.TEXT_SECONDARY} />
          </View>
          <Text style={styles.emptyTitle}>No orders in this filter</Text>
          <Text style={styles.emptySub}>Try choosing “All” or another status.</Text>
        </>
      ) : (
        <>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="receipt-outline" size={32} color={Colors.TEXT_SECONDARY} />
          </View>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySub}>When you shop, your orders will appear here.</Text>
        </>
      )}
    </View>
  ) : null;

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.WINE} />
      </View>
    );
  };

  const filterStrip =
    orderCount > 0 ? (
      <View style={styles.filterStrip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
        >
          {FILTER_CHIPS.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.filterChip, statusFilter === key && styles.filterChipOn]}
              onPress={() => setStatusFilter(key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, statusFilter === key && styles.filterChipTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => nav.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backWrap}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={Colors.BLACK} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            My orders
          </Text>
          {orderCount > 0 ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {orderCount} order{orderCount !== 1 ? 's' : ''}
              {statusFilter !== 'all' || sortMode !== 'recent'
                ? ` · ${displayOrders.length} shown`
                : ''}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.sortHit, orderCount === 0 && styles.sortHitDisabled]}
          onPress={cycleSort}
          disabled={orderCount === 0}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortLabel}`}
        >
          <Ionicons name="swap-vertical" size={20} color={orderCount === 0 ? Colors.TEXT_DISABLED : Colors.WINE} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={20} color={Colors.ERROR} style={styles.errorIcon} />
          <Text style={styles.errorBannerText}>{error.message}</Text>
        </View>
      ) : null}

      {initialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.WINE} />
          <Text style={styles.loadingCaption}>Loading your orders…</Text>
        </View>
      ) : (
        <FlatList
          data={displayOrders}
          renderItem={renderOrderCard}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={filterStrip}
          contentContainerStyle={[
            styles.listContent,
            displayOrders.length === 0 && styles.listContentEmpty,
          ]}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.45}
          refreshControl={
            <RefreshControl
              refreshing={loading && !loadingMore}
              onRefresh={refresh}
              tintColor={Colors.WINE}
              colors={[Colors.WINE]}
            />
          }
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={10}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.OFF_WHITE,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.SCREEN_PADDING - 4,
    paddingVertical: 10,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  backWrap: {
    paddingVertical: 4,
    paddingRight: 4,
    marginRight: 4,
  },
  headerTitles: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.TEXT_PRIMARY,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.TEXT_SECONDARY,
  },
  sortHit: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(230, 0, 18, 0.06)',
  },
  sortHitDisabled: {
    backgroundColor: 'transparent',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: Spacing.SCREEN_PADDING,
    marginTop: 12,
    padding: 14,
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
  },
  errorIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  errorBannerText: {
    flex: 1,
    color: Colors.DARK_GRAY,
    fontSize: 14,
    lineHeight: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingCaption: {
    marginTop: 14,
    fontSize: 15,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '500',
  },
  filterStrip: {
    backgroundColor: Colors.WHITE,
    paddingBottom: 12,
    paddingTop: 4,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    marginBottom: 4,
  },
  chipScroll: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 8,
    alignItems: 'center',
    flexGrow: 1,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    backgroundColor: Colors.OFF_WHITE,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  filterChipOn: {
    backgroundColor: 'rgba(230, 0, 18, 0.07)',
    borderColor: Colors.WINE,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.DARK_GRAY,
  },
  filterChipTextOn: {
    color: Colors.WINE,
  },
  listContent: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 12,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  orderCard: {
    backgroundColor: Colors.WHITE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardTopLeft: {
    flex: 1,
    minWidth: 0,
  },
  orderId: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.TEXT_PRIMARY,
    letterSpacing: -0.2,
  },
  orderDate: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.TEXT_SECONDARY,
  },
  orderTotal: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.WINE,
    fontVariant: ['tabular-nums'],
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: hairline,
    borderTopColor: Colors.BORDER,
    gap: 10,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: '55%',
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemLine: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '500',
    color: Colors.TEXT_SECONDARY,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 28,
    minHeight: 320,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  emptyTitle: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.TEXT_PRIMARY,
    textAlign: 'center',
  },
  emptySub: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
