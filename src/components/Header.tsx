import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { Spacing } from '../constants/spacing';

interface HeaderProps {
  onSearchPress?: () => void;
  onMailPress?: () => void;
  onWishlistPress?: () => void;
  onCartPress?: () => void;
  onMenuPress?: () => void;
  onCameraPress?: () => void;
  onCalendarPress?: () => void;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  showBackButton?: boolean;
  onBackPress?: () => void;
  customPaddingTop?: number;
  isScrolled?: boolean;
  headerBackgroundColor?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onSearchPress,
  onMailPress,
  onWishlistPress,
  onCartPress,
  onMenuPress,
  onCameraPress,
  onCalendarPress,
  searchValue: controlledSearchValue,
  onSearchChange,
  showBackButton = false,
  onBackPress,
  customPaddingTop,
  isScrolled = false,
  headerBackgroundColor: customHeaderBackgroundColor,
}) => {
  const navigation = useNavigation();
  const [localSearchValue, setLocalSearchValue] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const preventFocusNavigationRef = useRef(false);
  const previousRouteNameRef = useRef<string | undefined>(undefined);
  
  // Get current route name using navigation state
  const currentRouteName = useNavigationState((state) => {
    const route = state?.routes[state?.index || 0];
    return route?.name;
  });
  
  // Determine if we're on Home screen - Home screen has special transparent styling
  const isHomeScreen = currentRouteName === 'Home';
  
  // For non-Home screens, use wine background with white text
  // For Home screen, use transparent when not scrolled, wine when scrolled
  // Unless a custom headerBackgroundColor is provided
  const headerBackgroundColor = customHeaderBackgroundColor ?? (!isHomeScreen ? Colors.ROYAL_BLUE : (isScrolled ? Colors.ROYAL_BLUE : 'transparent'));
  const headerTopBackgroundColor = customHeaderBackgroundColor ?? (!isHomeScreen ? Colors.ROYAL_BLUE : (isScrolled ? Colors.ROYAL_BLUE : 'transparent'));
  
  // Icon color logic:
  // - Custom white background: black text
  // - Other screens: white (on wine background)
  // - Home screen, not scrolled: white (on transparent, over carousel)
  // - Home screen, scrolled: white (on wine background)
  const iconColor = customHeaderBackgroundColor === Colors.WHITE
    ? Colors.BLACK
    : (!isHomeScreen 
      ? Colors.WHITE 
      : (isScrolled ? Colors.WHITE : Colors.WHITE));

  // Use controlled value if provided, otherwise use local state
  const searchValue = controlledSearchValue !== undefined ? controlledSearchValue : localSearchValue;

  // Track route changes to detect when we come back from Search screen
  useEffect(() => {
    // If we were on Search and now we're not, we just navigated back
    if (previousRouteNameRef.current === 'Search' && currentRouteName !== 'Search') {
      // Set flag to prevent navigation on focus for a longer period
      preventFocusNavigationRef.current = true;
      // Blur the input if it's focused
      if (searchInputRef.current) {
        searchInputRef.current.blur();
      }
      // Reset flag after a longer delay to ensure we don't trigger again
      setTimeout(() => {
        preventFocusNavigationRef.current = false;
      }, 1000);
    }
    // Update previous route name
    previousRouteNameRef.current = currentRouteName;
  }, [currentRouteName]);

  const handleSearchFocus = () => {
    // Prevent navigation if we just came back from Search screen
    if (preventFocusNavigationRef.current) {
      // Blur immediately to prevent any further focus events
      if (searchInputRef.current) {
        searchInputRef.current.blur();
      }
      return;
    }
    // Navigate to Search screen when user taps/focuses on search input
    // This happens before typing, so transition is smooth
    // Use navigate (not replace) so we can go back
    if (currentRouteName !== 'Search') {
      (navigation as any).navigate('Search', { query: searchValue });
    }
  };
  
  const handleSearchChange = (text: string) => {
    if (onSearchChange) {
      onSearchChange(text);
    } else {
      setLocalSearchValue(text);
      // Only update params when typing (no navigation, smooth typing)
      if (currentRouteName === 'Search') {
        (navigation as any).setParams({ query: text });
      }
    }
  };

  const handleSearchPress = () => {
    if (onSearchPress) {
      onSearchPress();
    } else {
      // Only navigate if we're not already on Search and not preventing navigation
      if (currentRouteName !== 'Search' && !preventFocusNavigationRef.current) {
        // Navigate to Search screen with the search query
        if (searchValue.trim()) {
          (navigation as any).navigate('Search', { query: searchValue });
        } else {
          (navigation as any).navigate('Search', { query: '' });
        }
      }
    }
  };

  const handleMailPress = () => {
    if (onMailPress) {
      onMailPress();
    }
  };

  const handleSourcingPress = () => {
    if (onWishlistPress) {
      onWishlistPress();
    } else {
      (navigation as any).navigate('SourcingRequest');
    }
  };

  const handleCartPress = () => {
    if (onCartPress) {
      onCartPress();
    } else {
      (navigation as any).navigate('OrderHistory');
    }
  };

  const handleMenuPress = () => {
    if (onMenuPress) {
      onMenuPress();
    }
  };

  const handleCameraPress = () => {
    if (onCameraPress) {
      onCameraPress();
    }
  };

  const handleCalendarPress = () => {
    if (onCalendarPress) {
      onCalendarPress();
    }
  };

  const handleSearchSubmit = () => {
    if (searchValue.trim()) {
      handleSearchPress();
    }
  };

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      // Check if we can go back, otherwise navigate to Main/Home
      const nav = navigation as any;
      if (nav.canGoBack && nav.canGoBack()) {
        nav.goBack();
      } else {
        // If no screen to go back to, navigate to Main tab
        nav.navigate('Main', { screen: 'Home' });
      }
    }
  };

  return (
    <View style={[
      styles.header, 
      customPaddingTop !== undefined && { paddingTop: customPaddingTop },
      { backgroundColor: headerBackgroundColor },
      (!isHomeScreen || customHeaderBackgroundColor === Colors.WHITE) && styles.headerScrolled
    ]}>
      {/* Search and Icons Row */}
      <View style={[
        styles.headerTop, 
        styles.headerTopWithBackground,
        { backgroundColor: headerTopBackgroundColor }
      ]}>
        {/* Left side icons */}
        <View style={styles.leftIcons}>
          {showBackButton ? (
            <TouchableOpacity 
              style={styles.iconButton} 
              onPress={handleBackPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={18} color={iconColor} />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity 
                style={styles.iconButton} 
                onPress={handleMailPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="mail-outline" size={18} color={iconColor} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.iconButton} 
                onPress={handleCalendarPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="cube-outline" size={18} color={iconColor} />
              </TouchableOpacity>
            </>
          )}
        </View>
        
        {/* Search bar */}
        <View style={styles.searchWrapper}>
          <TouchableOpacity 
            style={[
              styles.searchContainer,
              isScrolled && styles.searchContainerScrolled,
              !isHomeScreen && styles.searchContainerWhite
            ]}
            activeOpacity={0.7}
            onPress={handleSearchPress}
          >
            <TextInput
              ref={searchInputRef}
              style={[
                styles.searchInput,
                !isHomeScreen && styles.searchInputWhite
              ]}
              placeholder="Search"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              value={searchValue}
              onChangeText={handleSearchChange}
              onFocus={handleSearchFocus}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
              editable={currentRouteName === 'Search'}
              pointerEvents={currentRouteName === 'Search' ? 'auto' : 'none'}
            />
            <View style={styles.searchIconsContainer} pointerEvents="box-none">
              <TouchableOpacity 
                style={styles.cameraButton} 
                onPress={handleCameraPress}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              >
                <Ionicons name="camera-outline" size={18} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.searchIconButton} 
                onPress={currentRouteName === 'Search' ? handleSearchSubmit : handleSearchPress}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              >
                <Ionicons name="search" size={18} color={Colors.ROYAL_BLUE} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Right side icons */}
        <View style={styles.rightIcons}>
          <TouchableOpacity 
            style={styles.iconButton} 
            onPress={handleSourcingPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="briefcase-outline" size={18} color={iconColor} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.iconButton} 
            onPress={handleCartPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="cart-outline" size={18} color={iconColor} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: Spacing.PADDING_LG + 30,
    paddingBottom: Spacing.PADDING_SM,
    backgroundColor: 'transparent',
    width: '100%',
    marginBottom: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  headerScrolled: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  appNameRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 2,
    marginBottom: 2,
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.BLACK,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.MARGIN_SM,
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_XS,
    minHeight: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(200, 200, 200, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.BLACK,
    padding: 0,
    margin: 0,
  },
  searchIconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MARGIN_XS,
    marginLeft: Spacing.MARGIN_XS,
  },
  cameraButton: {
    padding: 4,
  },
  searchIconButton: {
    padding: 4,
  },
  headerTopWithBackground: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: Spacing.PADDING_XS,
  },
  searchContainerScrolled: {
    backgroundColor: Colors.LIGHT_GRAY,
    borderColor: Colors.BORDER,
  },
  searchContainerWhite: {
    backgroundColor: Colors.LIGHT_GRAY,
    borderColor: Colors.BORDER,
  },
  searchInputWhite: {
    color: Colors.BLACK,
  },
});
