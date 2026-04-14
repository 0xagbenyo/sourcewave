# Product Card Consistency Issue & Solution

## Problem Identified

Currently, product cards are rendered differently in multiple screens:

1. **HomeScreen** - Uses custom rendering logic (mix of manual rendering + ProductCard)
2. **NewScreen** - Custom `renderProductSection()` with emoji images
3. **CategoryProductsScreen** - Uses ProductCard component correctly ✅
4. **CategoriesScreen** - Uses custom `renderProductGrid()`  
5. **SearchScreen** - Uses custom `renderProductSection()` with mock emoji data

### Issues:
- ❌ Inconsistent styling and behavior
- ❌ Some product cards not clickable
- ❌ Prices not showing in all places
- ❌ Discount badges not applied consistently
- ❌ Mock data (emojis) mixed with real products

## Solution: Unified ProductCard Component

The **ProductCard component** should be the ONLY way to render products across the entire app.

### Current ProductCard Props:

```typescript
interface ProductCardProps {
  product: Product;              // The product data
  onPress?: (productId: string) => void;        // Click handler
  onWishlistPress?: (productId: string) => void; // Wishlist handler
  isWishlisted?: boolean;        // Wishlist state
  style?: any;                   // Additional styles
  variant?: 'tall' | 'medium' | 'short'; // Card size
  pricingDiscount?: number;      // Discount percentage from pricing rules
}
```

## Files to Update

### 1. **HomeScreen.tsx**
- Replace custom product rendering with ProductCard
- Use ProductCard in renderNewArrivals(), renderMainProducts(), renderForYouProducts()
- Pass pricing discounts using `getProductDiscount(product, pricingRules)`

### 2. **NewScreen.tsx**
- Replace `renderProductSection()` with FlatList using ProductCard
- Use real product data instead of emoji mocks
- Apply pricing discounts

### 3. **CategoriesScreen.tsx**
- ✅ Already correctly using ProductCard in renderProductGrid()
- Just ensure pricing discounts are passed

### 4. **CategoryProductsScreen.tsx**
- ✅ Already correctly using ProductCard
- Just ensure pricing discounts are passed

### 5. **SearchScreen.tsx**
- Replace `renderProductSection()` with ProductCard component
- Remove emoji mock data
- Apply pricing discounts

## Implementation Steps

### Step 1: Wrap all product rendering with ProductCard

**Example - Converting NewScreen:**

```typescript
// BEFORE (current - emoji mocks)
const renderProductSection = (products: any[], title: string) => (
  <View style={styles.section}>
    <FlatList
      data={products}
      horizontal
      renderItem={({ item }) => (
        <View style={styles.productCard}>
          <View style={styles.productImage}>
            <Text style={styles.productEmoji}>{item.image}</Text>
          </View>
          <Text style={styles.productName}>{item.name}</Text>
          <Text style={styles.productPrice}>{item.price}</Text>
        </View>
      )}
    />
  </View>
);

// AFTER (using ProductCard)
const renderProductSection = (products: any[], title: string) => (
  <View style={styles.section}>
    <FlatList
      data={products}
      horizontal
      renderItem={({ item }) => (
        <ProductCard
          product={item}
          onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
          onWishlistPress={() => console.log('Wishlist:', item.id)}
          pricingDiscount={getProductDiscount(item, pricingRules)}
          variant="medium"
        />
      )}
      keyExtractor={(item) => item.id}
    />
  </View>
);
```

### Step 2: Ensure all ProductCard instances include discount

```typescript
<ProductCard
  product={product}
  onPress={handleProductPress}
  onWishlistPress={handleWishlistPress}
  pricingDiscount={getProductDiscount(product, pricingRules)} // ← ADD THIS
  variant="medium"
/>
```

### Step 3: Pass pricing rules to all screens

Each screen that uses ProductCard should:

```typescript
const { data: pricingRules = [] } = usePricingRules();

// Then in ProductCard:
pricingDiscount={getProductDiscount(product, pricingRules)}
```

## Benefits

✅ **Consistency** - Same look and feel everywhere
✅ **Maintainability** - Update ProductCard once, updates everywhere
✅ **Clickability** - All cards properly clickable
✅ **Prices** - Shown consistently
✅ **Discounts** - Applied to all products
✅ **Real Data** - No more emoji placeholders with real products

## Next Steps

1. Update NewScreen to use ProductCard for all products
2. Update SearchScreen to use ProductCard instead of mock data
3. Update HomeScreen to use ProductCard for all product displays
4. Ensure all ProductCard instances receive pricingDiscount prop
5. Remove all custom product rendering functions
6. Test consistency across all screens

