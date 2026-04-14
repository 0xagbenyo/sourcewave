import { Product } from '../types';

export interface PricingRule {
  name: string;
  title?: string;
  discount_percentage: number;
  item_code?: string;
  item_group?: string;
  valid_from?: string;
  valid_upto?: string;
  disable: number;
  apply_on?: string;
}

/**
 * Check if a pricing rule is currently active
 * @param rule - The pricing rule to check
 * @returns true if the rule is active and within valid date range
 */
export const isRuleActive = (rule: PricingRule): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if disabled
  if (rule.disable === 1) {
    return false;
  }

  // Check valid_from date
  if (rule.valid_from) {
    const validFrom = new Date(rule.valid_from);
    validFrom.setHours(0, 0, 0, 0);
    if (today < validFrom) {
      return false;
    }
  }

  // Check valid_upto date
  if (rule.valid_upto) {
    const validUpto = new Date(rule.valid_upto);
    validUpto.setHours(23, 59, 59, 999);
    if (today > validUpto) {
      return false;
    }
  }

  return true;
};

/**
 * Get applicable discount for a product based on active pricing rules
 * @param product - The product to check
 * @param pricingRules - All pricing rules
 * @returns The highest applicable discount percentage, or 0 if none apply
 */
export const getProductDiscount = (product: Product | null | undefined, pricingRules: PricingRule[] | null | undefined): number => {
  // Safety checks
  if (!product || !pricingRules || !Array.isArray(pricingRules)) {
    return 0;
  }

  let maxDiscount = 0;

  for (const rule of pricingRules) {
    // Skip invalid rules
    if (!rule || typeof rule !== 'object') {
      continue;
    }

    // Only consider active rules
    if (!isRuleActive(rule)) {
      continue;
    }

    // Skip if no discount percentage
    if (!rule.discount_percentage || rule.discount_percentage <= 0) {
      continue;
    }

    let applies = false;
    const ruleAny = rule as any;

    try {
      // Check based on apply_on field
      if (ruleAny.apply_on === 'Item Code') {
        // Match against items table
        if (ruleAny.items && Array.isArray(ruleAny.items) && product.id) {
          applies = ruleAny.items.some((item: any) => item && item.item_code === product.id);
        }
      } else if (ruleAny.apply_on === 'Item Group') {
        // Match against item_groups table
        if (ruleAny.item_groups && Array.isArray(ruleAny.item_groups) && product.category) {
          applies = ruleAny.item_groups.some((ig: any) => {
            return ig && ig.item_group === product.category;
          });
        }
      }

      if (applies && rule.discount_percentage > maxDiscount) {
        maxDiscount = rule.discount_percentage;
      }
    } catch (error) {
      console.warn('Error calculating discount for rule:', rule.name, error);
      continue;
    }
  }
  
  return maxDiscount;
};

/**
 * Get formatted discount label
 * @param discountPercentage - The discount percentage
 * @returns Formatted string like "-20%"
 */
export const formatDiscount = (discountPercentage: number): string => {
  if (discountPercentage <= 0) {
    return '';
  }
  return `-${Math.round(discountPercentage)}%`;
};

/**
 * Calculate discounted price
 * @param originalPrice - The original price
 * @param discountPercentage - The discount percentage
 * @returns The discounted price
 */
export const calculateDiscountedPrice = (
  originalPrice: number,
  discountPercentage: number
): number => {
  if (discountPercentage <= 0) {
    return originalPrice;
  }
  return originalPrice * (1 - discountPercentage / 100);
};

