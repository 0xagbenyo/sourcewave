import React from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { ProductCardSkeleton } from './ProductCardSkeleton';
import { Spacing } from '../constants/spacing';

const { width } = Dimensions.get('window');
const cardWidth = (width - Spacing.SCREEN_PADDING * 2) * 0.45; // Slightly smaller for horizontal scroll

interface ProductCardSkeletonHorizontalProps {
  count?: number;
}

export const ProductCardSkeletonHorizontal: React.FC<ProductCardSkeletonHorizontalProps> = ({
  count = 6,
}) => {
  const variants: Array<'tall' | 'medium' | 'short'> = ['tall', 'medium', 'short', 'tall', 'medium', 'short'];
  
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {skeletons}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: Spacing.PADDING_MD,
  },
  skeletonCard: {
    marginRight: Spacing.MARGIN_SM,
  },
});

