import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { appStorage } from '../services/appStorage';
import { STORAGE_ONBOARDING_COMPLETE } from '../constants/appPreferencesKeys';

const { width, height } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  title: string;
  description: string;
  illustration: any;
}

export const OnboardingScreen: React.FC = () => {
  const { t } = useTranslation();
  const onboardingSlides: OnboardingSlide[] = useMemo(
    () => [
      {
        id: '1',
        title: t('onboarding.slide1Title'),
        description: t('onboarding.slide1Desc'),
        illustration: require('../assets/images/source1.jpg'),
      },
      {
        id: '2',
        title: t('onboarding.slide2Title'),
        description: t('onboarding.slide2Desc'),
        illustration: require('../assets/images/source2.png'),
      },
      {
        id: '3',
        title: t('onboarding.slide3Title'),
        description: t('onboarding.slide3Desc'),
        illustration: require('../assets/images/source3.jpeg'),
      },
    ],
    [t]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation();

  const finishOnboarding = async () => {
    await appStorage.setItem(STORAGE_ONBOARDING_COMPLETE, 'true');
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Auth' as never }],
      })
    );
  };

  const handleNext = () => {
    if (currentIndex < onboardingSlides.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      void finishOnboarding();
    }
  };

  const handleSkip = () => {
    void finishOnboarding();
  };

  const renderSlide = ({ item, index }: { item: OnboardingSlide; index: number }) => {
    const inputRange = [
      (index - 1) * width,
      index * width,
      (index + 1) * width,
    ];

    const imageScale = scrollX.interpolate({
      inputRange,
      outputRange: [0.8, 1, 0.8],
      extrapolate: 'clamp',
    });

    const titleOpacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.6, 1, 0.6],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.slide}>
        <View style={styles.content}>
          {/* Title */}
          <Animated.View style={[styles.titleContainer, { opacity: titleOpacity }]}>
            <Text style={styles.title}>{item.title}</Text>
          </Animated.View>

          {/* Illustration */}
          <Animated.View style={[styles.illustrationContainer, { transform: [{ scale: imageScale }] }]}>
            <Image 
              source={item.illustration} 
              style={styles.illustration} 
              resizeMode="contain"
              fadeDuration={0}
            />
          </Animated.View>

          {/* Description */}
          <Animated.View style={[styles.descriptionContainer, { opacity: titleOpacity }]}>
            <Text style={styles.description}>{item.description}</Text>
          </Animated.View>
        </View>
      </View>
    );
  };

  const renderPagination = () => {
    return (
      <View style={styles.pagination}>
        {onboardingSlides.map((_, index) => {
          const inputRange = [
            (index - 1) * width,
            index * width,
            (index + 1) * width,
          ];

          const dotOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });

          const dotScale = scrollX.interpolate({
            inputRange,
            outputRange: [0.8, 1, 0.8],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  opacity: dotOpacity,
                  transform: [{ scale: dotScale }],
                },
              ]}
            />
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with brand info
      <View style={styles.header}>
        <Text style={styles.headerTitle}>China Sourcing Hub</Text>
        <Text style={styles.headerSubtitle}>Connect with suppliers directly</Text>
      </View> */}

      <FlatList
        ref={flatListRef}
        data={onboardingSlides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      />
      
      <View style={styles.footer}>
        {renderPagination()}
        
        <View style={styles.buttonContainer}>
          {currentIndex < onboardingSlides.length - 1 ? (
            <>
              <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>{t('onboarding.next')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={handleNext} style={styles.startButton}>
              <Text style={styles.startButtonText}>{t('onboarding.start')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#F5F5F5',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ROYAL_BLUE,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  slide: {
    width,
    height: height - 200, // Account for footer
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  titleContainer: {
    marginBottom: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.BLACK,
    textAlign: 'center',
    lineHeight: 34,
  },
  illustrationContainer: {
    width: width * 0.85,
    height: width * 0.85,
    marginBottom: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 20,
    overflow: 'hidden',
  },
  illustration: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  descriptionContainer: {
    maxWidth: 280,
  },
  description: {
    fontSize: 16,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.ROYAL_BLUE,
    marginHorizontal: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.BLACK,
  },
  nextButton: {
    backgroundColor: Colors.ROYAL_BLUE,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 25,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  startButton: {
    backgroundColor: Colors.ROYAL_BLUE,
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 25,
    alignSelf: 'center',
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

