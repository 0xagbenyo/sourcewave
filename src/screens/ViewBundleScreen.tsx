import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { getERPNextClient } from '../services/erpnext';
import { useCartActions } from '../hooks/erpnext';
import { useUserSession } from '../context/UserContext';
import { Toast } from '../components/Toast';

interface BundleItem {
  itemCode: string;
  itemName?: string;
  qty?: number;
  price?: number;
  image?: string;
}

interface Bundle {
  bundleName: string;
  newItemCode: string;
  customCustomer?: string;
  items: BundleItem[];
}

type ViewBundleScreenRouteProp = RouteProp<
  { ViewBundle: { bundle: Bundle } },
  'ViewBundle'
>;

export const ViewBundleScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<ViewBundleScreenRouteProp>();
  const insets = useSafeAreaInsets();
  const { user } = useUserSession();
  const { addToCart } = useCartActions();
  
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [prices, setItemPrices] = useState<{ [key: string]: number }>({});
  const [images, setImages] = useState<{ [key: string]: string | null }>({});
  const [loading, setLoadingPrices] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const fetchItemPrices = async () => {
      try {
        const client = getERPNextClient();
        const bundleData = route.params.bundle;
        setBundle(bundleData);

        const prices: { [key: string]: number } = {};
        const imageMap: { [key: string]: string | null } = {};

        for (const item of bundleData.items) {
          try {
            const price = await client.getItemPrice(item.itemCode);
            prices[item.itemCode] = price || 0;

            // Fetch item details to get image
            try {
              const itemDetail = await client.getItem(item.itemCode);
              console.log(`Item detail for ${item.itemCode}:`, itemDetail);
              
              // Check for website_image or image field
              const imagePath = itemDetail?.website_image || itemDetail?.image;
              
              if (imagePath) {
                console.log(`Found image path for ${item.itemCode}:`, imagePath);
                let imageUrl = null;
                
                if (imagePath.startsWith('http')) {
                  imageUrl = imagePath;
                } else {
                  const pathParts = imagePath.split('/');
                  const encodedParts = pathParts.map((part: string, idx: number) => {
                    return idx === 0 && part === '' ? '' : encodeURIComponent(part);
                  });
                  const encodedPath = encodedParts.join('/');
                  imageUrl = `https://glamora.rxcue.net${encodedPath.startsWith('/') ? encodedPath : '/' + encodedPath}`;
                }
                imageMap[item.itemCode] = imageUrl;
                console.log(`Final image URL for ${item.itemCode}:`, imageUrl);
              } else {
                console.log(`No image found for ${item.itemCode}`);
                imageMap[item.itemCode] = null;
              }
            } catch (imgError) {
              console.warn(`Failed to fetch image for ${item.itemCode}:`, imgError);
              imageMap[item.itemCode] = null;
            }
          } catch (error) {
            console.warn(`Failed to fetch price for ${item.itemCode}:`, error);
            prices[item.itemCode] = 0;
            imageMap[item.itemCode] = null;
          }
        }

        setItemPrices(prices);
        setImages(imageMap);
      } catch (error) {
        console.error('Error fetching bundle details:', error);
        Alert.alert('Error', 'Failed to load bundle details');
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchItemPrices();
  }, [route.params.bundle]);

  const calculateTotalPrice = () => {
    if (!bundle) return 0;
    return bundle.items.reduce((sum, item) => {
      const price = prices[item.itemCode] || 0;
      const qty = item.qty || 1;
      return sum + (price * qty);
    }, 0);
  };

  const handleAddToCart = async () => {
    if (!user?.email) {
      Alert.alert('Login Required', 'Please log in to add items to your cart.');
      return;
    }

    if (!bundle) return;

    setAddingToCart(true);
    try {
      // Add each item in the bundle to cart
      let allSuccessful = true;
      for (const item of bundle.items) {
        const qty = item.qty || 1;
        const success = await addToCart(item.itemCode, qty);
        if (!success) {
          allSuccessful = false;
        }
      }

      if (allSuccessful) {
        setToastMessage('Bundle added to cart!');
        setToastVisible(true);
        // Navigate to cart immediately
        (navigation as any).navigate('Cart');
      } else {
        Alert.alert('Partial Success', 'Some items could not be added to cart. Please try again.');
      }
    } catch (error) {
      console.error('Error adding bundle to cart:', error);
      Alert.alert('Error', 'Failed to add bundle to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  const renderHeader = () => (
    <LinearGradient
      colors={[Colors.ROYAL_BLUE, Colors.ELECTRIC_BLUE]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.header}
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Bundle Details</Text>
      <View style={{ width: 40 }} />
    </LinearGradient>
  );

  const renderBundleHeader = () => (
    <LinearGradient
      colors={['rgba(255, 255, 255, 0.98)', 'rgba(248, 247, 246, 0.95)']}
      style={styles.modernBundleHeader}
    >
      <View style={styles.bundleHeaderContent}>
        <Text style={styles.bundleTitle}>{bundle?.bundleName}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{bundle?.items.length}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {bundle?.items.reduce((sum, item) => sum + (item.qty || 1), 0)}
            </Text>
            <Text style={styles.statLabel}>Qty</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.bundlePrice}>GH₵{totalPrice.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );

  const renderItemCard = ({ item }: { item: BundleItem }) => {
    const price = prices[item.itemCode] || 0;
    const qty = item.qty || 1;
    const itemTotal = price * qty;
    const imageUrl = images[item.itemCode];

    return (
      <View style={styles.itemCard}>
        {/* Item Image Container */}
        <View style={styles.imageContainer}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.itemImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={48} color={Colors.MEDIUM_GRAY} />
            </View>
          )}
          {/* Quantity Badge */}
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyBadgeText}>×{qty}</Text>
          </View>
        </View>

        {/* Item Info */}
        <View style={styles.itemCardInfo}>
          <Text style={styles.itemCardName} numberOfLines={2}>
            {item.itemName || item.itemCode}
          </Text>
          <Text style={styles.itemCardCode}>{item.itemCode}</Text>

          {/* Price Info */}
          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>Unit</Text>
              <Text style={styles.unitPrice}>GH₵{price.toFixed(2)}</Text>
            </View>
            <View style={styles.priceArrow}>
              <Ionicons name="arrow-forward" size={16} color={Colors.WINE} />
            </View>
            <View style={styles.totalPriceContainer}>
              <Text style={styles.priceLabel}>Total</Text>
              <Text style={styles.itemCardTotal}>GH₵{itemTotal.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const totalPrice = calculateTotalPrice();

  if (loading || !bundle) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.WINE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {renderHeader()}
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderBundleHeader()}

        {/* Items Section - Grid Layout */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bundle Items</Text>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.WINE} />
            </View>
          ) : (
            <FlatList
              data={bundle?.items}
              renderItem={renderItemCard}
              keyExtractor={(item, index) => `${item.itemCode}-${index}`}
              scrollEnabled={false}
              columnWrapperStyle={styles.gridRow}
              numColumns={2}
            />
          )}
        </View>

        {/* Summary Card */}
        <View style={styles.section}>
          <LinearGradient
            colors={['rgba(113, 15, 28, 0.08)', 'rgba(207, 98, 117, 0.05)']}
            style={styles.modernSummary}
          >
            <View style={styles.summaryContent}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Items</Text>
                <Text style={styles.summaryBigValue}>{bundle?.items.length}</Text>
              </View>
              <View style={styles.summarySpacer} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Qty</Text>
                <Text style={styles.summaryBigValue}>
                  {bundle?.items.reduce((sum, item) => sum + (item.qty || 1), 0)}
                </Text>
              </View>
              <View style={styles.summarySpacer} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Bundle Price</Text>
                <Text style={styles.summaryPrice}>GH₵{totalPrice.toFixed(2)}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      </ScrollView>

      {/* Add to Cart Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.addToCartButton, addingToCart && styles.addToCartButtonDisabled]}
          onPress={handleAddToCart}
          disabled={addingToCart}
        >
          {addingToCart ? (
            <View style={styles.buttonGradient}>
              <ActivityIndicator size="small" color={Colors.WHITE} />
            </View>
          ) : (
            <LinearGradient
              colors={[Colors.SUCCESS, Colors.SUCCESS + 'CC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Ionicons name="bag-add-outline" size={20} color={Colors.WHITE} />
              <Text style={styles.addToCartButtonText}>Add Bundle to Cart</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>
      
      {/* Toast Notification */}
      <Toast
        message={toastMessage}
        type="success"
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F7F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.PADDING_MD,
    paddingTop: 60,
    paddingBottom: Spacing.PADDING_XL,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    padding: Spacing.PADDING_XS,
  },
  headerTitle: {
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WHITE,
    flex: 1,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  modernBundleHeader: {
    paddingVertical: 24,
    paddingHorizontal: Spacing.PADDING_MD,
    marginHorizontal: Spacing.PADDING_MD,
    marginTop: Spacing.PADDING_MD,
    marginBottom: Spacing.PADDING_LG,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  bundleHeaderContent: {
    gap: Spacing.PADDING_MD,
  },
  bundleTitle: {
    fontSize: Typography.FONT_SIZE_XL,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.PADDING_SM,
  },
  bundlePrice: {
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WINE,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: Spacing.PADDING_MD,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  section: {
    paddingHorizontal: Spacing.PADDING_MD,
    marginVertical: Spacing.PADDING_MD,
  },
  sectionTitle: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WINE,
    marginBottom: Spacing.PADDING_MD,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: Spacing.PADDING_MD,
  },
  itemCard: {
    width: '48%',
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFEFEF',
  },
  qtyBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.WINE,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  qtyBadgeText: {
    color: Colors.WHITE,
    fontSize: 12,
    fontWeight: '600',
  },
  itemCardInfo: {
    padding: Spacing.PADDING_MD,
    gap: Spacing.PADDING_SM,
  },
  itemCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TEXT_PRIMARY,
    lineHeight: 16,
  },
  itemCardCode: {
    fontSize: 11,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.PADDING_SM,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
    gap: Spacing.PADDING_SM,
  },
  priceLabel: {
    fontSize: 10,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  unitPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TEXT_PRIMARY,
  },
  priceArrow: {
    marginHorizontal: 4,
  },
  totalPriceContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  itemCardTotal: {
    fontSize: 14,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WINE,
  },
  modernSummary: {
    borderRadius: 12,
    padding: Spacing.PADDING_LG,
    marginBottom: Spacing.PADDING_MD,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summarySpacer: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(113, 15, 28, 0.1)',
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '500',
  },
  summaryBigValue: {
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WINE,
  },
  summaryPrice: {
    fontSize: Typography.FONT_SIZE_XL,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WINE,
  },
  bottomBar: {
    backgroundColor: Colors.WHITE,
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_MD,
    paddingBottom: Spacing.PADDING_LG,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
  },
  addToCartButton: {
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: Colors.SUCCESS,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonGradient: {
    paddingHorizontal: Spacing.PADDING_LG,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.PADDING_SM,
  },
  addToCartButtonDisabled: {
    opacity: 0.6,
  },
  addToCartButtonText: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WHITE,
  },
});
