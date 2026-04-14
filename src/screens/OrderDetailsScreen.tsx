import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { useOrder } from '../hooks/erpnext';
import { OrderItem } from '../types';

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

export const OrderDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { orderId, orderNumber } = (route.params as any) || {};
  const resolvedOrderId = orderId || orderNumber || '';
  
  const { data: order, loading, error } = useOrder(resolvedOrderId);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return `GH₵${amount.toFixed(2)}`;
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => (navigation as any).goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Order Details</Text>
      <View style={styles.placeholder} />
    </View>
  );

  const renderOrderItem = (item: OrderItem, index: number) => (
    <View key={index} style={styles.orderItemRow}>
      <View style={styles.tableCellItem}>
        <Text style={styles.itemCode}>{item.productId}</Text>
        {item.product?.name && (
          <Text style={styles.itemName}>{item.product.name}</Text>
        )}
        {item.color && item.size && (
          <Text style={styles.itemVariant}>
            {item.color.name} / {item.size.name}
          </Text>
        )}
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableCellText}>{item.quantity}</Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableCellText}>{formatCurrency(item.price)}</Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={[styles.tableCellText, styles.amountValue]}>
          {formatCurrency(item.price * item.quantity)}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.ROYAL_BLUE} />
          <Text style={styles.loadingText}>Loading order...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.ERROR} />
          <Text style={styles.errorText}>Error loading order</Text>
          {error && <Text style={styles.errorSubtext}>{error.message}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const status = statusConfig[order.status] || statusConfig['pending'];

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <View>
              <Text style={styles.orderNumber}>{order.orderNumber}</Text>
              <Text style={styles.orderDate}>
                {formatDate(order.createdAt)}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
              <Ionicons name={status.icon as any} size={16} color={Colors.WHITE} />
              <Text style={styles.statusText}>{status.label}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Items</Text>
            <View style={styles.itemsTable}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableHeaderText}>Item</Text>
                <Text style={styles.tableHeaderText}>Qty</Text>
                <Text style={styles.tableHeaderText}>Price</Text>
                <Text style={styles.tableHeaderText}>Total</Text>
              </View>
              {order.items && order.items.length > 0 ? (
                order.items.map((item, index) => renderOrderItem(item, index))
              ) : (
                <View style={styles.emptyItems}>
                  <Text style={styles.emptyItemsText}>No items found</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.summarySection}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(order.subtotal)}</Text>
            </View>
            {order.tax > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tax:</Text>
                <Text style={styles.summaryValue}>{formatCurrency(order.tax)}</Text>
              </View>
            )}
            {order.shipping > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Shipping:</Text>
                <Text style={styles.summaryValue}>{formatCurrency(order.shipping)}</Text>
              </View>
            )}
            {order.discount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Discount:</Text>
                <Text style={[styles.summaryValue, styles.discountValue]}>
                  -{formatCurrency(order.discount)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.totalSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total:</Text>
              <Text style={styles.totalAmount}>{formatCurrency(order.total)}</Text>
            </View>
          </View>

          {order.shippingAddress && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Shipping Address</Text>
              <View style={styles.addressCard}>
                <Text style={styles.addressText}>
                  {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                </Text>
                <Text style={styles.addressText}>
                  {order.shippingAddress.addressLine1}
                </Text>
                {order.shippingAddress.addressLine2 && (
                  <Text style={styles.addressText}>
                    {order.shippingAddress.addressLine2}
                  </Text>
                )}
                <Text style={styles.addressText}>
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
                </Text>
                <Text style={styles.addressText}>
                  {order.shippingAddress.country}
                </Text>
                {order.shippingAddress.phone && (
                  <Text style={[styles.addressText, styles.addressPhone]}>
                    {order.shippingAddress.phone}
                  </Text>
                )}
              </View>
            </View>
          )}

          {order.trackingNumber && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tracking</Text>
              <View style={styles.trackingCard}>
                <Ionicons name="car-outline" size={20} color={Colors.ELECTRIC_BLUE} />
                <Text style={styles.trackingNumber}>{order.trackingNumber}</Text>
              </View>
            </View>
          )}

          {order.estimatedDelivery && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Estimated Delivery</Text>
              <Text style={styles.deliveryDate}>
                {formatDate(order.estimatedDelivery)}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
  },
  orderCard: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.WHITE,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginBottom: 12,
  },
  itemsTable: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.LIGHT_GRAY,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.BLACK,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  orderItemRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    alignItems: 'center',
  },
  tableCellItem: {
    flex: 1,
    paddingRight: 8,
  },
  tableCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCellText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.BLACK,
    textAlign: 'center',
  },
  itemCode: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.BLACK,
    marginBottom: 2,
  },
  itemName: {
    fontSize: 11,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 2,
  },
  itemVariant: {
    fontSize: 10,
    color: Colors.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
  amountValue: {
    fontWeight: 'bold',
    color: Colors.ROYAL_BLUE,
  },
  emptyItems: {
    padding: 24,
    alignItems: 'center',
  },
  emptyItemsText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  summarySection: {
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.BLACK,
  },
  discountValue: {
    color: Colors.SUCCESS,
  },
  totalSection: {
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: Colors.BORDER,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.ROYAL_BLUE,
  },
  addressCard: {
    backgroundColor: Colors.LIGHT_GRAY,
    padding: 12,
    borderRadius: 8,
  },
  addressText: {
    fontSize: 13,
    color: Colors.BLACK,
    marginBottom: 3,
  },
  addressPhone: {
    marginTop: 8,
    fontWeight: '500',
  },
  trackingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.LIGHT_GRAY,
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  trackingNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  deliveryDate: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.BLACK,
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
});

