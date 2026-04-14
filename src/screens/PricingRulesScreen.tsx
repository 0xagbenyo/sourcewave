import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Dimensions,
  SafeAreaView,
  Image,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, CommonActions } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { RootStackParamList } from '../types';
import type { NavigationProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { usePricingRules, useWishlistActions, useWishlist, useCartActions } from '../hooks/erpnext';
import { useUserSession } from '../context/UserContext';
import { LoadingScreen } from '../components/LoadingScreen';
import { ProductCardSkeletonList } from '../components/ProductCardSkeletonList';
import { ProductCard } from '../components/ProductCard';
import { PriceFilter, SortOption } from '../components/PriceFilter';
import { CartAnimation } from '../components/CartAnimation';
import { getProductDiscount } from '../utils/pricingRules';
import { getERPNextClient } from '../services/erpnext';
import { mapERPItemToProduct } from '../services/mappers';

const { width } = Dimensions.get('window');

export const PricingRulesScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useUserSession();
  const { wishlistItems, refresh: refreshWishlist } = useWishlist(user?.email || null);
  const { toggleWishlist } = useWishlistActions(refreshWishlist);
  const { addToCart: addItemToCart } = useCartActions();
  const { data: pricingRules, loading: pricingRulesLoading } = usePricingRules();
  // Memoize safePricingRules to prevent infinite loops
  const safePricingRules = useMemo(() => pricingRules || [], [pricingRules]);
  
  // Get rule name from route params if provided
  const routeParams = route.params as { ruleName?: string } | undefined;
  const initialRuleName = routeParams?.ruleName;

  // Optimistic state for immediate UI updates
  const [optimisticWishlist, setOptimisticWishlist] = useState<Set<string>>(new Set());
  const [pendingOperations, setPendingOperations] = useState<Set<string>>(new Set());
  
  // Cart animation state
  const [showCartAnimation, setShowCartAnimation] = useState(false);
  const [animationStartPos, setAnimationStartPos] = useState({ x: 0, y: 0 });
  const [animationEndPos, setAnimationEndPos] = useState({ x: 0, y: 0 });
  const [animationProductImage, setAnimationProductImage] = useState<string | undefined>(undefined);
  
  // Create a Set of wishlisted product IDs for quick lookup
  const wishlistedProductIds = useMemo(() => {
    const baseSet = new Set(wishlistItems.map(item => item.productId));
    // Merge with optimistic updates
    optimisticWishlist.forEach(id => baseSet.add(id));
    return baseSet;
  }, [wishlistItems, optimisticWishlist]);
  
  // Sync optimistic state with actual wishlist when it updates
  const wishlistIdsRef = useRef<string>('');
  const currentWishlistIds = useMemo(() => {
    const ids = [...new Set(wishlistItems.map(item => item.productId))].sort();
    return JSON.stringify(ids);
  }, [wishlistItems]);
  
  useEffect(() => {
    if (pendingOperations.size > 0) {
      return; // Don't sync while operations are pending
    }
    
    // Only update if the wishlist IDs actually changed
    if (currentWishlistIds === wishlistIdsRef.current) {
      return;
    }
    
    wishlistIdsRef.current = currentWishlistIds;
    
    // Parse IDs from the string to avoid depending on wishlistItems array
    const actualIds = JSON.parse(currentWishlistIds) as string[];
    const actualSet = new Set(actualIds);
    
    setOptimisticWishlist(prev => {
      const newSet = new Set(actualSet);
      if (newSet.size !== prev.size || Array.from(newSet).some(id => !prev.has(id)) || Array.from(prev).some(id => !newSet.has(id))) {
        return newSet;
      }
      return prev;
    });
  }, [currentWishlistIds, pendingOperations.size]);

  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [ruleProducts, setRuleProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const sidebarAnimation = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  
  // Handle pull-to-refresh - reload the entire page
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const navigation = useNavigation();
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
          await Updates.reloadAsync();
        } catch (error) {
          console.log('Updates.reloadAsync not available, using navigation reset');
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Main' }],
            })
          );
        }
      }, 1500);
    } catch (error) {
      console.error('Error refreshing data:', error);
      setRefreshing(false);
    }
  }, []);
  
  // Check if page is initially loading
  const isInitialLoading = pricingRulesLoading && safePricingRules.length === 0;

  // Fetch products for selected rule
  useEffect(() => {
    const fetchRuleProducts = async () => {
      if (!selectedRule || !safePricingRules || safePricingRules.length === 0) {
        setRuleProducts([]);
        return;
      }

      setLoadingProducts(true);
      try {
        const client = getERPNextClient();
        const rule = safePricingRules.find((r: any) => r.name === selectedRule);
        if (!rule) {
          setRuleProducts([]);
          return;
        }

        const ruleAny = rule as any;
        const allProducts: any[] = [];

        // Fetch products by item codes
        if (ruleAny.items && Array.isArray(ruleAny.items)) {
          for (const item of ruleAny.items) {
            if (item && item.item_code) {
              try {
                const websiteItem = await client.getItem(item.item_code);
                if (websiteItem) {
                  const product = mapERPItemToProduct(websiteItem);
                  const calculatedDiscount = getProductDiscount(product, safePricingRules);
                  const ruleDiscount = ruleAny.discount_percentage || 0;
                  const discount = calculatedDiscount > 0 ? calculatedDiscount : ruleDiscount;
                  
                  if (discount > 0 || ruleDiscount > 0) {
                    const productWithDiscount = {
                      ...product,
                      discount: discount > 0 ? discount : ruleDiscount,
                      ruleName: rule.name
                    };
                    allProducts.push(productWithDiscount);
                  }
                }
              } catch (error: any) {
                if (error?.message && !error.message.includes('not found') && !error.message.includes('DoesNotExistError')) {
                  console.warn(`Failed to fetch product ${item.item_code}:`, error.message);
                }
              }
            }
          }
        }

        // Fetch products by item groups
        if (ruleAny.item_groups && Array.isArray(ruleAny.item_groups)) {
          for (const itemGroup of ruleAny.item_groups) {
            if (itemGroup && itemGroup.item_group) {
              try {
                const websiteItems = await client.getItemsByGroup(itemGroup.item_group, 100);
                const products = websiteItems.map((item: any) => {
                  const product = mapERPItemToProduct(item);
                  const discount = getProductDiscount(product, safePricingRules);
                  return {
                    ...product,
                    discount,
                    ruleName: rule.name
                  };
                }).filter((p: any) => p.discount > 0);
                allProducts.push(...products);
              } catch (error) {
                console.warn(`Failed to fetch products for group ${itemGroup.item_group}:`, error);
              }
            }
          }
        }

        // Remove duplicates
        const uniqueProducts = Array.from(
          new Map(allProducts.map((p: any) => [p.id, p])).values()
        );

        setRuleProducts(uniqueProducts);
      } catch (error) {
        console.error('Error fetching rule products:', error);
        setRuleProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchRuleProducts();
  }, [selectedRule, safePricingRules]);


  // Auto-select rule from route params or first rule if none selected
  // Use a ref to track if we've already auto-selected to prevent infinite loops
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!selectedRule && safePricingRules && safePricingRules.length > 0 && !hasAutoSelectedRef.current) {
      hasAutoSelectedRef.current = true;
      // If route param provides a rule name, try to select it, otherwise select first rule
      if (initialRuleName) {
        const ruleExists = safePricingRules.some((r: any) => r.name === initialRuleName);
        if (ruleExists) {
          setSelectedRule(initialRuleName);
        } else {
          setSelectedRule(safePricingRules[0].name);
        }
      } else {
        setSelectedRule(safePricingRules[0].name);
      }
    }
  }, [selectedRule, safePricingRules, initialRuleName]);

  // Sort products
  const sortedProducts = useMemo(() => {
    if (!Array.isArray(ruleProducts)) {
      return [];
    }
    const sorted = [...ruleProducts];
    switch (sortOption) {
      case 'lowToHigh':
        return sorted.sort((a: any, b: any) => (a.price || 0) - (b.price || 0));
      case 'highToLow':
        return sorted.sort((a: any, b: any) => (b.price || 0) - (a.price || 0));
      default:
        return sorted.sort((a: any, b: any) => (b.discount || 0) - (a.discount || 0));
    }
  }, [ruleProducts, sortOption]);

  // Animate sidebar toggle
  useEffect(() => {
    Animated.timing(sidebarAnimation, {
      toValue: sidebarVisible ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [sidebarVisible]);

  // Fade in products when loaded
  useEffect(() => {
    if (Array.isArray(sortedProducts) && sortedProducts.length > 0) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [sortedProducts]);

  const handleBack = () => {
    navigation.goBack();
  };

  const renderHeader = () => {
    const selectedRuleData = safePricingRules.find((r: any) => r.name === selectedRule);
    const discount = selectedRuleData?.discount_percentage || 0;
    let dealTitle = selectedRuleData?.title || `${discount}% Off`;
    if (selectedRuleData?.item_groups && selectedRuleData.item_groups.length > 0) {
      const groupNames = selectedRuleData.item_groups.map((ig: any) => ig.item_group).filter(Boolean).join(', ');
      if (groupNames) {
        dealTitle = `${discount}% Off - ${groupNames}`;
      }
    }
    
    return (
      <>
        <View style={[styles.header, { paddingTop: Math.max(insets.top - 20, 0) }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={20} color={Colors.WHITE} />
          </TouchableOpacity>
          <Text style={styles.title}>Super Deals</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.subHeader}>
          <TouchableOpacity 
            onPress={() => setSidebarVisible(!sidebarVisible)} 
            style={styles.toggleButton}
          >
            <Ionicons 
              name={sidebarVisible ? "close" : "menu"} 
              size={20} 
              color={Colors.WHITE} 
            />
          </TouchableOpacity>
          <Text style={styles.dealTitle} numberOfLines={1}>
            {selectedRule ? dealTitle : 'Select a deal'}
          </Text>
        </View>
      </>
    );
  };


  const renderProductItem = ({ item, index }: { item: any; index: number }) => {
    const isLeftColumn = index % 2 === 0;
    const row = Math.floor(index / 2);
    const patterns = [
      ['tall', 'short'],
      ['medium', 'tall'],
      ['short', 'medium'],
    ];
    const patternIndex = row % patterns.length;
    const variant = (isLeftColumn 
      ? patterns[patternIndex][0] 
      : patterns[patternIndex][1]
    ) as 'tall' | 'medium' | 'short';
    
    const discount = item.discount || getProductDiscount(item, safePricingRules);
    
    const cardWidth = sidebarVisible 
      ? (width * 0.75 - Spacing.SCREEN_PADDING * 2 - Spacing.MARGIN_SM) / 2 * 0.85
      : (width - Spacing.SCREEN_PADDING * 2 - Spacing.MARGIN_SM) / 2 * 0.85;
    
    return (
      <ProductCard
        product={item}
        onPress={(productId) => {
          (navigation as any).navigate('ProductDetails', { productId });
        }}
        onCartPress={async (productId, animationData) => {
          if (!user?.email) {
            return;
          }
          
          try {
            const itemCode = item.itemCode || productId;
            const success = await addItemToCart(itemCode, 1);
            if (success) {
              // Trigger animation if data is available
              if (animationData) {
                const endX = width - 60; // Approx position of cart icon
                const endY = 50; // Approx position of cart icon
                setAnimationStartPos(animationData.startPos);
                setAnimationEndPos({ x: endX, y: endY });
                setAnimationProductImage(animationData.productImage);
                setShowCartAnimation(true);
              }
            }
          } catch (error) {
            console.error('Error adding to cart:', error);
          }
        }}
        onWishlistPress={async (productId) => {
          if (pendingOperations.has(productId)) {
            return;
          }
          
          const isWishlisted = wishlistedProductIds.has(productId);
          setPendingOperations(prev => new Set(prev).add(productId));
          
          setOptimisticWishlist(prev => {
            const newSet = new Set(prev);
            if (isWishlisted) {
              newSet.delete(productId);
            } else {
              newSet.add(productId);
            }
            return newSet;
          });
          
          try {
            const success = await toggleWishlist(productId, isWishlisted);
            if (!success) {
              setOptimisticWishlist(prev => {
                const newSet = new Set(prev);
                if (isWishlisted) {
                  newSet.add(productId);
                } else {
                  newSet.delete(productId);
                }
                return newSet;
              });
            }
          } finally {
            setPendingOperations(prev => {
              const newSet = new Set(prev);
              newSet.delete(productId);
              return newSet;
            });
          }
        }}
        isWishlisted={wishlistedProductIds.has(item.id)}
        style={[styles.productCard, { width: cardWidth }]}
        variant={variant}
        pricingDiscount={discount}
      />
    );
  };

  if (isInitialLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ProductCardSkeletonList count={6} numColumns={2} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <CartAnimation
        visible={showCartAnimation}
        startPosition={animationStartPos}
        endPosition={animationEndPos}
        productImage={animationProductImage}
        onComplete={() => setShowCartAnimation(false)}
      />
      {renderHeader()}
      <View style={styles.content}>
        {/* Left sidebar with pricing rules */}
        <Animated.View
          style={[
            styles.rulesSidebar,
            {
              width: sidebarAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [0, width * 0.25],
              }),
              opacity: sidebarAnimation,
            },
          ]}
        >
          <ScrollView 
            showsVerticalScrollIndicator={false}
          >
            {safePricingRules.map((rule: any) => {
              const discount = rule.discount_percentage || 0;
              let title = rule.title || `${discount}% Off`;
              if (rule.item_groups && rule.item_groups.length > 0) {
                const groupNames = rule.item_groups.map((ig: any) => ig.item_group).filter(Boolean).join(', ');
                if (groupNames) {
                  title = `${discount}% Off - ${groupNames}`;
                }
              }
              
              return (
                <TouchableOpacity
                  key={rule.name}
                  style={[styles.ruleItem, selectedRule === rule.name && styles.ruleItemSelected]}
                  onPress={() => setSelectedRule(rule.name)}
                >
                  <Text 
                    style={[styles.ruleText, selectedRule === rule.name && styles.ruleTextSelected]} 
                    numberOfLines={2}
                  >
                    {title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* Right side with products */}
        <View style={styles.productsContainer}>
          <View style={styles.filterContainer}>
            <PriceFilter onSortChange={setSortOption} currentSort={sortOption} />
          </View>
          
          {loadingProducts ? (
            <ProductCardSkeletonList count={6} numColumns={2} />
          ) : sortedProducts.length > 0 ? (
            <Animated.View 
              style={{ 
                flex: 1, 
                opacity: fadeAnim,
              }}
            >
              <FlatList
                data={sortedProducts}
                numColumns={2}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.productsGrid}
                columnWrapperStyle={styles.productRow}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#acc5e1"
                    colors={["#acc5e1"]}
                  />
                }
                renderItem={renderProductItem}
                keyExtractor={(item) => item.id}
              />
            </Animated.View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="pricetag-outline" size={40} color="#acc5e1" />
              <Text style={styles.emptyText}>No products available</Text>
              <Text style={styles.emptySubtext}>Select a pricing rule to see products</Text>
            </View>
          )}
        </View>
      </View>
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
    paddingHorizontal: 12,
    paddingVertical: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BLACK,
    backgroundColor: Colors.FLASH_SALE_RED,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_XS,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    backgroundColor: Colors.FLASH_SALE_RED,
  },
  dealTitle: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.WHITE,
    flex: 1,
    marginLeft: Spacing.MARGIN_SM,
    textAlign: 'center',
  },
  dealTitleWhite: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.WHITE,
    flex: 1,
    marginLeft: Spacing.MARGIN_SM,
    textAlign: 'center',
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WHITE,
    flex: 1,
    textAlign: 'center',
  },
  titleWhite: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WHITE,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  rulesSidebar: {
    width: width * 0.25,
    backgroundColor: Colors.LIGHT_GRAY,
    borderRightWidth: 1,
    borderRightColor: Colors.BORDER,
  },
  ruleItem: {
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    justifyContent: 'center',
    minHeight: 50,
  },
  ruleItemSelected: {
    backgroundColor: Colors.FLASH_SALE_RED,
  },
  ruleText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_PRIMARY,
    fontWeight: '500',
  },
  ruleTextSelected: {
    color: Colors.WHITE,
    fontWeight: '600',
  },
  productsContainer: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  filterContainer: {
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_SM,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: Colors.FLASH_SALE_RED,
  },
  productsGrid: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: Spacing.PADDING_SM,
    paddingBottom: 100,
  },
  productRow: {
    justifyContent: 'space-between',
    marginBottom: Spacing.MARGIN_XS,
  },
  productCard: {
    marginBottom: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  loadingText: {
    marginTop: Spacing.MARGIN_MD,
    fontSize: Typography.FONT_SIZE_MD,
    color: Colors.TEXT_SECONDARY,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    marginTop: Spacing.MARGIN_SM,
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.FLASH_SALE_RED,
  },
  emptySubtext: {
    marginTop: Spacing.MARGIN_XS,
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.FLASH_SALE_RED,
  },
});

