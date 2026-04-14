import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useWishlist, useWishlistActions } from '../hooks/erpnext';
import { ProductCard } from '../components/ProductCard';
import { ProductCardSkeletonList } from '../components/ProductCardSkeletonList';
import { PriceFilter, SortOption } from '../components/PriceFilter';
import { useNavigation, useFocusEffect, CommonActions } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { WishlistItem } from '../types';
import { useUserSession } from '../context/UserContext';

const { width } = Dimensions.get('window');

export const WishlistScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortOption, setSortOption] = useState<SortOption>('default');
  
  // Get user email from session
  const { user } = useUserSession();
  const userEmail = user?.email || null;
  
  // Fetch wishlist from ERPNext
  const { wishlistItems, loading, error, refresh } = useWishlist(userEmail);
  const { removeFromWishlist } = useWishlistActions(refresh);
  
  // Sort wishlist items by price
  const sortedWishlistItems = React.useMemo(() => {
    if (!wishlistItems || wishlistItems.length === 0) return [];
    
    const sorted = [...wishlistItems];
    switch (sortOption) {
      case 'lowToHigh':
        return sorted.sort((a, b) => {
          const priceA = a.product?.price || 0;
          const priceB = b.product?.price || 0;
          return priceA - priceB;
        });
      case 'highToLow':
        return sorted.sort((a, b) => {
          const priceA = a.product?.price || 0;
          const priceB = b.product?.price || 0;
          return priceB - priceA;
        });
      default:
        return sorted;
    }
  }, [wishlistItems, sortOption]);
  
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  
  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (error) {
      console.error('Error refreshing wishlist:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  
  // Refresh wishlist when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (userEmail) {
        console.log('WishlistScreen focused, refreshing wishlist for:', userEmail);
        refresh();
      }
    }, [userEmail, refresh])
  );
  
  // Handle delete selected items
  const handleDeleteSelected = async () => {
    if (selectedItems.length === 0) return;
    
    try {
      // Remove each selected item from wishlist
      for (const itemId of selectedItems) {
        const wishlistItem = wishlistItems.find(item => item.id === itemId);
        if (wishlistItem) {
          await removeFromWishlist(wishlistItem.productId);
        }
      }
      // Clear selection after deletion
      setSelectedItems([]);
    } catch (error) {
      console.error('Error deleting items from wishlist:', error);
      alert('Failed to delete items. Please try again.');
    }
  };
  
  // Handle remove single item
  const handleRemoveItem = async (productId: string) => {
    try {
      await removeFromWishlist(productId);
    } catch (error) {
      console.error('Error removing item from wishlist:', error);
      alert('Failed to remove item. Please try again.');
    }
  };
  
  // Debug logging
  useEffect(() => {
    console.log('WishlistScreen - User:', userEmail);
    console.log('WishlistScreen - Loading:', loading);
    console.log('WishlistScreen - Error:', error);
    console.log('WishlistScreen - Items count:', wishlistItems.length);
    console.log('WishlistScreen - Items:', wishlistItems);
  }, [userEmail, loading, error, wishlistItems]);

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
          <Text style={styles.headerTitle}>Wishlist</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.viewModeButton}
            onPress={() => (navigation as any).navigate('CreateBundle')}
          >
            <Ionicons 
              name="layers" 
              size={20} 
              color={Colors.BLACK} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={() => navigation.navigate('Search' as never)}
          >
            <Ionicons name="search" size={16} color={Colors.BLACK} />
          </TouchableOpacity>
        </View>
      </View>
      
      {selectedItems.length > 0 && (
        <View style={styles.selectionBar}>
          <View style={styles.selectionInfo}>
            <Text style={styles.selectionText}>
              {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
            </Text>
          </View>
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.selectionButton}>
              <Text style={styles.selectionButtonText}>Move to Cart</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.selectionButton, styles.deleteButton]}
              onPress={handleDeleteSelected}
            >
              <Text style={[styles.selectionButtonText, styles.deleteButtonText]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const renderWishlistItem = ({ item, index }: { item: WishlistItem; index: number }) => {
    if (!item.product) {
      return null; // Skip items without product data
    }

    const isSelected = selectedItems.includes(item.id);
    const variants: ('tall' | 'medium' | 'short')[] = ['tall', 'medium', 'short'];
    const variant = variants[index % 3] as 'tall' | 'medium' | 'short';
    
    return (
      <View style={styles.wishlistItemWrapper}>
        <TouchableOpacity 
          style={styles.selectButton}
          onPress={() => {
            if (isSelected) {
              setSelectedItems(selectedItems.filter(id => id !== item.id));
            } else {
              setSelectedItems([...selectedItems, item.id]);
            }
          }}
        >
          <Ionicons 
            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} 
            size={18} 
            color={isSelected ? Colors.SHEIN_PINK : Colors.TEXT_SECONDARY} 
          />
        </TouchableOpacity>
        <ProductCard
          product={item.product}
          variant={variant}
          onPress={() => {
            (navigation as any).navigate('ProductDetails', { productId: item.productId });
          }}
          onWishlistPress={() => {
            // Remove item from wishlist when heart is clicked
            handleRemoveItem(item.productId);
          }}
          isWishlisted={true}
        />
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-outline" size={48} color={Colors.LIGHT_GRAY} />
      <Text style={styles.emptyText}>Your wishlist is empty</Text>
      <Text style={styles.emptySubtext}>Start adding items you love!</Text>
    </View>
  );

  const renderLoadingState = () => (
    <ProductCardSkeletonList count={6} numColumns={2} />
  );

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

  const renderErrorState = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="alert-circle-outline" size={48} color={Colors.ERROR} />
      <Text style={styles.errorText}>Failed to load wishlist</Text>
      <TouchableOpacity style={styles.retryButton} onPress={handleFullReload}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={[styles.headerContainer, { marginTop: -insets.top }]}>
        {renderHeader()}
      </View>
      {loading && renderLoadingState()}
      {error && !loading && renderErrorState()}
      {!loading && !error && wishlistItems.length === 0 && renderEmptyState()}
      {!loading && !error && wishlistItems.length > 0 && (
        <>
          <View style={styles.filterContainer}>
            <PriceFilter onSortChange={setSortOption} currentSort={sortOption} />
          </View>
          <FlatList
            data={sortedWishlistItems}
          renderItem={renderWishlistItem}
          keyExtractor={(item) => item.id}
          numColumns={viewMode === 'grid' ? 2 : 1}
          contentContainerStyle={styles.wishlistContainer}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={viewMode === 'grid' ? styles.row : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.SHEIN_PINK}
              colors={[Colors.SHEIN_PINK]}
            />
          }
        />
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 0,
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  headerContainer: {
    backgroundColor: Colors.BACKGROUND,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingTop: 100,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    padding: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewModeButton: {
    padding: 2,
  },
  searchButton: {
    padding: 2,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  selectionInfo: {
    flex: 1,
  },
  selectionText: {
    fontSize: 12,
    color: Colors.BLACK,
    fontWeight: '500',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 6,
  },
  selectionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.SHEIN_PINK,
  },
  deleteButton: {
    borderColor: Colors.ERROR,
  },
  selectionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.SHEIN_PINK,
  },
  deleteButtonText: {
    color: Colors.ERROR,
  },
  wishlistContainer: {
    padding: 12,
  },
  wishlistItemWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  row: {
    justifyContent: 'space-between',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginTop: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  errorText: {
    fontSize: 14,
    color: Colors.ERROR,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.SHEIN_PINK,
    borderRadius: 6,
  },
  retryButtonText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  wishlistItem: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: (width - 48) / 2,
    marginHorizontal: 4,
  },
  listItem: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectButton: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 1,
  },
  itemImage: {
    width: '100%',
    height: 150,
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  listItemImage: {
    width: 80,
    height: 80,
    marginBottom: 0,
    marginRight: 12,
  },
  itemEmoji: {
    fontSize: 40,
  },
  discountTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.FLASH_SALE_RED,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountText: {
    fontSize: 12,
    color: Colors.WHITE,
    fontWeight: 'bold',
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  outOfStockText: {
    color: Colors.WHITE,
    fontSize: 12,
    fontWeight: 'bold',
  },
  itemInfo: {
    flex: 1,
  },
  brandName: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 4,
  },
  itemName: {
    fontSize: 14,
    color: Colors.BLACK,
    fontWeight: '500',
    marginBottom: 8,
    lineHeight: 18,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginRight: 8,
  },
  originalPrice: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  colorSwatches: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  colorSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  sizeContainer: {
    marginBottom: 12,
  },
  sizeLabel: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 4,
  },
  sizeOptions: {
    flexDirection: 'row',
    gap: 4,
  },
  sizeOption: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 4,
  },
  sizeText: {
    fontSize: 12,
    color: Colors.BLACK,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.SHEIN_PINK,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: Colors.LIGHT_GRAY,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.WHITE,
  },
  disabledText: {
    color: Colors.TEXT_SECONDARY,
  },
  removeButton: {
    padding: 8,
  },
  filterContainer: {
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_SM,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
});

