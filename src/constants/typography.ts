export const Typography = {
  // Font Families
  FONT_FAMILY_PRIMARY: 'Inter',
  FONT_FAMILY_SECONDARY: 'Helvetica Neue',
  
  // Font Sizes
  FONT_SIZE_XS: 12,
  FONT_SIZE_SM: 14,
  FONT_SIZE_MD: 16,
  FONT_SIZE_LG: 18,
  FONT_SIZE_XL: 20,
  FONT_SIZE_2XL: 24,
  FONT_SIZE_3XL: 30,
  FONT_SIZE_4XL: 36,
  
  // Font Weights
  FONT_WEIGHT_LIGHT: '300',
  FONT_WEIGHT_REGULAR: '400',
  FONT_WEIGHT_MEDIUM: '500',
  FONT_WEIGHT_SEMIBOLD: '600',
  FONT_WEIGHT_BOLD: '700',
  
  // Line Heights
  LINE_HEIGHT_TIGHT: 1.2,
  LINE_HEIGHT_NORMAL: 1.4,
  LINE_HEIGHT_RELAXED: 1.6,
  
  // Letter Spacing
  LETTER_SPACING_TIGHT: -0.5,
  LETTER_SPACING_NORMAL: 0,
  LETTER_SPACING_WIDE: 0.5,
} as const;

export const TextStyles = {
  // Headlines
  H1: {
    fontSize: Typography.FONT_SIZE_4XL,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    lineHeight: Typography.LINE_HEIGHT_TIGHT,
    letterSpacing: Typography.LETTER_SPACING_TIGHT,
  },
  H2: {
    fontSize: Typography.FONT_SIZE_3XL,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    lineHeight: Typography.LINE_HEIGHT_TIGHT,
    letterSpacing: Typography.LETTER_SPACING_TIGHT,
  },
  H3: {
    fontSize: Typography.FONT_SIZE_2XL,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    lineHeight: Typography.LINE_HEIGHT_NORMAL,
    letterSpacing: Typography.LETTER_SPACING_NORMAL,
  },
  H4: {
    fontSize: Typography.FONT_SIZE_XL,
    fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
    lineHeight: Typography.LINE_HEIGHT_NORMAL,
    letterSpacing: Typography.LETTER_SPACING_NORMAL,
  },
  
  // Body Text
  BODY_LARGE: {
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_REGULAR,
    lineHeight: Typography.LINE_HEIGHT_RELAXED,
    letterSpacing: Typography.LETTER_SPACING_NORMAL,
  },
  BODY_MEDIUM: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_REGULAR,
    lineHeight: Typography.LINE_HEIGHT_RELAXED,
    letterSpacing: Typography.LETTER_SPACING_NORMAL,
  },
  BODY_SMALL: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_REGULAR,
    lineHeight: Typography.LINE_HEIGHT_RELAXED,
    letterSpacing: Typography.LETTER_SPACING_NORMAL,
  },
  
  // Special Text
  PRICE: {
    fontSize: Typography.FONT_SIZE_XL,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    lineHeight: Typography.LINE_HEIGHT_TIGHT,
    letterSpacing: Typography.LETTER_SPACING_TIGHT,
  },
  DISCOUNT: {
    fontSize: Typography.FONT_SIZE_LG,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    lineHeight: Typography.LINE_HEIGHT_TIGHT,
    letterSpacing: Typography.LETTER_SPACING_TIGHT,
  },
  CAPTION: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_REGULAR,
    lineHeight: Typography.LINE_HEIGHT_NORMAL,
    letterSpacing: Typography.LETTER_SPACING_NORMAL,
  },
} as const;

