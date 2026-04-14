# Pricing Rule Fields Reference

To fetch the actual Pricing Rule fields from your ERPNext instance, use the `getPricingRuleAllFields()` method.

## How to Check Available Fields:

1. In any screen (e.g., HomeScreen), add this code temporarily:

```typescript
import { useEffect } from 'react';
import { usePricingRuleFields } from '../hooks/erpnext';

// Inside your component:
const { data: pricingRuleFields } = usePricingRuleFields();

useEffect(() => {
  if (pricingRuleFields) {
    console.log('All Pricing Rule Fields:', pricingRuleFields);
  }
}, [pricingRuleFields]);
```

2. Check the console logs when the app loads to see all available fields

## Expected Pricing Rule Fields (based on ERPNext docs):

- **name** - Document ID
- **title** - Title of the pricing rule
- **apply_on** - Apply On (Item, Item Group)
- **item_code** - Specific item code (if apply_on = "Item")
- **item_group** - Item group (if apply_on = "Item Group")
- **buying** - If this is a buying rule
- **selling** - If this is a selling rule
- **applicable_for** - Applicable For (Customer, Supplier, etc.)
- **margin_type** - Margin Type (% or Amount)
- **margin_rate_or_amount** - Margin Rate or Amount
- **rate_or_discount** - Rate or Discount
- **discount_percentage** - Discount Percentage
- **discount_amount** - Discount Amount
- **min_qty** - Minimum Quantity
- **max_qty** - Maximum Quantity
- **min_amt** - Minimum Amount
- **max_amt** - Maximum Amount
- **valid_from** - Valid From (date)
- **valid_upto** - Valid Upto (date)
- **disable** - Disabled (0 or 1)
- **company** - Company
- **currency** - Currency

## Update the getPricingRules() method once you know the exact field names:

Once you check the console and see what fields are available, update the `getPricingRules()` method in `src/services/erpnext.ts` to include the correct fields.

For example:
```typescript
async getPricingRules(): Promise<any[]> {
  try {
    const response = await this.client.get(
      `${API_VERSION}/Pricing Rule?fields=["name","title","discount_percentage","item_code","item_group","valid_from","valid_upto","disable","selling","buying","min_qty","max_qty"]&filters=[["disable","=",0]]`
    );
    return response.data.data;
  } catch (error) {
    console.warn('Error fetching pricing rules:', error);
    return [];
  }
}
```

