import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import { useCategories } from '../hooks/erpnext';
import { LoadingScreen } from '../components/LoadingScreen';
import { Header } from '../components/Header';
import { useTranslation } from 'react-i18next';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';
import { getERPNextClient } from '../services/erpnext';
import { encodeErpFileUrl } from '../utils/erpImageUrl';
import {
  isDisabledItemGroupRow,
  isItemGroupTopLevelParentRow,
  isReservedItemGroupRow,
} from '../utils/itemGroup';

const { width } = Dimensions.get('window');
const SIDEBAR_WIDTH = width * 0.32;
const MAIN_COLUMN_WIDTH = width - SIDEBAR_WIDTH;
const GRID_COLUMNS = 2;
const GRID_GAP = 10;
const GRID_PAD = 12;
const TILE_WIDTH =
  (MAIN_COLUMN_WIDTH - GRID_PAD * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
const TILE_IMAGE_HEIGHT = Math.round(TILE_WIDTH * 0.92);

const AnimatedCategoryGridItem: React.FC<{
  category: any;
  image: string | undefined;
  categoryName: string;
  index: number;
  onPress: () => void;
}> = ({ category, image, categoryName, index, onPress }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const delay = index * 40;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        delay,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, index]);

  return (
    <Animated.View
      style={[
        styles.gridTile,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity style={styles.gridTileTouchable} onPress={onPress} activeOpacity={0.88}>
        <View style={styles.gridImageWrap}>
          {image ? (
            <ErpAuthenticatedImage
              uri={image}
              style={styles.gridImage}
              resizeMode="cover"
              onError={() => {
                console.warn(`Failed to load image for category ${category.name}:`, image);
              }}
            />
          ) : (
            <View style={styles.gridPlaceholder}>
              <Ionicons name="image-outline" size={28} color={Colors.TEXT_SECONDARY} />
            </View>
          )}
        </View>
        <Text style={styles.gridTitle} numberOfLines={2}>
          {categoryName || 'Category'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const CategoriesScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const route = useRoute<any>();
  const { data: parentCategories, loading: categoriesLoading } = useCategories();
  
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [childCategories, setChildCategories] = useState<any[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [childImages, setChildImages] = useState<Record<string, string>>({});
  const preselectedParent = route?.params?.selectedParent;

  const parentOnly = useMemo(() => {
    const all = parentCategories || [];
    return all.filter((category) =>
      isItemGroupTopLevelParentRow(
        {
          name: category.id,
          item_group_name: category.name,
          is_group: category.isGroup,
          parent_item_group: category.parentId,
        },
        all.map((cat) => ({
          name: cat.id,
          parent_item_group: cat.parentId,
        }))
      )
    );
  }, [parentCategories]);

  const selectedParentName = useMemo(() => {
    if (!selectedParentId) return '';
    const match = parentOnly.find((cat) => cat.id === selectedParentId);
    return match?.name || selectedParentId;
  }, [parentOnly, selectedParentId]);
  
  // Check if page is initially loading (fresh load - no data loaded yet)
  const isInitialLoading = !parentCategories && categoriesLoading;

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
        if (isReservedItemGroupRow(group) || isDisabledItemGroupRow(group)) return false;
        const parent = String(group.parent_item_group || '').trim();
        return parent === parentId || (!!parentName && parent === parentName);
      });
      setChildCategories(children);

      const allCats = parentCategories || [];
      const images: Record<string, string> = {};
      for (const child of children) {
        const fromGroup = encodeErpFileUrl(child.image);
        if (fromGroup) {
          images[child.name] = fromGroup;
          continue;
        }
        const catRow = allCats.find((c) => c.id === child.name);
        const fromCatalog = encodeErpFileUrl(catRow?.image);
        if (fromCatalog) {
          images[child.name] = fromCatalog;
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
      // Pull-to-refresh: parent categories reload via useCategories if wired; no-op for now.
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);


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

  const renderChildCategoriesGrid = () => (
    <View style={[styles.productSection, styles.productSectionFlush]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Picks for You</Text>
      </View>
      {loadingChildren ? (
        <ActivityIndicator style={styles.childLoader} color={Colors.SHEIN_PINK} />
      ) : childCategories.length > 0 ? (
        <View style={styles.childCategoriesList}>
          {childCategories.map((item, index) => {
            const image = childImages[item.name];
            const categoryName = item.item_group_name || item.name || 'Category';

            return (
              <AnimatedCategoryGridItem
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
      <Header title={t('tabs.category')} />
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
  /** Picks for You: photo grid in the main column beside the sidebar. */
  productSectionFlush: {
    paddingVertical: 0,
    marginTop: 4,
    marginBottom: 12,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 12,
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
  childCategoriesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PAD,
    paddingBottom: GRID_PAD,
    gap: GRID_GAP,
  },
  gridTile: {
    width: TILE_WIDTH,
  },
  gridTileTouchable: {
    width: '100%',
  },
  gridImageWrap: {
    width: '100%',
    height: TILE_IMAGE_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.LIGHT_GRAY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.LIGHT_GRAY,
  },
  gridPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridTitle: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.BLACK,
    textAlign: 'center',
    lineHeight: 16,
    minHeight: 32,
    letterSpacing: -0.1,
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

