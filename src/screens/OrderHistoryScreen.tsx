import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { useUserSession } from '../context/UserContext';
import { useOrders } from '../hooks/erpnext';
import { Order } from '../types';

const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
  'pending': { color: Colors.WARNING, icon: 'time-outline', label: 'Pending' },
  'confirmed': { color: Colors.INFO, icon: 'checkmark-circle-outline', label: 'Confirmed' },
  'processing': { color: Colors.ELECTRIC_BLUE, icon: 'cube-outline', label: 'Processing' },
  'to_deliver': { color: Colors.INFO, icon: 'car-outline', label: 'To Deliver' },
  'completed': { color: Colors.SUCCESS, icon: 'checkmark-circle', label: 'Completed' },
  'shipped': { color: Colors.INFO, icon: 'car-outline', label: 'Shipped' },
  'delivered': { color: Colors.SUCCESS, icon: 'checkmark-circle', label: 'Delivered' },
  'cancelled': { color: Colors.ERROR, icon: 'close-circle', label: 'Canceled' },
  'returned': { color: Colors.ERROR, icon: 'arrow-undo-outline', label: 'Returned' },
};

export const OrderHistoryScreen: React.FC = () => {
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [resolvedCustomerId, setResolvedCustomerId] = useState('');
  const navigation = useNavigation();
  const { user } = useUserSession();
  
  // Get customer ID from session; fallback to portal-user lookup by email.
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
    resolveCustomer();
    return () => {
      isMounted = false;
    };
  }, [user?.user, user?.email]);
  
  // Fetch sales orders for the logged-in user with pagination
  const { data: orders, loading, loadingMore, error, hasMore, loadMore, refresh } = useOrders(resolvedCustomerId, undefined, 20);
  
  // Debug logging
  useEffect(() => {
    console.log('📦 OrderHistoryScreen - Orders state:', {
      ordersCount: orders?.length || 0,
      loading,
      loadingMore,
      hasMore,
      error: error?.message,
      customerId: resolvedCustomerId,
      selectedFilter,
      filteredCount: filteredOrders?.length || 0,
    });
    if (orders && orders.length > 0) {
      console.log('📦 First order:', orders[0]);
      console.log('📦 All order statuses:', orders.map(o => ({ id: o.id, status: o.status })));
    }
  }, [orders, loading, loadingMore, hasMore, error, resolvedCustomerId, selectedFilter, filteredOrders]);

  // Handle infinite scroll
  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      loadMore();
    }
  }, [hasMore, loadingMore, loading, loadMore]);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => (navigation as any).goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>My Orders</Text>
      <View style={styles.placeholder} />
    </View>
  );

  const renderFilterTabs = () => {
    const filters = ['All', 'Pending', 'Processing', 'To Deliver', 'Completed', 'Canceled'];
    
    return (
      <View style={styles.filterTabs}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterTab,
              selectedFilter === filter && styles.filterTabActive
            ]}
            onPress={() => setSelectedFilter(filter)}
          >
            <Text style={[
              styles.filterTabText,
              selectedFilter === filter && styles.filterTabTextActive
            ]}>
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return `GH₵${amount.toFixed(2)}`;
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    if (!item || !item.id) {
      console.warn('Invalid order item:', item);
      return null;
    }
    
    const status = statusConfig[item.status] || statusConfig['pending'];
    const itemCount = item.items?.length || 0;
    
    return (
      <TouchableOpacity 
        style={styles.invoiceCard}
        onPress={() => {
          (navigation as any).navigate('OrderDetails', { orderId: item.id });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.invoiceHeader}>
          <View style={styles.invoiceInfo}>
            <Text style={styles.invoiceNumber}>{item.orderNumber}</Text>
            <Text style={styles.invoiceDate}>{formatDate(item.createdAt)}</Text>
          </View>
          <View style={styles.statusContainer}>
            <Ionicons name={status.icon as any} size={16} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        <View style={styles.invoiceDetails}>
          <Text style={styles.itemCount}>
            {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'View items'}
          </Text>
          <Text style={styles.totalAmount}>{formatCurrency(item.total)}</Text>
        </View>

        <View style={styles.invoiceFooter}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => {
              (navigation as any).navigate('OrderDetails', { orderId: item.id });
            }}
          >
            <Text style={[styles.actionButtonText, styles.primaryButtonText]}>
              View Details
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredOrders = orders && selectedFilter !== 'All'
    ? orders.filter(order => {
        const status = order.status || 'pending';
        console.log('Filtering order:', { orderNumber: order.orderNumber, status, selectedFilter });
        if (selectedFilter === 'Pending') return status === 'pending';
        if (selectedFilter === 'Processing') return status === 'processing';
        if (selectedFilter === 'To Deliver') return status === 'to_deliver';
        if (selectedFilter === 'Completed') return status === 'completed';
        if (selectedFilter === 'Canceled') return status === 'cancelled';
        return true;
      })
    : orders || [];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        {renderFilterTabs()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.ROYAL_BLUE} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        {renderFilterTabs()}
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.ERROR} />
          <Text style={styles.errorText}>Error loading orders</Text>
          <Text style={styles.errorSubtext}>{error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        {renderFilterTabs()}
        <View style={styles.emptyContainer}>
          <Ionicons name="document-outline" size={64} color={Colors.TEXT_SECONDARY} />
          <Text style={styles.emptyText}>No orders found</Text>
          <Text style={styles.emptySubtext}>Your orders will appear here</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.ROYAL_BLUE} />
        <Text style={styles.footerLoaderText}>Loading more orders...</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderFilterTabs()}
      <FlatList
        data={filteredOrders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.invoicesList}
        showsVerticalScrollIndicator={false}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={64} color={Colors.TEXT_SECONDARY} />
            <Text style={styles.emptyText}>No orders found</Text>
            <Text style={styles.emptySubtext}>
              {selectedFilter !== 'All' 
                ? `No ${selectedFilter.toLowerCase()} orders`
                : 'Your orders will appear here'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={loading && !loadingMore}
            onRefresh={refresh}
            tintColor={Colors.ROYAL_BLUE}
            colors={[Colors.ROYAL_BLUE]}
          />
        }
        removeClippedSubviews={true}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={10}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  placeholder: {
    width: 32,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  filterTabActive: {
    backgroundColor: Colors.ROYAL_BLUE,
    borderColor: Colors.ROYAL_BLUE,
  },
  filterTabText: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: Colors.WHITE,
    fontWeight: '700',
  },
  invoicesList: {
    padding: 16,
  },
  invoiceCard: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginBottom: 4,
  },
  invoiceDate: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  invoiceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  itemCount: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  invoiceFooter: {
    marginTop: 8,
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.ROYAL_BLUE,
    borderColor: Colors.ROYAL_BLUE,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.BLACK,
  },
  primaryButtonText: {
    color: Colors.WHITE,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  errorSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLoaderText: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
});
