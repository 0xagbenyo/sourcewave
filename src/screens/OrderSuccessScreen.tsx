import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../components/Button';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Spacing } from '../constants/spacing';
import { GRAY_PIXEL_DATA_URI } from '../constants/inlinePlaceholder';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';

// Sample order details shown until a live order is wired through navigation params.
const mockOrder = {
  orderNumber: 'GLM-2024-001234',
  orderDate: 'December 15, 2024',
  estimatedDelivery: 'December 20-22, 2024',
  totalAmount: 154.97,
  items: [
    {
      id: '1',
      name: 'Summer Floral Maxi Dress',
      price: 49.99,
      quantity: 1,
      color: 'Blue Floral',
      size: 'S',
      image: GRAY_PIXEL_DATA_URI,
    },
    {
      id: '2',
      name: 'High-Waist Skinny Jeans',
      price: 39.99,
      quantity: 2,
      color: 'Light Blue',
      size: 'M',
      image: GRAY_PIXEL_DATA_URI,
    },
    {
      id: '3',
      name: 'Crop Top Blouse',
      price: 24.99,
      quantity: 1,
      color: 'White',
      size: 'S',
      image: GRAY_PIXEL_DATA_URI,
    },
  ],
  shippingAddress: {
    name: 'Sarah Johnson',
    address: '123 Main Street, Apt 4B',
    city: 'New York, NY 10001',
    phone: '+1 (555) 123-4567',
  },
  paymentMethod: {
    type: 'Visa',
    lastFourDigits: '4242',
  },
};

