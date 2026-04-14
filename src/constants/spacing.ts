export const Spacing = {
  // Base spacing units
  XS: 4,
  SM: 8,
  MD: 16,
  LG: 24,
  XL: 32,
  XXL: 48,
  XXXL: 64,
  
  // Component-specific spacing
  SCREEN_PADDING: 16,
  CARD_PADDING: 16,
  BUTTON_PADDING: 12,
  INPUT_PADDING: 16,
  
  // Margins
  MARGIN_XS: 4,
  MARGIN_SM: 8,
  MARGIN_MD: 16,
  MARGIN_LG: 24,
  MARGIN_XL: 32,
  
  // Padding
  PADDING_XS: 4,
  PADDING_SM: 8,
  PADDING_MD: 16,
  PADDING_LG: 24,
  PADDING_XL: 32,
  
  // Border radius
  BORDER_RADIUS_SM: 4,
  BORDER_RADIUS_MD: 8,
  BORDER_RADIUS_LG: 12,
  BORDER_RADIUS_XL: 16,
  BORDER_RADIUS_XXL: 24,
  
  // Shadows
  SHADOW_SM: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  SHADOW_MD: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  SHADOW_LG: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;

