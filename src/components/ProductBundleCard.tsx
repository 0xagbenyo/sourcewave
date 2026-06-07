import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { getERPNextClient } from '../services/erpnext';
import { mapERPItemToProduct } from '../services/mappers';
import { encodeErpFileUrl } from '../utils/erpImageUrl';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.95; // 95% of screen width (wider)
const CARD_HEIGHT = 220; // Longer card height
const ITEM_SIZE = 60; // Size for individual items in the bundle (smaller)

interface BundleItem {
  itemCode: string;
  itemName?: string;
  image?: string | null;
  qty?: number;
}

interface ProductBundleCardProps {
  bundleName: string;
  newItemCode: string;
  customCustomer?: string;
  items: BundleItem[];
  totalAmount?: number;
  onPress?: () => void;
}

export const ProductBundleCard: React.FC<ProductBundleCardProps> = ({
  bundleName,
  newItemCode,
  customCustomer,
  items,
  totalAmount,
  onPress,
}) => {
  const navigation = useNavigation<any>();
  const [totalPrice, setTotalPrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);

  // Fetch prices for all items and calculate total
  useEffect(() => {
    const fetchTotalPrice = async () => {
      try {
        const client = getERPNextClient();
        let total = 0;

        for (const item of items) {
          try {
            const price = await client.getItemPrice(item.itemCode);
            const qty = item.qty || 1;
            total += (price || 0) * qty;
          } catch (error) {
            console.warn(`Failed to fetch price for ${item.itemCode}:`, error);
          }
        }

        setTotalPrice(total);
      } catch (error) {
        console.error('Error calculating bundle total price:', error);
        setTotalPrice(0);
      } finally {
        setLoadingPrice(false);
      }
    };

    if (items && items.length > 0) {
      fetchTotalPrice();
    } else {
      setLoadingPrice(false);
    }
  }, [items]);

  const getImageUrl = (imagePath: string | null | undefined): string | null => {
    if (!imagePath) return null;
    const u = encodeErpFileUrl(imagePath);
    return u || null;
  };

  const handleItemPress = async (item: BundleItem) => {
    try {
      const client = getERPNextClient();
      const filters = [['Website Item', 'item_code', '=', item.itemCode]];
      const websiteItems = await client.getWebsiteItems(filters, 1);
      
      if (websiteItems && websiteItems.length > 0) {
        const product = mapERPItemToProduct(websiteItems[0]);
        navigation.navigate('ProductDetails', { productId: product.id });
      } else {
        const websiteItems = await client.searchItems(item.itemCode);
        if (websiteItems && websiteItems.length > 0) {
          const product = mapERPItemToProduct(websiteItems[0]);
          navigation.navigate('ProductDetails', { productId: product.id });
        }
      }
    } catch (error) {
      console.error('Error searching for product:', error);
    }
  };

  // Show all items - user can scroll to see more
  const displayItems = items;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => {
        if (onPress) {
          onPress();
        } else {
          // Navigate to ViewBundleScreen with bundle data
          (navigation as any).navigate('ViewBundle', {
            bundle: {
              bundleName,
              newItemCode,
              customCustomer,
              items,
            },
          });
        }
      }}
      activeOpacity={0.85}
    >
      <View style={styles.cardContent}>
        {/* Header Section */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.bundleIconContainer}>
              <LinearGradient
                colors={[Colors.WINE, Colors.WINE_LIGHT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <Ionicons name="layers" size={18} color={Colors.WHITE} />
              </LinearGradient>
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.bundleLabel}>Bundle</Text>
              <Text style={styles.bundleName} numberOfLines={2}>
                {bundleName || 'Product Bundle'}
              </Text>
            </View>
          </View>
          
          <View style={styles.priceSection}>
            {loadingPrice ? (
              <ActivityIndicator size="small" color={Colors.WINE} />
            ) : (
              <>
                <Text style={styles.priceLabel}>From</Text>
                <Text style={styles.priceValue}>GH₵{(totalPrice || 0).toFixed(2)}</Text>
              </>
            )}
          </View>
        </View>

        {/* Items Carousel */}
        <View style={styles.itemsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.itemsScrollContent}
            style={styles.itemsScrollView}
          >
            {displayItems.map((item, index) => {
              const imageUrl = getImageUrl(item.image);
              return (
                <TouchableOpacity
                  key={`${item.itemCode}-${index}`}
                  style={styles.itemWrapper}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemImageContainer}>
                    {imageUrl ? (
                      <ErpAuthenticatedImage uri={imageUrl} style={styles.itemImage} resizeMode="contain" />
                    ) : (
                      <View style={styles.placeholderImage}>
                        <Ionicons name="image-outline" size={22} color={Colors.LIGHT_GRAY} />
                      </View>
                    )}
                    {item.qty && item.qty > 1 && (
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyText}>×{item.qty}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Footer Section */}
        <View style={styles.cardFooter}>
          <View style={styles.footerInfo}>
            <Text style={styles.itemsCountText}>{items.length} items</Text>
          </View>
          <View style={styles.viewButton}>
            <Text style={styles.viewButtonText}>View</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.WINE} />
          </View>
        </View>
      </View>

      {/* Card Shadow/Elevation */}
      <View style={styles.cardShadow} pointerEvents="none" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    marginVertical: Spacing.MARGIN_SM,
    overflow: 'visible',
  },
  cardContent: {
    flex: 1,
    backgroundColor: Colors.WHITE,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  cardShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: Colors.WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
    zIndex: -1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.PADDING_MD,
    paddingTop: Spacing.PADDING_MD,
    paddingBottom: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.MARGIN_SM,
  },
  bundleIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  bundleLabel: {
    fontSize: 10,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  bundleName: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    lineHeight: 16,
  },
  priceSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  priceLabel: {
    fontSize: 9,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 2,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  priceValue: {
    fontSize: 16,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WINE,
  },
  itemsContainer: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.PADDING_SM,
  },
  itemsScrollView: {
    flex: 1,
  },
  itemsScrollContent: {
    paddingHorizontal: Spacing.PADDING_MD,
    alignItems: 'center',
    gap: Spacing.MARGIN_SM,
  },
  itemWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImageContainer: {
    width: 70,
    height: 70,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8F7F6',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  itemImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8F7F6',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFEFEF',
  },
  qtyBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: Colors.WINE,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 22,
    alignItems: 'center',
  },
  qtyText: {
    color: Colors.WHITE,
    fontSize: 10,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_SM,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: '#FAFAFA',
  },
  footerInfo: {
    flex: 1,
  },
  itemsCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: 6,
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WINE,
  },
});

