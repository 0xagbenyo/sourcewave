# Pricing Rule Doctype - Complete Structure Guide

## How to Find the Fields

When you reload the app, the console will now show the **complete JSON structure** of the first 2 Pricing Rules.

Look for:
```
📌 PRICING RULE: PRLE-0001
📋 COMPLETE OBJECT STRUCTURE:
{
  "name": "PRLE-0001",
  ... all fields here ...
}
```

## What to Look For

### 1. **Direct Fields** (top level)
These appear directly in the object:
```json
{
  "name": "PRLE-0001",
  "discount_percentage": 60,
  "item_code": "ABC-123",          // Single item code
  "item_group": "Gym Ware Men",    // Single item group
  "valid_from": "2025-11-10",
  "valid_upto": "2025-11-30",
  "apply_on": "Item Group",
  ...
}
```

### 2. **Child Table Fields** (most likely!)
These are arrays/tables within the object. Common names:
- `pricing_rules_details` ← Most common
- `items` 
- `item_details`
- `details`
- `pricing_rule_items`

Example structure:
```json
{
  "name": "PRLE-0001",
  "discount_percentage": 60,
  "pricing_rules_details": [
    {
      "item_code": "WEB-ITM-0001",
      "item_group": "Gym Ware Men"
    },
    {
      "item_code": "WEB-ITM-0002",
      "item_group": "Shoes"
    }
  ],
  ...
}
```

## Steps to Complete

1. **Reload the app** - Console will show full JSON structure
2. **Copy the complete JSON output** and share it
3. **We'll identify:**
   - Which fields to use for item matching
   - The name of the child table (if present)
   - What field holds the item code
   - What field holds the item group

## Once We Know the Structure

We'll update:
1. `getProductDiscount()` function to match products correctly
2. Discount percentages will show on product cards
3. Test with the actual pricing rules

---

## What You Should See in Console

### ✅ If items are in a child table:
```
"pricing_rule_items": [
  {"item_code": "WEB-ITM-0001"},
  {"item_code": "WEB-ITM-0002"}
]
```

### ✅ If item groups are in a child table:
```
"item_group_list": [
  {"item_group": "Gym Ware Men"},
  {"item_group": "Shoes"}
]
```

### ✅ If directly on the rule:
```
"item_code": "WEB-ITM-0001",
"item_group": "Gym Ware Men"
```

---

## Next Action

**Reload app → Check console → Share the complete JSON structure → I'll fix the matching logic**

