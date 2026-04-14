import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';

const { width } = Dimensions.get('window');

interface TopCustomerAwardProps {
  customerName: string;
  month: string;
  year: string;
}

export const TopCustomerAward: React.FC<TopCustomerAwardProps> = ({
  customerName,
  month,
  year,
}) => {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = monthNames[parseInt(month) - 1] || month;

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const sparkleAnim1 = useRef(new Animated.Value(0)).current;
  const sparkleAnim2 = useRef(new Animated.Value(0)).current;
  const sparkleAnim3 = useRef(new Animated.Value(0)).current;
  const ribbonSwayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation - fade in and scale up
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous pulse animation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();

    // Glow animation
    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    glowAnimation.start();

    // Sparkle animations (rotating stars)
    const createSparkleAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 2000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      );
    };

    createSparkleAnimation(sparkleAnim1, 0).start();
    createSparkleAnimation(sparkleAnim2, 500).start();
    createSparkleAnimation(sparkleAnim3, 1000).start();

    // Ribbon sway animation
    const ribbonSway = Animated.loop(
      Animated.sequence([
        Animated.timing(ribbonSwayAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ribbonSwayAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    ribbonSway.start();

    // Continuous rotation for sparkles
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotateAnimation.start();
  }, []);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const sparkle1Opacity = sparkleAnim1.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 0],
  });

  const sparkle2Opacity = sparkleAnim2.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 0],
  });

  const sparkle3Opacity = sparkleAnim3.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 0],
  });

  const ribbonSwayLeft = ribbonSwayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-3, 3],
  });

  const ribbonSwayRight = ribbonSwayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [3, -3],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <LinearGradient
        colors={['#FFFFFF', '#FFFFFF', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBackground}
      >
        {/* Sparkle effects */}
        <Animated.View
          style={[
            styles.sparkle,
            styles.sparkle1,
            {
              opacity: sparkle1Opacity,
              transform: [{ rotate: rotateInterpolate }],
            },
          ]}
        >
          <Ionicons name="star" size={20} color="#FFD700" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sparkle,
            styles.sparkle2,
            {
              opacity: sparkle2Opacity,
              transform: [{ rotate: rotateInterpolate }],
            },
          ]}
        >
          <Ionicons name="star" size={16} color="#FFD700" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sparkle,
            styles.sparkle3,
            {
              opacity: sparkle3Opacity,
              transform: [{ rotate: rotateInterpolate }],
            },
          ]}
        >
          <Ionicons name="star" size={18} color="#FFD700" />
        </Animated.View>

        {/* Award Ribbon */}
        <Animated.View
          style={[
            styles.ribbonContainer,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          {/* Medallion with scalloped border */}
          <Animated.View
            style={[
              styles.medallionWrapper,
              {
                shadowOpacity: glowOpacity,
              },
            ]}
          >
            <Animated.View
              style={[
                styles.medallion,
                {
                  shadowOpacity: glowOpacity,
                },
              ]}
            >
              <View style={styles.medallionContent}>
                <Text style={styles.topCustomerText}>Top Customer</Text>
                <Text style={styles.monthYearText}>{monthName}</Text>
                <Text style={styles.yearText}>{year}</Text>
                <View style={styles.divider} />
                <Text style={styles.customerNameText} numberOfLines={2}>
                  {customerName}
                </Text>
              </View>
            </Animated.View>
            {/* Scalloped border effect */}
            <View style={styles.scallopedBorder} />
          </Animated.View>

          {/* Ribbon Tails with sway animation */}
          <View style={styles.ribbonTails}>
            <Animated.View
              style={[
                styles.ribbonTail,
                styles.ribbonTailLeft,
                {
                  transform: [
                    { rotate: '-15deg' },
                    { translateX: ribbonSwayLeft },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.ribbonTail,
                styles.ribbonTailRight,
                {
                  transform: [
                    { rotate: '15deg' },
                    { translateX: ribbonSwayRight },
                  ],
                },
              ]}
            />
          </View>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.PADDING_MD,
    marginVertical: Spacing.PADDING_SM,
  },
  gradientBackground: {
    padding: Spacing.PADDING_MD,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    backgroundColor: 'transparent',
  },
  ribbonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallionWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallion: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.PADDING_MD,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 2,
  },
  scallopedBorder: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 3,
    borderColor: Colors.SHEIN_RED, // Red color
    zIndex: 1,
    top: -4,
    left: -4,
  },
  medallionContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  topCustomerText: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  monthYearText: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 2,
  },
  yearText: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    color: Colors.TEXT_SECONDARY,
    marginBottom: Spacing.MARGIN_XS,
  },
  divider: {
    width: 60,
    height: 1,
    backgroundColor: Colors.BORDER,
    marginVertical: Spacing.MARGIN_XS,
  },
  customerNameText: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    textAlign: 'center',
    marginTop: Spacing.MARGIN_XS,
  },
  ribbonTails: {
    flexDirection: 'row',
    marginTop: -10,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  ribbonTail: {
    width: 60,
    height: 40,
    backgroundColor: Colors.SHEIN_RED, // Red color
  },
  ribbonTailLeft: {
    marginRight: -5,
  },
  ribbonTailRight: {
    marginLeft: -5,
  },
  sparkle: {
    position: 'absolute',
    zIndex: 10,
  },
  sparkle1: {
    top: 20,
    left: 30,
  },
  sparkle2: {
    top: 40,
    right: 35,
  },
  sparkle3: {
    bottom: 60,
    left: '50%',
    marginLeft: -10,
  },
});

