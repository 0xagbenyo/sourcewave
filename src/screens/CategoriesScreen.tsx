import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Dimensions,
  RefreshControl,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useCategories, usePricingRules, useWishlistActions, useWishlist } from '../hooks/erpnext';
import { useUserSession } from '../context/UserContext';
import { LoadingScreen } from '../components/LoadingScreen';
import { ProductCard } from '../components/ProductCard';
import { Header } from '../components/Header';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';
import { SortOption } from '../components/PriceFilter';
import { getProductDiscount } from '../utils/pricingRules';
import { getERPNextClient } from '../services/erpnext';
import { mapERPItemToProduct } from '../services/mappers';
import { collectDescendantItemGroupIds } from '../utils/itemGroup';

const { width } = Dimensions.get('window');

const isTopLevelParentGroup = (category: any): boolean => {
  const isGroup = Number(category?.isGroup ?? category?.is_group) === 1;
  const parent = String(category?.parentItemGroup ?? category?.parent_item_group ?? '').trim();
  return (
    isGroup &&
    (parent === '' || parent === 'All Item Groups' || parent === 'All Items Group')
  );
};

// Animated Category Item Component
const AnimatedCategoryItem: React.FC<{
  category: any;
  image: string | undefined;
  categoryName: string;
  index: number;
  onPress: () => void;
}> = ({ category, image, categoryName, index, onPress }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  
  useEffect(() => {
    // Staggered entrance animation with fade, slide, rotate, and scale
    const delay = index * 80;
    
    Animated.parallel([
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        delay: delay,
        useNativeDriver: true,
      }),
      // Slide up
      Animated.spring(slideAnim, {
        toValue: 0,
        delay: delay,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
      // Rotate with bounce
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 400,
          delay: delay,
          useNativeDriver: true,
        }),
        Animated.spring(rotateAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 3,
        }),
      ]),
      // Scale bounce
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.1,
          delay: delay,
          useNativeDriver: true,
          tension: 100,
          friction: 4,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 6,
        }),
      ]),
    ]).start();
  }, []);
  
  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '10deg'],
  });
  
  return (
    <Animated.View
      style={[
        styles.childCategoryItem,
        {
          opacity: fadeAnim,
          transform: [
            { translateY: slideAnim },
            { rotate: rotateInterpolate },
            { scale: scaleAnim },
          ],
        },
      ]}
    >
      <TouchableOpacity
        style={{ alignItems: 'center' }}
        onPress={onPress}
      >
        {image ? (
          <View style={styles.childCategoryCircle}>
            <ErpAuthenticatedImage
              uri={image}
              style={styles.childCategoryImage}
              resizeMode="cover"
              onError={() => {
                console.warn(`Failed to load image for category ${category.name}:`, image);
              }}
            />
          </View>
        ) : (
          <View style={styles.childCategoryCircle}>
            <Ionicons name="image" size={18} color={Colors.TEXT_SECONDARY} />
          </View>
        )}
        {categoryName ? (
          <Text style={styles.childCategoryName} numberOfLines={2}>
            {categoryName}
            </Text>
        ) : null}
          </TouchableOpacity>
    </Animated.View>
  );
};

