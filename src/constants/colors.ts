export const Colors = {
  // Primary Colors
  BLACK: '#000000',
  WHITE: '#FFFFFF',
  OFF_WHITE: '#FAFAFA',
  
  // SHEIN Brand Colors
  SHEIN_PINK: '#FF4D6D',
  SHEIN_ORANGE: '#FF6B35',
  SHEIN_RED: '#FF3B30',
  
  // Wine & Gold Colors (China Red & Gold Theme)
  WINE: '#E60012', // Bright China Red
  WINE_LIGHT: '#FF6B6B', // Light China Red
  GOLD: '#FFD700', // Bright Gold
  GOLD_LIGHT: '#FFE082', // Light Gold
  
  // Accent Colors
  VIBRANT_PINK: '#FF4D6D',
  ELECTRIC_BLUE: '#007AFF',
  LIGHT_BLUE: '#5AC8FA',
  
  // Supporting Shades
  NEUTRAL_GRAY: '#8E8E93',
  LIGHT_GRAY: '#F2F2F7',
  MEDIUM_GRAY: '#C7C7CC',
  DARK_GRAY: '#3A3A3C',
  
  // Pastels
  MINT: '#98D8C8',
  LAVENDER: '#E6E6FA',
  PEACH: '#FFDAB9',
  LIGHT_PINK: '#FFF0F5',
  
  // Additional UI Colors
  BACKGROUND: '#FFFFFF',
  SURFACE: '#FFFFFF',
  TEXT_PRIMARY: '#000000',
  TEXT_SECONDARY: '#8E8E93',
  TEXT_DISABLED: '#C7C7CC',
  BORDER: '#E5E5EA',
  SHADOW: 'rgba(0, 0, 0, 0.1)',
  
  // Status Colors
  SUCCESS: '#34C759',
  WARNING: '#FF9500',
  ERROR: '#FF3B30',
  INFO: '#007AFF',
  
  // SHEIN Specific Colors
  PROMO_ORANGE: '#FF6B35',
  FLASH_SALE_RED: '#FF3B30',
  FREE_SHIPPING_GREEN: '#34C759',
  GOLD_ACCENT: '#FFD700',
  ROYAL_BLUE: '#6B8CE8',
  
  // Gradient Colors for UI Enhancement
  GRADIENT_PINK_START: '#FF4D6D',
  GRADIENT_PINK_END: '#FF6B9D',
  GRADIENT_BLUE_START: '#007AFF',
  GRADIENT_BLUE_END: '#5AC8FA',
  GRADIENT_ORANGE_START: '#FF6B35',
  GRADIENT_ORANGE_END: '#FF8C42',
  GRADIENT_WINE_START: '#E60012',
  GRADIENT_WINE_END: '#FF6B6B',
  GRADIENT_DARK_START: 'rgba(0, 0, 0, 0.5)',
  GRADIENT_DARK_END: 'rgba(0, 0, 0, 0.1)',
  GRADIENT_LIGHT_START: 'rgba(255, 255, 255, 0.1)',
  GRADIENT_LIGHT_END: 'rgba(255, 255, 255, 0)',
} as const;

export type ColorKeys = keyof typeof Colors;

