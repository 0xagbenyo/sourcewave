import React from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
} from 'react-native';
import { ProductBundleCard } from './ProductBundleCard';
import { Spacing } from '../constants/spacing';

const { width } = Dimensions.get('window');

interface BundleItem {
  itemCode: string;
  itemName?: string;
  image?: string | null;
}

interface ProductBundleCarouselProps {
  bundles: Array<{
    bundleName: string;
    newItemCode: string;
    customCustomer?: string;
    items: BundleItem[];
  }>;
}

export const ProductBundleCarousel: React.FC<ProductBundleCarouselProps> = ({
  bundles,
}) => {
  if (!bundles || bundles.length === 0) {
    return null;
  }

  // Limit to first 10 bundles
  const displayBundles = bundles.slice(0, 10);

  const renderBundle = ({ item, index }: { item: typeof bundles[0]; index: number }) => {
    return (
      <ProductBundleCard
        bundleName={item.bundleName}
        newItemCode={item.newItemCode}
        customCustomer={item.customCustomer}
        items={item.items}
      />
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={displayBundles}
        renderItem={renderBundle}
        keyExtractor={(item, index) => `bundle-${index}-${item.bundleName}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        snapToInterval={width * 0.95 + Spacing.MARGIN_MD}
        decelerationRate="fast"
        snapToAlignment="start"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.MARGIN_SM,
    marginLeft: Spacing.MARGIN_MD,
    minWidth: width * 0.8,
    overflow: 'visible',
  },
  listContent: {
    paddingLeft: Spacing.SCREEN_PADDING,
    paddingRight: Spacing.SCREEN_PADDING,
    paddingVertical: Spacing.PADDING_XS,
  },
});