export const CategoriesScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { user } = useUserSession();
  const { wishlistItems, refresh: refreshWishlist } = useWishlist(user?.email || null);
  const { toggleWishlist } = useWishlistActions(refreshWishlist);
  const { data: parentCategories, loading: categoriesLoading } = useCategories();
  const { data: pricingRules = [], loading: pricingRulesLoading } = usePricingRules();
  
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [childCategories, setChildCategories] = useState<any[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [childImages, setChildImages] = useState<Record<string, string>>({});
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const preselectedParent = route?.params?.selectedParent;

  const parentOnly = useMemo(
    () => parentCategories?.filter(isTopLevelParentGroup) || [],
    [parentCategories]
  );

  const selectedParentName = useMemo(() => {
    if (!selectedParentId) return '';
    const match = parentOnly.find((cat) => cat.id === selectedParentId);
    return match?.name || selectedParentId;
  }, [parentOnly, selectedParentId]);
  
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
  
  // Check if page is initially loading (fresh load - no data loaded yet)
  const isInitialLoading = (!parentCategories && categoriesLoading) && 
    (!pricingRules || pricingRules.length === 0);

  // Set first parent category when data loads
  useEffect(() => {
    if (parentOnly.length > 0 && !selectedParentId) {
      const firstParent = parentOnly[0];
      setSelectedParentId(firstParent.id);
      fetchChildCategories(firstParent.id, firstParent.name);
    }
  }, [parentOnly, selectedParentId]);

  // If Home passes a parent category, open this screen with that parent selected.
  useEffect(() => {
    if (parentOnly.length === 0 || !preselectedParent) return;
    const matchedParent = parentOnly.find(
      (cat) => cat.id === preselectedParent || cat.name === preselectedParent
    );
    if (matchedParent && matchedParent.id !== selectedParentId) {
      setSelectedParentId(matchedParent.id);
      fetchChildCategories(matchedParent.id, matchedParent.name);
    }
  }, [parentOnly, preselectedParent, selectedParentId]);

  const fetchChildCategories = async (parentId: string, parentName?: string) => {
    setLoadingChildren(true);
    try {
      const client = getERPNextClient();
      const response = await client.getItemGroups();

      const children = response.filter((group: any) => {
        const parent = String(group.parent_item_group || '').trim();
        return (
          (parent === parentId || (!!parentName && parent === parentName)) &&
          group.name !== 'All Items Group'
        );
      });
      setChildCategories(children);

      // Thumbnails: random Item.image from Items in this group tree (Item doctype, not Website Item)
      const images: Record<string, string> = {};
      const allCats = parentCategories || [];
      for (const child of children) {
        try {
          const groupIds = collectDescendantItemGroupIds(child.name, allCats);
          const items = await client.getRawItemsByGroups(groupIds, 200);
          const withImages = items.filter(
            (row: any) => row.image && String(row.image).trim() !== ''
          );
          if (withImages.length > 0) {
            const pick = withImages[Math.floor(Math.random() * withImages.length)];
            const product = mapERPItemToProduct(pick);
            if (product.images?.[0]) {
              images[child.name] = product.images[0];
              console.log(`✅ Item image for category ${child.name}: ${product.images[0]}`);
            }
          } else {
            const catRow = allCats.find((c: any) => c.id === child.name);
            if (catRow?.image) {
              const p = mapERPItemToProduct({
                name: child.name,
                item_name: child.name,
                disabled: 0,
                image: catRow.image,
              });
              if (p.images?.[0]) {
                images[child.name] = p.images[0];
                console.log(`✅ Item Group image fallback for ${child.name}`);
              }
            } else {
              console.log(`⚠️ No Item images for category ${child.name}`);
            }
          }
        } catch (error) {
          console.warn(`❌ Could not fetch Item image for category ${child.name}:`, error);
        }
      }
      setChildImages(images);
    } catch (error) {
      console.error('Error fetching child categories:', error);
      setChildCategories([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  const handleParentSelect = useCallback((parentId: string, parentName: string) => {
    setSelectedParentId(parentId);
    fetchChildCategories(parentId, parentName);
  }, []);
  
  // Handle pull-to-refresh - reload the entire page
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Refresh wishlist when user pulls to refresh
      if (refreshWishlist) refreshWishlist();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshWishlist]);


  const renderSidebar = () => (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <View style={styles.sidebarIndicator} />
        <Text style={styles.sidebarTitle}>Just for You</Text>
      </View>
      {categoriesLoading ? (
        <ActivityIndicator style={styles.sidebarLoader} color={Colors.SHEIN_PINK} />
      ) : (
        <ScrollView
          style={styles.sidebarScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sidebarScrollContent}
        >
          {parentOnly.length > 0 ? (
            parentOnly.map((category) => {
              const categoryName = category.name || category.id || '';
              if (!categoryName) return null;
              const isActive = selectedParentId === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
                  onPress={() => handleParentSelect(category.id, category.name)}
                >
                  <Text style={[styles.sidebarItemText, isActive && styles.sidebarItemTextActive]}>
                    {categoryName}
                  </Text>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No categories available</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );

  const renderProductGrid = (products: any[], title: string, showTrendsLogo = false) => (
    <View style={styles.productSection}>
      <View style={styles.sectionHeader}>
        {showTrendsLogo ? (
          <View style={styles.trendsLogoContainer}>
            <Text style={styles.trendsLogo}>SOURCEWAVE</Text>
            <Text style={styles.trendsSubtitle}>Trends</Text>
          </View>
        ) : (
          <Text style={styles.sectionTitle}>{title}</Text>
        )}
      </View>
      <FlatList
        data={products}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.productGridList}
        columnWrapperStyle={styles.productGridRow}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.SHEIN_PINK}
            colors={[Colors.SHEIN_PINK]}
          />
        }
        renderItem={({ item, index }) => {
          const discount = getProductDiscount(item, pricingRules);
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

          return (
            <ProductCard
              product={item}
              onPress={(productId) => {
                (navigation as any).navigate('ProductDetails', { productId });
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
        }}
        keyExtractor={(item) => item.id}
      />
    </View>
  );

  const renderChildCategoriesGrid = () => (
    <View style={styles.productSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Picks for You</Text>
      </View>
      {loadingChildren ? (
        <ActivityIndicator style={styles.childLoader} color={Colors.SHEIN_PINK} />
      ) : childCategories.length > 0 ? (
        <View style={styles.childCategoriesGridContainer}>
          {childCategories.map((item, index) => {
            const image = childImages[item.name];
            const categoryName = item.item_group_name || item.name || 'Category';

            return (
              <AnimatedCategoryItem
                key={item.name || item.item_group_name || `category-${index}`}
                category={item}
                image={image}
                categoryName={categoryName}
                index={index}
                  onPress={() => {
                    (navigation as any).navigate('SourcingRequest', {
                      parentCategoryId: selectedParentId || '',
                      parentCategory: selectedParentName || '',
                      subCategoryId: item.name || '',
                      subCategory: item.item_group_name || item.name || '',
                    });
                  }}
              />
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {selectedParentId ? 'No subcategories for this group' : 'Select a category on the left'}
          </Text>
        </View>
      )}
    </View>
  );

  // Show loading screen on initial load
  if (isInitialLoading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header />
      <View style={styles.content}>
        {renderSidebar()}
        <ScrollView
          style={styles.mainContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.SHEIN_PINK}
              colors={[Colors.SHEIN_PINK]}
            />
          }
        >
          {renderChildCategoriesGrid()}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: width * 0.32,
    borderRightWidth: 1,
    borderRightColor: Colors.BORDER,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarScrollContent: {
    paddingBottom: 24,
  },
  sidebarLoader: {
    marginTop: 24,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  sidebarIndicator: {
    width: 4,
    height: 20,
    backgroundColor: Colors.BLACK,
    marginRight: 12,
    borderRadius: 2,
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  sidebarItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  sidebarItemActive: {
    backgroundColor: Colors.WHITE,
  },
  sidebarItemText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  sidebarItemTextActive: {
    color: Colors.BLACK,
    fontWeight: '500',
  },
  mainContent: {
    flex: 1,
    backgroundColor: Colors.WHITE,
  },
  productSection: {
    paddingVertical: 16,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  trendsLogoContainer: {
    alignItems: 'center',
  },
  trendsLogo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.SHEIN_PINK,
  },
  trendsSubtitle: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    marginTop: -4,
  },
  productGridList: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: Spacing.PADDING_MD,
    paddingBottom: Spacing.PADDING_XL,
  },
  productGridRow: {
    justifyContent: 'space-between',
    marginBottom: Spacing.MARGIN_SM,
  },
  productCard: {
    width: (width * 0.65 - Spacing.SCREEN_PADDING * 2 - Spacing.MARGIN_SM) / 2,
    marginBottom: 0, // Row spacing handled by columnWrapperStyle
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  productEmoji: {
    fontSize: 24,
  },
  viewAllOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productName: {
    fontSize: 12,
    color: Colors.BLACK,
    textAlign: 'center',
    marginBottom: 4,
    lineHeight: 16,
  },
  productPrice: {
    fontSize: 12,
    color: Colors.SHEIN_PINK,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  childLoader: {
    marginVertical: 32,
  },
  childCategoriesGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    justifyContent: 'flex-start',
  },
  childCategoryItem: {
    alignItems: 'center',
    marginBottom: 16,
    width: (width * 0.68 - 16) / 4,
    paddingHorizontal: 4,
  },
  childCategoryCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.WINE_LIGHT,
  },
  childCategoryImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.LIGHT_GRAY,
  },
  childCategoryEmoji: {
    fontSize: 28,
  },
  childCategoryName: {
    fontSize: 9,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  backButtonText: {
    fontSize: 16,
    color: Colors.SHEIN_PINK,
    fontWeight: '600',
    marginLeft: 4,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  filterContainer: {
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_SM,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
});

