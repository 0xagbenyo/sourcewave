import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Dimensions, View, Text, Easing } from 'react-native';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';
import { Colors } from '../constants/colors';

const { width, height } = Dimensions.get('window');

interface CartAnimationProps {
  visible: boolean;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  productImage?: string;
  onComplete: () => void;
}

export const CartAnimation: React.FC<CartAnimationProps> = ({
  visible,
  startPosition,
  endPosition,
  productImage,
  onComplete,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (__DEV__) {
      console.log('CartAnimation: useEffect triggered', { visible, startPosition, endPosition });
    }
    if (!visible) {
      return;
    }

    // Reset animation values - start big (scale 1.5) and fade in
    translateX.setValue(0);
    translateY.setValue(0);
    scale.setValue(1.5); // Start bigger
    opacity.setValue(1);

    // Calculate the distance to travel
    const deltaX = endPosition.x - startPosition.x;
    const deltaY = endPosition.y - startPosition.y;
    
    if (__DEV__) {
      console.log('CartAnimation: Starting animation', { deltaX, deltaY, startPosition, endPosition });
    }

    // Create the animation sequence with curved path
    Animated.parallel([
      // Move from start to end position with easing for smooth curve
      Animated.timing(translateX, {
        toValue: deltaX,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: deltaY,
        duration: 600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      // Scale down from big to small as it moves
      Animated.sequence([
        // Quickly scale down from 1.5 to 1.0 at the start
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // Continue scaling down as it moves
        Animated.timing(scale, {
          toValue: 0.6,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.4,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.2,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      // Fade out at the end
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 100,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onComplete();
    });
  }, [visible, startPosition, endPosition]);

  if (__DEV__ && visible) {
    console.log('CartAnimation: Render', { visible, startPosition, endPosition, productImage });
  }

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.animatedItem,
        {
          position: 'absolute',
          left: startPosition.x,
          top: startPosition.y,
          transform: [
            { translateX },
            { translateY },
            { scale },
          ],
          opacity,
          zIndex: 9999,
        },
      ]}
      pointerEvents="none"
    >
      {productImage ? (
        <ErpAuthenticatedImage uri={productImage} style={styles.productImage} resizeMode="cover" />
      ) : (
        <View style={styles.fallbackIcon}>
          <Text style={styles.iconText} allowFontScaling={false}>
            🛒
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  animatedItem: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: Colors.WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  fallbackIcon: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.SHEIN_PINK,
  },
  iconText: {
    fontSize: 24,
  },
});