export const OrderSuccessScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const orderNumber = (route.params as any)?.orderNumber || mockOrder.orderNumber;

  const formatPrice = (price: number) => {
    return `GH₵${price.toFixed(2)}`;
  };

  const handleContinueShopping = () => {
    navigation.navigate('Home' as never);
  };

  const handleViewOrder = () => {
    // Navigate to Order History (Sales Orders)
    (navigation as any).navigate('OrderHistory');
  };

  const handleTrackOrder = () => {
    // Navigate to order tracking
    Alert.alert('Track Order', 'This would navigate to order tracking screen');
  };

  const renderSuccessHeader = () => (
    <View style={styles.successHeader}>
      <LinearGradient
        colors={[Colors.VIBRANT_PINK, Colors.ELECTRIC_BLUE]}
        style={styles.successIconContainer}
      >
        <Ionicons name="checkmark" size={40} color={Colors.WHITE} />
      </LinearGradient>
      <Text style={styles.successTitle}>Order Confirmed!</Text>
      <Text style={styles.successSubtitle}>
        Thank you for your purchase. Your order has been successfully placed.
      </Text>
    </View>
  );

  const renderOrderInfo = () => (
    <View style={styles.orderInfoCard}>
      <View style={styles.orderInfoRow}>
        <Text style={styles.orderInfoLabel}>Order Number:</Text>
        <Text style={styles.orderInfoValue}>{orderNumber}</Text>
      </View>
      <View style={styles.orderInfoRow}>
        <Text style={styles.orderInfoLabel}>Order Date:</Text>
        <Text style={styles.orderInfoValue}>{mockOrder.orderDate}</Text>
      </View>
      <View style={styles.orderInfoRow}>
        <Text style={styles.orderInfoLabel}>Estimated Delivery:</Text>
        <Text style={styles.orderInfoValue}>{mockOrder.estimatedDelivery}</Text>
      </View>
      <View style={styles.orderInfoRow}>
        <Text style={styles.orderInfoLabel}>Total Amount:</Text>
        <Text style={styles.orderInfoValue}>{formatPrice(mockOrder.totalAmount)}</Text>
      </View>
    </View>
  );

  const renderOrderItems = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Order Items</Text>
      {mockOrder.items.map((item) => (
        <View key={item.id} style={styles.orderItem}>
          <ErpAuthenticatedImage uri={item.image} style={styles.itemImage} resizeMode="cover" />
          <View style={styles.itemDetails}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemDetails}>
              {item.color} • Size {item.size} • Qty {item.quantity}
            </Text>
            <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderShippingInfo = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Shipping Information</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Ionicons name="location-outline" size={20} color={Colors.TEXT_PRIMARY} />
          <Text style={styles.infoTitle}>Shipping Address</Text>
        </View>
        <Text style={styles.infoText}>{mockOrder.shippingAddress.name}</Text>
        <Text style={styles.infoText}>{mockOrder.shippingAddress.address}</Text>
        <Text style={styles.infoText}>{mockOrder.shippingAddress.city}</Text>
        <Text style={styles.infoText}>{mockOrder.shippingAddress.phone}</Text>
      </View>
    </View>
  );

  const renderPaymentInfo = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Payment Information</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Ionicons name="card-outline" size={20} color={Colors.TEXT_PRIMARY} />
          <Text style={styles.infoTitle}>Payment Method</Text>
        </View>
        <Text style={styles.infoText}>
          {mockOrder.paymentMethod.type} ending in {mockOrder.paymentMethod.lastFourDigits}
        </Text>
      </View>
    </View>
  );

  const renderNextSteps = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>What's Next?</Text>
      <View style={styles.nextStepsContainer}>
        <View style={styles.nextStep}>
          <View style={styles.stepIcon}>
            <Ionicons name="mail-outline" size={24} color={Colors.VIBRANT_PINK} />
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Order Confirmation Email</Text>
            <Text style={styles.stepDescription}>
              You'll receive a confirmation email with your order details shortly.
            </Text>
          </View>
        </View>

        <View style={styles.nextStep}>
          <View style={styles.stepIcon}>
            <Ionicons name="car-outline" size={24} color={Colors.ELECTRIC_BLUE} />
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Shipping Updates</Text>
            <Text style={styles.stepDescription}>
              Track your order status and get notified when your package ships.
            </Text>
          </View>
        </View>

        <View style={styles.nextStep}>
          <View style={styles.stepIcon}>
            <Ionicons name="time-outline" size={24} color={Colors.SUCCESS} />
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Estimated Delivery</Text>
            <Text style={styles.stepDescription}>
              Your order will arrive between {mockOrder.estimatedDelivery}.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderActionButtons = () => (
    <View style={styles.actionButtons}>
      <Button
        title="Continue Shopping"
        onPress={handleContinueShopping}
        variant="primary"
        size="large"
        fullWidth
        style={styles.continueButton}
      />
      
      <View style={styles.secondaryButtons}>
        <Button
          title="Track Order"
          onPress={handleTrackOrder}
          variant="outline"
          size="medium"
          style={styles.secondaryButton}
        />
        <Button
          title="View Order"
          onPress={handleViewOrder}
          variant="outline"
          size="medium"
          style={styles.secondaryButton}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderSuccessHeader()}
        {renderOrderInfo()}
        {renderOrderItems()}
        {renderShippingInfo()}
        {renderPaymentInfo()}
        {renderNextSteps()}
        {renderActionButtons()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  successHeader: {
    alignItems: 'center',
    paddingHorizontal: Spacing.PADDING_XL,
    paddingVertical: Spacing.PADDING_XXL,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.MARGIN_LG,
  },
  successTitle: {
    fontSize: Typography.FONT_SIZE_2XL,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_SM,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: Typography.FONT_SIZE_MD,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: Typography.FONT_SIZE_MD * 1.4,
  },
  orderInfoCard: {
    backgroundColor: Colors.SURFACE,
    marginHorizontal: Spacing.PADDING_LG,
    borderRadius: Spacing.BORDER_RADIUS_LG,
    padding: Spacing.PADDING_LG,
    shadowColor: Colors.SHADOW,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  orderInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.PADDING_SM,
  },
  orderInfoLabel: {
    fontSize: Typography.FONT_SIZE_MD,
    color: Colors.TEXT_SECONDARY,
  },
  orderInfoValue: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
  },
  section: {
    marginHorizontal: Spacing.PADDING_LG,
    marginTop: Spacing.MARGIN_XL,
  },
  sectionTitle: {
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_LG,
  },
  orderItem: {
    flexDirection: 'row',
    backgroundColor: Colors.SURFACE,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    padding: Spacing.PADDING_MD,
    marginBottom: Spacing.MARGIN_MD,
    shadowColor: Colors.SHADOW,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemImage: {
    width: 60,
    height: 90,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    marginRight: Spacing.MARGIN_MD,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  itemDetails: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  itemPrice: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
  },
  infoCard: {
    backgroundColor: Colors.SURFACE,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    padding: Spacing.PADDING_LG,
    shadowColor: Colors.SHADOW,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.MARGIN_MD,
  },
  infoTitle: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
    marginLeft: Spacing.MARGIN_SM,
  },
  infoText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  nextStepsContainer: {
    gap: Spacing.MARGIN_LG,
  },
  nextStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.MARGIN_MD,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  stepDescription: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    lineHeight: Typography.FONT_SIZE_SM * 1.4,
  },
  actionButtons: {
    marginHorizontal: Spacing.PADDING_LG,
    marginTop: Spacing.MARGIN_XXL,
    marginBottom: Spacing.MARGIN_XL,
  },
  continueButton: {
    marginBottom: Spacing.MARGIN_LG,
  },
  secondaryButtons: {
    flexDirection: 'row',
    gap: Spacing.MARGIN_MD,
  },
  secondaryButton: {
    flex: 1,
  },
});
