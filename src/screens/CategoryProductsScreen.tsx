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
import { useProductsByCategory, useCategories, usePricingRules, useWishlistActions, useWishlist } from '../hooks/erpnext';
import { useUserSession } from '../context/UserContext';
import { LoadingScreen } from '../components/LoadingScreen';
import { ProductCardSkeletonList } from '../components/ProductCardSkeletonList';
import { ProductCard } from '../components/ProductCard';
import { PriceFilter, SortOption } from '../components/PriceFilter';
import { getProductDiscount } from '../utils/pricingRules';
import { getERPNextClient } from '../services/erpnext';
import { mapERPItemToProduct } from '../services/mappers';

const { width } = Dimensions.get('window');

interface RouteParams {
  categoryName: string;
  parentName: string;
}

export const CategoryProductsScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useUserSession();
  const { wishlistItems, refresh: refreshWishlist } = useWishlist(user?.email || null);
  const { toggleWishlist } = useWishlistActions(refreshWishlist);
  const routeParams = (route.params as RouteParams) || {};
  const { categoryName: initialCategoryName = '', parentName = '' } = routeParams;

  const { data: allCategories } = useCategories();
  
  // Optimistic state for immediate UI updates
  const [optimisticWishlist, setOptimisticWishlist] = useState<Set<string>>(new Set());
  const [pendingOperations, setPendingOperations] = useState<Set<string>>(new Set());
  
  // Create a Set of wishlisted product IDs for quick lookup
  const wishlistedProductIds = useMemo(() => {
    const baseSet = new Set(wishlistItems.map(item => item.productId));
    // Merge with optimistic updates
    optimisticWishlist.forEach(id => baseSet.add(id));
    return baseSet;
  }, [wishlistItems, optimisticWishlist]);
  
  // Sync optimistic state with actual wishlist when it updates
  // Only sync when not currently performing operations to avoid infinite loops
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
      // Clear optimistic state and sync with actual wishlist
      // This ensures we start fresh after operations complete
      const newSet = new Set(actualSet);
      
      // Only update if there's a change to prevent unnecessary re-renders
      if (newSet.size !== prev.size || Array.from(newSet).some(id => !prev.has(id)) || Array.from(prev).some(id => !newSet.has(id))) {
        return newSet;
      }
      return prev; // Return same reference if no change
    });
  }, [currentWishlistIds, pendingOperations.size]);
  const [siblingsLoading, setSiblingsLoading] = useState(false);
  const [siblingCategories, setSiblingCategories] = useState<any[]>([]);
  const [siblingImages, setSiblingImages] = useState<Record<string, string>>({});
  // Ensure selectedCategory always has a value - use initialCategoryName from route params
  // Use useMemo to ensure stable value for hook calls
  const stableCategoryName = useMemo(() => initialCategoryName || '', [initialCategoryName]);
  const [selectedCategory, setSelectedCategory] = useState(() => stableCategoryName);
  const [sortOption, setSortOption] = useState<SortOption>('default');
  
  // Use selectedCategory state instead of route params for fetching products
  // Convert sortOption to server-side sorting parameter
  const sortByPrice = sortOption === 'lowToHigh' ? 'asc' : sortOption === 'highToLow' ? 'desc' : undefined;
  // Use memoized category name to ensure stable hook calls
  const categoryForFetch = useMemo(() => {
    return selectedCategory || stableCategoryName || '';
  }, [selectedCategory, stableCategoryName]);
  
  const { 
    data: products, 
    loading: productsLoading, 
    loadingMore: productsLoadingMore,
    hasMore: productsHasMore,
    loadMore: loadMoreProducts,
    refresh: refreshProducts 
  } = useProductsByCategory(categoryForFetch, 20, sortByPrice);
  const { data: pricingRules = [], loading: pricingRulesLoading } = usePricingRules();
  
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  
  // Handle pull-to-refresh - reload the entire page
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshProducts();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);
  
  // Check if page is initially loading (fresh load - no data loaded yet)
  const isInitialLoading = (!products && productsLoading) && 
    (!pricingRules || pricingRules.length === 0);

  // Handle infinite scroll
  const handleEndReached = useCallback(() => {
    if (productsHasMore && !productsLoadingMore && !productsLoading) {
      loadMoreProducts();
    }
  }, [productsHasMore, productsLoadingMore, productsLoading, loadMoreProducts]);

  // Fetch sibling categories and their first product image
  useEffect(() => {
    const fetchSiblings = async () => {
      setSiblingsLoading(true);
      try {
        const client = getERPNextClient();
        const allGroups = await client.getItemGroups();
        // Filter for children of the same parent and exclude "All Items Group"
        const siblings = allGroups.filter(
          (group: any) => group.parent_item_group === parentName && group.name !== 'All Items Group'
        );
        setSiblingCategories(siblings);

        // Fetch first product image for each sibling category
        const images: Record<string, string> = {};
        for (const sibling of siblings) {
          try {
            // Fetch just 1 product per category (same as HomeScreen)
            const websiteItems = await client.getWebsiteItemsByGroup(sibling.name, 1);
            if (websiteItems && websiteItems.length > 0) {
              const product = mapERPItemToProduct(websiteItems[0]);
              if (product.images && product.images.length > 0) {
                images[sibling.name] = product.images[0];
              }
            }
          } catch (error) {
            // Silently fail for individual categories
          }
        }
        setSiblingImages(images);
      } catch (error) {
        console.error('Error fetching sibling categories:', error);
      } finally {
        setSiblingsLoading(false);
      }
    };

    if (parentName) {
      fetchSiblings();
    }
  }, [parentName]);

  const handleCategoryChange = (categoryName: string, parentName: string) => {
    setSelectedCategory(categoryName);
    // Update route params for navigation state
    navigation.setParams({ categoryName, parentName } as any);
  };
  
  // Update selectedCategory when route params change (e.g., when navigating back)
  // Use a ref to track if we've initialized to prevent unnecessary updates
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    // Only update if we have a valid category name and haven't initialized yet, or if it changed
    if (initialCategoryName && (!hasInitializedRef.current || initialCategoryName !== selectedCategory)) {
      setSelectedCategory(initialCategoryName);
      hasInitializedRef.current = true;
    }
  }, [initialCategoryName, selectedCategory]);

  // No client-side sorting needed - server-side sorting is already applied
  const sortedProducts = useMemo(() => {
    return products || [];
  }, [products]);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={24} color={Colors.BLACK} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {selectedCategory}
      </Text>
      <View style={styles.headerIcons}>
        <TouchableOpacity 
          style={styles.iconButton}
          onPress={() => (navigation as any).navigate('Search')}
        >
          <Ionicons name="search" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.iconButton}
          onPress={() => (navigation as any).navigate('Wishlist')}
        >
          <Ionicons name="heart-outline" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSiblingCategories = () => (
    <View style={styles.siblingContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.siblingScroll}
      >
        {siblingCategories.map((category) => {
          const image = siblingImages[category.name];
          const categoryName = category.item_group_name || category.name || 'Category';
          return (
            <TouchableOpacity
              key={category.name || category.item_group_name}
              style={[
                styles.siblingTab,
                selectedCategory === category.name && styles.siblingTabActive,
              ]}
              onPress={() => handleCategoryChange(category.name, parentName)}
            >
              {image ? (
                <View style={styles.siblingTabImageContainer}>
                  <Image
                    source={{ uri: image }}
                    style={styles.siblingTabImage}
                    resizeMode="cover"
                    onError={(error) => {
                      console.warn(`❌ Failed to load image for category ${category.name}:`, image, error);
                    }}
                    onLoad={() => {
                      console.log(`✅ Successfully loaded image for category ${category.name}`);
                    }}
                  />
                </View>
              ) : (
                <View style={styles.siblingTabPlaceholder}>
                  <Ionicons name="image" size={18} color={Colors.TEXT_SECONDARY} />
                </View>
              )}
              <Text
                style={[
                  styles.siblingTabText,
                  selectedCategory === category.name && styles.siblingTabTextActive,
                ]}
                numberOfLines={2}
              >
                {categoryName}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersScroll}
      >
        <PriceFilter onSortChange={setSortOption} currentSort={sortOption} />

        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterChipText}>Category</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.WINE} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterChipText}>Size</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.WINE} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.filterChip}>
          <Text style={styles.filterChipText}>Color</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.WINE} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

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
    
    const discount = getProductDiscount(item, pricingRules);
    
    return (
      <ProductCard
        product={item}
        onPress={(productId) => {
          navigation.navigate('ProductDetails', { productId });
        }}
        onWishlistPress={async (productId) => {
          // Prevent multiple simultaneous operations on the same item
          if (pendingOperations.has(productId)) {
            return;
          }
          
          const isWishlisted = wishlistedProductIds.has(productId);
          
          // Mark operation as pending
          setPendingOperations(prev => new Set(prev).add(productId));
          
          // Optimistic update - immediately update UI
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
              // Revert optimistic update on failure
              setOptimisticWishlist(prev => {
                const newSet = new Set(prev);
                if (isWishlisted) {
                  newSet.add(productId); // Re-add if removal failed
                } else {
                  newSet.delete(productId); // Remove if add failed
                }
                return newSet;
              });
            }
            // refreshWishlist is called automatically by useWishlistActions
          } finally {
            // Remove from pending immediately after operation completes
            // This allows immediate toggling back and forth
            setPendingOperations(prev => {
              const newSet = new Set(prev);
              newSet.delete(productId);
              return newSet;
            });
          }
        }}
        isWishlisted={wishlistedProductIds.has(item.id)}
        style={styles.productCard}
        variant={variant}
        pricingDiscount={discount}
      />
    );
  };

  const renderProducts = () => {
    const ListHeader = () => (
      <>
        {renderSiblingCategories()}
        <View style={styles.stickyFiltersWrapper}>
          {renderFilters()}
        </View>
      </>
    );

    // Show skeleton loading cards while fetching products
    if (productsLoading && (!products || products.length === 0)) {
      return (
        <>
          <ListHeader />
          <ProductCardSkeletonList count={6} numColumns={2} />
        </>
      );
    }

    if (!sortedProducts || sortedProducts.length === 0) {
      return (
        <>
          <ListHeader />
          <View style={styles.emptyContainer}>
            <Ionicons name="search" size={48} color={Colors.LIGHT_GRAY} />
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        </>
      );
    }

    const renderFooter = () => {
      if (!productsLoadingMore) return null;
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={Colors.WINE} />
          <Text style={styles.footerLoaderText}>Loading more products...</Text>
        </View>
      );
    };

    return (
      <FlatList
        data={sortedProducts}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.productsList}
        columnWrapperStyle={styles.productRow}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.WINE}
            colors={[Colors.WINE]}
          />
        }
        renderItem={renderProductItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        ListHeaderComponentStyle={styles.listHeader}
        ListFooterComponent={renderFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={true}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={10}
      />
    );
  };

  // Show loading screen on initial load
  if (isInitialLoading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.headerContainer, { marginTop: -insets.top }]}>
        {renderHeader()}
      </View>
      {renderProducts()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.WHITE,
    paddingTop: 0,
  },
  headerContainer: {
    backgroundColor: Colors.WHITE,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.PADDING_SM,
    paddingTop: 60,
    paddingBottom: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.LIGHT_GRAY,
    backgroundColor: Colors.WHITE,
  },
  headerTitle: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: '600',
    color: Colors.BLACK,
    flex: 1,
    marginHorizontal: Spacing.MARGIN_XS,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MARGIN_XS,
  },
  iconButton: {
    padding: Spacing.PADDING_XS,
  },
  siblingContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.LIGHT_GRAY,
    backgroundColor: Colors.WHITE,
  },
  siblingScroll: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: Spacing.PADDING_XS,
    gap: Spacing.MARGIN_XS,
  },
  siblingTab: {
    alignItems: 'center',
    paddingVertical: Spacing.PADDING_XS,
    marginRight: 0,
    maxWidth: width * 0.25,
  },
  siblingTabActive: {
    opacity: 0.8,
  },
  siblingTabImageContainer: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginBottom: Spacing.MARGIN_XS / 2,
    backgroundColor: Colors.LIGHT_GRAY,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.WINE,
  },
  siblingTabImage: {
    width: '100%',
    height: '100%',
  },
  siblingTabPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.MARGIN_XS / 2,
    borderWidth: 2,
    borderColor: Colors.WINE,
  },
  siblingTabText: {
    fontSize: Typography.FONT_SIZE_XS - 1,
    color: Colors.DARK_GRAY,
    fontWeight: '500',
    textAlign: 'center',
  },
  siblingTabTextActive: {
    color: Colors.WINE,
    fontWeight: '600',
  },
  stickyFiltersWrapper: {
    backgroundColor: Colors.WHITE,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  filtersContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.LIGHT_GRAY,
    backgroundColor: Colors.WHITE,
  },
  filtersScroll: {
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: Spacing.PADDING_XS,
    gap: Spacing.MARGIN_XS,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: Spacing.PADDING_XS,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.WINE,
    marginRight: Spacing.MARGIN_XS,
  },
  filterChipText: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.BLACK,
    fontWeight: '500',
    marginRight: 3,
  },
  listHeader: {
    backgroundColor: 'transparent',
  },
  productsList: {
    paddingHorizontal: Spacing.PADDING_SM,
    paddingTop: 0,
    paddingBottom: Spacing.PADDING_MD,
  },
  productRow: {
    justifyContent: 'space-between',
    marginBottom: Spacing.MARGIN_XS,
  },
  productCard: {
    width: (width - Spacing.PADDING_SM * 2 - Spacing.MARGIN_XS) / 2,
    marginBottom: 0, // Row spacing handled by columnWrapperStyle
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: Typography.FONT_SIZE_MD,
    color: Colors.DARK_GRAY,
    marginTop: Spacing.MARGIN_SM,
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

