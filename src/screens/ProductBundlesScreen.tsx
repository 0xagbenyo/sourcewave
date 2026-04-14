import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { RootStackParamList } from '../types';
import type { NavigationProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { useProductBundles, useWishlistActions, useWishlist, useCartActions } from '../hooks/erpnext';
import { useUserSession } from '../context/UserContext';
import { LoadingScreen } from '../components/LoadingScreen';
import { ProductCardSkeletonList } from '../components/ProductCardSkeletonList';
import { ProductBundleCard } from '../components/ProductBundleCard';

const { width } = Dimensions.get('window');

export const ProductBundlesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useUserSession();
  const { wishlistItems, refresh: refreshWishlist } = useWishlist(user?.email || null);
  const { toggleWishlist } = useWishlistActions(refreshWishlist);
  const { addToCart: addItemToCart } = useCartActions();
  const { data: productBundles, loading: bundlesLoading, error: bundlesError } = useProductBundles(100);
  
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Handle pull-to-refresh - just refresh data without navigation
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Refresh the bundle data by calling the hook's refresh or re-fetching
      // The hook will handle fetching the latest data
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate refresh delay
      refreshWishlist(); // Also refresh wishlist while we're at it
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshWishlist]);
  
  // Check if page is initially loading
  const isInitialLoading = bundlesLoading && (!productBundles || productBundles.length === 0);

  // Filter bundles based on search query
  const filteredBundles = useMemo(() => {
    if (!productBundles) return [];
    if (!searchQuery.trim()) return productBundles;
    
    const query = searchQuery.toLowerCase();
    return productBundles.filter(bundle =>
      bundle.bundleName.toLowerCase().includes(query) ||
      bundle.newItemCode.toLowerCase().includes(query)
    );
  }, [productBundles, searchQuery]);

  const renderHeader = () => (
    <LinearGradient
      colors={[Colors.ROYAL_BLUE, Colors.ELECTRIC_BLUE]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.headerGradient}
    >
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Product Bundles</Text>
            <Text style={styles.headerSubtitle}>Curated collections</Text>
          </View>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('CreateBundle' as any)}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']}
              style={styles.createButtonGradient}
            >
              <Ionicons name="add" size={24} color={Colors.WHITE} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.TEXT_SECONDARY} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search bundles..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={Colors.TEXT_SECONDARY}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close" size={18} color={Colors.TEXT_SECONDARY} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </LinearGradient>
  );

  const renderBundleItem = useCallback(({ item, index }: { item: any; index: number }) => {
    const totalAmount = item.items?.reduce((sum: number, itemObj: any) => sum + (itemObj.qty || 1), 0) || 0;
    
    return (
      <View style={styles.bundleItemContainer}>
        <ProductBundleCard
          bundleName={item.bundleName}
          newItemCode={item.newItemCode}
          customCustomer={item.customCustomer}
          items={item.items}
          totalAmount={totalAmount}
        />
      </View>
    );
  }, []);

  if (isInitialLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ProductCardSkeletonList count={6} numColumns={2} />
      </SafeAreaView>
    );
  }

  if (bundlesError) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        {renderHeader()}
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.ERROR} />
          <Text style={styles.errorText}>Failed to load bundles</Text>
          <Text style={styles.errorSubtext}>{bundlesError.message || 'Please try again later'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!productBundles || productBundles.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={64} color={Colors.TEXT_SECONDARY} />
          <Text style={styles.emptyText}>No bundles available</Text>
          <Text style={styles.emptySubtext}>Check back later for new product bundles</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {renderHeader()}
      <FlatList
        data={filteredBundles}
        renderItem={renderBundleItem}
        keyExtractor={(item, index) => `bundle-${index}-${item.bundleName}`}
        contentContainerStyle={styles.listContent}
        numColumns={1}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.WINE}
            colors={[Colors.WINE]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={64} color={Colors.TEXT_SECONDARY} />
            <Text style={styles.emptyText}>No bundles available</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F7F6',
  },
  headerGradient: {
    paddingBottom: Spacing.PADDING_MD,
  },
  headerContainer: {
    paddingTop: Spacing.PADDING_SM,
    paddingHorizontal: Spacing.PADDING_MD,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.PADDING_SM,
    marginBottom: Spacing.PADDING_MD,
  },
  backButton: {
    padding: Spacing.PADDING_XS,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WHITE,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
    fontWeight: '500',
  },
  createButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    overflow: 'hidden',
  },
  createButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    paddingHorizontal: Spacing.PADDING_SM,
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: Spacing.PADDING_SM,
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_PRIMARY,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: Spacing.PADDING_MD,
  },
  bundleItemContainer: {
    marginBottom: Spacing.MARGIN_MD,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.PADDING_XL,
  },
  emptyText: {
    marginTop: Spacing.MARGIN_MD,
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
  },
  emptySubtext: {
    marginTop: Spacing.MARGIN_SM,
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
});


