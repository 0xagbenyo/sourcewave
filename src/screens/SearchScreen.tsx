import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, CommonActions } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { useSearchProducts } from '../hooks/erpnext';
import { ProductCard } from '../components/ProductCard';
import { ProductCardSkeletonList } from '../components/ProductCardSkeletonList';
import { useNavigation } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { PriceFilter, SortOption } from '../components/PriceFilter';

export const SearchScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const routeQuery = (route.params as any)?.query || '';
  const [searchQuery, setSearchQuery] = useState(routeQuery);
  const [refreshing, setRefreshing] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('default');
  
  // Update search query when route params change (when navigating from Header)
  useEffect(() => {
    const currentQuery = (route.params as any)?.query || '';
    if (currentQuery !== searchQuery) {
      setSearchQuery(currentQuery);
    }
  }, [route.params]);

  // Perform search using the hook - this will automatically filter as searchQuery changes
  const { data: searchResults, loading, error } = useSearchProducts(searchQuery);
  
  // Sort search results
  const sortedResults = React.useMemo(() => {
    if (!searchResults || searchResults.length === 0) return [];

    const sorted = [...searchResults];
    switch (sortOption) {
      case 'lowToHigh':
        return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
      case 'highToLow':
        return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
      default:
        return sorted;
    }
  }, [searchResults, sortOption]);
  
  // Handle pull-to-refresh - reload the entire page
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
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
  }, [navigation]);

  const renderSearchResults = () => {
    if (loading) {
      return <ProductCardSkeletonList count={6} numColumns={2} />;
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.ERROR} />
          <Text style={styles.errorText}>Error searching products</Text>
          <Text style={styles.errorSubtext}>{error.message}</Text>
        </View>
      );
    }

    if (!searchQuery.trim()) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={64} color={Colors.TEXT_SECONDARY} />
          <Text style={styles.emptyText}>Enter a search term</Text>
          <Text style={styles.emptySubtext}>Search for products by name, code, or category</Text>
    </View>
  );
    }

    if (!searchResults || searchResults.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={64} color={Colors.TEXT_SECONDARY} />
          <Text style={styles.emptyText}>No results found</Text>
          <Text style={styles.emptySubtext}>Try a different search term</Text>
    </View>
  );
    }

    return (
      <>
        <View style={styles.filterContainer}>
          <PriceFilter onSortChange={setSortOption} currentSort={sortOption} />
      </View>
      <FlatList
          data={sortedResults}
        numColumns={2}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.resultsList}
        columnWrapperStyle={styles.resultsRow}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            variant={['tall', 'medium', 'short'][Math.floor(Math.random() * 3)] as any}
            onPress={() => (navigation as any).navigate('ProductDetails', { productId: item.id })}
            style={styles.productCard}
          />
        )}
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
  );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header 
        searchValue={searchQuery}
        onSearchChange={(text) => {
          setSearchQuery(text);
          // Update route params to keep navigation in sync
          (navigation as any).setParams({ query: text });
        }}
        showBackButton={true}
        onBackPress={() => {
          (navigation as any).goBack();
        }}
        headerBackgroundColor={Colors.WHITE}
      />
      {renderSearchResults()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.TEXT_SECONDARY,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.ERROR,
  },
  errorSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.TEXT_PRIMARY,
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  resultsList: {
    padding: Spacing.PADDING_MD,
  },
  resultsRow: {
    justifyContent: 'space-between',
    marginBottom: Spacing.MARGIN_SM,
  },
  productCard: {
    flex: 1,
    maxWidth: '48%',
  },
  filterContainer: {
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_SM,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
});

