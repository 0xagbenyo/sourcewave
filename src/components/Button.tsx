import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Spacing } from '../constants/spacing';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
}) => {
  const buttonStyle = [
    styles.base,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ];

  const textStyleArray = [
    styles.text,
    styles[`${variant}Text`],
    styles[`${size}Text`],
    disabled && styles.disabledText,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? Colors.WHITE : Colors.VIBRANT_PINK}
          size="small"
        />
      ) : (
        <Text style={textStyleArray}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: Spacing.BORDER_RADIUS_MD,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  
  // Variants
  primary: {
    backgroundColor: Colors.VIBRANT_PINK,
    ...Spacing.SHADOW_SM,
  },
  secondary: {
    backgroundColor: Colors.ELECTRIC_BLUE,
    ...Spacing.SHADOW_SM,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.VIBRANT_PINK,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  
  // Sizes
  small: {
    paddingVertical: Spacing.PADDING_SM,
    paddingHorizontal: Spacing.PADDING_MD,
    minHeight: 36,
  },
  medium: {
    paddingVertical: Spacing.PADDING_MD,
    paddingHorizontal: Spacing.PADDING_LG,
    minHeight: 48,
  },
  large: {
    paddingVertical: Spacing.PADDING_LG,
    paddingHorizontal: Spacing.PADDING_XL,
    minHeight: 56,
  },
  
  // Full width
  fullWidth: {
    width: '100%',
  },
  
  // Disabled state
  disabled: {
    backgroundColor: Colors.LIGHT_GRAY,
    borderColor: Colors.LIGHT_GRAY,
    ...Spacing.SHADOW_SM,
  },
  
  // Text styles
  text: {
    fontFamily: Typography.FONT_FAMILY_PRIMARY,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    textAlign: 'center',
  },
  
  // Text variants
  primaryText: {
    color: Colors.WHITE,
  },
  secondaryText: {
    color: Colors.WHITE,
  },
  outlineText: {
    color: Colors.VIBRANT_PINK,
  },
  ghostText: {
    color: Colors.VIBRANT_PINK,
  },
  
  // Text sizes
  smallText: {
    fontSize: Typography.FONT_SIZE_SM,
  },
  mediumText: {
    fontSize: Typography.FONT_SIZE_MD,
  },
  largeText: {
    fontSize: Typography.FONT_SIZE_LG,
  },
  
  // Disabled text
  disabledText: {
    color: Colors.TEXT_DISABLED,
  },
});

