import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useRoute, useNavigation, CommonActions } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { ProductCard } from '../components/ProductCard';
import { PriceFilter, SortOption } from '../components/PriceFilter';
import { Product } from '../types';

const { width } = Dimensions.get('window');

interface RouteParams {
  deals: Product[];
}

export const AllDealsScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const routeParams = (route.params as RouteParams) || {};
  const deals = Array.isArray(routeParams.deals) ? routeParams.deals : [];
  const [refreshing, setRefreshing] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('default');
  
  // Handle pull-to-refresh - reload the entire page
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Just refresh the data without navigation
      // The page will reload deals automatically via the hook
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for UX
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Sort deals by price or discount, randomize when not sorting
  const sortedDeals = useMemo(() => {
    if (!Array.isArray(deals) || deals.length === 0) {
      return [];
    }
    const sorted = [...deals];
    
    // Randomize when not sorting
    if (sortOption === 'default') {
      const shuffled = [...sorted];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    
    switch (sortOption) {
      case 'lowToHigh':
        return sorted.sort((a: any, b: any) => (a.price || 0) - (b.price || 0));
      case 'highToLow':
        return sorted.sort((a: any, b: any) => (b.price || 0) - (a.price || 0));
      default:
        // Default: sort by discount percentage (highest first)
        return sorted.sort((a: any, b: any) => (b.discount || 0) - (a.discount || 0));
    }
  }, [deals, sortOption]);

  const handleBack = () => {
    navigation.goBack();
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={20} color="#acc5e1" />
      </TouchableOpacity>
      <Text style={styles.title}>Super Deals</Text>
      <View style={styles.backButton} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {renderHeader()}
      <View style={styles.filterContainer}>
        <PriceFilter onSortChange={setSortOption} currentSort={sortOption} />
      </View>
      {!Array.isArray(sortedDeals) || sortedDeals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetag-outline" size={48} color="#acc5e1" />
          <Text style={styles.emptyText}>No deals available</Text>
        </View>
      ) : (
        <FlatList
          data={sortedDeals}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.gridContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#acc5e1"
              colors={["#acc5e1"]}
            />
          }
          renderItem={({ item, index }) => {
            if (!item || !item.id) {
              return null;
            }
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
                onWishlistPress={(productId) => {
                  console.log('Toggle wishlist for:', productId);
                }}
                style={styles.productCard}
                variant={variant}
                pricingDiscount={(item as any).discount}
              />
            );
          }}
          keyExtractor={(item, index) => item?.id || `deal-${index}`}
        />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.FLASH_SALE_RED, // Burgundy border
    backgroundColor: Colors.WHITE,
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
    color: Colors.FLASH_SALE_RED, // Burgundy
    flex: 1,
    textAlign: 'center',
  },
  filterContainer: {
    paddingHorizontal: 12,
    paddingVertical: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.FLASH_SALE_RED, // Burgundy border
  },
  gridContainer: {
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: Spacing.PADDING_MD,
    gap: Spacing.MARGIN_SM,
  },
  productCard: {
    width: '48%',
    marginBottom: Spacing.MARGIN_SM,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: Typography.FONT_SIZE_MD,
    color: Colors.FLASH_SALE_RED,
    marginTop: Spacing.MARGIN_MD,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
  },
});

