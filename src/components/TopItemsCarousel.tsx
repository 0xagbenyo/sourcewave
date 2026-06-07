import React from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { getERPNextClient } from '../services/erpnext';
import { mapERPItemToProduct } from '../services/mappers';
import { encodeErpFileUrl } from '../utils/erpImageUrl';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';

const { width } = Dimensions.get('window');
const ITEM_SIZE = 60; // Fixed size for circular/square images
const ITEM_SPACING = Spacing.MARGIN_SM;

interface TopItem {
  rank?: number;
  item_name: string;
  total_qty: number;
  image: string | null;
}

interface TopItemsCarouselProps {
  items: TopItem[];
  onItemPress?: (item: TopItem) => void;
}

export const TopItemsCarousel: React.FC<TopItemsCarouselProps> = ({
  items,
  onItemPress,
}) => {
  const navigation = useNavigation<any>();
  if (!items || items.length === 0) {
    return null;
  }

  // Limit to first 20 items
  const displayItems = items.slice(0, 20);

  const getImageUrl = (imagePath: string | null): string | null => {
    if (!imagePath) return null;
    const u = encodeErpFileUrl(imagePath);
    return u || null;
  };

  const handleItemPress = async (item: TopItem) => {
    if (onItemPress) {
      onItemPress(item);
      return;
    }

    try {
      // Search for the product by item_name
      const client = getERPNextClient();
      const websiteItems = await client.searchItems(item.item_name);
      
      if (websiteItems && websiteItems.length > 0) {
        // Find exact match by item_name
        const exactMatch = websiteItems.find(
          (wi: any) =>
            wi.item_name === item.item_name ||
            wi.name === item.item_name ||
            wi.item_code === item.item_name
        );
        
        const productItem = exactMatch || websiteItems[0];
        const product = mapERPItemToProduct(productItem);
        
        // Navigate to product details
        navigation.navigate('ProductDetails', { productId: product.id });
      } else {
        console.warn('Product not found for item:', item.item_name);
      }
    } catch (error) {
      console.error('Error searching for product:', error);
    }
  };

  const renderItem = ({ item, index }: { item: TopItem; index: number }) => {
    const imageUrl = getImageUrl(item.image);
    
    return (
      <TouchableOpacity
        style={[
          styles.itemContainer,
          index === 0 && styles.firstItem,
          index === displayItems.length - 1 && styles.lastItem,
        ]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        {imageUrl ? (
          <ErpAuthenticatedImage uri={imageUrl} style={styles.itemImage} resizeMode="contain" />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="image-outline" size={24} color={Colors.TEXT_SECONDARY} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={displayItems}
        renderItem={renderItem}
        keyExtractor={(item, index) => `top-item-${index}-${item.item_name}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        snapToInterval={ITEM_SIZE + ITEM_SPACING}
        decelerationRate="fast"
        snapToAlignment="start"
        style={styles.flatList}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.MARGIN_SM,
    width: '100%',
    overflow: 'visible',
  },
  flatList: {
    overflow: 'visible',
  },
  listContent: {
    paddingLeft: Spacing.SCREEN_PADDING,
    paddingRight: Spacing.SCREEN_PADDING,
    alignItems: 'center',
    paddingVertical: Spacing.PADDING_XS,
  },
  itemContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    marginRight: ITEM_SPACING,
    borderRadius: Spacing.BORDER_RADIUS_MD,
    overflow: 'hidden',
    backgroundColor: Colors.LIGHT_GRAY,
    ...Spacing.SHADOW_SM,
  },
  firstItem: {
    marginLeft: 0,
  },
  lastItem: {
    marginRight: 0,
  },
  itemImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.LIGHT_GRAY,
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.LIGHT_GRAY,
  },
});

