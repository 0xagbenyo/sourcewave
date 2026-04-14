import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { ProductCardSkeleton } from './ProductCardSkeleton';
import { Spacing } from '../constants/spacing';

const { width } = Dimensions.get('window');

interface ProductCardSkeletonListProps {
  count?: number;
  numColumns?: number;
}

export const ProductCardSkeletonList: React.FC<ProductCardSkeletonListProps> = ({
  count = 6,
  numColumns = 2,
}) => {
  const variants: Array<'tall' | 'medium' | 'short'> = ['tall', 'medium', 'short', 'tall', 'medium', 'short'];
  
  const cardWidth = (width - Spacing.SCREEN_PADDING * 2 - Spacing.MARGIN_SM) / numColumns;
  
  const skeletons = Array.from({ length: count }, (_, index) => {
    const variant = variants[index % variants.length];
    return (
      <ProductCardSkeleton
        key={`skeleton-${index}`}
        variant={variant}
        style={[styles.skeletonCard, { width: cardWidth }]}
      />
    );
  });

  return (
    <View style={styles.container}>
      <View style={[styles.grid, { justifyContent: 'space-between' }]}>
        {skeletons}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: Spacing.PADDING_MD,
    paddingBottom: Spacing.PADDING_XL,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  skeletonCard: {
    marginBottom: Spacing.MARGIN_SM,
  },
});

