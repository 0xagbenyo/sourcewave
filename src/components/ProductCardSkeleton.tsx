import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';

const { width } = Dimensions.get('window');
const cardWidth = (width - Spacing.SCREEN_PADDING * 2 - Spacing.MARGIN_SM) / 2;

interface ProductCardSkeletonProps {
  variant?: 'tall' | 'medium' | 'short';
  style?: any;
}

export const ProductCardSkeleton: React.FC<ProductCardSkeletonProps> = ({
  variant = 'medium',
  style,
}) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmerAnimation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    );

    shimmerAnimation.start();

    return () => {
      shimmerAnimation.stop();
    };
  }, [shimmerAnim]);

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1, 0.3],
  });

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-cardWidth * 2, cardWidth * 2],
  });

  const getHeights = () => {
    switch (variant) {
      case 'tall':
        return cardWidth * 1.0;
      case 'short':
        return cardWidth * 0.9;
      default:
        return cardWidth * 0.95;
    }
  };

  const imageHeight = getHeights();

  return (
    <View style={[styles.container, style]}>
      {/* Image skeleton */}
      <View style={[styles.imageContainer, { height: imageHeight }]}>
        <Animated.View
          style={[
            styles.shimmer,
            {
              opacity: shimmerOpacity,
              transform: [{ translateX: shimmerTranslateX }],
            },
          ]}
        />
      </View>

      {/* Content skeleton */}
      <View style={styles.contentContainer}>
        {/* Brand/Company name */}
        <View style={styles.brandSkeleton}>
          <Animated.View
            style={[
              styles.shimmer,
              {
                opacity: shimmerOpacity,
                transform: [{ translateX: shimmerTranslateX }],
              },
            ]}
          />
        </View>

        {/* Product name */}
        <View style={styles.nameSkeleton}>
          <Animated.View
            style={[
              styles.shimmer,
              {
                opacity: shimmerOpacity,
                transform: [{ translateX: shimmerTranslateX }],
              },
            ]}
          />
        </View>
        <View style={[styles.nameSkeleton, styles.nameSkeletonShort]}>
          <Animated.View
            style={[
              styles.shimmer,
              {
                opacity: shimmerOpacity,
                transform: [{ translateX: shimmerTranslateX }],
              },
            ]}
          />
        </View>

        {/* Price skeleton */}
        <View style={styles.priceSkeleton}>
          <Animated.View
            style={[
              styles.shimmer,
              {
                opacity: shimmerOpacity,
                transform: [{ translateX: shimmerTranslateX }],
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: cardWidth,
    marginBottom: Spacing.MARGIN_MD,
    backgroundColor: Colors.WHITE,
    borderRadius: 8,
    overflow: 'hidden',
  },
  imageContainer: {
    width: '100%',
    backgroundColor: Colors.LIGHT_GRAY,
    overflow: 'hidden',
    position: 'relative',
  },
  contentContainer: {
    padding: Spacing.PADDING_SM,
  },
  brandSkeleton: {
    height: 12,
    width: '40%',
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  nameSkeleton: {
    height: 14,
    width: '90%',
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 4,
    marginBottom: 4,
    overflow: 'hidden',
  },
  nameSkeletonShort: {
    width: '60%',
  },
  priceSkeleton: {
    height: 16,
    width: '50%',
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 4,
    marginTop: 4,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    width: cardWidth * 2,
  },
});

