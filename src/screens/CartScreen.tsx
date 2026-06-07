import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useShoppingCart, useCartActions } from '../hooks/erpnext';
import { useUserSession } from '../context/UserContext';
import { useFocusEffect, useNavigation, CommonActions } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { LoadingScreen } from '../components/LoadingScreen';
import { getERPNextClient } from '../services/erpnext';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';

export const CartScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const { cartItems, loading, error, refresh } = useShoppingCart(user?.email || null);
  const { removeFromCart, updateQuantity, isLoading: isCartActionLoading } = useCartActions(refresh);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set()); // Track items being updated
  const [optimisticQuantities, setOptimisticQuantities] = useState<Map<string, number>>(new Map()); // Optimistic quantity updates
  const [quantityInputs, setQuantityInputs] = useState<{ [key: string]: string }>({}); // Track quantity input values
  const [isValidatingCheckout, setIsValidatingCheckout] = useState(false);
  const [showStockAlert, setShowStockAlert] = useState(false);
  const [problematicItems, setProblematicItems] = useState<Array<{ name: string; reason: string; itemCode: string }>>([]);
  
  // Sync optimistic quantities with actual cart items when cart updates
  // Only clear optimistic state when the actual cart quantity matches the optimistic one
  React.useEffect(() => {
    if (cartItems.length > 0 && optimisticQuantities.size > 0) {
      setOptimisticQuantities(prev => {
        const newMap = new Map(prev);
        let hasChanges = false;
        
        // Remove optimistic quantities that match the actual cart quantities
        cartItems.forEach(item => {
          const optimisticQty = newMap.get(item.itemCode);
          if (optimisticQty !== undefined && optimisticQty === item.quantity) {
            // Quantity matches server value, safe to clear optimistic state
            newMap.delete(item.itemCode);
            hasChanges = true;
          }
        });
        
        // Only update if there were changes to avoid unnecessary re-renders
        return hasChanges ? newMap : prev;
      });
    }
  }, [cartItems]);
  
  // Refresh cart when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (user?.email) {
        refresh();
      }
    }, [user?.email, refresh])
  );
  
  // Handle pull-to-refresh - reload the entire page
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (error) {
      console.error('Error refreshing cart:', error);
    } finally {
      setRefreshing(false);
    }
  };
  
  // Handle remove item
  const handleRemoveItem = async (itemCode: string) => {
    try {
      await removeFromCart(itemCode);
    } catch (error) {
      console.error('Error removing item:', error);
    }
  };
  
  // Handle update quantity with optimistic update
  const handleUpdateQuantity = async (itemCode: string, newQuantity: number) => {
    // Clear the input value for this item when using +/- buttons
    setQuantityInputs(prev => {
      const updated = { ...prev };
      delete updated[itemCode];
      return updated;
    });
    if (newQuantity <= 0) {
      await handleRemoveItem(itemCode);
      return;
    }
    
    // Optimistic update: immediately update the quantity in UI
    setOptimisticQuantities(prev => {
      const newMap = new Map(prev);
      newMap.set(itemCode, newQuantity);
      return newMap;
    });
    
    // Add to updating set
    setUpdatingItems(prev => new Set(prev).add(itemCode));
    
    try {
      await updateQuantity(itemCode, newQuantity);
      // Don't clear optimistic quantity here - let the useEffect sync handle it
      // The cart will refresh and the useEffect will clear when quantities match
    } catch (error) {
      console.error('Error updating quantity:', error);
      // Revert optimistic update on error
      setOptimisticQuantities(prev => {
        const newMap = new Map(prev);
        newMap.delete(itemCode);
        return newMap;
      });
    } finally {
      // Remove from updating set
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemCode);
        return newSet;
      });
    }
  };
  
  // Handle decrease quantity
  const handleDecreaseQuantity = async (itemCode: string, currentQuantity: number) => {
    const newQuantity = currentQuantity - 1;
    if (newQuantity <= 0) {
      await handleRemoveItem(itemCode);
      return;
    }
    await handleUpdateQuantity(itemCode, newQuantity);
  };
  
  // Get the effective quantity (optimistic or actual)
  const getEffectiveQuantity = (itemCode: string, actualQuantity: number): number => {
    return optimisticQuantities.get(itemCode) ?? actualQuantity;
  };

  const handleQuantityInputChange = (itemCode: string, value: string) => {
    // Only allow numbers
    const numericValue = value.replace(/[^0-9]/g, '');
    setQuantityInputs(prev => ({
      ...prev,
      [itemCode]: numericValue,
    }));
  };

  const validateCartItemsBeforeCheckout = async () => {
    const client = getERPNextClient();
    const problematicItems: Array<{ name: string; reason: string; itemCode: string }> = [];

    // Check stock for each cart item
    for (const item of cartItems) {
      if (!item.product || !item.itemCode) continue;

      try {
        // Fetch current stock for the item
        // getItem will find the Website Item by item_code and fetch stock
        const websiteItem = await client.getItem(item.itemCode);
        const availableStock = websiteItem?.available_stock ?? 0;

        if (availableStock === 0) {
          problematicItems.push({
            name: item.product.name || item.itemCode,
            reason: 'out of stock',
            itemCode: item.itemCode,
          });
        } else if (availableStock < item.quantity) {
          problematicItems.push({
            name: item.product.name || item.itemCode,
            reason: `only ${availableStock} available (requested ${item.quantity})`,
            itemCode: item.itemCode,
          });
        }
      } catch (error) {
        console.error(`Error checking stock for ${item.itemCode}:`, error);
        // If we can't check stock, assume it's problematic
        problematicItems.push({
          name: item.product.name || item.itemCode,
          reason: 'unable to verify stock',
          itemCode: item.itemCode,
        });
      }
    }

    return problematicItems;
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Your cart is empty. Add items to proceed to checkout.');
      return;
    }

    setIsValidatingCheckout(true);
    try {
      const problematicItems = await validateCartItemsBeforeCheckout();

      if (problematicItems.length > 0) {
        setIsValidatingCheckout(false);
        setProblematicItems(problematicItems);
        setShowStockAlert(true);
        return;
      }

      // All items are valid, proceed to checkout
      setIsValidatingCheckout(false);
      (navigation as any).navigate('Checkout');
    } catch (error) {
      setIsValidatingCheckout(false);
      console.error('Error validating cart items:', error);
      Alert.alert('Error', 'Unable to verify item availability. Please try again.');
    }
  };

  const handleQuantityInputBlur = async (itemCode: string, currentQty: number) => {
    const inputValue = quantityInputs[itemCode];
    if (!inputValue) {
      // Clear the input if empty
      setQuantityInputs(prev => {
        const updated = { ...prev };
        delete updated[itemCode];
        return updated;
      });
      return;
    }

    const newQty = parseInt(inputValue, 10);
    if (isNaN(newQty) || newQty < 1) {
      // Invalid input, reset to current quantity
      setQuantityInputs(prev => {
        const updated = { ...prev };
        delete updated[itemCode];
        return updated;
      });
      return;
    }

    if (newQty !== currentQty) {
      try {
        await handleUpdateQuantity(itemCode, newQty);
        // Clear the input value after successful update
        setQuantityInputs(prev => {
          const updated = { ...prev };
          delete updated[itemCode];
          return updated;
        });
      } catch (error) {
        console.error('Error updating quantity:', error);
        // Reset to current quantity on error
        setQuantityInputs(prev => {
          const updated = { ...prev };
          delete updated[itemCode];
          return updated;
        });
      }
    } else {
      // Same quantity, just clear the input
      setQuantityInputs(prev => {
        const updated = { ...prev };
        delete updated[itemCode];
        return updated;
      });
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => (navigation as any).goBack()}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.BLACK} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioButton}>
            <Ionicons name="radio-button-off" size={16} color={Colors.BLACK} />
          </TouchableOpacity>
          <Text style={styles.radioLabel}>All</Text>
        </View>
        <Text style={styles.cartTitle}>Cart ({cartItems.length})</Text>
        <TouchableOpacity style={styles.moreButton}>
          <Ionicons name="ellipsis-vertical" size={16} color={Colors.BLACK} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.shippingInfo}>
        <Text style={styles.shippingText}>Ship to Accra {'>'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFilterTabs = () => (
    <View style={styles.filterTabs}>
      {[
        { id: '1', name: 'All', active: true },
        { id: '2', name: 'Markdowns', icon: 'arrow-down' },
        { id: '3', name: 'Almost Out of Stock', icon: 'flame' },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.id}
          style={[
            styles.filterTab,
            tab.active && styles.filterTabActive
          ]}
          onPress={() => setSelectedFilter(tab.name)}
        >
          {tab.icon && (
            <Ionicons 
              name={tab.icon as any} 
              size={16} 
              color={tab.active ? Colors.WHITE : Colors.BLACK} 
            />
          )}
          <Text style={[
            styles.filterTabText,
            tab.active && styles.filterTabTextActive
          ]}>
            {tab.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderCartItem = ({ item }: { item: any }) => {
    if (!item.product) {
      return null; // Skip items without product data
    }
    
    const product = item.product;
    const formatPrice = (price: number) => `GH₵${price.toFixed(2)}`;
    const isUpdating = updatingItems.has(item.itemCode);
    
    // Get effective quantity (optimistic or actual)
    const effectiveQuantity = getEffectiveQuantity(item.itemCode, item.quantity);
    
    // Calculate total price for this item (price * quantity)
    const itemTotalPrice = product.price * effectiveQuantity;
    const itemTotalOriginalPrice = product.originalPrice ? product.originalPrice * effectiveQuantity : null;
    
    // Check if this item is out of stock
    const isOutOfStock = problematicItems.some(p => p.itemCode === item.itemCode);
    const outOfStockItem = problematicItems.find(p => p.itemCode === item.itemCode);
    
    // Extract available stock from the reason text (e.g., "only 5 available")
    const availableStock = outOfStockItem?.reason.match(/only (\d+) available/) ? 
      outOfStockItem.reason.match(/only (\d+) available/)?.[1] : null;
    
    const handleImagePress = () => {
      // Navigate to product details using product.id
      const productId = product.id || item.productId;
      if (productId) {
        (navigation as any).navigate('ProductDetails', { productId });
      }
    };

    return (
      <View style={[styles.cartItem, isOutOfStock && styles.cartItemOutOfStock]}>
        {isOutOfStock && (
          <View style={styles.outOfStockOverlay}>
            <Ionicons name="alert-circle" size={28} color={Colors.WHITE} />
            <Text style={styles.outOfStockText}>Out of Stock</Text>
            {availableStock && (
              <View style={styles.availableStockBadge}>
                <Text style={styles.availableStockText}>{availableStock} available</Text>
              </View>
            )}
          </View>
        )}
        <View style={styles.itemHeader}>
          <Text style={styles.brandName}>{product.brand || product.company || 'SOURCEWAVE'}</Text>
        </View>
        
        <View style={[styles.itemContent, isOutOfStock && styles.itemContentDisabled]}>
          <TouchableOpacity 
            style={styles.radioButton}
            onPress={() => {
              if (selectedItems.includes(item.id)) {
                setSelectedItems(selectedItems.filter(id => id !== item.id));
              } else {
                setSelectedItems([...selectedItems, item.id]);
              }
            }}
          >
              <Ionicons 
              name={selectedItems.includes(item.id) ? "radio-button-on" : "radio-button-off"} 
              size={16} 
              color={selectedItems.includes(item.id) ? Colors.FLASH_SALE_RED : Colors.BLACK} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.itemImage}
            onPress={handleImagePress}
            activeOpacity={0.7}
          >
            {product.images && product.images.length > 0 ? (
              <ErpAuthenticatedImage
                uri={product.images[0]}
                style={styles.itemImageContent}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="image-outline" size={30} color={Colors.TEXT_SECONDARY} />
            )}
          </TouchableOpacity>
          
          <View style={styles.itemDetails}>
            <Text style={styles.itemName} numberOfLines={2}>{product.name}</Text>
          
          <View style={styles.priceContainer}>
              {isUpdating ? (
                <ActivityIndicator size="small" color={Colors.WINE} style={styles.priceLoading} />
              ) : (
                <>
                  <Text style={styles.itemPrice}>{formatPrice(itemTotalPrice)}</Text>
                  {itemTotalOriginalPrice && itemTotalOriginalPrice > itemTotalPrice && (
                    <Text style={styles.originalPrice}>{formatPrice(itemTotalOriginalPrice)}</Text>
                  )}
                </>
            )}
          </View>
          
          <View style={styles.quantityContainer}>
              <TouchableOpacity 
                style={[styles.quantityButton, styles.quantityButtonMinus, isUpdating && styles.quantityButtonDisabled]}
                onPress={() => {
                  handleDecreaseQuantity(item.itemCode, effectiveQuantity);
                }}
                disabled={isUpdating || isCartActionLoading}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={Colors.ERROR} />
                ) : (
                  <Ionicons name="remove" size={16} color={Colors.ERROR} />
                )}
            </TouchableOpacity>
            <View style={styles.quantityBox}>
                {isUpdating ? (
                  <ActivityIndicator size="small" color={Colors.WINE} />
                ) : (
                  <TextInput
                    style={styles.quantityInput}
                    value={quantityInputs[item.itemCode] !== undefined ? quantityInputs[item.itemCode] : effectiveQuantity.toString()}
                    onChangeText={(value) => handleQuantityInputChange(item.itemCode, value)}
                    onBlur={() => handleQuantityInputBlur(item.itemCode, effectiveQuantity)}
                    keyboardType="numeric"
                    selectTextOnFocus
                    maxLength={3}
                    editable={!isUpdating && !isCartActionLoading}
                    placeholderTextColor={Colors.BLACK}
                    underlineColorAndroid="transparent"
                  />
                )}
              </View>
              <TouchableOpacity 
                style={[styles.quantityButton, styles.quantityButtonPlus, isUpdating && styles.quantityButtonDisabled]}
                onPress={() => {
                  handleUpdateQuantity(item.itemCode, effectiveQuantity + 1);
                }}
                disabled={isUpdating || isCartActionLoading}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={Colors.SUCCESS} />
                ) : (
                  <Ionicons name="add" size={16} color={Colors.SUCCESS} />
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.deleteButton, isUpdating && styles.quantityButtonDisabled]}
                onPress={() => {
                  handleRemoveItem(item.itemCode);
                }}
                disabled={isUpdating || isCartActionLoading}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={Colors.TEXT_SECONDARY} />
                ) : (
                  <Ionicons name="trash-outline" size={14} color={Colors.TEXT_SECONDARY} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
  );
  };

  const renderPromotionsBanner = () => (
    <View style={styles.promotionsBanner}>
      <View style={styles.promotionsContent}>
        <Ionicons name="pricetag" size={16} color="#acc5e1" />
        <Text style={styles.promotionsText}>
          2 Promotions in your cart! Click to view exclusive deals and save more!
        </Text>
      </View>
      <TouchableOpacity style={styles.viewMoreButton}>
        <Text style={styles.viewMoreText}>View More</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCheckoutBar = () => (
    <View style={styles.checkoutBar}>
      <View style={styles.totalContainer}>
        <Text style={styles.totalLabel}>GH₵0.00</Text>
      </View>
      <TouchableOpacity style={styles.checkoutButton}>
        <Text style={styles.checkoutButtonText}>Checkout</Text>
      </TouchableOpacity>
    </View>
  );

  // Show loading screen on initial load
  if (loading && cartItems.length === 0) {
    return <LoadingScreen />;
  }
  
  // Calculate total
  const calculateTotal = () => {
    return cartItems.reduce((sum, item) => {
      if (item.product) {
        return sum + (item.product.price * item.quantity);
      }
      return sum;
    }, 0);
  };
  
  const total = calculateTotal();

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {renderHeader()}
      {renderFilterTabs()}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error loading cart: {error.message}</Text>
        </View>
      )}
      {!loading && cartItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={64} color={Colors.TEXT_SECONDARY} />
          <Text style={styles.emptyText}>Your cart is empty</Text>
          <Text style={styles.emptySubtext}>Add items to your cart to see them here</Text>
        </View>
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.WINE}
              colors={[Colors.WINE]}
            />
          }
        >
        {cartItems.map((item) => (
          <View key={item.id}>
            {renderCartItem({ item })}
          </View>
        ))}
      </ScrollView>
      )}
      {cartItems.length > 0 && (
        <View style={styles.checkoutBar}>
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalAmount}>GH₵{total.toFixed(2)}</Text>
          </View>
          <TouchableOpacity 
            style={[styles.checkoutButton, isValidatingCheckout && styles.checkoutButtonDisabled]}
            onPress={handleCheckout}
            disabled={isValidatingCheckout}
          >
            {isValidatingCheckout ? (
              <ActivityIndicator size="small" color={Colors.WHITE} />
            ) : (
              <>
                <Ionicons name="bag-check-outline" size={18} color={Colors.WHITE} />
                <Text style={styles.checkoutButtonText}>Checkout</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButton: {
    padding: 2,
    marginRight: 4,
  },
  radioButton: {
    padding: 2,
  },
  radioLabel: {
    fontSize: 14,
    color: Colors.BLACK,
    fontWeight: '500',
  },
  cartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  moreButton: {
    padding: 4,
  },
  shippingInfo: {
    alignSelf: 'flex-start',
  },
  shippingText: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 16,
    gap: 3,
  },
  filterTabActive: {
    backgroundColor: Colors.WINE,
  },
  filterTabText: {
    fontSize: 12,
    color: Colors.BLACK,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: Colors.WHITE,
  },
  cartItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    position: 'relative',
  },
  cartItemOutOfStock: {
    backgroundColor: 'rgba(220, 38, 38, 0.05)',
    borderLeftWidth: 4,
    borderLeftColor: Colors.SHEIN_RED,
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 70,
    height: 75,
    backgroundColor: 'rgba(220, 38, 38, 0.8)',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
    flexDirection: 'column',
    gap: 4,
  },
  outOfStockText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.WHITE,
    textAlign: 'center',
  },
  availableStockBadge: {
    backgroundColor: Colors.WHITE,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 2,
  },
  availableStockText: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.SHEIN_RED,
    textAlign: 'center',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  brandName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.BLACK,
    flex: 1,
  },
  trendsTag: {
    backgroundColor: Colors.FLASH_SALE_RED, // Burgundy
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 6,
  },
  trendsText: {
    fontSize: 10,
    color: Colors.WHITE,
    fontWeight: 'bold',
  },
  itemContent: {
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 10,
  },
  itemContentDisabled: {
    opacity: 1,
  },
  itemImage: {
    width: 60,
    height: 75,
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  itemEmoji: {
    fontSize: 30,
  },
  itemImageContent: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: Colors.ERROR + '20',
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    color: Colors.ERROR,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    marginTop: 8,
    textAlign: 'center',
  },
  stockBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.SHEIN_ORANGE,
    paddingVertical: 2,
    alignItems: 'center',
  },
  stockText: {
    fontSize: 10,
    color: Colors.WHITE,
    fontWeight: 'bold',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 12,
    color: Colors.BLACK,
    marginBottom: 6,
    lineHeight: 16,
  },
  heartButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 4,
  },
  variantContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  variantText: {
    fontSize: 12,
    color: Colors.BLACK,
    marginRight: 3,
  },
  reviewsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  reviewsText: {
    fontSize: 10,
    color: Colors.SUCCESS,
    marginLeft: 3,
  },
  salesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  salesText: {
    fontSize: 10,
    color: Colors.FLASH_SALE_RED, // Burgundy
    marginLeft: 3,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 20,
  },
  priceLoading: {
    marginRight: 6,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginRight: 6,
  },
  originalPrice: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    textDecorationLine: 'line-through',
    marginRight: 6,
  },
  priceChange: {
    fontSize: 10,
    color: Colors.FLASH_SALE_RED,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonMinus: {
    backgroundColor: '#FFE5E5', // Light red background
  },
  quantityButtonPlus: {
    backgroundColor: '#E5F5E5', // Light green background
  },
  quantityButtonDisabled: {
    opacity: 0.5,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 3,
  },
  quantityBox: {
    width: 36,
    height: 28,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 12,
    color: Colors.BLACK,
  },
  quantityInput: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.BLACK,
    textAlign: 'center',
    width: 36,
    height: 28,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  promotionsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0F5',
    marginHorizontal: 16,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  promotionsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  promotionsText: {
    fontSize: 12,
    color: Colors.BLACK,
    flex: 1,
  },
  viewMoreButton: {
    borderWidth: 1,
    borderColor: Colors.FLASH_SALE_RED, // Burgundy
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
  },
  viewMoreText: {
    fontSize: 12,
    color: Colors.FLASH_SALE_RED, // Burgundy
    fontWeight: '500',
  },
  checkoutBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.WHITE,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  totalContainer: {
    marginBottom: 8,
    backgroundColor: Colors.LIGHT_GRAY,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.WINE,
  },
  totalLabel: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 2,
    fontWeight: '500',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.WINE,
  },
  checkoutButton: {
    backgroundColor: Colors.SUCCESS,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: Colors.SUCCESS,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  checkoutButtonDisabled: {
    opacity: 0.6,
  },
  checkoutButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.WHITE,
  },
});
