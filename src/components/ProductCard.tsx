import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Spacing } from '../constants/spacing';
import { Product } from '../types';

const { width } = Dimensions.get('window');
const cardWidth = (width - Spacing.SCREEN_PADDING * 4) / 2;

export interface ProductCardProps {
  product: Product;
  onPress?: (productId: string) => void;
  onWishlistPress?: (productId: string) => void;
  onCartPress?: (productId: string, animationData?: { startPos: { x: number; y: number }, productImage?: string }) => void;
  isWishlisted?: boolean;
  style?: any;
  variant?: 'tall' | 'medium' | 'short'; // For staggered layout
  pricingDiscount?: number; // Discount from pricing rules
}

export const ProductCard: React.FC<ProductCardProps> = React.memo(({
  product,
  onPress,
  onWishlistPress,
  onCartPress,
  isWishlisted = false,
  style,
  variant = 'medium',
  pricingDiscount = 0,
}) => {
  // Safety check for product - return nothing if product is invalid
  if (!product || !product.id || !product.name) {
    return null;
  }

  const formatPrice = (price: number) => {
    const numPrice = typeof price === 'number' ? price : 0;
    return `GH₵${numPrice.toFixed(2)}`;
  };

  const calculateDiscount = () => {
    // Use pricing rule discount if available, otherwise calculate from prices
    if (pricingDiscount && typeof pricingDiscount === 'number' && pricingDiscount > 0) {
      return Math.round(pricingDiscount);
    }
    if (product?.originalPrice && typeof product.originalPrice === 'number' && product?.price && typeof product.price === 'number' && product.originalPrice > product.price) {
      return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
    }
    return 0;
  };

  const discount = calculateDiscount();

  // Calculate prices based on discount
  const getDisplayPrices = () => {
    if (!product) {
      return { displayPrice: 0, originalPrice: 0 };
    }
    if (discount > 0) {
      // If we have a pricing rule discount, calculate the new price from current price
      if (pricingDiscount && typeof pricingDiscount === 'number' && pricingDiscount > 0) {
        const discountedPrice = (typeof product.price === 'number' ? product.price : 0) * (1 - discount / 100);
        return {
          displayPrice: discountedPrice,
          originalPrice: typeof product.price === 'number' ? product.price : 0, // Current price becomes the "original"
        };
      }
      // Otherwise use the existing price structure
      return {
        displayPrice: typeof product.price === 'number' ? product.price : 0,
        originalPrice: typeof product.originalPrice === 'number' ? product.originalPrice : 0,
      };
    }
    return {
      displayPrice: typeof product.price === 'number' ? product.price : 0,
      originalPrice: typeof product.originalPrice === 'number' ? product.originalPrice : 0,
    };
  };

  const { displayPrice, originalPrice } = getDisplayPrices();

  // Calculate heights based on variant for very subtle staggered layout
  const getHeights = () => {
    switch (variant) {
      case 'tall':
        return {
          imageHeight: cardWidth * 0.85, // Shorter height
          contentPadding: Spacing.PADDING_SM, // Reduced content space
        };
      case 'short':
        return {
          imageHeight: cardWidth * 0.75, // Shorter height
          contentPadding: Spacing.PADDING_SM, // Reduced content space
        };
      case 'medium':
      default:
        return {
          imageHeight: cardWidth * 0.8, // Shorter height
          contentPadding: Spacing.PADDING_SM, // Reduced content space
        };
    }
  };

  const { imageHeight, contentPadding } = getHeights();
  const imageRef = useRef<View>(null);
  const cartButtonRef = useRef<TouchableOpacity>(null);

  const handleCartPress = () => {
    if (!onCartPress) return;

    const productImage = product.images?.[0] || product.image;
    
    // Always measure fresh on each press to get the correct position for this specific card
    if (cartButtonRef.current) {
      cartButtonRef.current.measureInWindow((x, y, width, height) => {
        if (x !== undefined && y !== undefined && width && height) {
          const startX = x + width / 2 - 25; // 25 is half of animation item width
          const startY = y + height / 2 - 25;
          
          console.log('ProductCard: Measured on press', { startX, startY, productImage, x, y, width, height });
          onCartPress(product.id, {
            startPos: { x: startX, y: startY },
            productImage,
          });
        } else {
          console.log('ProductCard: Measurement failed, calling without animation');
          // Final fallback: call without animation data
          onCartPress(product.id);
        }
      });
    } else {
      console.log('ProductCard: No ref, calling without animation');
      // Final fallback: call without animation data
      onCartPress(product.id);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, style, { alignSelf: 'flex-start' }]}
      onPress={() => onPress?.(product.id)}
      activeOpacity={0.9}
    >
      <View 
        ref={imageRef}
        style={[styles.imageContainer, { height: imageHeight }]}
      >
        {product.images && product.images.length > 0 && product.images[0] ? (
          <ErpAuthenticatedImage uri={product.images[0]} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="image-outline" size={40} color={Colors.TEXT_SECONDARY} />
          </View>
        )}
        
        {/* Wishlist Button */}
        {onWishlistPress && (
          <TouchableOpacity
            style={styles.wishlistButton}
            onPress={() => onWishlistPress(product.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isWishlisted ? 'heart' : 'heart-outline'}
              size={16}
              color={isWishlisted ? Colors.WINE : Colors.GOLD}
            />
          </TouchableOpacity>
        )}

        {/* Cart Button */}
        {onCartPress && (
          <TouchableOpacity
            ref={cartButtonRef}
            style={styles.cartButton}
            onPress={handleCartPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="cart-outline"
              size={16}
              color={Colors.WHITE}
            />
          </TouchableOpacity>
        )}

        {/* Discount Badge */}
        {discount > 0 && typeof discount === 'number' && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{Math.round(discount)}%</Text>
          </View>
        )}

        {/* New Badge */}
        {product.isNew === true && (
          <View style={styles.newBadge}>
            <Text style={styles.newText}>NEW</Text>
          </View>
        )}
      </View>

      <View style={[styles.content, { padding: contentPadding }]}>
        {product.brand && typeof product.brand === 'string' && (
          <Text style={styles.brand} numberOfLines={1} ellipsizeMode="tail">
            {product.brand}
          </Text>
        )}
        
        {product.company && variant !== 'short' && typeof product.company === 'string' && (
          <Text style={styles.company} numberOfLines={1} ellipsizeMode="tail">
            {product.company}
          </Text>
        )}
        
        {product.name && typeof product.name === 'string' && (
          <Text 
            style={styles.name} 
            numberOfLines={variant === 'tall' ? 3 : variant === 'short' ? 1 : 2}
            ellipsizeMode="tail"
          >
            {product.name}
          </Text>
        )}

        <View style={styles.priceContainer}>
          <View style={styles.priceRow} pointerEvents="none">
            <View style={styles.priceTextContainer}>
              <Text 
                style={styles.price}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {formatPrice(displayPrice || 0)}
              </Text>
            </View>
            {originalPrice && originalPrice > (displayPrice || 0) && (
              <View style={styles.originalPriceTextContainer}>
                <Text 
                  style={styles.originalPrice}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {formatPrice(originalPrice)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Rating - only show for tall and medium variants */}
        {product.rating && typeof product.rating === 'number' && product.rating > 0 && variant !== 'short' && (
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={10} color={Colors.WARNING} />
            <Text style={styles.rating}>
              {product.rating.toFixed(1)} ({typeof product.reviewCount === 'number' ? product.reviewCount : 0})
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  return (
    prevProps.product.id === nextProps.product.id &&
    prevProps.product.price === nextProps.product.price &&
    prevProps.product.images?.[0] === nextProps.product.images?.[0] &&
    prevProps.isWishlisted === nextProps.isWishlisted &&
    prevProps.style === nextProps.style &&
    prevProps.variant === nextProps.variant &&
    prevProps.pricingDiscount === nextProps.pricingDiscount
  );
});

const styles = StyleSheet.create({
  container: {
    width: cardWidth,
    backgroundColor: Colors.SURFACE,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    marginBottom: Spacing.MARGIN_SM,
    overflow: 'hidden', // Prevent any content from overflowing
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  
  imageContainer: {
    position: 'relative',
    width: '100%',
    borderTopLeftRadius: Spacing.BORDER_RADIUS_MD,
    borderTopRightRadius: Spacing.BORDER_RADIUS_MD,
    overflow: 'hidden',
    backgroundColor: Colors.LIGHT_GRAY,
  },
  
  image: {
    width: '100%',
    height: '100%',
  },
  
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  wishlistButton: {
    position: 'absolute',
    top: Spacing.MARGIN_XS,
    right: Spacing.MARGIN_XS,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  
  cartButton: {
    position: 'absolute',
    bottom: Spacing.MARGIN_XS,
    right: Spacing.MARGIN_XS,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.VIBRANT_PINK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.VIBRANT_PINK,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  
  discountBadge: {
    position: 'absolute',
    top: Spacing.MARGIN_SM,
    left: Spacing.MARGIN_SM,
    backgroundColor: Colors.VIBRANT_PINK,
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: 4,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  
  discountText: {
    color: Colors.WHITE,
    fontSize: 11,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    letterSpacing: 0.3,
  },
  
  newBadge: {
    position: 'absolute',
    bottom: Spacing.MARGIN_SM,
    left: Spacing.MARGIN_SM,
    backgroundColor: Colors.ELECTRIC_BLUE,
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: 4,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  
  newText: {
    color: Colors.WHITE,
    fontSize: 11,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    letterSpacing: 0.3,
  },
  
  content: {
    width: '100%',
    flexShrink: 1,
    overflow: 'hidden',
    paddingVertical: Spacing.PADDING_SM,
  },
  
  brand: {
    fontSize: 9,
    color: Colors.WINE,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  
  company: {
    fontSize: 10,
    color: Colors.TEXT_SECONDARY,
    fontWeight: Typography.FONT_WEIGHT_REGULAR,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  
  name: {
    fontSize: 11,
    color: Colors.TEXT_PRIMARY,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    marginBottom: Spacing.MARGIN_XS,
    lineHeight: 11 * 1.4,
  },
  
  priceContainer: {
    marginBottom: Spacing.MARGIN_XS,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 77, 109, 0.05)',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 6,
  },
  
  priceTextContainer: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
    maxWidth: '70%',
  },
  
  price: {
    fontSize: 11,
    color: Colors.WINE,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    letterSpacing: 0.3,
  },
  
  originalPriceTextContainer: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
    maxWidth: '28%',
  },
  
  originalPrice: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  
  rating: {
    fontSize: 11,
    color: Colors.SHEIN_RED,
    marginLeft: Spacing.MARGIN_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    letterSpacing: 0.2,
  },
});

