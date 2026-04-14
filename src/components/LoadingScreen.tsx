import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Colors } from '../constants/colors';

const { width, height } = Dimensions.get('window');

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  message = 'SOURCEWAVE' 
}) => {
  const waveAnim = useRef(new Animated.Value(0)).current;
  const letters = message.split('');
  const totalLetters = letters.length;

  useEffect(() => {
    // Continuous looping animation
    const waveAnimation = Animated.loop(
      Animated.timing(waveAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: false,
      })
    );

    waveAnimation.start();

    return () => {
      waveAnimation.stop();
    };
  }, [waveAnim]);

  // Get animated color for each letter
  // Wave moves from left (-0.2) to right (1.2) to cover entire text
  const getLetterColor = (index: number) => {
    if (totalLetters === 0) return Colors.TEXT_PRIMARY;
    
    // Letter position: 0 (first) to 1 (last)
    const letterPos = totalLetters === 1 ? 0 : index / (totalLetters - 1);
    
    // Wave width - how wide the red highlight is
    const waveWidth = 0.2;
    
    // Wave travels from -waveWidth (before start) to 1+waveWidth (after end)
    // So waveAnim value of 0 corresponds to position -waveWidth
    // And waveAnim value of 1 corresponds to position 1+waveWidth
    const waveStartPos = -waveWidth;
    const waveEndPos = 1 + waveWidth;
    
    // This letter should be red when wave is near letterPos
    // Red zone: letterPos - waveWidth/2 to letterPos + waveWidth/2
    const redZoneStart = letterPos - waveWidth / 2;
    const redZoneCenter = letterPos;
    const redZoneEnd = letterPos + waveWidth / 2;
    
    // Map waveAnim (0 to 1) to wave position (waveStartPos to waveEndPos)
    // Then check if that position is in the red zone for this letter
    return waveAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [waveStartPos, waveEndPos],
    }).interpolate({
      inputRange: [
        redZoneStart - 0.05,
        redZoneStart,
        redZoneCenter,
        redZoneEnd,
        redZoneEnd + 0.05,
      ],
      outputRange: [
        Colors.TEXT_PRIMARY,
        Colors.TEXT_PRIMARY,
        Colors.FLASH_SALE_RED,
        Colors.TEXT_PRIMARY,
        Colors.TEXT_PRIMARY,
      ],
      extrapolate: 'clamp',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        {letters.map((letter, index) => (
          <Animated.Text
            key={index}
            style={[
              styles.letter,
              {
                color: getLetterColor(index),
              },
            ]}
            allowFontScaling={false}
          >
            {letter === ' ' ? '\u00A0' : letter}
          </Animated.Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 4,
  },
});
