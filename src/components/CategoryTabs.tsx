import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';

const { width } = Dimensions.get('window');

interface CategoryTabsProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categories?: string[];
  variant?: 'default' | 'red'; // Variant for different background colors
  showMenuIcon?: boolean; // Show hamburger menu icon on the right
  onMenuPress?: () => void; // Handler for menu icon press
  isScrolled?: boolean; // Whether scrolled past carousel
  activeColor?: string; // Custom color for active tab (default: SHEIN_PINK)
}

export const CategoryTabs: React.FC<CategoryTabsProps> = ({
  selectedCategory,
  onSelectCategory,
  categories = ['All', 'Women', 'Kids', 'Men', 'Curve', 'Shoes', 'Electronics', 'Jewelry and Accessories', 'Sports', 'Bags', 'Toys', 'Office'],
  variant = 'default',
  showMenuIcon = false,
  onMenuPress,
  isScrolled = false,
  activeColor,
}) => {
  const navigation = useNavigation();
  const isRedVariant = variant === 'red';
  
  const handleMenuPress = () => {
    if (onMenuPress) {
      onMenuPress();
    } else {
      // Navigate to Categories screen
      (navigation as any).navigate('Categories');
    }
  };
  
  return (
    <View style={[
      styles.container, 
      isRedVariant && styles.containerRed,
      isScrolled && styles.containerScrolled
    ]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.tab,
              isRedVariant && styles.tabRed,
              selectedCategory === category && (isRedVariant ? styles.tabActiveRed : styles.tabActive),
              selectedCategory === category && !isRedVariant && activeColor && { backgroundColor: activeColor },
            ]}
            onPress={() => onSelectCategory(category)}
          >
            <Text
              style={[
                styles.tabText,
                isRedVariant && styles.tabTextRed,
                selectedCategory === category && (isRedVariant ? styles.tabTextActiveRed : styles.tabTextActive),
                isScrolled && isRedVariant && styles.tabTextScrolled,
                isScrolled && isRedVariant && selectedCategory === category && styles.tabTextActiveScrolled,
                selectedCategory === category && !isRedVariant && activeColor && { color: Colors.WHITE },
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {showMenuIcon && (
        <View style={styles.menuIconContainer}>
          <TouchableOpacity 
            style={styles.menuIcon}
            onPress={handleMenuPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="menu" size={24} color={Colors.WHITE} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
  },
  containerRed: {
    backgroundColor: 'transparent',
  },
  containerScrolled: {
    backgroundColor: Colors.WINE,
    marginTop: 0,
    paddingTop: 0,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_XS,
    gap: Spacing.MARGIN_XS,
  },
  tab: {
    paddingHorizontal: Spacing.PADDING_SM,
    paddingVertical: Spacing.PADDING_XS,
    borderRadius: 16,
    backgroundColor: Colors.LIGHT_GRAY,
    marginRight: Spacing.MARGIN_XS,
  },
  tabRed: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingBottom: Spacing.PADDING_XS,
  },
  tabActive: {
    backgroundColor: Colors.SHEIN_PINK,
  },
  tabActiveRed: {
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderBottomColor: Colors.WHITE,
  },
  tabText: {
    fontSize: Typography.FONT_SIZE_SM,
    color: Colors.DARK_GRAY,
    fontWeight: '700',
  },
  tabTextRed: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: '800',
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  tabTextActive: {
    color: Colors.WHITE,
    fontWeight: '800',
  },
  tabTextActiveRed: {
    color: Colors.WHITE,
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: '900',
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  tabTextScrolled: {
    color: Colors.WHITE,
    textShadowColor: 'transparent',
  },
  tabTextActiveScrolled: {
    color: Colors.WHITE,
    textShadowColor: 'transparent',
  },
  menuIconContainer: {
    paddingRight: Spacing.PADDING_MD,
    paddingLeft: Spacing.PADDING_SM,
  },
  menuIcon: {
    padding: Spacing.PADDING_XS,
  },
});

