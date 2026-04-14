import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Spacing } from '../constants/spacing';
import { Product, ProductColor, ProductSize } from '../types';
import { useProduct, usePricingRules, useProductReviews, useCartActions } from '../hooks/erpnext';
import { getERPNextClient } from '../services/erpnext';
import { getProductDiscount } from '../utils/pricingRules';
import { useUserSession } from '../context/UserContext';
import { Toast } from '../components/Toast';
import { CartAnimation } from '../components/CartAnimation';
import { LoadingScreen } from '../components/LoadingScreen';

const { width, height } = Dimensions.get('window');

type TabType = 'Goods' | 'Reviews' | 'Recommend';

export const ProductDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { productId } = (route.params as any) || {};
  
  // Fetch product data from API
  const { data: product, loading, error, retry } = useProduct(productId || '');
  const { data: pricingRules = [] } = usePricingRules();
  const { data: reviews = [], loading: reviewsLoading, refresh: refreshReviews } = useProductReviews(productId || null);
  const { user } = useUserSession();
  const [submittingReview, setSubmittingReview] = useState(false);
  
  // Cart actions
  const { addToCart: addItemToCart, isLoading: isAddingToCart } = useCartActions();
  
  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Cart animation state
  const [showCartAnimation, setShowCartAnimation] = useState(false);
  const [animationStartPos, setAnimationStartPos] = useState({ x: 0, y: 0 });
  const [animationEndPos, setAnimationEndPos] = useState({ x: 0, y: 0 });
  const productImageRef = useRef<View>(null);
  const addToCartButtonRef = useRef<TouchableOpacity>(null);
  
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  
  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        retry(),
        refreshReviews(),
      ]);
    } catch (error) {
      console.error('Error refreshing product data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [retry, refreshReviews]);
  
  const [selectedColor, setSelectedColor] = useState<ProductColor | null>(null);
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const carouselRef = useRef<FlatList>(null);
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('Goods');
  const [searchQuery, setSearchQuery] = useState('');
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);
  const [rawWebsiteItem, setRawWebsiteItem] = useState<any>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const goodsSectionRef = useRef<View>(null);
  const reviewsSectionRef = useRef<View>(null);
  const recommendSectionRef = useRef<View>(null);
  const [scrollY, setScrollY] = useState(0);
  const [sectionPositions, setSectionPositions] = useState<{
    goods: number;
    reviews: number;
    recommend: number;
  }>({ goods: 0, reviews: 0, recommend: 0 });
  const [stockQuantity, setStockQuantity] = useState<number | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [showFullProductName, setShowFullProductName] = useState(false);
  const [displayedReviewsCount, setDisplayedReviewsCount] = useState(5);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false);
  const [modalDisplayedCount, setModalDisplayedCount] = useState(10);
  const modalScrollRef = useRef<ScrollView>(null);

  // Stock + optional recommendations (Item doctype — no Website Item child tables)
  React.useEffect(() => {
    if (!productId) {
      setStockQuantity(null);
      setRecommendedProducts([]);
      return;
    }
    
    let isMounted = true;
    
    const fetchRecommendedItemsAndStock = async () => {
      try {
        setRecommendedLoading(true);
        setStockLoading(true);
        const client = getERPNextClient();
        
        const itemDoc = await client.getItem(productId);
        
        if (!isMounted) return;
        
        setRawWebsiteItem(itemDoc);
        
        const stock = itemDoc?.available_stock ?? 0;
        setStockQuantity(stock);
        setStockLoading(false);
        setRecommendedProducts([]);
      } catch (error) {
        console.error('Error fetching recommended items:', error);
        if (isMounted) {
          setStockQuantity(0);
          setStockLoading(false);
        }
      } finally {
        if (isMounted) {
          setRecommendedLoading(false);
        }
      }
    };
    
    fetchRecommendedItemsAndStock();
    
    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [productId]); // Only runs when productId changes - prevents duplicate API calls

  // Set default color when product loads
  React.useEffect(() => {
    if (product && product.colors && product.colors.length > 0) {
      setSelectedColor(product.colors[0]);
    }
  }, [product]);

  // Auto-scroll slideshow carousel
  React.useEffect(() => {
    if (!product) return;

    // Get images array (slideshow or regular)
    const images = (product.slideshowImages && product.slideshowImages.length > 0)
      ? product.slideshowImages
      : (product.images && product.images.length > 0 ? product.images : []);

    // Only auto-scroll if there are multiple images and user is not manually scrolling
    if (images.length <= 1 || isUserScrolling) {
      // Clear any existing timer
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
      return;
    }

    // Clear any existing timer before starting a new one
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
    }

    // Auto-scroll every 3 seconds
    autoScrollTimerRef.current = setInterval(() => {
      setCurrentImageIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % images.length;
        
        // Scroll to next image
        if (carouselRef.current) {
          carouselRef.current.scrollToIndex({
            index: nextIndex,
            animated: true,
          });
        }
        
        return nextIndex;
      });
    }, 3000);

    // Cleanup interval on unmount or when dependencies change
    return () => {
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    };
  }, [product, isUserScrolling]); // Removed currentImageIndex from dependencies to avoid restarting timer

  // Reset user scrolling flag after user stops scrolling
  React.useEffect(() => {
    if (isUserScrolling) {
      const timer = setTimeout(() => {
        setIsUserScrolling(false);
      }, 5000); // Resume auto-scroll after 5 seconds of no user interaction

      return () => clearTimeout(timer);
    }
  }, [isUserScrolling]);

  const formatPrice = (price: number) => {
    return `GH₵${price.toFixed(2)}`;
  };

  const calculateDiscount = () => {
    if (product && product.originalPrice && product.originalPrice > product.price) {
      return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
    }
    return 0;
  };

  // Get pricing rule discount
  const getPricingRuleDiscount = () => {
    if (!product) return 0;
    return getProductDiscount(product, pricingRules);
  };

  // Calculate final price with pricing rule discount
  const getFinalPrice = () => {
    if (!product) return 0;
    const pricingDiscount = getPricingRuleDiscount();
    if (pricingDiscount > 0) {
      return product.price * (1 - pricingDiscount / 100);
    }
    return product.price;
  };

  const handleAddToCart = async () => {
    if (!product) {
      Alert.alert('Error', 'Product information is not available.');
      return;
    }
    
    if (!user?.email) {
      Alert.alert('Login Required', 'Please log in to add items to your cart.');
      return;
    }
    
    if (!selectedSize && product.sizes && product.sizes.length > 0) {
      Alert.alert('Select Size', 'Please select a size before adding to cart.');
      return;
    }
    
    try {
      // Get the item_code from the raw Website Item data or product
      // The Website Item has an 'item_code' field that links to the Item doctype
      // This is what we need to add to the cart
      const itemCode = rawWebsiteItem?.item_code || product?.itemCode || productId;
      
      // Build description with selected size if available
      const description = selectedSize ? `Size: ${selectedSize.name}` : '';
      
      console.log('Adding to cart:', { itemCode, quantity, description, productId, rawWebsiteItem: rawWebsiteItem?.item_code, productItemCode: product?.itemCode });
      
      const success = await addItemToCart(itemCode, quantity, description);
      
      if (success) {
        // Measure positions for animation
        if (productImageRef.current) {
          productImageRef.current.measure((x, y, width, height, pageX, pageY) => {
            // Start position: center of product image
            const startX = pageX + width / 2 - 25; // 25 is half of animation item width
            const startY = pageY + height / 2 - 25;
            
            // End position: top right corner (where cart icon typically is)
            // Cart icon is usually at top right, accounting for header padding
            // Header has padding, and cart icon is in the rightIcons section
            const endX = width - 50; // Approximate position of cart icon from right
            const endY = 60; // Approximate position from top (accounting for safe area and header padding)
            
            setAnimationStartPos({ x: startX, y: startY });
            setAnimationEndPos({ x: endX, y: endY });
            setShowCartAnimation(true);
          });
        } else {
          // Fallback: use center of screen as start, top right as end
          setAnimationStartPos({ x: width / 2 - 25, y: height / 2 - 25 });
          setAnimationEndPos({ x: width - 50, y: 60 });
          setShowCartAnimation(true);
        }
      } else {
        Alert.alert('Error', 'Failed to add item to cart. Please try again.');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      Alert.alert('Error', 'Failed to add item to cart. Please try again.');
    }
  };

  const handleBuyNow = () => {
    if (!product) return;
    
    if (!selectedSize && product.sizes && product.sizes.length > 0) {
      Alert.alert('Select Size', 'Please select a size before purchasing.');
      return;
    }
    
    navigation.navigate('Checkout' as never);
  };

  const handleWishlist = () => {
    setIsWishlisted(!isWishlisted);
    Alert.alert(
      isWishlisted ? 'Removed from Wishlist' : 'Added to Wishlist',
      isWishlisted ? 'Item removed from your wishlist.' : 'Item added to your wishlist!'
    );
  };

  const renderTopNavigation = () => {
    return (
      <View style={styles.topNavBar}>
        <TouchableOpacity
          style={styles.navBackButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.TEXT_PRIMARY} />
        </TouchableOpacity>
        
        <View style={styles.searchBarContainer}>
          <TextInput
            style={styles.searchBar}
            placeholder="Search products..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={Colors.TEXT_SECONDARY}
          />
          <Ionicons name="search" size={20} color={Colors.TEXT_SECONDARY} style={styles.searchIcon} />
        </View>
        
        <View style={styles.navIcons}>
          <TouchableOpacity
            style={styles.navIconButton}
            onPress={() => navigation.navigate('Cart' as never)}
          >
            <Ionicons name="cart-outline" size={24} color={Colors.TEXT_PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navIconButton}>
            <Ionicons name="share-outline" size={24} color={Colors.TEXT_PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navIconButton}>
            <Ionicons name="ellipsis-vertical" size={24} color={Colors.TEXT_PRIMARY} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const scrollToSection = (section: TabType) => {
    let ref: React.RefObject<View> | null = null;
    switch (section) {
      case 'Goods':
        ref = goodsSectionRef as React.RefObject<View>;
        break;
      case 'Reviews':
        ref = reviewsSectionRef as React.RefObject<View>;
        break;
      case 'Recommend':
        ref = recommendSectionRef as React.RefObject<View>;
        break;
    }
    
    if (ref?.current && scrollViewRef.current) {
      ref.current.measureLayout(
        scrollViewRef.current as any,
        (x, y) => {
          scrollViewRef.current?.scrollTo({ y: y - 60, animated: true });
        },
        () => {}
      );
    }
  };

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setScrollY(offsetY);
    
    // Determine which section is visible based on scroll position
    const threshold = 150; // Offset for tab bar and header
    
    if (offsetY + threshold >= sectionPositions.recommend) {
      setActiveTab('Recommend');
    } else if (offsetY + threshold >= sectionPositions.reviews) {
      setActiveTab('Reviews');
    } else {
      setActiveTab('Goods');
    }
  };

  const handleSectionLayout = (section: TabType, y: number) => {
    const key = section === 'Goods' ? 'goods' : section === 'Reviews' ? 'reviews' : 'recommend';
    setSectionPositions(prev => ({
      ...prev,
      [key]: y,
    }));
  };

  const renderTabs = () => {
    const tabs: TabType[] = ['Goods', 'Reviews', 'Recommend'];
    return (
      <View style={styles.tabsContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => {
              setActiveTab(tab);
              scrollToSection(tab);
            }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderImageCarousel = () => {
    if (!product) return null;
    
    // Use slideshow images if available, otherwise fallback to website_image (the default image)
    const images = (product.slideshowImages && product.slideshowImages.length > 0)
      ? product.slideshowImages
      : (product.images && product.images.length > 0 
        ? product.images
        : ['https://via.placeholder.com/400x600/F2F2F7/8E8E93?text=No+Image']);
    
    return (
      <View style={styles.imageContainer} ref={productImageRef}>
        <FlatList
          ref={carouselRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => {
            setIsUserScrolling(true);
            if (autoScrollTimerRef.current) {
              clearInterval(autoScrollTimerRef.current);
              autoScrollTimerRef.current = null;
            }
          }}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / width);
            setCurrentImageIndex(index);
            setTimeout(() => {
              setIsUserScrolling(false);
            }, 2000);
          }}
          onScrollToIndexFailed={(info) => {
            const wait = new Promise(resolve => setTimeout(resolve, 500));
            wait.then(() => {
              if (carouselRef.current) {
                carouselRef.current.scrollToIndex({ index: info.index, animated: false });
              }
            });
          }}
          getItemLayout={(data, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          renderItem={({ item }) => (
            <Image 
              source={{ uri: item }} 
              style={styles.productImage} 
              resizeMode="cover"
              defaultSource={require('../assets/images/download.jpg')}
            />
          )}
          keyExtractor={(_, index) => index.toString()}
        />
      
        {/* Discount Banner - On top of image */}
        {getPricingRuleDiscount() > 0 && (
          <View style={styles.discountBannerOnImage}>
            <Ionicons name="pricetag" size={12} color={Colors.WHITE} />
            <Text style={styles.discountBannerTextOnImage}>
              {getPricingRuleDiscount()}% OFF
            </Text>
          </View>
        )}
      
        {/* Image counter (e.g., "7/9") */}
        {images.length > 1 && (
          <View style={styles.imageCounter}>
            <Text style={styles.imageCounterText}>
              {currentImageIndex + 1}/{images.length}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderStockBanner = () => {
    if (stockLoading) {
      return (
        <View style={styles.stockSectionInCarousel}>
          <View style={styles.stockStatusRow}>
            <ActivityIndicator size="small" color={Colors.TEXT_SECONDARY} />
            <Text style={[styles.stockStatusText, { color: Colors.TEXT_SECONDARY, marginLeft: Spacing.MARGIN_XS, fontSize: Typography.FONT_SIZE_XS }]}>Loading stock...</Text>
          </View>
        </View>
      );
    }

    // Handle stockQuantity: if null, it means loading or unknown, show "Out of Stock"
    // If it's a number (including 0), use that value
    const stockQty = stockQuantity !== null && stockQuantity !== undefined ? stockQuantity : 0;
    
    // Only show banner for limited stock or out of stock, not for in stock
    if (stockQty > 20) {
      return null; // Don't show banner for in stock
    }
    
    let statusText: string;
    let statusColor: string;
    let statusIcon: string;

    if (stockQty === 0) {
      statusText = 'OUT OF STOCK';
      statusColor = '#FF1A1A'; // brighter red
      statusIcon = 'close-circle';
    } else {
      // stockQty > 0 && stockQty <= 20 (limited stock)
      statusText = `Limited in stock - ${stockQty}`;
      statusColor = '#F5F5DC'; // cream color (beige)
      statusIcon = 'alert-circle';
    }

    const textColor = stockQty === 0 ? Colors.WHITE : Colors.BLACK;
    
    return (
      <View style={styles.stockSectionInCarousel}>
        <View style={styles.stockStatusRow}>
          <View style={[
            styles.stockStatusBadge,
            { backgroundColor: statusColor }
          ]}>
            <Ionicons
              name={statusIcon as any}
              size={12}
              color={textColor}
            />
            <Text style={[
              styles.stockStatusText,
              { color: textColor }
            ]}>
              {statusText}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderProductName = () => {
    if (!product) return null;
    
    const words = product.name.split(' ');
    const wordCount = words.length;
    const shouldTruncate = wordCount > 13;
    const displayText = shouldTruncate && !showFullProductName
      ? words.slice(0, 13).join(' ') + '...'
      : product.name;

    return (
      <View style={styles.productNameInCarousel}>
        <Text style={styles.productNameText}>{displayText}</Text>
        {shouldTruncate && (
          <TouchableOpacity
            style={styles.productNameReadMoreButton}
            onPress={() => setShowFullProductName(!showFullProductName)}
          >
            <Text style={styles.productNameReadMoreText}>
              {showFullProductName ? 'Read less' : 'Read more'}
            </Text>
            <Ionicons
              name={showFullProductName ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={Colors.VIBRANT_PINK}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderColorOptions = () => {
    if (!product || !product.colors || product.colors.length === 0) return null;
    
    return (
      <View style={styles.colorSection}>
        <View style={styles.colorHeader}>
          <Text style={styles.colorLabel}>
            Color: {selectedColor ? selectedColor.name : 'Multicolor'}
        </Text>
          {selectedColor && (
            <Ionicons name="checkmark-circle" size={16} color={Colors.SUCCESS} />
          )}
        </View>
        <View style={styles.colorOptions}>
          {product.colors.map((color) => (
          <TouchableOpacity
            key={color.id}
            style={[
              styles.colorOption,
              { backgroundColor: color.hexCode },
              selectedColor && selectedColor.id === color.id && styles.colorOptionSelected,
              !color.inStock && styles.colorOptionDisabled,
            ]}
            onPress={() => color.inStock && setSelectedColor(color)}
            disabled={!color.inStock}
          >
            {selectedColor && selectedColor.id === color.id && (
              <Ionicons name="checkmark" size={10} color={Colors.WHITE} />
            )}
            {!color.inStock && (
              <View style={styles.outOfStockOverlay} />
            )}
          </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderSizeOptions = () => {
    if (!product || !product.sizes || product.sizes.length === 0) return null;
    
    return (
      <View style={styles.optionSection}>
        <Text style={styles.optionTitle}>Size</Text>
        <View style={styles.sizeOptions}>
          {product.sizes.map((size) => (
          <TouchableOpacity
            key={size.id}
            style={[
              styles.sizeOption,
              selectedSize?.id === size.id && styles.sizeOptionSelected,
              !size.inStock && styles.sizeOptionDisabled,
            ]}
            onPress={() => size.inStock && setSelectedSize(size)}
            disabled={!size.inStock}
          >
            <Text
              style={[
                styles.sizeText,
                selectedSize?.id === size.id && styles.sizeTextSelected,
                !size.inStock && styles.sizeTextDisabled,
              ]}
            >
              {size.name}
            </Text>
          </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderQuantitySelector = () => (
    <View style={styles.optionSection}>
      <Text style={styles.optionTitle}>Quantity</Text>
      <View style={styles.quantitySelector}>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => quantity > 1 && setQuantity(quantity - 1)}
        >
          <Ionicons name="remove" size={14} color={Colors.TEXT_PRIMARY} />
        </TouchableOpacity>
        <Text style={styles.quantityText}>{quantity}</Text>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => setQuantity(quantity + 1)}
        >
          <Ionicons name="add" size={14} color={Colors.TEXT_PRIMARY} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Strip HTML tags from text
  const stripHtmlTags = (html: string): string => {
    if (!html) return '';
    // Remove HTML tags and decode HTML entities
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .replace(/&apos;/g, "'") // Replace &apos; with '
      .trim();
  };

  const renderSpecifications = () => {
    if (!product || !product.specifications || product.specifications.length === 0) {
      return null;
    }

    return (
      <View style={styles.specificationsSection}>
        <Text style={styles.specificationsTitle}>Specifications</Text>
        {product.specifications.map((spec, index) => (
          <View key={index} style={styles.specificationItem}>
            <Text style={styles.specificationLabel}>{stripHtmlTags(spec.label)}</Text>
            <Text style={styles.specificationDescription}>{stripHtmlTags(spec.description)}</Text>
          </View>
        ))}
      </View>
    );
  };

  const handleSubmitReview = async () => {
    // Check if user is logged in
    if (!user?.email) {
      Alert.alert(
        'Login Required',
        'Please log in to submit a review.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Login',
            onPress: () => {
              (navigation as any).navigate('Login');
            },
          },
        ]
      );
      return;
    }

    if (reviewRating === 0) {
      Alert.alert('Rating Required', 'Please select a rating before submitting your review.');
      return;
    }
    if (!reviewTitle.trim()) {
      Alert.alert('Title Required', 'Please enter a review title.');
      return;
    }
    if (!reviewComment.trim()) {
      Alert.alert('Comment Required', 'Please enter your review comment.');
      return;
    }

    if (!productId) {
      Alert.alert('Error', 'Product ID is missing.');
      return;
    }

    setSubmittingReview(true);

    try {
      const client = getERPNextClient();
      await client.createItemReview(productId, user.email, {
        rating: reviewRating,
        review_title: reviewTitle.trim(),
        comment: reviewComment.trim(),
      });

      // Success - refresh reviews and reset form
    Alert.alert(
      'Review Submitted',
        'Thank you for your review! It has been published.',
      [
        {
          text: 'OK',
          onPress: () => {
            setShowReviewForm(false);
            setReviewRating(0);
            setReviewTitle('');
            setReviewComment('');
              // Refresh reviews list
              refreshReviews();
          },
        },
      ]
    );
    } catch (error: any) {
      console.error('Error submitting review:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to submit review. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  const renderReviewForm = () => {
    if (!showReviewForm) return null;

    return (
      <View style={styles.reviewFormContainer}>
        <Text style={styles.reviewFormTitle}>Write a Review</Text>
        
        <View style={styles.ratingInputContainer}>
          <Text style={styles.ratingInputLabel}>Rating</Text>
          <View style={styles.ratingStarsInput}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setReviewRating(star)}
                style={styles.starButton}
              >
                <Ionicons
                  name={star <= reviewRating ? 'star' : 'star-outline'}
                  size={24}
                  color={star <= reviewRating ? '#FFD700' : Colors.TEXT_SECONDARY}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.reviewInputContainer}>
          <Text style={styles.reviewInputLabel}>Title</Text>
          <TextInput
            style={styles.reviewInput}
            placeholder="Enter review title"
            value={reviewTitle}
            onChangeText={setReviewTitle}
            placeholderTextColor={Colors.TEXT_SECONDARY}
          />
        </View>

        <View style={styles.reviewInputContainer}>
          <Text style={styles.reviewInputLabel}>Comment</Text>
          <TextInput
            style={[styles.reviewInput, styles.reviewTextArea]}
            placeholder="Write your review..."
            value={reviewComment}
            onChangeText={setReviewComment}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor={Colors.TEXT_SECONDARY}
          />
        </View>

        <View style={styles.reviewFormActions}>
          <TouchableOpacity
            style={[styles.reviewFormButton, styles.reviewFormButtonCancel]}
            onPress={() => {
              setShowReviewForm(false);
              setReviewRating(0);
              setReviewTitle('');
              setReviewComment('');
            }}
          >
            <Text style={styles.reviewFormButtonTextCancel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reviewFormButton, styles.reviewFormButtonSubmit, submittingReview && styles.reviewFormButtonDisabled]}
            onPress={handleSubmitReview}
            disabled={submittingReview}
          >
            {submittingReview ? (
              <ActivityIndicator size="small" color={Colors.WHITE} />
            ) : (
            <Text style={styles.reviewFormButtonTextSubmit}>Submit Review</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFitFeedback = () => {
    // Note: Fit feedback would need to come from a custom ERPNext field or doctype
    // For now, we show a placeholder or hide it if no data is available
    // In a real implementation, you would fetch this from ERPNext custom fields
    
    // Check if fit feedback data exists in raw website item
    const fitData = rawWebsiteItem?.custom_fit_feedback 
      ? JSON.parse(rawWebsiteItem.custom_fit_feedback)
      : null;

    if (!fitData) {
      // Hide fit feedback section if no data available
      return null;
    }

    return (
      <View style={styles.fitFeedbackSection}>
        <Text style={styles.fitFeedbackQuestion}>Did the item fit well?</Text>
        <View style={styles.fitFeedbackBars}>
          <View style={styles.fitBarItem}>
            <Text style={styles.fitBarLabel}>Small</Text>
            <View style={styles.fitBarContainer}>
              <View style={[styles.fitBar, { width: `${fitData.small || 0}%` }]} />
            </View>
            <Text style={styles.fitBarPercentage}>{fitData.small || 0}%</Text>
          </View>
          <View style={styles.fitBarItem}>
            <Text style={styles.fitBarLabel}>True to Size</Text>
            <View style={styles.fitBarContainer}>
              <View style={[styles.fitBar, styles.fitBarActive, { width: `${fitData.trueToSize || 0}%` }]} />
            </View>
            <Text style={styles.fitBarPercentage}>{fitData.trueToSize || 0}%</Text>
          </View>
          <View style={styles.fitBarItem}>
            <Text style={styles.fitBarLabel}>Large</Text>
            <View style={styles.fitBarContainer}>
              <View style={[styles.fitBar, { width: `${fitData.large || 0}%` }]} />
            </View>
            <Text style={styles.fitBarPercentage}>{fitData.large || 0}%</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderReviewTags = () => {
    // Note: Review tags would need to come from a custom ERPNext field or doctype
    // Check if review tags exist in raw website item
    const tags = rawWebsiteItem?.custom_review_tags
      ? (typeof rawWebsiteItem.custom_review_tags === 'string' 
          ? JSON.parse(rawWebsiteItem.custom_review_tags)
          : rawWebsiteItem.custom_review_tags)
      : null;

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      // Hide tags if no data available
      return null;
    }

    return (
      <View style={styles.reviewTagsContainer}>
        {tags.map((tag: any, index: number) => (
          <TouchableOpacity key={index} style={styles.reviewTag}>
            <Text style={styles.reviewTagText}>
              {tag.label || tag.name} ({tag.count || 0})
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderIndividualReviews = () => {
    if (reviewsLoading) {
      return (
        <View style={styles.individualReviewsContainer}>
          <ActivityIndicator size="small" color={Colors.SHEIN_PINK} />
          <Text style={styles.loadingReviewsText}>Loading reviews...</Text>
        </View>
      );
    }

    if (!reviews || reviews.length === 0) {
      return (
        <View style={styles.individualReviewsContainer}>
          <Text style={styles.noReviewsText}>
            No individual reviews available yet. Be the first to review this product!
          </Text>
        </View>
      );
    }

    // Sort reviews by date (latest first) and take only 5 initially
    const sortedReviews = [...reviews].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
    
    const displayedReviews = sortedReviews.slice(0, displayedReviewsCount);
    const hasMoreReviews = displayedReviewsCount < sortedReviews.length;
    const MAX_COMMENT_LENGTH = 100; // Characters to show before truncating
    
    const toggleReviewExpansion = (reviewId: string) => {
      setExpandedReviews(prev => {
        const newSet = new Set(prev);
        if (newSet.has(reviewId)) {
          newSet.delete(reviewId);
        } else {
          newSet.add(reviewId);
        }
        return newSet;
      });
    };
    
    return (
      <View style={styles.individualReviewsContainer}>
        {displayedReviews.map((review) => {
          const isExpanded = expandedReviews.has(review.id);
          const comment = review.comment || '';
          const isLongComment = comment.length > MAX_COMMENT_LENGTH;
          const displayComment = isLongComment && !isExpanded 
            ? comment.substring(0, MAX_COMMENT_LENGTH) + '...' 
            : comment;
          
          return (
            <View key={review.id} style={styles.reviewItem}>
              <View style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewUserInfo}>
                    <View style={styles.reviewAvatar}>
                      <Text style={styles.reviewAvatarText}>
                        {review.userName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.reviewUserDetails}>
                      <Text style={styles.reviewUserName}>{review.userName}</Text>
                      <Text style={styles.reviewDate}>
                        {new Date(review.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.reviewRating}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      // Get rating as float - ensure it's a number
                      const ratingValue = typeof review.rating === 'number' 
                        ? review.rating 
                        : (typeof review.rating === 'string' ? parseFloat(review.rating) : 0) || 0;
                      
                      // Fill star if current star number is less than or equal to the rating
                      // For example: rating 4.5 fills stars 1, 2, 3, 4 (and half of 5 if we had half stars)
                      const isFilled = star <= ratingValue;
                      
                      return (
                        <Ionicons
                          key={star}
                          name="star"
                          size={8}
                          color={isFilled ? '#FFD700' : Colors.LIGHT_GRAY}
                        />
                      );
                    })}
                  </View>
                </View>
                {review.title && (
                  <Text style={styles.reviewTitle}>{review.title}</Text>
                )}
                {review.comment && (
                  <View style={styles.reviewCommentContainer}>
                    <Text style={styles.reviewComment}>{displayComment}</Text>
                    {isLongComment && (
                      <TouchableOpacity
                        style={styles.expandReviewButton}
                        activeOpacity={0.7}
                        onPress={() => toggleReviewExpansion(review.id)}
                      >
                        <Ionicons 
                          name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                          size={12} 
                          color={Colors.SHEIN_PINK} 
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}
        {sortedReviews.length > 5 && (
          <TouchableOpacity
            style={styles.viewMoreButton}
            activeOpacity={0.8}
            onPress={() => {
              setShowAllReviewsModal(true);
              setModalDisplayedCount(10);
            }}
          >
            <Text style={styles.viewMoreButtonText}>View All</Text>
            <Ionicons 
              name="chevron-forward" 
              size={14} 
              color={Colors.SHEIN_RED} 
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderAllReviewsModal = () => {
    if (!product || !showAllReviewsModal) return null;

    const sortedReviews = [...reviews].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    const displayedReviews = sortedReviews.slice(0, modalDisplayedCount);
    const hasMore = modalDisplayedCount < sortedReviews.length;
    const MAX_COMMENT_LENGTH = 100;

    const handleScroll = (event: any) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const paddingToBottom = 200; // Load more when 200px from bottom
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

      if (isCloseToBottom && hasMore) {
        // Load 10 more reviews
        setModalDisplayedCount(prev => Math.min(prev + 10, sortedReviews.length));
      }
    };

    const toggleReviewExpansion = (reviewId: string) => {
      setExpandedReviews(prev => {
        const newSet = new Set(prev);
        if (newSet.has(reviewId)) {
          newSet.delete(reviewId);
        } else {
          newSet.add(reviewId);
        }
        return newSet;
      });
    };

    return (
      <Modal
        visible={showAllReviewsModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowAllReviewsModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>All Reviews ({sortedReviews.length})</Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowAllReviewsModal(false);
                setModalDisplayedCount(10);
              }}
            >
              <Ionicons name="close" size={24} color={Colors.TEXT_PRIMARY} />
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={modalScrollRef}
            style={styles.modalScrollView}
            onScroll={handleScroll}
            scrollEventThrottle={400}
            showsVerticalScrollIndicator={true}
          >
            {displayedReviews.map((review) => {
              const isExpanded = expandedReviews.has(review.id);
              const comment = review.comment || '';
              const isLongComment = comment.length > MAX_COMMENT_LENGTH;
              const displayComment = isLongComment && !isExpanded 
                ? comment.substring(0, MAX_COMMENT_LENGTH) + '...' 
                : comment;

              return (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.reviewUserInfo}>
                        <View style={styles.reviewAvatar}>
                          <Text style={styles.reviewAvatarText}>
                            {review.userName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.reviewUserDetails}>
                          <Text style={styles.reviewUserName}>{review.userName}</Text>
                          <Text style={styles.reviewDate}>
                            {new Date(review.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.reviewRating}>
                        {[1, 2, 3, 4, 5].map((star) => {
                          const ratingValue = typeof review.rating === 'number' 
                            ? review.rating 
                            : (typeof review.rating === 'string' ? parseFloat(review.rating) : 0) || 0;
                          const isFilled = star <= ratingValue;
                          
                          return (
                            <Ionicons
                              key={star}
                              name="star"
                              size={8}
                              color={isFilled ? '#FFD700' : Colors.LIGHT_GRAY}
                            />
                          );
                        })}
                      </View>
                    </View>
                    {review.title && (
                      <Text style={styles.reviewTitle}>{review.title}</Text>
                    )}
                    {review.comment && (
                      <View style={styles.reviewCommentContainer}>
                        <Text style={styles.reviewComment}>{displayComment}</Text>
                        {isLongComment && (
                          <TouchableOpacity
                            style={styles.expandReviewButton}
                            activeOpacity={0.7}
                            onPress={() => toggleReviewExpansion(review.id)}
                          >
                            <Ionicons 
                              name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                              size={12} 
                              color={Colors.SHEIN_PINK} 
                            />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
            {hasMore && (
              <View style={styles.modalLoadingMore}>
                <ActivityIndicator size="small" color={Colors.SHEIN_PINK} />
                <Text style={styles.modalLoadingText}>Loading more reviews...</Text>
              </View>
            )}
            {!hasMore && displayedReviews.length > 0 && (
              <View style={styles.modalEndMessage}>
                <Text style={styles.modalEndText}>All reviews loaded</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderReviews = () => {
    if (!product) return null;
    
    return (
      <View style={styles.reviewsSection}>
        <View style={styles.reviewsHeader}>
          <Text style={styles.reviewsTitle}>Reviews ({reviews && reviews.length > 0 ? `${reviews.length}` : '0'})</Text>
          <TouchableOpacity
            style={styles.addReviewButton}
            activeOpacity={0.8}
            onPress={() => {
              if (!user?.email) {
                Alert.alert(
                  'Login Required',
                  'Please log in to write a review.',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                    },
                    {
                      text: 'Login',
                      onPress: () => {
                        (navigation as any).navigate('Login');
                      },
                    },
                  ]
                );
              } else {
                setShowReviewForm(true);
              }
            }}
          >
            <Ionicons name="add-circle" size={12} color={Colors.WHITE} />
            <Text style={styles.addReviewButtonText}>Write Review</Text>
          </TouchableOpacity>
            </View>
        
        {/* Review Form */}
        {renderReviewForm()}
        
        {/* Overall Rating */}
        <View style={styles.overallRatingContainer}>
          <View style={styles.overallRatingCard}>
            <View style={styles.overallRatingContent}>
              <Text style={styles.overallRatingNumber}>{product.rating.toFixed(1) || '4.9'}</Text>
              <View style={styles.overallRatingStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name="star"
                    size={10}
                    color={star <= Math.round(product.rating) ? '#FFD700' : Colors.LIGHT_GRAY}
                  />
                ))}
              </View>
              <Text style={styles.overallRatingCount}>
                {reviews && reviews.length > 0 ? `${reviews.length} Reviews` : 'No Reviews'}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Fit Feedback */}
        {renderFitFeedback()}

        {/* Local Reviews - Use product rating if available */}
        {product.rating > 0 && (
          <View style={styles.localReviewsContainer}>
            <View style={styles.localReviewsHeader}>
              <Text style={styles.localReviewsTitle}>Product Rating</Text>
              <View style={styles.localReviewsRating}>
                <Text style={styles.localReviewsRatingText}>{product.rating.toFixed(2)}</Text>
                <View style={styles.localReviewsStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name="star"
                      size={10}
                      color={star <= Math.round(product.rating) ? '#FFD700' : Colors.LIGHT_GRAY}
                    />
                  ))}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Review Tags */}
        {renderReviewTags()}

        {/* Individual Reviews */}
        {renderIndividualReviews()}
      </View>
    );
  };

  // Function to reload the full page by navigating to Splash screen, then reloading the app
  const handleFullReload = useCallback(async () => {
    // Navigate to Splash screen first to show SOURCEWAVE
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Splash' }],
      })
    );
    
    // Wait a moment for Splash to appear, then reload the entire app
    setTimeout(async () => {
      try {
        // Try to reload the app using expo-updates
        await Updates.reloadAsync();
      } catch (error) {
        // If reload fails (e.g., in development mode), reset navigation to Main
        console.log('Updates.reloadAsync not available, using navigation reset');
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'Main' }],
          })
        );
      }
    }, 1500); // Show splash for 1.5 seconds before reload
  }, [navigation]);

  // Loading state - show LoadingScreen first
  if (loading) {
    return <LoadingScreen />;
  }

  // Error state - only show if not loading and there's an error or no product
  if (error || !product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.ERROR} />
          <Text style={styles.errorText}>Failed to load product</Text>
          <Text style={styles.errorSubtext}>{error?.message || 'Product not found'}</Text>
          <View style={styles.errorActions}>
            <TouchableOpacity
              style={[styles.retryButton, styles.retryButtonPrimary]}
              onPress={handleFullReload}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="refresh" size={20} color={Colors.WHITE} />
              <Text style={styles.retryButtonText}>Retry</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={[styles.retryButtonText, { color: Colors.TEXT_PRIMARY }]}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const renderGoodsContent = () => {
    if (!product) return null;

    return (
      <View style={styles.goodsContent}>
        {/* Price Section */}
        <View style={styles.priceSection}>
          <View style={styles.priceRow}>
            {getPricingRuleDiscount() > 0 ? (
              <>
                <Text style={styles.priceFrom}>From {formatPrice(getFinalPrice())}</Text>
                <Text style={styles.originalPrice}>{formatPrice(product.price)}</Text>
              </>
            ) : (
              <>
            <Text style={styles.priceFrom}>From {formatPrice(product.price)}</Text>
              {product.originalPrice && product.originalPrice > product.price && (
              <>
                <Text style={styles.originalPrice}>{formatPrice(product.originalPrice)}</Text>
              {calculateDiscount() > 0 && (
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>-{calculateDiscount()}%</Text>
                </View>
                    )}
                  </>
                )}
              </>
              )}
          </View>
            </View>

        {/* Short Description */}
        {rawWebsiteItem?.short_description && (
          <View style={styles.shortDescriptionSection}>
            <Text style={styles.shortDescriptionText}>
              {stripHtmlTags(rawWebsiteItem.short_description)}
                </Text>
              </View>
            )}

        {/* Description Section */}
        {product.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionTitle}>Description</Text>
            <Text style={styles.descriptionText} numberOfLines={showFullDescription ? undefined : 3}>
              {stripHtmlTags(product.description)}
            </Text>
            {product.description.length > 150 && (
              <TouchableOpacity
                onPress={() => setShowFullDescription(!showFullDescription)}
                style={styles.readMoreButton}
              >
                <Text style={styles.readMoreText}>
                  {showFullDescription ? 'Show Less' : 'Read More'}
                </Text>
                <Ionicons
                  name={showFullDescription ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.VIBRANT_PINK}
                />
              </TouchableOpacity>
            )}
              </View>
            )}

        {/* Company & Category Info */}
        {(product.company || product.category || rawWebsiteItem?.ranking) ? (
          <View style={styles.metaInfoSection}>
            {product.company ? (
              <View style={styles.metaInfoItem}>
                <Ionicons name="business-outline" size={10} color={Colors.TEXT_SECONDARY} />
                <Text style={styles.metaInfoText}>{product.company}</Text>
          </View>
            ) : null}
            {product.category ? (
              <View style={styles.metaInfoItem}>
                <Ionicons name="grid-outline" size={10} color={Colors.TEXT_SECONDARY} />
                <Text style={styles.metaInfoText}>{product.category}</Text>
              </View>
            ) : null}
            {rawWebsiteItem?.ranking ? (
              <View style={styles.metaInfoItem}>
                <Ionicons name="trending-up-outline" size={10} color={Colors.TEXT_SECONDARY} />
                <Text style={styles.metaInfoText}>Ranking: {rawWebsiteItem.ranking}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Offers Section */}
        {rawWebsiteItem?.offers && Array.isArray(rawWebsiteItem.offers) && rawWebsiteItem.offers.length > 0 && (
          <View style={styles.offersSection}>
            <Text style={styles.offersSectionTitle}>Special Offers</Text>
            {rawWebsiteItem.offers.map((offer: any, index: number) => (
              <View key={index} style={styles.offerItem}>
                <Ionicons name="gift-outline" size={16} color={Colors.VIBRANT_PINK} />
                <View style={styles.offerContent}>
                  <Text style={styles.offerTitle}>
                    {offer.title || offer.offer_title || offer.name || 'Special Offer'}
                  </Text>
                  {offer.description && (
                    <Text style={styles.offerDescription}>
                      {stripHtmlTags(offer.description || offer.offer_description || '')}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Specifications Section */}
        {product.specifications && product.specifications.length > 0 && (
          <View style={styles.specificationsSection}>
            <Text style={styles.specificationsTitle}>Specifications</Text>
            {product.specifications.map((spec, index) => (
              <View key={index} style={styles.specificationItem}>
                {spec.label ? <Text style={styles.specificationLabel}>{spec.label}</Text> : null}
                {spec.description ? <Text style={styles.specificationDescription}>{spec.description}</Text> : null}
              </View>
            ))}
          </View>
        )}

        {/* Rating */}
        {product.rating > 0 && (
          <View style={styles.ratingRow}>
            <View style={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name="star"
                  size={16}
                  color={star <= Math.round(product.rating) ? '#FFD700' : Colors.LIGHT_GRAY}
                />
              ))}
            </View>
            <Text style={styles.ratingText}>
              {product.rating.toFixed(2)} ({(product.reviewCount || 0) > 0 ? `${product.reviewCount}+` : '0'})
            </Text>
          </View>
        )}

        {/* Color Options */}
        {renderColorOptions()}

        {/* Size Options */}
        {renderSizeOptions()}

        {/* Quantity Selector */}
        {renderQuantitySelector()}

      </View>
    );
  };

  const renderRecommendContent = () => {
    if (recommendedLoading) {
      return (
        <View style={styles.recommendContent}>
          <Text style={styles.sectionTitle}>You May Also Like</Text>
          <ActivityIndicator size="large" color={Colors.SHEIN_PINK} style={styles.loadingIndicator} />
        </View>
      );
    }

    if (recommendedProducts.length === 0) {
      return (
        <View style={styles.recommendContent}>
          <Text style={styles.sectionTitle}>You May Also Like</Text>
          <Text style={styles.comingSoonText}>No recommended products available</Text>
        </View>
      );
    }

    return (
      <View style={styles.recommendContent}>
        <Text style={styles.sectionTitle}>You May Also Like</Text>
        <FlatList
          data={recommendedProducts}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.recommendedProductCard}
              onPress={() => {
                (navigation as any).navigate('ProductDetails', { productId: item.id });
              }}
            >
              {item.images && item.images.length > 0 && (
                <Image
                  source={{ uri: item.images[0] }}
                  style={styles.recommendedProductImage}
                  resizeMode="cover"
                />
              )}
              <View style={styles.recommendedProductInfo}>
                <Text style={styles.recommendedProductName} numberOfLines={2}>
                  {item.name}
                </Text>
                <View style={styles.recommendedProductPriceRow}>
                  <Text style={styles.recommendedProductPrice}>
                    {formatPrice(item.price)}
                  </Text>
                  {item.originalPrice && item.originalPrice > item.price && (
                    <Text style={styles.recommendedProductOriginalPrice}>
                      {formatPrice(item.originalPrice)}
                    </Text>
                  )}
                </View>
                {item.rating > 0 && (
                  <View style={styles.recommendedProductRating}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.recommendedProductRatingText}>
                      {item.rating.toFixed(1)} ({item.reviewCount || 0})
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          scrollEnabled={false}
            />
          </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CartAnimation
        visible={showCartAnimation}
        startPosition={animationStartPos}
        endPosition={animationEndPos}
        productImage={product?.images?.[0] || product?.image}
        onComplete={() => setShowCartAnimation(false)}
      />
      {renderTopNavigation()}
      {renderTabs()}
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.SHEIN_PINK}
            colors={[Colors.SHEIN_PINK]}
          />
        }
      >
        {renderImageCarousel()}
        {renderStockBanner()}
        {renderProductName()}
        
        <View style={styles.content}>
          {/* Goods Section */}
          <View 
            ref={goodsSectionRef} 
            style={styles.sectionContainer}
            onLayout={(e) => {
              const { y } = e.nativeEvent.layout;
              handleSectionLayout('Goods', y);
            }}
          >
            {renderGoodsContent()}
          </View>

          {/* Reviews Section */}
          <View 
            ref={reviewsSectionRef} 
            style={styles.sectionContainer}
            onLayout={(e) => {
              const { y } = e.nativeEvent.layout;
              handleSectionLayout('Reviews', y);
            }}
          >
          {renderReviews()}
          </View>

          {/* Recommend Section */}
          <View 
            ref={recommendSectionRef} 
            style={styles.sectionContainer}
            onLayout={(e) => {
              const { y } = e.nativeEvent.layout;
              handleSectionLayout('Recommend', y);
            }}
          >
            {renderRecommendContent()}
          </View>
        </View>
      </ScrollView>
      
      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.bottomWishlistButton}
          onPress={handleWishlist}
        >
          <Ionicons
            name={isWishlisted ? 'heart' : 'heart-outline'}
            size={24}
            color={isWishlisted ? Colors.VIBRANT_PINK : Colors.TEXT_PRIMARY}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addToCartBottomButton}
          onPress={handleAddToCart}
          disabled={!product?.inStock || isAddingToCart || !product}
        >
          {isAddingToCart ? (
            <ActivityIndicator size="small" color={Colors.WHITE} />
          ) : (
          <Text style={styles.addToCartBottomText}>Add to Cart</Text>
          )}
          {calculateDiscount() > 0 && (
            <Text style={styles.addToCartBottomDiscount}>
              {calculateDiscount()}% off discount
            </Text>
          )}
        </TouchableOpacity>
      </View>
      
      {/* All Reviews Modal */}
      {renderAllReviewsModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  // Top Navigation
  topNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_SM,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  navBackButton: {
    padding: Spacing.PADDING_XS,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    paddingHorizontal: Spacing.PADDING_MD,
    marginHorizontal: Spacing.MARGIN_SM,
    height: 40,
  },
  searchBar: {
    flex: 1,
    fontSize: Typography.FONT_SIZE_MD,
    color: Colors.TEXT_PRIMARY,
  },
  searchIcon: {
    marginLeft: Spacing.MARGIN_SM,
  },
  navIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MARGIN_SM,
  },
  navIconButton: {
    padding: Spacing.PADDING_XS,
  },
  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.WHITE,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.PADDING_XS,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.VIBRANT_PINK,
  },
  tabText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
  },
  tabTextActive: {
    color: Colors.VIBRANT_PINK,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
  },
  sectionContainer: {
    marginBottom: Spacing.MARGIN_LG,
  },
  // Image Carousel
  imageContainer: {
    position: 'relative',
    backgroundColor: Colors.LIGHT_GRAY,
  },
  productImage: {
    width,
    height: height * 0.5,
  },
  discountBannerOnImage: {
    position: 'absolute',
    top: Spacing.PADDING_MD,
    left: Spacing.PADDING_MD,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.VIBRANT_PINK,
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: Spacing.PADDING_XS,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    gap: 3,
    zIndex: 10,
  },
  discountBannerTextOnImage: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
  },
  imageCounter: {
    position: 'absolute',
    bottom: Spacing.PADDING_MD,
    right: Spacing.PADDING_MD,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: Spacing.PADDING_XS,
    borderRadius: Spacing.BORDER_RADIUS_MD,
  },
  imageCounterText: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
  },
  content: {
    padding: Spacing.PADDING_MD,
  },
  // Goods Tab Content
  goodsContent: {
    paddingBottom: Spacing.PADDING_MD,
  },
  priceSection: {
    marginBottom: Spacing.MARGIN_SM,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.MARGIN_XS,
  },
  priceFrom: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
  },
  originalPrice: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    backgroundColor: Colors.ERROR,
    paddingHorizontal: Spacing.PADDING_XS,
    paddingVertical: 2,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    borderWidth: 1,
    borderColor: Colors.ERROR,
  },
  discountText: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    marginBottom: Spacing.MARGIN_XS,
  },
  infoSectionText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_PRIMARY,
    flex: 1,
  },
  titleSection: {
    marginBottom: Spacing.MARGIN_SM,
  },
  productTitle: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_REGULAR,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_XS,
    lineHeight: Typography.FONT_SIZE_SM * 1.4,
  },
  bestsellerBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.MARGIN_XS,
  },
  bestsellerText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.MARGIN_SM,
  },
  ratingStars: {
    flexDirection: 'row',
    marginRight: Spacing.MARGIN_XS,
  },
  ratingText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_PRIMARY,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
  },
  description: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    lineHeight: Typography.FONT_SIZE_SM * 1.5,
    marginBottom: Spacing.MARGIN_LG,
  },
  // Color Section
  colorSection: {
    marginBottom: Spacing.MARGIN_XS,
  },
  colorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.MARGIN_XS,
  },
  colorLabel: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
    color: Colors.TEXT_PRIMARY,
  },
  colorOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.MARGIN_XS,
  },
  optionSection: {
    marginBottom: Spacing.MARGIN_LG,
  },
  optionTitle: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  colorOption: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.BORDER,
  },
  colorOptionSelected: {
    borderColor: Colors.VIBRANT_PINK,
    borderWidth: 2,
  },
  colorOptionDisabled: {
    opacity: 0.5,
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 20,
  },
  sizeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.MARGIN_XS,
  },
  sizeOption: {
    width: 36,
    height: 36,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.SURFACE,
  },
  sizeOptionSelected: {
    borderColor: Colors.VIBRANT_PINK,
    backgroundColor: Colors.VIBRANT_PINK,
  },
  sizeOptionDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  sizeText: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
    color: Colors.TEXT_PRIMARY,
  },
  sizeTextSelected: {
    color: Colors.WHITE,
  },
  sizeTextDisabled: {
    color: Colors.TEXT_DISABLED,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.SURFACE,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    alignSelf: 'flex-start',
  },
  quantityButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
    paddingHorizontal: Spacing.PADDING_SM,
  },
  actionButtons: {
    marginBottom: Spacing.MARGIN_XL,
  },
  addToCartButton: {
    marginBottom: Spacing.MARGIN_MD,
  },
  buyNowButton: {
    marginBottom: Spacing.MARGIN_MD,
  },
  // Reviews Section
  reviewsSection: {
    paddingBottom: Spacing.PADDING_SM,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.MARGIN_XS,
  },
  reviewsTitle: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
  },
  addReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: Spacing.PADDING_XS,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    backgroundColor: Colors.SHEIN_PINK,
    shadowColor: Colors.SHEIN_PINK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  addReviewButtonText: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WHITE,
  },
  overallRatingContainer: {
    marginBottom: Spacing.MARGIN_SM,
  },
  overallRatingCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: Spacing.BORDER_RADIUS_SM,
    padding: Spacing.PADDING_SM,
    borderWidth: 1,
    borderColor: '#FFE5E5',
    shadowColor: Colors.SHADOW,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  overallRatingContent: {
    alignItems: 'center',
  },
  overallRatingNumber: {
    fontSize: 20,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.SHEIN_PINK,
    marginBottom: 2,
  },
  overallRatingStars: {
    flexDirection: 'row',
    marginBottom: 2,
    gap: 1,
  },
  overallRatingCount: {
    fontSize: 9,
    color: Colors.TEXT_SECONDARY,
    marginTop: 1,
  },
  fitFeedbackSection: {
    marginBottom: Spacing.MARGIN_XS,
    paddingBottom: Spacing.PADDING_XS,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  fitFeedbackQuestion: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  fitFeedbackBars: {
    gap: Spacing.MARGIN_XS,
  },
  fitBarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MARGIN_XS,
  },
  fitBarLabel: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    width: 60,
  },
  fitBarContainer: {
    flex: 1,
    height: 14,
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    overflow: 'hidden',
  },
  fitBar: {
    height: '100%',
    backgroundColor: Colors.TEXT_SECONDARY,
  },
  fitBarActive: {
    backgroundColor: Colors.TEXT_PRIMARY,
  },
  fitBarPercentage: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    width: 30,
    textAlign: 'right',
  },
  localReviewsContainer: {
    marginBottom: Spacing.MARGIN_XS,
    paddingBottom: Spacing.PADDING_XS,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  localReviewsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  localReviewsTitle: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
    color: Colors.TEXT_PRIMARY,
  },
  localReviewsRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MARGIN_XS,
  },
  localReviewsRatingText: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
  },
  localReviewsStars: {
    flexDirection: 'row',
  },
  viewMoreText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.VIBRANT_PINK,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
  },
  reviewTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.MARGIN_XS,
    marginBottom: Spacing.MARGIN_SM,
  },
  reviewTag: {
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: Spacing.PADDING_XS,
    backgroundColor: '#FFF5F5',
    borderRadius: Spacing.BORDER_RADIUS_SM,
    borderWidth: 1,
    borderColor: Colors.SHEIN_PINK,
  },
  reviewTagText: {
    fontSize: 9,
    color: Colors.SHEIN_PINK,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
  },
  individualReviewsContainer: {
    paddingVertical: Spacing.PADDING_XS,
  },
  loadingReviewsText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: Spacing.MARGIN_XS,
  },
  noReviewsText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    paddingVertical: Spacing.PADDING_MD,
  },
  reviewItem: {
    paddingVertical: 2,
    marginBottom: 0,
  },
  reviewCard: {
    backgroundColor: Colors.WHITE,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    padding: Spacing.PADDING_SM,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#FFE5E5',
    shadowColor: Colors.SHADOW,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  reviewUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  reviewAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.SHEIN_PINK,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.MARGIN_XS,
    shadowColor: Colors.SHADOW,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
    elevation: 1,
  },
  reviewAvatarText: {
    fontSize: 9,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WHITE,
  },
  reviewUserDetails: {
    flex: 1,
  },
  reviewUserName: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: 1,
  },
  reviewDate: {
    fontSize: 9,
    color: Colors.TEXT_SECONDARY,
  },
  reviewRating: {
    flexDirection: 'row',
    gap: 1,
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: Spacing.BORDER_RADIUS_SM,
  },
  reviewTitle: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: 2,
    marginTop: 2,
  },
  reviewCommentContainer: {
    marginTop: 2,
  },
  reviewComment: {
    fontSize: 9,
    color: Colors.TEXT_PRIMARY,
    lineHeight: 14,
  },
  viewMoreButton: {
    marginTop: Spacing.MARGIN_SM,
    paddingVertical: Spacing.PADDING_SM,
    paddingHorizontal: Spacing.PADDING_MD,
    backgroundColor: '#FFF5F5',
    borderRadius: Spacing.BORDER_RADIUS_SM,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.SHEIN_PINK,
    shadowColor: Colors.SHADOW,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  viewMoreButtonText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.SHEIN_RED,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
  },
  expandReviewButton: {
    alignItems: 'center',
    marginTop: 4,
    padding: 2,
  },
  expandReviewText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.SHEIN_PINK,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_MD,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  modalTitle: {
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
  },
  modalCloseButton: {
    padding: Spacing.PADDING_XS,
  },
  modalScrollView: {
    flex: 1,
    paddingHorizontal: Spacing.PADDING_MD,
  },
  modalLoadingMore: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.PADDING_MD,
    gap: Spacing.MARGIN_XS,
  },
  modalLoadingText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
  },
  modalEndMessage: {
    paddingVertical: Spacing.PADDING_MD,
    alignItems: 'center',
  },
  modalEndText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  helpfulButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MARGIN_XS,
  },
  helpfulText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.PADDING_XL,
  },
  loadingText: {
    marginTop: Spacing.MARGIN_MD,
    fontSize: Typography.FONT_SIZE_MD,
    color: Colors.TEXT_SECONDARY,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.PADDING_XL,
  },
  errorText: {
    marginTop: Spacing.MARGIN_MD,
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.ERROR,
  },
  errorSubtext: {
    marginTop: Spacing.MARGIN_SM,
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  errorActions: {
    marginTop: Spacing.MARGIN_LG,
    flexDirection: 'row',
    gap: Spacing.MARGIN_MD,
    justifyContent: 'center',
  },
  retryButton: {
    paddingHorizontal: Spacing.PADDING_LG,
    paddingVertical: Spacing.PADDING_MD,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    borderWidth: 1,
    borderColor: Colors.TEXT_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  retryButtonPrimary: {
    backgroundColor: Colors.SHEIN_PINK,
    borderColor: Colors.SHEIN_PINK,
  },
  retryButtonText: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
  },
  specificationsSection: {
    marginTop: Spacing.MARGIN_SM,
    marginBottom: Spacing.MARGIN_XS,
    paddingTop: Spacing.PADDING_SM,
    borderTopWidth: 1,
    borderTopColor: Colors.LIGHT_GRAY,
  },
  specificationsTitle: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: 2,
  },
  specificationItem: {
    marginBottom: Spacing.MARGIN_XS,
    paddingBottom: Spacing.PADDING_XS,
    borderBottomWidth: 1,
    borderBottomColor: Colors.LIGHT_GRAY,
  },
  specificationLabel: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: 1,
  },
  specificationDescription: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    lineHeight: Typography.FONT_SIZE_XS * 1.4,
  },
  writeReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.SHEIN_PINK,
    paddingVertical: Spacing.PADDING_MD,
    paddingHorizontal: Spacing.PADDING_LG,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    marginTop: Spacing.MARGIN_MD,
    marginBottom: Spacing.MARGIN_LG,
  },
  writeReviewButtonText: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    marginLeft: Spacing.MARGIN_SM,
  },
  reviewFormContainer: {
    marginTop: Spacing.MARGIN_MD,
    padding: Spacing.PADDING_MD,
    backgroundColor: Colors.SURFACE,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  reviewFormTitle: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_MD,
  },
  ratingInputContainer: {
    marginBottom: Spacing.MARGIN_LG,
  },
  ratingInputLabel: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_SM,
  },
  ratingStarsInput: {
    flexDirection: 'row',
    gap: Spacing.MARGIN_SM,
  },
  starButton: {
    padding: Spacing.PADDING_XS,
  },
  reviewInputContainer: {
    marginBottom: Spacing.MARGIN_LG,
  },
  reviewInputLabel: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  reviewInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    padding: Spacing.PADDING_SM,
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_PRIMARY,
    backgroundColor: Colors.WHITE,
  },
  reviewTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  reviewFormActions: {
    flexDirection: 'row',
    gap: Spacing.MARGIN_MD,
    marginTop: Spacing.MARGIN_MD,
  },
  reviewFormButton: {
    flex: 1,
    paddingVertical: Spacing.PADDING_MD,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewFormButtonCancel: {
    backgroundColor: Colors.SURFACE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  reviewFormButtonSubmit: {
    backgroundColor: Colors.SHEIN_PINK,
  },
  reviewFormButtonDisabled: {
    opacity: 0.6,
  },
  reviewFormButtonTextCancel: {
    color: Colors.TEXT_PRIMARY,
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
  },
  reviewFormButtonTextSubmit: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
  },
  company: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    fontStyle: 'italic',
    marginBottom: Spacing.MARGIN_XS,
  },
  outOfStockBadge: {
    marginTop: Spacing.MARGIN_SM,
    alignSelf: 'flex-start',
    backgroundColor: Colors.ERROR,
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_XS,
    borderRadius: Spacing.BORDER_RADIUS_SM,
  },
  outOfStockText: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
  },
  reviewDetails: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    marginTop: Spacing.MARGIN_XS,
    marginBottom: Spacing.MARGIN_SM,
  },
  // Recommend Tab
  recommendContent: {
    paddingBottom: Spacing.PADDING_MD,
  },
  sectionTitle: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: 2,
  },
  comingSoonText: {
    fontSize: Typography.FONT_SIZE_MD,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    padding: Spacing.PADDING_XL,
  },
  loadingIndicator: {
    marginVertical: Spacing.MARGIN_XL,
  },
  recommendedProductCard: {
    width: (width - Spacing.PADDING_LG * 3) / 2,
    backgroundColor: Colors.SURFACE,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    marginBottom: Spacing.MARGIN_MD,
    marginRight: Spacing.MARGIN_MD,
    ...Spacing.SHADOW_SM,
  },
  recommendedProductImage: {
    width: '100%',
    height: (width - Spacing.PADDING_LG * 3) / 2 * 1.2,
    borderTopLeftRadius: Spacing.BORDER_RADIUS_MD,
    borderTopRightRadius: Spacing.BORDER_RADIUS_MD,
  },
  recommendedProductInfo: {
    padding: Spacing.PADDING_MD,
  },
  recommendedProductName: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_SM,
    minHeight: 36,
  },
  recommendedProductPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.MARGIN_XS,
  },
  recommendedProductPrice: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginRight: Spacing.MARGIN_SM,
  },
  recommendedProductOriginalPrice: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  recommendedProductRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recommendedProductRatingText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    marginLeft: Spacing.MARGIN_XS,
  },
  reviewsNoteText: {
    fontSize: Typography.FONT_SIZE_MD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_SM,
    lineHeight: Typography.FONT_SIZE_MD * 1.5,
  },
  reviewsNoteSubtext: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    fontStyle: 'italic',
    lineHeight: Typography.FONT_SIZE_SM * 1.4,
  },
  // Description Section
  descriptionSection: {
    marginBottom: Spacing.MARGIN_SM,
    paddingBottom: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  descriptionTitle: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: 2,
  },
  descriptionText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    lineHeight: Typography.FONT_SIZE_XS * 1.4,
  },
  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.MARGIN_SM,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.VIBRANT_PINK,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
    marginRight: Spacing.MARGIN_XS,
  },
  // Stock Information Section (Full Width under carousel)
  stockSectionFullWidth: {
    width: width,
    backgroundColor: Colors.WHITE,
    paddingVertical: Spacing.PADDING_SM,
    paddingHorizontal: Spacing.PADDING_MD,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  // Stock Information Section (Inside carousel container)
  stockSectionInCarousel: {
    width: width,
    backgroundColor: Colors.WHITE,
    paddingTop: 0,
    paddingBottom: Spacing.PADDING_SM,
    paddingHorizontal: Spacing.PADDING_MD,
  },
  // Product Name (Inside carousel container, under stock badge)
  productNameInCarousel: {
    width: width,
    backgroundColor: Colors.WHITE,
    paddingHorizontal: Spacing.PADDING_SM,
    paddingBottom: Spacing.PADDING_SM,
  },
  productNameText: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    textAlign: 'left',
  },
  productNameReadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.MARGIN_XS,
    alignSelf: 'flex-start',
  },
  productNameReadMoreText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.VIBRANT_PINK,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
    marginRight: Spacing.MARGIN_XS,
  },
  stockSection: {
    marginBottom: Spacing.MARGIN_SM,
    paddingBottom: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  stockStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: width,
    paddingVertical: Spacing.PADDING_XS,
    paddingHorizontal: Spacing.PADDING_SM,
    borderRadius: 0,
    gap: 4,
  },
  stockStatusText: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
  },
  // Short Description
  shortDescriptionSection: {
    marginBottom: Spacing.MARGIN_SM,
    paddingBottom: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  shortDescriptionText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_PRIMARY,
    fontWeight: Typography.FONT_WEIGHT_MEDIUM,
    lineHeight: Typography.FONT_SIZE_SM * 1.4,
  },
  // Meta Info Section (Company, Category, Ranking)
  metaInfoSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.MARGIN_SM,
    marginBottom: Spacing.MARGIN_SM,
    paddingBottom: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  metaInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MARGIN_XS,
  },
  metaInfoText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
  },
  // Offers Section
  offersSection: {
    marginBottom: Spacing.MARGIN_SM,
    paddingBottom: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  offersSectionTitle: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_SM,
  },
  offerItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.MARGIN_SM,
    marginBottom: Spacing.MARGIN_SM,
    padding: Spacing.PADDING_SM,
    backgroundColor: Colors.LIGHT_GRAY + '40',
    borderRadius: Spacing.BORDER_RADIUS_SM,
  },
  offerContent: {
    flex: 1,
  },
  offerTitle: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  offerDescription: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    lineHeight: Typography.FONT_SIZE_XS * 1.4,
  },
  // Bottom Bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_MD,
    backgroundColor: Colors.WHITE,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
    ...Spacing.SHADOW_MD,
  },
  bottomWishlistButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.MARGIN_MD,
  },
  addToCartBottomButton: {
    flex: 1,
    backgroundColor: Colors.DARK_GRAY,
    paddingVertical: Spacing.PADDING_MD,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addToCartBottomText: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
  },
  addToCartBottomDiscount: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_XS,
    marginTop: Spacing.MARGIN_XS,
  },
});
