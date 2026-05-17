import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	FlatList,
	Dimensions,
	Image,
	ScrollView,
	ActivityIndicator,
	RefreshControl,
	Alert,
	Animated,
	Easing,
	Linking,
} from 'react-native';
import { Video } from 'expo-av';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import type { NavigationProp } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { useNewArrivals, useProductsByCategory, useForYouProducts, usePricingRuleFields, usePricingRules, useWishlistActions, useWishlist, useCartActions, useDealProducts, useProductBundles, useFlyers, useCategories, useOrders } from '../hooks/erpnext';
import { useUserSession } from '../context/UserContext';
import { ProductCard } from '../components/ProductCard';
import { LoadingScreen } from '../components/LoadingScreen';
import { ProductCardSkeletonList } from '../components/ProductCardSkeletonList';
import { ProductCardSkeletonHorizontal } from '../components/ProductCardSkeletonHorizontal';
import { CategoryTabs } from '../components/CategoryTabs';
import { Header } from '../components/Header';
import { Toast } from '../components/Toast';
import { PriceFilter, SortOption } from '../components/PriceFilter';
import { CartAnimation } from '../components/CartAnimation';
import { getProductDiscount } from '../utils/pricingRules';
import { Product, Order } from '../types';
import { getERPNextClient } from '../services/erpnext';
import { mapERPItemToProduct } from '../services/mappers';
import { collectDescendantItemGroupIds } from '../utils/itemGroup';

const { width } = Dimensions.get('window');

// Mock data for products
const superDeals = [
	{ id: '1', name: 'Grey Long-Sleeve Shirt', price: 'GH₵7.00', discount: '-53%', image: '👔' },
	{ id: '2', name: 'Portable Blender', price: 'GH₵1.70', image: '🥤' },
	{ id: '3', name: 'Black Polo Shirt', price: 'GH₵15.00', image: '👕' },
	{ id: '4', name: 'Sanitary Pad Organizers', price: 'GH₵0.75', image: '👜' },
];

const buy6Get60 = [
	{ id: '1', name: 'Blue Floral Dress', price: 'GH₵23.00', image: '👗' },
	{ id: '2', name: 'Gold Layered Necklace', price: 'GH₵2.00', image: '💍' },
];

const discount10to50 = [
	{ id: '1', name: "Men's Light Blue Outfit", price: 'GH₵15.30', image: '👔' },
	{ id: '2', name: 'Brown Brooklyn Sweatshirt', price: 'GH₵10.01', image: '🧥' },
];

const mainProducts = [
	{ id: '1', name: 'Baseball Caps', price: 'GH₵12.00', image: '🧢', tag: 'Trends' },
	{ id: '2', name: 'Brown Dress and Shirt', price: 'GH₵45.00', image: '👗' },
];

const categories = ['All', 'Women', 'Kids', 'Men', 'Curve', 'Shoes', 'Electronics', 'Jewelry and Accessories', 'Sports', 'Bags', 'Toys', 'Office'];

// Map UI category names to ERPNext item_group names
// You may need to adjust these based on your actual ERPNext item group names
const mapCategoryToItemGroup = (category: string): string | null => {
  const categoryMap: Record<string, string> = {
    'Women': 'Women',
    'Men': 'Men',
    'Kids': 'Kids',
    'Curve': 'Curve',
    'Shoes': 'Shoes',
    'Electronics': 'Electronics',
    'Jewelry and Accessories': 'Jewelry and Accessories',
    'Sports': 'Sports',
    'Bags': 'Bags',
    'Toys': 'Toys',
    'Office': 'Office',
  };
  return category === 'All' ? null : (categoryMap[category] || null);
};
const filterTabs = [
	{ id: '1', name: 'For You', icon: null, active: true },
	{ id: '2', name: 'New In', icon: 'sparkles' },
	{ id: '3', name: 'Deals', icon: 'pricetag' },
	{ id: '4', name: 'Best Sellers', icon: 'trophy' },
];

/** Status labels for recent orders (aligned with OrderHistoryScreen) */
const RECENT_ORDER_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
	pending: { color: Colors.WARNING, label: 'Pending' },
	confirmed: { color: Colors.INFO, label: 'Confirmed' },
	processing: { color: Colors.ELECTRIC_BLUE, label: 'Processing' },
	to_deliver: { color: Colors.INFO, label: 'To deliver' },
	completed: { color: Colors.SUCCESS, label: 'Completed' },
	shipped: { color: Colors.INFO, label: 'Shipped' },
	delivered: { color: Colors.SUCCESS, label: 'Delivered' },
	cancelled: { color: Colors.ERROR, label: 'Canceled' },
	returned: { color: Colors.ERROR, label: 'Returned' },
};

const formatRecentOrderDate = (dateString: string) => {
	if (!dateString) return '';
	try {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	} catch {
		return '';
	}
};

export const HomeScreen: React.FC = () => {
	const insets = useSafeAreaInsets();
	const [resolvedCustomerId, setResolvedCustomerId] = useState('');
	const [selectedCategory, setSelectedCategory] = useState('All');
	const [selectedFilter, setSelectedFilter] = useState('For You');
	const [shouldScrollToFilterTabs, setShouldScrollToFilterTabs] = useState(false);
	const [isScrolledPastFilterTabs, setIsScrolledPastFilterTabs] = useState(false);
	const forYouListRef = useRef<FlatList>(null);
	const mainListRef = useRef<FlatList>(null);
	const navigation = useNavigation<NavigationProp<RootStackParamList>>();
	
	// Handle category selection - switch active tab on homepage
	const handleCategorySelect = useCallback((category: string) => {
		setSelectedCategory(category);
		// Only navigate to CategoryProductsScreen if user wants to see full category page
		// For now, just switch the active tab indicator on homepage
	}, []);
	const { user } = useUserSession();
	useEffect(() => {
		let isMounted = true;
		const resolveCustomer = async () => {
			const sessionCustomerId = user?.user || '';
			if (sessionCustomerId) {
				if (isMounted) setResolvedCustomerId(sessionCustomerId);
				return;
			}
			if (!user?.email) {
				if (isMounted) setResolvedCustomerId('');
				return;
			}
			try {
				const client = getERPNextClient();
				const customer = await client.getCustomerByEmail(user.email);
				if (isMounted) setResolvedCustomerId(customer?.name || '');
			} catch {
				if (isMounted) setResolvedCustomerId('');
			}
		};
		resolveCustomer();
		return () => {
			isMounted = false;
		};
	}, [user?.user, user?.email]);
	const { data: recentOrders = [], loading: recentOrdersLoading } = useOrders(resolvedCustomerId, undefined);
	const { wishlistItems, refresh: refreshWishlist } = useWishlist(user?.email || null);
	const { toggleWishlist } = useWishlistActions(refreshWishlist);
	const { addToCart: addItemToCart } = useCartActions();
	
	// Optimistic state for immediate UI updates
	const [optimisticWishlist, setOptimisticWishlist] = useState<Set<string>>(new Set());
	const [pendingOperations, setPendingOperations] = useState<Set<string>>(new Set());
	
	// Toast state
	const [toastVisible, setToastVisible] = useState(false);
	const [toastMessage, setToastMessage] = useState('');
	const [sortOption, setSortOption] = useState<SortOption>('default');
	
	// Cart animation state
	const [showCartAnimation, setShowCartAnimation] = useState(false);
	const [animationStartPos, setAnimationStartPos] = useState({ x: 0, y: 0 });
	const [animationEndPos, setAnimationEndPos] = useState({ x: 0, y: 0 });
	const [animationProductImage, setAnimationProductImage] = useState<string | undefined>(undefined);
	
	// Debug: Log animation state changes
	useEffect(() => {
		console.log('HomeScreen: Animation state changed', {
			showCartAnimation,
			animationStartPos,
			animationEndPos,
			animationProductImage
		});
	}, [showCartAnimation, animationStartPos, animationEndPos, animationProductImage]);
	
	// Create a Set of wishlisted product IDs for quick lookup
	const wishlistedProductIds = useMemo(() => {
		const baseSet = new Set(wishlistItems.map(item => item.productId));
		// Merge with optimistic updates
		optimisticWishlist.forEach(id => baseSet.add(id));
		return baseSet;
	}, [wishlistItems, optimisticWishlist]);
	
	// Sync optimistic state with actual wishlist when it updates
	// Only sync when not currently performing operations to avoid infinite loops
	const wishlistIdsRef = useRef<string>('');
	const pendingOpsSizeRef = useRef<number>(0);
	
	const currentWishlistIds = useMemo(() => {
		const ids = [...new Set(wishlistItems.map(item => item.productId))].sort();
		return JSON.stringify(ids);
	}, [wishlistItems]);
	
	useEffect(() => {
		// Update refs for comparison
		const currentPendingSize = pendingOperations.size;
		pendingOpsSizeRef.current = currentPendingSize;
		
		if (currentPendingSize > 0) {
			return; // Don't sync while operations are pending
		}
		
		// Only update if the wishlist IDs actually changed
		if (currentWishlistIds === wishlistIdsRef.current) {
			return;
		}
		
		wishlistIdsRef.current = currentWishlistIds;
		
		// Parse IDs from the string to avoid depending on wishlistItems array
		const actualIds = JSON.parse(currentWishlistIds) as string[];
		const actualSet = new Set(actualIds);
		
		setOptimisticWishlist(prev => {
			// Clear optimistic state and sync with actual wishlist
			// This ensures we start fresh after operations complete
			const newSet = new Set(actualSet);
			
			// Only update if there's a change to prevent unnecessary re-renders
			if (newSet.size !== prev.size || Array.from(newSet).some(id => !prev.has(id)) || Array.from(prev).some(id => !newSet.has(id))) {
				return newSet;
			}
			return prev; // Return same reference if no change
		});
	}, [currentWishlistIds, pendingOperations.size]);
	
	// Map category to item group name
	const itemGroupName = mapCategoryToItemGroup(selectedCategory);
	
	// Fetch pricing rule fields (logs all available fields) - Commented out to reduce API calls
	// const { data: pricingRuleFields } = usePricingRuleFields();
	
	// Fetch pricing rules for discounts
	const { data: pricingRules = [], loading: pricingRulesLoading } = usePricingRules();
	
	// Fetch Product Bundles
	const { data: productBundles, loading: bundlesLoading, error: bundlesError } = useProductBundles(10);
	
	// Fetch flyers for carousel
	const { data: flyers, loading: flyersLoading } = useFlyers();
	
	// Fetch categories for category images section
	const { data: allCategories, loading: categoriesLoading } = useCategories();
	
	// Get random 30 categories with images
	const [randomCategories, setRandomCategories] = useState<any[]>([]);
	const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
	const [loadingCategoryImages, setLoadingCategoryImages] = useState(false);
	
	useEffect(() => {
		const fetchCategoryTileImages = async () => {
			if (!allCategories || allCategories.length === 0) return;

			setLoadingCategoryImages(true);
			try {
				const client = getERPNextClient();

				// Home should show only groups (is_group = 1) and exclude "All Items Group".
				const groupedOnly = allCategories.filter((category: any) => {
					const rawIsGroup = category?.isGroup ?? category?.is_group;
					return Number(rawIsGroup) === 1 && category.id !== 'All Items Group' && category.name !== 'All Items Group';
				});
				const selected = groupedOnly.slice(0, 30);

				const resolveItemGroupImage = (categoryRow: any): string | null => {
					const raw = categoryRow?.image;
					if (!raw || String(raw).trim() === '') return null;
					const p = mapERPItemToProduct({
						name: 'ig',
						item_name: 'ig',
						disabled: 0,
						image: raw,
					});
					return p.images?.[0] || null;
				};

				// Thumbnails: random Item.image from Items in this group tree (Item doctype, not Website Item).
				const results = await Promise.all(
					selected.map(async (category: any) => {
						try {
							const groupIds = collectDescendantItemGroupIds(category.id, allCategories);
							const items = await client.getRawItemsByGroups(groupIds, 200);
							const withImages = items.filter(
								(row: any) => row.image && String(row.image).trim() !== ''
							);
							if (withImages.length > 0) {
								const pick = withImages[Math.floor(Math.random() * withImages.length)];
								const product = mapERPItemToProduct(pick);
								if (product.images?.[0]) {
									return { id: category.id, uri: product.images[0] };
								}
							}
							const fallback = resolveItemGroupImage(category);
							return { id: category.id, uri: fallback };
						} catch {
							const fallback = resolveItemGroupImage(category);
							return { id: category.id, uri: fallback };
						}
					})
				);

				const images: Record<string, string> = {};
				for (const r of results) {
					if (r.uri) images[r.id] = r.uri;
				}

				setRandomCategories(selected);
				setCategoryImages(images);
			} catch (error) {
				console.error('Error fetching category images from Items:', error);
			} finally {
				setLoadingCategoryImages(false);
			}
		};

		fetchCategoryTileImages();
	}, [allCategories]);
	
	
	// Log pricing rule fields when available - Commented out to reduce API calls
	// useEffect(() => {
	// 	if (pricingRuleFields) {
	// 		console.log('💰 PRICING RULE FIELDS:', pricingRuleFields);
	// 	}
	// }, [pricingRuleFields]);
	
	// Log pricing rules when available
	useEffect(() => {
		if (pricingRules && pricingRules.length > 0) {
			console.log('💰 PRICING RULES FETCHED:', pricingRules.length, 'rules');
			pricingRules.slice(0, 3).forEach((rule: any) => {
				console.log(`  - ${rule.name}: ${rule.discount_percentage}% (${rule.item_code || rule.item_group})`);
				// Log all keys to see what fields are available
				console.log(`  📋 Available fields in ${rule.name}:`, Object.keys(rule));
				// Specifically check for custom_flyer
				if (rule.custom_flyer !== undefined) {
					console.log(`  🖼️ custom_flyer found in ${rule.name}:`, rule.custom_flyer);
				} else {
					console.log(`  ⚠️ custom_flyer NOT found in ${rule.name}`);
				}
			});
		}
	}, [pricingRules]);
	
	// Fetch new arrivals from API with infinite scroll
	const { 
		products: newArrivals, 
		loading: newArrivalsLoading, 
		loadingMore: newArrivalsLoadingMore,
		error: newArrivalsError, 
		hasMore: newArrivalsHasMore,
		loadMore: newArrivalsLoadMore,
		refresh: refreshNewArrivals
	} = useNewArrivals(20);
	
	// Fetch products by category when a category is selected (not "All")
	// Convert sortOption to server-side sorting parameter
	const sortByPrice = sortOption === 'lowToHigh' ? 'asc' : sortOption === 'highToLow' ? 'desc' : undefined;
	const { data: categoryProducts, loading: categoryLoading, error: categoryError, refresh: refreshCategoryProducts } = useProductsByCategory(
		itemGroupName || '',
		itemGroupName ? 50 : 0, // Only fetch if category is selected
		sortByPrice
	);
	
	// Fetch "For You" products with infinite scroll
	const { 
		products: forYouProducts, 
		loading: forYouLoading, 
		loadingMore: forYouLoadingMore,
		error: forYouError, 
		hasMore: forYouHasMore,
		loadMore: forYouLoadMore,
		refresh: refreshForYouProducts
	} = useForYouProducts(20);
	
	// No client-side sorting needed for category products - server-side sorting is already applied
	const sortedCategoryProducts = useMemo(() => {
		return categoryProducts || [];
	}, [categoryProducts]);
	
	// Sort "For You" products by price (client-side for now, can be updated later)
	const sortedForYouProducts = useMemo(() => {
		if (!forYouProducts || forYouProducts.length === 0) return [];
		
		const sorted = [...forYouProducts];
		switch (sortOption) {
			case 'lowToHigh':
				return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
			case 'highToLow':
				return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
			default:
				return sorted;
		}
	}, [forYouProducts, sortOption]);
	
	// Pull-to-refresh state
	const [refreshing, setRefreshing] = useState(false);
	
	// Handle pull-to-refresh - reload the entire page
	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			// Just refresh the data without navigation
			// The page will reload automatically via the hook
			await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for UX
		} catch (error) {
			console.error('Error refreshing data:', error);
		} finally {
			setRefreshing(false);
		}
	}, []);
	
	// Products to display - only show when a specific category is selected
	const displayedProducts = selectedCategory === 'All' 
		? [] 
		: (categoryProducts || []);
	
	const isLoadingProducts = categoryLoading;
	const productsError = categoryError;

	// Fetch products grouped by pricing rules (for Super Deals section)
	const [productsByRule, setProductsByRule] = useState<Record<string, any[]>>({});
	const [allDealProducts, setAllDealProducts] = useState<any[]>([]);
	const [loadingDeals, setLoadingDeals] = useState(false);
	
	// State for infinite scroll deals
	const [dealProducts, setDealProducts] = useState<any[]>([]);
	const [dealProductsOffset, setDealProductsOffset] = useState(0);
	const [dealProductsLoadingMore, setDealProductsLoadingMore] = useState(false);
	const dealPageSize = 20;
	
	// Check if page is initially loading (fresh load - no data loaded yet)
	const isInitialLoading = (!newArrivals && newArrivalsLoading) && 
		(!pricingRules || pricingRules.length === 0);

	useEffect(() => {
		let isMounted = true;
		let abortController = new AbortController();
		
		const fetchDealProducts = async () => {
			if (!pricingRules || pricingRules.length === 0) {
				if (isMounted) {
					setProductsByRule({});
					setAllDealProducts([]);
					setDealProducts([]);
					setDealProductsOffset(0);
				}
				return;
			}

			if (isMounted) {
				setLoadingDeals(true);
			}
			
			try {
				const client = getERPNextClient();
				const productsByRuleMap: Record<string, any[]> = {};
				const allProducts: any[] = [];

				// Limit processing to prevent too many API calls and improve performance
				const MAX_RULES = 5;
				const MAX_ITEMS_PER_RULE = 10;
				const MAX_GROUPS_PER_RULE = 2;
				const MAX_ITEMS_PER_GROUP = 20;

				// Extract item codes and item groups from pricing rules (limit rules)
				for (const rule of pricingRules.slice(0, MAX_RULES)) {
					const ruleAny = rule as any;
					const ruleName = rule.name || ruleAny.name || 'Unknown';
					const ruleProducts: any[] = [];
					
					// Fetch products by item codes - limit items and batch fetch
					if (ruleAny.items && Array.isArray(ruleAny.items)) {
						const limitedItems = ruleAny.items.slice(0, MAX_ITEMS_PER_RULE);
						const itemCodes = limitedItems
							.filter((item: any) => item && item.item_code)
							.map((item: any) => item.item_code);
						
						// Fetch items in parallel (but limited)
						const itemPromises = itemCodes.map(async (itemCode: string) => {
							try {
								const websiteItem = await client.getItem(itemCode);
								if (websiteItem) {
									const product = mapERPItemToProduct(websiteItem);
									const calculatedDiscount = getProductDiscount(product, pricingRules);
									const ruleDiscount = ruleAny.discount_percentage || 0;
									const discount = calculatedDiscount > 0 ? calculatedDiscount : ruleDiscount;
									
									if (discount > 0 || ruleDiscount > 0) {
										return {
											...product,
											discount: discount > 0 ? discount : ruleDiscount,
											ruleName
										};
									}
								}
							} catch (error: any) {
								if (error?.message && !error.message.includes('not found') && !error.message.includes('DoesNotExistError')) {
									console.warn(`Failed to fetch product ${itemCode}:`, error.message);
								}
							}
							return null;
						});
						
						const fetchedProducts = await Promise.all(itemPromises);
						const validProducts = fetchedProducts.filter((p): p is any => p !== null);
						ruleProducts.push(...validProducts);
						allProducts.push(...validProducts);
					}

					// Fetch products by item groups - limit groups and items
					if (ruleAny.item_groups && Array.isArray(ruleAny.item_groups)) {
						const limitedGroups = ruleAny.item_groups.slice(0, MAX_GROUPS_PER_RULE);
						for (const itemGroup of limitedGroups) {
							if (itemGroup && itemGroup.item_group) {
								try {
									const websiteItems = await client.getItemsByGroup(itemGroup.item_group, MAX_ITEMS_PER_GROUP);
									const products = websiteItems.map((item: any) => {
										const product = mapERPItemToProduct(item);
										const discount = getProductDiscount(product, pricingRules);
										return {
											...product,
											discount,
											ruleName
										};
									}).filter((p: any) => p.discount > 0);
									ruleProducts.push(...products);
									allProducts.push(...products);
								} catch (error) {
									console.warn(`Failed to fetch products for group ${itemGroup.item_group}:`, error);
								}
							}
						}
					}

					if (ruleProducts.length > 0) {
						// Remove duplicates within this rule and sort by discount
						const uniqueRuleProducts = Array.from(
							new Map(ruleProducts.map((p: any) => [p.id, p])).values()
						).sort((a: any, b: any) => b.discount - a.discount);
						
						productsByRuleMap[ruleName] = uniqueRuleProducts;
					}
				}

				// Remove duplicates from all products
				const uniqueAllProducts = Array.from(
					new Map(allProducts.map((p: any) => [p.id, p])).values()
				);
				
				// Shuffle to mix products from different pricing rules
				const shuffledProducts = [...uniqueAllProducts];
				for (let i = shuffledProducts.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[shuffledProducts[i], shuffledProducts[j]] = [shuffledProducts[j], shuffledProducts[i]];
				}

				if (isMounted) {
					setProductsByRule(productsByRuleMap);
					setAllDealProducts(shuffledProducts);
					
					// Initialize deal products for infinite scroll (first page)
					setDealProducts(shuffledProducts.slice(0, dealPageSize));
					setDealProductsOffset(dealPageSize);
				}
			} catch (error) {
				if (isMounted && error instanceof Error && !error.message.includes('aborted')) {
					console.error('Error fetching deal products:', error);
				}
				if (isMounted) {
					setProductsByRule({});
					setAllDealProducts([]);
					setDealProducts([]);
					setDealProductsOffset(0);
				}
			} finally {
				if (isMounted) {
					setLoadingDeals(false);
				}
			}
		};

		fetchDealProducts();
	}, [pricingRules]);
	
	// Load more deal products for infinite scroll
	const loadMoreDealProducts = useCallback(() => {
		if (dealProductsLoadingMore || dealProductsOffset >= allDealProducts.length) {
			return;
		}
		
		setDealProductsLoadingMore(true);
		
		// Simulate async load (in case we need to fetch more later)
		setTimeout(() => {
			const nextProducts = allDealProducts.slice(dealProductsOffset, dealProductsOffset + dealPageSize);
			setDealProducts((prev) => [...prev, ...nextProducts]);
			setDealProductsOffset((prev) => prev + dealPageSize);
			setDealProductsLoadingMore(false);
		}, 100);
	}, [dealProductsLoadingMore, dealProductsOffset, allDealProducts.length, dealPageSize]);
	
	const dealProductsHasMore = dealProductsOffset < allDealProducts.length;
	const dealProductsError: Error | null = null; // No error state needed since we use cached data

	// Track when user switches from "For You" to another filter
	const prevFilterRef = useRef(selectedFilter);
	const wasForYouRef = useRef(false);
	
	// Track if we're transitioning from "For You" to another filter
	useEffect(() => {
		if (selectedFilter === 'For You') {
			wasForYouRef.current = true;
		} else if (wasForYouRef.current && selectedFilter !== 'For You' && selectedCategory === 'All') {
			// We just switched from "For You" to another filter
			setShouldScrollToFilterTabs(true);
			wasForYouRef.current = false;
		}
		prevFilterRef.current = selectedFilter;
	}, [selectedFilter, selectedCategory]);
	
	// Use a stable key that doesn't change when filter changes (only when category changes)
	// This prevents the list from remounting unnecessarily
	const mainListKey = useMemo(() => `main-list-${selectedCategory}`, [selectedCategory]);

	// Generate dynamic sections based on pricing rules
	const pricingRuleSections = useMemo(() => {
		if (!pricingRules || pricingRules.length === 0) {
			return [];
		}
		return pricingRules.map((rule: any) => {
			const discount = rule.discount_percentage || 0;
			let title = rule.title || `${discount}% Off`;
			
			// Make title more descriptive based on what the rule applies to
			// For item_groups: show percentage and group name
			// For item_codes: show only percentage (no item names)
			if (rule.item_groups && rule.item_groups.length > 0) {
				const groupNames = rule.item_groups.map((ig: any) => ig.item_group).filter(Boolean).join(', ');
				if (groupNames) {
					title = `${discount}% Off - ${groupNames}`;
				}
			} else if (rule.items && rule.items.length > 0) {
				// For item codes, just show the percentage
				title = `${discount}% Off`;
			}
			
			return {
				type: 'pricingRule',
				id: rule.name || rule.id || `rule-${Math.random()}`,
				ruleName: rule.name,
				ruleTitle: title,
				discountPercent: discount
			};
		});
	}, [pricingRules]);

	// Show full homepage when "All" is selected, otherwise only header and tabs
	// Filter sections based on selectedFilter
	// IMPORTANT: Always include all sections to prevent remounting, but conditionally render content
	const getSections = (): Array<{ type: string; id: string; ruleName?: string; ruleTitle?: string; discountPercent?: number }> => {
		const baseSections: Array<{ type: string; id: string; ruleName?: string; ruleTitle?: string; discountPercent?: number }> = [
			{ type: 'flyerCarousel', id: 'flyerCarousel' },
			{ type: 'categoryImages', id: 'categoryImages' },
			{ type: 'recentOrders', id: 'recentOrders' },
		];
		
		return baseSections;
	};
	
	const sections = getSections();

	// Find the index of filterTabs section for sticky header
	const filterTabsIndex = sections.findIndex(s => s.id === 'filterTabs');
	const stickyHeaderIndices = filterTabsIndex >= 0 ? [filterTabsIndex] : [];

	// Store section layout positions to scroll directly to them
	const sectionLayouts = useRef<{ [key: string]: number }>({});
	const filterTabsLayoutRef = useRef<View>(null);
	const mainProductsLayoutRef = useRef<View>(null);

	// Reset scroll flag when filter changes away from "For You"
	useEffect(() => {
		if (selectedFilter !== 'For You' && prevFilterRef.current === 'For You') {
			// Flag is set in renderFilterTabs onPress, layout handler will scroll
		}
		prevFilterRef.current = selectedFilter;
	}, [selectedFilter]);

	const bannerScrollRef = useRef<ScrollView>(null);
	const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
	const flyerCarouselRef = useRef<ScrollView>(null);
	const [currentFlyerIndex, setCurrentFlyerIndex] = useState(0);
	const [isScrolledPastCarousel, setIsScrolledPastCarousel] = useState(false);
	
	// Animated values for header transitions (all non-native to avoid conflicts)
	const headerOpacity = useRef(new Animated.Value(0)).current;
	const headerBorderRadius = useRef(new Animated.Value(0)).current;
	const headerShadowOpacity = useRef(new Animated.Value(0)).current;
	
	// Initialize header animation state
	useEffect(() => {
		if (isScrolledPastCarousel) {
			headerOpacity.setValue(1);
			headerBorderRadius.setValue(20);
			headerShadowOpacity.setValue(0.15);
		}
	}, []); // Only run on mount

	// Extract custom_flyer images from pricing rules
	const flyerMedia = useMemo(() => {
		if (!flyers || flyers.length === 0) {
			console.log('🖼️ No flyers available for carousel');
			return [];
		}
		
		const media: Array<{type: 'image' | 'video', uri: string}> = [];
		
	flyers.forEach((flyer: any) => {
			if (flyer.image && flyer.image.trim()) {
				let formattedUrl = flyer.image.trim();
				
				// Detect Frappe Cloud URL and make public
				if (formattedUrl.includes('frappe.cloud/private/files/')) {
					formattedUrl = formattedUrl.replace('frappe.cloud/private/files/', 'frappe.cloud/files/');
				} else if (formattedUrl.includes('/private/files/')) {
					formattedUrl = formattedUrl.replace('/private/files/', '/files/');
				}
				
				// Remove %20 spaces for cleaner URL (Frappe handles it)
				formattedUrl = formattedUrl.replace(/%20/g, ' ');
				
				// Detect video vs image
				const lowerUrl = formattedUrl.toLowerCase();
				const isVideo = /\.(mp4|webm|mov|avi|tmp)$/i.test(lowerUrl);
				const type = isVideo ? 'video' : 'image';
				
				// Add full server URL
				const fullUrl = formattedUrl.startsWith('http') ? formattedUrl : `https://sourcewave.frappe.cloud${formattedUrl.startsWith('/') ? formattedUrl : '/' + formattedUrl}`;
				
				media.push({ type, uri: fullUrl });
				console.log(`✅ Added ${type} to carousel: "${flyer.flyer_name || 'N/A'}" → ${fullUrl}`);
			}
		});
		
		console.log(`🖼️ Extracted ${media.length} flyer media items from Flyer doctype`);
		return media;
	}, [flyers]);

	// Auto-scroll flyer carousel
	useEffect(() => {
		if (flyerMedia.length <= 1) return;

		let videoTimeouts: NodeJS.Timeout[] = [];
		
		const advanceCarousel = () => {
			setCurrentFlyerIndex((prevIndex) => {
				const nextIndex = (prevIndex + 1) % flyerMedia.length;
				flyerCarouselRef.current?.scrollTo({
					x: nextIndex * width,
					animated: true,
				});
				return nextIndex;
			});
		};

		const setupVideoListeners = () => {
			videoTimeouts.forEach(clearTimeout);
			videoTimeouts = [];
			
			flyerMedia.forEach((item, index) => {
				if (item.type === 'video') {
					// Advance after 15s max for videos
					const timeoutId = setTimeout(advanceCarousel, 15000);
					videoTimeouts.push(timeoutId);
				}
			});
		};

		setupVideoListeners();
		
		const interval = setInterval(() => {
			advanceCarousel();
			setupVideoListeners();
		}, 8000); // Images advance every 8s

		return () => {
			clearInterval(interval);
			videoTimeouts.forEach(clearTimeout);
		};
	}, [flyerMedia]);

	const renderHeader = () => {
		const backgroundColor = headerOpacity.interpolate({
			inputRange: [0, 1],
			outputRange: ['rgba(255, 255, 255, 0)', Colors.WINE],
		});
		
		const shadowOpacity = headerShadowOpacity.interpolate({
			inputRange: [0, 1],
			outputRange: [0, 0.15],
		});
		
		return (
			<Animated.View 
				style={[
					styles.stickyHeaderWrapper, 
					{ 
						paddingTop: insets.top - Spacing.PADDING_MD,
						backgroundColor,
						shadowOpacity,
					},
					isScrolledPastCarousel && styles.stickyHeaderWrapperScrolled
				]}
			>
				<View style={styles.headerContentWrapper}>
					<Header 
						onCalendarPress={() => {
							if (productBundles && productBundles.length > 0) {
								(navigation as any).navigate('ProductBundles');
							}
						}}
						customPaddingTop={Spacing.PADDING_LG + 5}
						isScrolled={isScrolledPastCarousel}
					/>
				</View>
			</Animated.View>
		);
	};

	const renderCategoryTabsOverlay = () => {
		// Calculate header height when scrolled:
		// stickyHeaderWrapper paddingTop: insets.top - 16
		// Header customPaddingTop: 24 + 5 = 29
		// Header content (search bar + icons): ~42px
		// Header paddingBottom: 8
		// Total: insets.top - 16 + 29 + 42 + 8 = insets.top + 63
		const headerHeight = isScrolledPastCarousel 
			? Math.max(insets.top - Spacing.PADDING_MD, 0) + (Spacing.PADDING_LG + 5) + 42 + Spacing.PADDING_SM
			: 100;
		
		return (
			<View style={[
				styles.categoryTabsOverlay,
				isScrolledPastCarousel && [
					styles.categoryTabsOverlayScrolled,
					{ 
						top: headerHeight,
						borderBottomLeftRadius: 20,
						borderBottomRightRadius: 20,
					}
				]
			]}>
				<View style={styles.categoryTabsContentWrapper}>
					<CategoryTabs 
						selectedCategory={selectedCategory}
						onSelectCategory={handleCategorySelect}
						variant="red"
						showMenuIcon={true}
						isScrolled={isScrolledPastCarousel}
					/>
				</View>
			</View>
		);
	};

	const renderFlyerCarousel = () => {
		if (flyerMedia.length === 0) {
			// Show a placeholder or default image if no flyers
			return (
				<View style={styles.flyerCarouselContainer}>
					<View style={styles.flyerImageContainer}>
						<View style={styles.flyerPlaceholder}>
							<Ionicons name="image-outline" size={48} color={Colors.TEXT_SECONDARY} />
						</View>
					</View>
					<View style={styles.carouselOverlay} />
				</View>
			);
		}

		return (
			<View style={styles.flyerCarouselContainer}>
		<ScrollView
			ref={flyerCarouselRef}
			horizontal
			pagingEnabled
			showsHorizontalScrollIndicator={true}
			scrollEventThrottle={16}
			decelerationRate="fast"
			onMomentumScrollEnd={(event) => {
				const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
				setCurrentFlyerIndex(newIndex);
			}}
			nestedScrollEnabled={true}
		>
					{flyerMedia.map((item: any, index: number) => (
						<View key={index} style={styles.flyerImageContainer}>
							{item.type === 'video' ? (
								<Video
									source={{ uri: item.uri }}
									style={styles.flyerImage}
									shouldPlay
									isLooping={false}
									useNativeControls={false}
									onError={(error: any) => {
										console.error(`🎬 Error loading flyer video ${index}:`, item.uri, error);
									}}
									onLoad={() => {
										console.log(`🎬 Successfully loaded flyer video ${index}:`, item.uri);
									}}
									onPlaybackStatusUpdate={(status: any) => {
										if (status.didJustFinish) {
											console.log(`🎬 Video ${index} finished, moving to next slide`);
											// Move to next slide when video ends
											const nextIndex = (index + 1) % flyerMedia.length;
											setCurrentFlyerIndex(nextIndex);
											flyerCarouselRef.current?.scrollTo({
												x: nextIndex * width,
												animated: true,
											});
										}
									}}
								/>
							) : (
								<View style={styles.flyerImageWrapper}>
									<Image
										source={{ uri: item.uri }}
										style={styles.flyerImage}
										resizeMode="cover"
										onError={(error: any) => {
											console.error(`🖼️ Error loading flyer image ${index}:`, item.uri, error.nativeEvent.error);
										}}
										onLoad={() => {
											console.log(`🖼️ Successfully loaded flyer image ${index}:`, item.uri);
										}}
									/>
								</View>
							)}
						</View>
					))}
				</ScrollView>
				{/* Thin black overlay on carousel */}
				<View style={styles.carouselOverlay} />
				{flyerMedia.length > 1 && (
					<View style={styles.flyerIndicators}>
						{flyerMedia.map((_: any, index: number) => (
							<View
								key={index}
								style={[
									styles.flyerIndicator,
									index === currentFlyerIndex && styles.flyerIndicatorActive,
								]}
							/>
						))}
					</View>
				)}
			</View>
		);
	};

	// Calculate banner count for auto-scroll
	const latestRule = pricingRules && pricingRules.length > 0 ? pricingRules[0] : null;
	const discountPercent = latestRule?.discount_percentage || (latestRule as any)?.discount_percentage || 0;
	const showDiscountBanner = discountPercent > 0 || allDealProducts.length > 0;
	const bannerCount = showDiscountBanner ? 1 : 0;

	// Auto-scroll effect
	useEffect(() => {
		if (bannerCount <= 1) return; // No need to scroll if only one banner

		const interval = setInterval(() => {
			setCurrentBannerIndex((prevIndex) => {
				const nextIndex = (prevIndex + 1) % bannerCount;
				bannerScrollRef.current?.scrollTo({
					x: nextIndex * width,
					animated: true,
				});
				return nextIndex;
			});
		}, 3000); // Change banner every 3 seconds

		return () => clearInterval(interval);
	}, [bannerCount]);

	const renderShippingBanner = () => {
		// Get month name
		const getMonthName = (monthNum: string) => {
			const months = ['January', 'February', 'March', 'April', 'May', 'June', 
				'July', 'August', 'September', 'October', 'November', 'December'];
			const monthIndex = parseInt(monthNum) - 1;
			return months[monthIndex] || monthNum;
		};
		
		return (
			<View style={styles.shippingBannersContainer}>
				{/* Free Shipping Banner */}
				<View style={styles.shippingBannerContainer}>
					<View style={styles.shippingBanner}>
						<View style={styles.shippingBannerContent}>
							<Text style={styles.shippingText}>Free Shipping</Text>
							<Text style={styles.shippingSubtext}>On orders of $50.00+</Text>
						</View>
						<Ionicons name="car-outline" size={18} color={Colors.WHITE} />
					</View>
				</View>
				
			</View>
		);
	};
	
	const getCategoryBadgeColor = (id: string) => {
		// China-themed color palette: Reds, Golds, and accents
		const palette = ['#E60012', '#FF6B6B', '#FFD700', '#FFE082', '#FF8C00', '#DC143C', '#FF4500', '#F0E68C'];
		let hash = 0;
		for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
		return palette[Math.abs(hash) % palette.length];
	};

	const getCategoryIcon = (categoryName: string): keyof typeof Ionicons.glyphMap => {
		// Map category names to specific icons
		const name = categoryName.toLowerCase();
		
		if (name.includes('fashion') || name.includes('clothing') || name.includes('apparel')) return 'shirt-outline';
		if (name.includes('shoe') || name.includes('footwear')) return 'foot-outline';
		if (name.includes('electronic') || name.includes('phone') || name.includes('gadget')) return 'phone-portrait-outline';
		if (name.includes('beauty') || name.includes('cosmetic') || name.includes('makeup')) return 'sparkles-outline';
		if (name.includes('home') || name.includes('furniture') || name.includes('decor')) return 'home-outline';
		if (name.includes('sport') || name.includes('fitness') || name.includes('gym')) return 'fitness-outline';
		if (name.includes('book') || name.includes('office') || name.includes('stationery')) return 'book-outline';
		if (name.includes('toy') || name.includes('game') || name.includes('baby')) return 'game-controller-outline';
		if (name.includes('car') || name.includes('auto') || name.includes('vehicle')) return 'car-outline';
		if (name.includes('food') || name.includes('grocery') || name.includes('kitchen')) return 'fast-food-outline';
		if (name.includes('health') || name.includes('medical') || name.includes('pharmacy')) return 'medkit-outline';
		if (name.includes('pet') || name.includes('animal')) return 'paw-outline';
		if (name.includes('jewelry') || name.includes('watch') || name.includes('accessories')) return 'diamond-outline';
		if (name.includes('plant') || name.includes('garden') || name.includes('outdoor')) return 'leaf-outline';
		if (name.includes('tool') || name.includes('hardware')) return 'hammer-outline';
		
		// Default icon
		return 'layers-outline';
	};

	const renderCategoryImages = () => {
		return (
			<View style={styles.modernCategorySection}>
				<View style={styles.modernCategoryHeader}>
					<Text style={styles.modernCategoryTitle}>What is Sourcewave?</Text>
				</View>

				<View style={styles.sourcewaveExplainCard}>
					<Text style={styles.sourcewaveExplainBody}>
						Sourcewave connects you to global suppliers, submit custom requests, and manage
						orders seamlessly in one unified workflow.
					</Text>
					<View style={styles.sourcewavePointRow}>
						<View style={styles.sourcewaveDot} />
						<Text style={styles.sourcewavePointText}>Request products from trusted suppliers</Text>
					</View>
					<View style={styles.sourcewavePointRow}>
						<View style={styles.sourcewaveDot} />
						<Text style={styles.sourcewavePointText}>Track quotations, orders, and delivery status</Text>
					</View>
					<View style={styles.sourcewavePointRow}>
						<View style={styles.sourcewaveDot} />
						<Text style={styles.sourcewavePointText}>Reorder quickly and scale your inventory flow</Text>
					</View>
				</View>
			</View>
		);
	};

	const renderSuperDeals = () => {
		const firstTenDeals = allDealProducts.slice(0, 10);
		
		if (loadingDeals) {
			return null; // Don't show anything while loading deals
		}

		if (firstTenDeals.length === 0) {
			return null;
		}

		// Calculate average discount percentage for display
		const discounts = firstTenDeals
			.map(item => item.discount || 0)
			.filter(d => d > 0);
		const avgDiscount = discounts.length > 0
			? Math.round(discounts.reduce((a, b) => a + b, 0) / discounts.length)
			: 20; // Default to 20% if no discounts

		return (
		<View style={styles.section}>
			<View style={styles.superDealsTitleContainer}>
				<View style={styles.superDealsTitleLeft}>
				<Ionicons name="flash" size={12} color={Colors.WHITE} />
					<Text style={styles.superDealsTitle}>Super Deals</Text>
				</View>
				<TouchableOpacity 
					onPress={() => {
						navigation.navigate('PricingRules');
					}}
				>
					<Text style={styles.superDealsSaveText}>Save big now! {'>'}</Text>
				</TouchableOpacity>
			</View>
			{allDealProducts.length > 0 && (
				<FlatList
					data={firstTenDeals}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.productsList}
					renderItem={({ item }: { item: any }) => (
						<TouchableOpacity 
							style={styles.productCard}
							onPress={() => (navigation as any).navigate('ProductDetails', { productId: item.id })}
						>
							<View style={styles.productImage}>
								{item.images && item.images.length > 0 && item.images[0] ? (
									<Image 
										source={{ uri: item.images[0] }} 
										style={styles.productImageContent}
										resizeMode="cover"
									/>
								) : (
									<View style={styles.productImagePlaceholder}>
										<Ionicons name="image-outline" size={24} color={Colors.TEXT_SECONDARY} />
									</View>
								)}
								{item.discount > 0 && (
									<View style={styles.flashSaleTag}>
										<Text style={styles.flashSaleText}>Flash Sale</Text>
									</View>
								)}
							</View>
							<Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
							<View style={styles.priceRow}>
								<Text style={styles.productPrice} numberOfLines={1} ellipsizeMode="tail">GH₵{(item.price * (1 - (item.discount || 0) / 100)).toFixed(2)}</Text>
								{(item.discount || 0) > 0 && (
									<Text style={styles.originalPrice} numberOfLines={1} ellipsizeMode="tail">GH₵{item.price.toFixed(2)}</Text>
								)}
							</View>
						</TouchableOpacity>
					)}
					keyExtractor={(item) => item.id}
				/>
			)}
		</View>
	);
	};

	// Render dynamic deal section for a pricing rule
	const renderDealSection = (ruleName: string, ruleTitle: string, discountPercent: number) => {
		const ruleProducts = productsByRule[ruleName] || [];
		const firstFive = ruleProducts.slice(0, 5);

		if (loadingDeals) {
			return null; // Don't show anything while loading deals
		}

		if (firstFive.length === 0) {
			return null;
		}

		return (
		<View style={styles.section}>
			<View style={styles.sectionHeader}>
				<TouchableOpacity 
					style={styles.sectionTitleContainer}
					onPress={() => {
						(navigation as any).navigate('PricingRules', { ruleName });
					}}
					activeOpacity={0.7}
				>
					<View>
						<Text style={styles.sectionTitle}>{ruleTitle}</Text>
						<Text style={styles.sectionSubtitle}>{discountPercent}% off</Text>
					</View>
				</TouchableOpacity>
				{ruleProducts.length > 5 && (
					<TouchableOpacity 
						onPress={() => {
							const dealsToNavigate = Array.isArray(ruleProducts) ? ruleProducts : [];
							(navigation as any).navigate('AllDeals', { deals: dealsToNavigate });
						}}
						activeOpacity={0.7}
					>
						<Text style={styles.viewMoreText}>View more {'>'}</Text>
					</TouchableOpacity>
				)}
			</View>
			<FlatList
					data={firstFive}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.productsList}
					renderItem={({ item }: { item: any }) => (
						<TouchableOpacity 
							style={styles.productCard}
							onPress={() => (navigation as any).navigate('ProductDetails', { productId: item.id })}
						>
						<View style={styles.productImage}>
								{item.images && item.images.length > 0 && item.images[0] ? (
									<Image 
										source={{ uri: item.images[0] }} 
										style={styles.productImageContent}
										resizeMode="cover"
									/>
								) : (
									<View style={styles.productImagePlaceholder}>
										<Ionicons name="image-outline" size={24} color={Colors.TEXT_SECONDARY} />
						</View>
								)}
								{item.discount > 0 && (
									<View style={styles.discountTag}>
										<Text style={styles.discountText}>-{Math.round(item.discount)}%</Text>
					</View>
				)}
		</View>
							<Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
							<View style={styles.priceRow}>
								<Text style={styles.productPrice} numberOfLines={1} ellipsizeMode="tail">GH₵{(item.price * (1 - item.discount / 100)).toFixed(2)}</Text>
								{item.discount > 0 && (
									<Text style={styles.originalPrice} numberOfLines={1} ellipsizeMode="tail">GH₵{item.price.toFixed(2)}</Text>
								)}
				</View>
						</TouchableOpacity>
				)}
				keyExtractor={(item) => item.id}
			/>
		</View>
	);
	};

	const renderFilterTabs = () => {
		return (
		<View 
			ref={filterTabsLayoutRef}
				style={[
					styles.filterTabs,
					styles.filterTabsNormal, // Apply margin only when not sticky
					isScrolledPastFilterTabs && { opacity: 0 } // Hide when sticky overlay is shown
				]}
			onLayout={(e) => {
				const { y } = e.nativeEvent.layout;
				sectionLayouts.current['filterTabs'] = y;
			}}
		>
				{filterTabs.map((tab) => {
					if (!tab.name) return null;
					return (
				<TouchableOpacity
					key={tab.id}
					style={[
						styles.filterTab,
						selectedFilter === tab.name && styles.filterTabActive
					]}
					onPress={() => {
						// If switching from "For You" to another filter, set flag to scroll
						if (selectedFilter === 'For You' && tab.name !== 'For You' && selectedCategory === 'All') {
							setShouldScrollToFilterTabs(true);
						}
						setSelectedFilter(tab.name);
					}}
				>
					{tab.icon && (
						<Ionicons 
							name={tab.icon as any} 
							size={16} 
							color={selectedFilter === tab.name ? Colors.WHITE : Colors.BLACK} 
						/>
					)}
					<Text style={[
						styles.filterTabText,
						selectedFilter === tab.name && styles.filterTabTextActive
					]}>
						{tab.name}
					</Text>
				</TouchableOpacity>
					);
				})}
		</View>
	);
	};


	// Memoized renderItem for "New In" products (New Arrivals)
	const renderNewInItem = useCallback(({ item, index }: { item: any; index: number }) => {
		const isLeftColumn = index % 2 === 0;
		const row = Math.floor(index / 2);
		const patterns = [
			['tall', 'short'],
			['medium', 'tall'],
			['short', 'medium'],
			['tall', 'short'],
			['medium', 'tall'],
		];
		const patternIndex = row % patterns.length;
		const variant = (isLeftColumn 
			? patterns[patternIndex][0] 
			: patterns[patternIndex][1]
		) as 'tall' | 'medium' | 'short';
		
		// Get discount from pricing rules
		const discount = getProductDiscount(item, pricingRules);
		
		return (
						<ProductCard
							product={item}
							onPress={(productId) => {
								(navigation as any).navigate('ProductDetails', { productId });
							}}
				onCartPress={async (productId, animationData) => {
					if (!user?.email) {
						Alert.alert('Login Required', 'Please log in to add items to your cart.');
						return;
					}
					
					try {
						const itemCode = item.itemCode || productId;
						const success = await addItemToCart(itemCode, 1);
						if (success) {
							// Trigger animation if data is available
							if (animationData) {
								const endX = width - 60; // Approx position of cart icon
								const endY = 50; // Approx position of cart icon
								setAnimationStartPos(animationData.startPos);
								setAnimationEndPos({ x: endX, y: endY });
								setAnimationProductImage(animationData.productImage);
								setShowCartAnimation(true);
							} else {
								setToastMessage('Item added to cart!');
								setToastVisible(true);
							}
						}
					} catch (error) {
						console.error('Error adding to cart:', error);
						Alert.alert('Error', 'Failed to add item to cart. Please try again.');
					}
				}}
				onWishlistPress={async (productId) => {
					// Prevent multiple simultaneous operations on the same item
					if (pendingOperations.has(productId)) {
						return;
					}
					
					const isWishlisted = wishlistedProductIds.has(productId);
					
					// Mark operation as pending
					setPendingOperations(prev => new Set(prev).add(productId));
					
					// Optimistic update - immediately update UI
					setOptimisticWishlist(prev => {
						const newSet = new Set(prev);
						if (isWishlisted) {
							newSet.delete(productId);
						} else {
							newSet.add(productId);
						}
						return newSet;
					});
					
					try {
						const success = await toggleWishlist(productId, isWishlisted);
						if (!success) {
							// Revert optimistic update on failure
							setOptimisticWishlist(prev => {
								const newSet = new Set(prev);
								if (isWishlisted) {
									newSet.add(productId); // Re-add if removal failed
								} else {
									newSet.delete(productId); // Remove if add failed
								}
								return newSet;
							});
						}
						// refreshWishlist is called automatically by useWishlistActions
					} finally {
						// Remove from pending immediately after operation completes
						// This allows immediate toggling back and forth
						setPendingOperations(prev => {
							const newSet = new Set(prev);
							newSet.delete(productId);
							return newSet;
						});
					}
				}}
				isWishlisted={wishlistedProductIds.has(item.id)}
				style={styles.newInProductCard}
				variant={variant}
				pricingDiscount={discount}
						/>
		);
	}, [navigation, wishlistedProductIds, toggleWishlist, pricingRules, user, addItemToCart, pendingOperations]);

	// Memoized renderItem for "Deals" products
	const renderDealItem = useCallback(({ item, index }: { item: any; index: number }) => {
		const isLeftColumn = index % 2 === 0;
		const row = Math.floor(index / 2);
		const patterns = [
			['tall', 'short'],
			['medium', 'tall'],
			['short', 'medium'],
			['tall', 'short'],
			['medium', 'tall'],
		];
		const patternIndex = row % patterns.length;
		const variant = (isLeftColumn 
			? patterns[patternIndex][0] 
			: patterns[patternIndex][1]
		) as 'tall' | 'medium' | 'short';
		
		// Get discount from pricing rules (item already has discount from the hook)
		const discount = item.discount || getProductDiscount(item, pricingRules);
		
		return (
			<ProductCard
				product={item}
				onPress={(productId) => {
					(navigation as any).navigate('ProductDetails', { productId });
				}}
				onCartPress={async (productId, animationData) => {
					if (!user?.email) {
						Alert.alert('Login Required', 'Please log in to add items to your cart.');
						return;
					}
					
					try {
						const itemCode = item.itemCode || productId;
						const success = await addItemToCart(itemCode, 1);
						if (success) {
							// Trigger animation if data is available
							if (animationData) {
								const endX = width - 60; // Approx position of cart icon
								const endY = 50; // Approx position of cart icon
								setAnimationStartPos(animationData.startPos);
								setAnimationEndPos({ x: endX, y: endY });
								setAnimationProductImage(animationData.productImage);
								setShowCartAnimation(true);
							} else {
								setToastMessage('Item added to cart!');
								setToastVisible(true);
							}
						}
					} catch (error) {
						console.error('Error adding to cart:', error);
						Alert.alert('Error', 'Failed to add item to cart. Please try again.');
					}
				}}
				onWishlistPress={async (productId) => {
					// Prevent multiple simultaneous operations on the same item
					if (pendingOperations.has(productId)) {
						return;
					}
					
					const isWishlisted = wishlistedProductIds.has(productId);
					
					// Mark operation as pending
					setPendingOperations(prev => new Set(prev).add(productId));
					
					// Optimistic update - immediately update UI
					setOptimisticWishlist(prev => {
						const newSet = new Set(prev);
						if (isWishlisted) {
							newSet.delete(productId);
						} else {
							newSet.add(productId);
						}
						return newSet;
					});
					
					try {
						const success = await toggleWishlist(productId, isWishlisted);
						if (!success) {
							// Revert optimistic update on failure
							setOptimisticWishlist(prev => {
								const newSet = new Set(prev);
								if (isWishlisted) {
									newSet.add(productId); // Re-add if removal failed
								} else {
									newSet.delete(productId); // Remove if add failed
								}
								return newSet;
							});
						}
						// refreshWishlist is called automatically by useWishlistActions
					} finally {
						// Remove from pending immediately after operation completes
						// This allows immediate toggling back and forth
						setPendingOperations(prev => {
							const newSet = new Set(prev);
							newSet.delete(productId);
							return newSet;
						});
					}
				}}
				isWishlisted={wishlistedProductIds.has(item.id)}
				style={styles.dealProductCard}
				variant={variant}
				pricingDiscount={discount}
			/>
	);
	}, [navigation, wishlistedProductIds, toggleWishlist, pricingRules, user, addItemToCart, pendingOperations]);

	const renderMainProducts = () => {
		// Only show main products when "Best Sellers" is selected
		if (selectedFilter !== 'Best Sellers') {
			return null;
		}

	// Show empty state for Best Sellers since top items data removed
		const bestSellerProducts = [];

		return (
			<View 
				ref={mainProductsLayoutRef}
				style={styles.mainProducts}
				onLayout={(e) => {
					const { y } = e.nativeEvent.layout;
					sectionLayouts.current['mainProducts'] = y;
				}}
			>
				{bestSellerProducts.length === 0 ? (
					<View style={styles.emptyContainer}>
						<Text style={styles.emptyText}>No best sellers available</Text>
					</View>
				) : (
					<FlatList
					data={bestSellerProducts}
					numColumns={2}
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.productsList}
					scrollEnabled={false}
					renderItem={({ item, index }) => {
						const isLeftColumn = index % 2 === 0;
						const row = Math.floor(index / 2);
						const patterns = [
							['tall', 'short'],
							['medium', 'tall'],
							['short', 'medium'],
							['tall', 'short'],
							['medium', 'tall'],
						];
						const patternIndex = row % patterns.length;
						const variant = (isLeftColumn 
							? patterns[patternIndex][0] 
							: patterns[patternIndex][1]
						) as 'tall' | 'medium' | 'short';
						
						// Get discount from pricing rules
						const discount = getProductDiscount(item, pricingRules);
						
						return (
							<ProductCard
								product={item}
								onPress={(productId) => {
									(navigation as any).navigate('ProductDetails', { productId });
								}}
								onCartPress={async (productId, animationData) => {
									console.log('HomeScreen: onCartPress called', { productId, hasAnimationData: !!animationData, animationData });
									if (!user?.email) {
										Alert.alert('Login Required', 'Please log in to add items to your cart.');
										return;
									}
									
									try {
										// Use item.itemCode if available, otherwise fallback to productId
										const itemCode = item.itemCode || productId;
										const success = await addItemToCart(itemCode, 1);
										console.log('HomeScreen: addItemToCart result', { success, hasAnimationData: !!animationData });
										if (success) {
											// Trigger animation if data is available
											if (animationData) {
												const endX = width - 60; // Approx position of cart icon
												const endY = 50; // Approx position of cart icon
												console.log('HomeScreen: Setting animation state', {
													startPos: animationData.startPos,
													endPos: { x: endX, y: endY },
													productImage: animationData.productImage
												});
												setAnimationStartPos(animationData.startPos);
												setAnimationEndPos({ x: endX, y: endY });
												setAnimationProductImage(animationData.productImage);
												setShowCartAnimation(true);
												console.log('HomeScreen: Animation state set, showCartAnimation should be true');
											} else {
												console.log('HomeScreen: No animation data, item added to cart:', itemCode);
											}
										}
									} catch (error) {
										console.error('Error adding to cart:', error);
										Alert.alert('Error', 'Failed to add item to cart. Please try again.');
									}
								}}
								onWishlistPress={async (productId) => {
									// Prevent multiple simultaneous operations on the same item
									if (pendingOperations.has(productId)) {
										return;
									}
									
									const isWishlisted = wishlistedProductIds.has(productId);
									
									// Mark operation as pending
									setPendingOperations(prev => new Set(prev).add(productId));
									
									// Optimistic update - immediately update UI
									setOptimisticWishlist(prev => {
										const newSet = new Set(prev);
										if (isWishlisted) {
											newSet.delete(productId);
										} else {
											newSet.add(productId);
										}
										return newSet;
									});
									
									try {
										const success = await toggleWishlist(productId, isWishlisted);
										if (!success) {
											// Revert optimistic update on failure
											setOptimisticWishlist(prev => {
												const newSet = new Set(prev);
												if (isWishlisted) {
													newSet.add(productId); // Re-add if removal failed
												} else {
													newSet.delete(productId); // Remove if add failed
												}
												return newSet;
											});
										}
										// refreshWishlist is called automatically by useWishlistActions
									} finally {
										// Remove from pending immediately after operation completes
										// This allows immediate toggling back and forth
										setPendingOperations(prev => {
											const newSet = new Set(prev);
											newSet.delete(productId);
											return newSet;
										});
									}
								}}
								isWishlisted={wishlistedProductIds.has(item.id)}
								style={styles.mainProductCard}
								variant={variant}
								pricingDiscount={discount}
							/>
						);
					}}
					keyExtractor={(item) => item.id}
				/>
				)}
			</View>
		);
	};

	const renderCategoryProducts = () => {
		// Only show category products when a specific category is selected (not "All")
		if (selectedCategory === 'All') {
			return null;
		}

		return (
			<View style={styles.categoryView}>
				{isLoadingProducts ? (
					<ProductCardSkeletonList count={6} numColumns={2} />
				) : productsError ? (
					<View style={styles.errorContainer}>
						<Ionicons name="alert-circle-outline" size={24} color={Colors.ERROR} />
						<Text style={styles.errorText}>Failed to load {selectedCategory} items</Text>
						<Text style={styles.errorSubtext}>{productsError.message}</Text>
					</View>
				) : displayedProducts && displayedProducts.length > 0 ? (
					<FlatList
						key={`category-${selectedCategory}`}
						data={displayedProducts}
						numColumns={2}
						showsVerticalScrollIndicator={false}
						contentContainerStyle={styles.categoryProductsList}
						columnWrapperStyle={styles.categoryProductRow}
						renderItem={({ item, index }) => {
							const isLeftColumn = index % 2 === 0;
							const row = Math.floor(index / 2);
							const patterns = [
								['tall', 'short'],
								['medium', 'tall'],
								['short', 'medium'],
							];
							const patternIndex = row % patterns.length;
							const variant = (isLeftColumn 
								? patterns[patternIndex][0] 
								: patterns[patternIndex][1]
							) as 'tall' | 'medium' | 'short';
							
							return (
							<ProductCard
								product={item}
								onPress={(productId) => {
									(navigation as any).navigate('ProductDetails', { productId });
								}}
								onCartPress={async (productId, animationData) => {
									console.log('HomeScreen: onCartPress called (Best Sellers)', { productId, hasAnimationData: !!animationData, animationData });
									if (!user?.email) {
										Alert.alert('Login Required', 'Please log in to add items to your cart.');
										return;
									}
									
									try {
										const itemCode = item.itemCode || productId;
										const success = await addItemToCart(itemCode, 1);
										console.log('HomeScreen: addItemToCart result (Best Sellers)', { success, hasAnimationData: !!animationData });
										if (success) {
											// Trigger animation if data is available
											if (animationData) {
												const endX = width - 60; // Approx position of cart icon
												const endY = 50; // Approx position of cart icon
												console.log('HomeScreen: Setting animation state (Best Sellers)', {
													startPos: animationData.startPos,
													endPos: { x: endX, y: endY },
													productImage: animationData.productImage
												});
												setAnimationStartPos(animationData.startPos);
												setAnimationEndPos({ x: endX, y: endY });
												setAnimationProductImage(animationData.productImage);
												setShowCartAnimation(true);
												console.log('HomeScreen: Animation state set (Best Sellers), showCartAnimation should be true');
											} else {
												console.log('HomeScreen: No animation data (Best Sellers), item added to cart:', itemCode);
											}
										}
									} catch (error) {
										console.error('Error adding to cart:', error);
										Alert.alert('Error', 'Failed to add item to cart. Please try again.');
									}
								}}
								onWishlistPress={async (productId) => {
									const isWishlisted = wishlistedProductIds.has(productId);
									const success = await toggleWishlist(productId, isWishlisted);
									if (success) {
										refreshWishlist(); // Refresh wishlist to update UI
									}
								}}
								isWishlisted={wishlistedProductIds.has(item.id)}
								style={styles.categoryProductCard}
								variant={variant}
								pricingDiscount={getProductDiscount(item, pricingRules)}
							/>
							);
						}}
						keyExtractor={(item) => item.id}
					/>
				) : (
					<View style={styles.emptyContainer}>
						<Ionicons name="grid-outline" size={48} color={Colors.TEXT_SECONDARY} />
						<Text style={styles.emptyText}>No items found in {selectedCategory}</Text>
					</View>
				)}
			</View>
		);
	};

	const renderRecentOrders = () => {
		const topThreeOrders = (recentOrders || []).slice(0, 3) as Order[];
		const lastIndex = topThreeOrders.length - 1;
		return (
			<View style={styles.recentOrdersSection}>
				<View style={styles.recentOrdersHeader}>
					<View style={styles.recentOrdersTitleBlock}>
						<Text style={styles.recentOrdersKicker}>Orders</Text>
						<Text style={styles.recentOrdersTitle}>Recent activity</Text>
					</View>
					<TouchableOpacity
						style={styles.viewAllButton}
						onPress={() => (navigation as any).navigate('OrderHistory')}
						activeOpacity={0.7}
						hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
					>
						<Text style={styles.viewAllText}>View all</Text>
					</TouchableOpacity>
				</View>

				{recentOrdersLoading ? (
					<View style={styles.recentOrdersLoadingBox}>
						<ActivityIndicator size="small" color={Colors.WINE} />
						<Text style={styles.recentOrdersLoadingText}>Loading recent orders...</Text>
					</View>
				) : topThreeOrders.length === 0 ? (
					<View style={styles.recentOrderEmptyWrap}>
						<View style={styles.recentOrderEmptyIconWrap}>
							<Ionicons name="receipt-outline" size={18} color={Colors.WINE} />
						</View>
						<Text style={styles.recentOrderEmptyTitle}>No recent orders</Text>
						<Text style={styles.recentOrderEmptyText}>
							Your latest purchases will appear here with totals and status updates.
						</Text>
						<TouchableOpacity
							onPress={() => (navigation as any).navigate('Categories')}
							activeOpacity={0.7}
							hitSlop={{ top: 8, bottom: 8 }}
						>
							<Text style={styles.recentOrderEmptyLink}>Start shopping</Text>
						</TouchableOpacity>
					</View>
				) : (
					<View style={styles.recentOrdersList}>
						{topThreeOrders.map((order, index) => {
							const status =
								RECENT_ORDER_STATUS_CONFIG[order.status] || RECENT_ORDER_STATUS_CONFIG.pending;
							const itemCount = order.items?.length || 0;
							const total = typeof order.total === 'number' ? order.total : 0;
							const orderLabel = order.orderNumber
								? String(order.orderNumber).replace(/^#/, '')
								: String(order.id);
							return (
								<TouchableOpacity
									key={order.id || order.orderNumber}
									style={[
										styles.recentOrderRow,
										index === lastIndex && styles.recentOrderRowLast,
									]}
									onPress={() => (navigation as any).navigate('OrderDetails', { orderId: order.id })}
									activeOpacity={0.8}
								>
									<View style={styles.recentOrderRowTop}>
										<View style={styles.recentOrderIdPill}>
											<Text style={styles.recentOrderIdPillText} numberOfLines={1}>
												{orderLabel}
											</Text>
										</View>
										<View style={styles.recentOrderAmountWrap}>
											<Text style={styles.recentOrderAmount}>GH₵{total.toFixed(2)}</Text>
											<Ionicons name="chevron-forward" size={16} color={Colors.WINE} />
										</View>
									</View>

									<View style={styles.recentOrderRowBottom}>
										<Text style={styles.recentOrderMeta} numberOfLines={1}>
											{formatRecentOrderDate(order.createdAt)}
											{itemCount > 0
												? ` • ${itemCount} item${itemCount !== 1 ? 's' : ''}`
												: ''}
										</Text>
										<View style={[styles.recentOrderStatusChip, { backgroundColor: `${status.color}18` }]}>
											<Text style={[styles.recentOrderStatusLabel, { color: status.color }]}>
												{status.label}
											</Text>
										</View>
									</View>
								</TouchableOpacity>
							);
						})}
					</View>
				)}
			</View>
		);
	};

	type SectionItem = { 
		type: string; 
		id: string; 
		data?: any;
		ruleName?: string;
		ruleTitle?: string;
		discountPercent?: number;
	};
	
	// Memoized renderItem for "For You" products FlatList
	const renderForYouItem = useCallback(({ item, index }: { item: any; index: number }) => {
		const isLeftColumn = index % 2 === 0;
		const row = Math.floor(index / 2);
		const patterns = [
			['tall', 'short'],
			['medium', 'tall'],
			['short', 'medium'],
			['tall', 'short'],
			['medium', 'tall'],
		];
		const patternIndex = row % patterns.length;
		const variant = (isLeftColumn 
			? patterns[patternIndex][0] 
			: patterns[patternIndex][1]
		) as 'tall' | 'medium' | 'short';
		
		return (
		<ProductCard
			product={item}
			onPress={(productId) => {
				(navigation as any).navigate('ProductDetails', { productId });
			}}
			onCartPress={async (productId, animationData) => {
				console.log('HomeScreen: onCartPress called (For You)', { productId, hasAnimationData: !!animationData, animationData });
				if (!user?.email) {
					Alert.alert('Login Required', 'Please log in to add items to your cart.');
					return;
				}
				
				try {
					const itemCode = item.itemCode || productId;
					const success = await addItemToCart(itemCode, 1);
					console.log('HomeScreen: addItemToCart result (For You)', { success, hasAnimationData: !!animationData });
					if (success) {
						// Trigger animation if data is available
						if (animationData) {
							const endX = width - 60; // Approx position of cart icon
							const endY = 50; // Approx position of cart icon
							console.log('HomeScreen: Setting animation state (For You)', {
								startPos: animationData.startPos,
								endPos: { x: endX, y: endY },
								productImage: animationData.productImage
							});
							setAnimationStartPos(animationData.startPos);
							setAnimationEndPos({ x: endX, y: endY });
							setAnimationProductImage(animationData.productImage);
							setShowCartAnimation(true);
							console.log('HomeScreen: Animation state set (For You), showCartAnimation should be true');
						} else {
							console.log('HomeScreen: No animation data (For You), item added to cart:', itemCode);
						}
					}
				} catch (error) {
					console.error('Error adding to cart:', error);
					Alert.alert('Error', 'Failed to add item to cart. Please try again.');
				}
			}}
			onWishlistPress={async (productId) => {
				// Prevent multiple simultaneous operations on the same item
				if (pendingOperations.has(productId)) {
					return;
				}
				
				const isWishlisted = wishlistedProductIds.has(productId);
				
				// Mark operation as pending
				setPendingOperations(prev => new Set(prev).add(productId));
				
				// Optimistic update - immediately update UI
				setOptimisticWishlist(prev => {
					const newSet = new Set(prev);
					if (isWishlisted) {
						newSet.delete(productId);
					} else {
						newSet.add(productId);
					}
					return newSet;
				});
				
				try {
					const success = await toggleWishlist(productId, isWishlisted);
					if (!success) {
						// Revert optimistic update on failure
						setOptimisticWishlist(prev => {
							const newSet = new Set(prev);
							if (isWishlisted) {
								newSet.add(productId); // Re-add if removal failed
							} else {
								newSet.delete(productId); // Remove if add failed
							}
							return newSet;
						});
					}
					// refreshWishlist is called automatically by useWishlistActions
				} finally {
					// Remove from pending immediately after operation completes
					// This allows immediate toggling back and forth
					setPendingOperations(prev => {
						const newSet = new Set(prev);
						newSet.delete(productId);
						return newSet;
					});
				}
			}}
			isWishlisted={wishlistedProductIds.has(item.id)}
			style={styles.forYouProductCard}
			variant={variant}
		/>
	);
	}, [navigation, wishlistedProductIds, toggleWishlist, refreshWishlist]);
	
	const renderSection = useCallback(({ item }: { item: SectionItem }) => {
		switch (item.type) {
			case 'flyerCarousel':
				return renderFlyerCarousel();
			case 'recentOrders':
				return renderRecentOrders();
	case 'topCustomerAward':
				return null;
			case 'topItemsCarousel':
				// This case is now handled within topCustomerAward case
				return null;
			case 'categoryTabs':
				// Category tabs are now rendered as overlay, return null here
				return null;
			case 'shippingBanner':
				return renderShippingBanner();
			case 'categoryImages':
				return renderCategoryImages();
			case 'superDeals':
				return renderSuperDeals();
			case 'pricingRule':
				return renderDealSection(
					item.ruleName || '',
					item.ruleTitle || 'Deal',
					item.discountPercent || 0
				);
			case 'filterTabs':
				return renderFilterTabs();
			case 'mainProducts':
				// Only render mainProducts when filter is "Best Sellers"
				if (selectedFilter === 'For You' || selectedFilter === 'New In' || selectedFilter === 'Deals') {
					return null;
				}
				return renderMainProducts();
			case 'forYouProducts':
				// Only render forYouProducts when filter IS "For You"
				if (selectedFilter !== 'For You' || selectedCategory !== 'All') {
					return null;
				}
				// Render "For You" products in a grid
				return (
					<View style={styles.forYouProductsSection}>
						<FlatList
							data={sortedForYouProducts}
							numColumns={2}
							showsVerticalScrollIndicator={false}
							contentContainerStyle={styles.forYouProductsList}
							columnWrapperStyle={styles.forYouProductRow}
							scrollEnabled={false}
							renderItem={renderForYouItem}
							keyExtractor={(item) => item.id}
							removeClippedSubviews={true}
							initialNumToRender={6}
							maxToRenderPerBatch={4}
							windowSize={10}
							ListEmptyComponent={
							forYouError ? (
									<View style={styles.errorContainer}>
										<Ionicons name="alert-circle-outline" size={24} color={Colors.ERROR} />
										<Text style={styles.errorText}>Failed to load products</Text>
										<Text style={styles.errorSubtext}>{forYouError.message}</Text>
									</View>
								) : (
									<View style={styles.emptyContainer}>
										<Text style={styles.emptyText}>No products available</Text>
									</View>
								)
							}
							ListFooterComponent={
							!forYouHasMore && forYouProducts.length > 0 ? (
									<View style={styles.loadMoreContainer}>
										<Text style={styles.loadMoreText}>No more products</Text>
									</View>
								) : null
							}
						/>
					</View>
				);
			case 'newInProducts':
				// Only render newInProducts when filter IS "New In"
				if (selectedFilter !== 'New In' || selectedCategory !== 'All') {
					return null;
				}
				// Render "New In" products (New Arrivals) in a grid
				return (
					<View style={styles.newInProductsSection}>
						<FlatList
							data={newArrivals || []}
							numColumns={2}
							showsVerticalScrollIndicator={false}
							contentContainerStyle={styles.newInProductsList}
							columnWrapperStyle={styles.newInProductRow}
							scrollEnabled={false}
							renderItem={renderNewInItem}
							keyExtractor={(item) => item.id}
							removeClippedSubviews={true}
							initialNumToRender={6}
							maxToRenderPerBatch={4}
							windowSize={10}
							ListEmptyComponent={
							newArrivalsError ? (
									<View style={styles.errorContainer}>
										<Ionicons name="alert-circle-outline" size={24} color={Colors.ERROR} />
										<Text style={styles.errorText}>Failed to load new arrivals</Text>
										<Text style={styles.errorSubtext}>{newArrivalsError.message}</Text>
									</View>
								) : (
									<View style={styles.emptyContainer}>
										<Text style={styles.emptyText}>No new arrivals available</Text>
									</View>
								)
							}
							ListFooterComponent={
							!newArrivalsHasMore && newArrivals.length > 0 ? (
									<View style={styles.loadMoreContainer}>
										<Text style={styles.loadMoreText}>No more products</Text>
									</View>
								) : null
							}
						/>
					</View>
				);
			case 'dealProducts':
				// Only render dealProducts when filter IS "Deals"
				if (selectedFilter !== 'Deals' || selectedCategory !== 'All') {
					return null;
				}
				// Render "Deals" products in a grid
				return (
					<View style={styles.dealProductsSection}>
						<FlatList
							data={dealProducts || []}
							numColumns={2}
							showsVerticalScrollIndicator={false}
							contentContainerStyle={styles.dealProductsList}
							columnWrapperStyle={styles.dealProductRow}
							scrollEnabled={false}
							renderItem={renderDealItem}
							keyExtractor={(item) => item.id}
							removeClippedSubviews={true}
							initialNumToRender={6}
							maxToRenderPerBatch={4}
							windowSize={10}
							ListEmptyComponent={
							dealProductsError ? (
									<View style={styles.errorContainer}>
										<Ionicons name="alert-circle-outline" size={24} color={Colors.ERROR} />
										<Text style={styles.errorText}>Failed to load deals</Text>
										<Text style={styles.errorSubtext}>Please try again later</Text>
									</View>
								) : (
									<View style={styles.emptyContainer}>
										<Text style={styles.emptyText}>No deals available</Text>
									</View>
								)
							}
							ListFooterComponent={
							!dealProductsHasMore && dealProducts.length > 0 ? (
									<View style={styles.loadMoreContainer}>
										<Text style={styles.loadMoreText}>No more products</Text>
									</View>
								) : null
							}
						/>
					</View>
				);
			default:
				return null;
		}
	}, [
		selectedCategory,
		selectedFilter,
		renderHeader,
		renderShippingBanner,
		renderSuperDeals,
		renderDealSection,
		renderFilterTabs,
		renderMainProducts,
		renderForYouItem,
		renderNewInItem,
		renderDealItem,
		flyerMedia,
		forYouProducts,
		dealProducts,
		forYouLoading,
		forYouError,
		forYouLoadingMore,
		forYouHasMore,
		forYouLoadMore,
		newArrivals,
		newArrivalsError,
		newArrivalsHasMore,
		newArrivalsLoadingMore,
		newArrivalsLoading,
		dealProducts,
		dealProductsHasMore,
		dealProductsLoadingMore,
		dealProductsError,
		allDealProducts,
		pricingRules,
	productsByRule,
		navigation,
	]);

	// NOTE: We now use a single FlatList for all filters to prevent remounting and scroll resets
	// The "For You" products are rendered as a section in the main list instead of a separate FlatList

	// Calculate approximate heights for getItemLayout
	// This helps FlatList scroll to the correct position immediately
	// MUST be defined before useEffect that uses it
	const getItemLayout = useCallback((data: any, index: number) => {
		// Approximate section heights (in pixels)
		const sectionHeights: { [key: string]: number } = {
			'flyerCarousel': 350,
			'shippingBanner': 80,
			'categoryImages': 400, // 6 rows x ~65px per row
			'latestCarousel': 280,
			'newArrivals': 200,
			'topCustomerAward': 200, // Increased to account for carousel
			'superDeals': 120,
			'pricingRule': 150, // Dynamic pricing rule sections
			'filterTabs': 50,
			'mainProducts': 200,
			'forYouProducts': 0, // Height varies, will be calculated dynamically
			'newInProducts': 0, // Height varies, will be calculated dynamically
			'dealProducts': 0, // Height varies, will be calculated dynamically
		};

		let offset = 0;
		for (let i = 0; i < index; i++) {
			const section = sections[i];
			if (section.id === 'forYouProducts' && selectedFilter === 'For You') {
				// Estimate height based on number of products (2 columns, variable heights)
				const estimatedRows = Math.ceil(forYouProducts.length / 2);
				offset += estimatedRows * 250; // Average row height
			} else if (section.id === 'newInProducts' && selectedFilter === 'New In') {
				// Estimate height based on number of new arrivals (2 columns, variable heights)
				const estimatedRows = Math.ceil((newArrivals?.length || 0) / 2);
				offset += estimatedRows * 250; // Average row height
			} else if (section.id === 'dealProducts' && selectedFilter === 'Deals') {
				// Estimate height based on number of deal products (2 columns, variable heights)
				const estimatedRows = Math.ceil((dealProducts?.length || 0) / 2);
				offset += estimatedRows * 250; // Average row height
			} else if (section.type === 'pricingRule') {
				offset += sectionHeights['pricingRule'] || 150;
			} else {
				offset += sectionHeights[section.id] || 200; // Default to 200 if unknown
			}
		}

		const currentSection = sections[index];
		let length = currentSection?.type === 'pricingRule' 
			? (sectionHeights['pricingRule'] || 150)
			: (sectionHeights[currentSection?.id] || 200);
		
		// Special handling for forYouProducts (dynamic height)
		if (currentSection?.id === 'forYouProducts' && selectedFilter === 'For You') {
			const estimatedRows = Math.ceil(forYouProducts.length / 2);
			length = estimatedRows * 250; // Average row height
		}
		
		// Special handling for newInProducts (dynamic height)
		if (currentSection?.id === 'newInProducts' && selectedFilter === 'New In') {
			const estimatedRows = Math.ceil((newArrivals?.length || 0) / 2);
			length = estimatedRows * 250; // Average row height
		}
		
		// Special handling for dealProducts (dynamic height)
		if (currentSection?.id === 'dealProducts' && selectedFilter === 'Deals') {
			const estimatedRows = Math.ceil((dealProducts?.length || 0) / 2);
			length = estimatedRows * 250; // Average row height
		}

		return {
			length,
			offset,
			index,
		};
	}, [sections, selectedFilter, forYouProducts.length, newArrivals?.length, dealProducts?.length]);

	// Store scroll position to restore when switching filters
	const scrollPositionRef = useRef<number>(0);
	const isScrollingRef = useRef<boolean>(false);

	// Handle scroll position when switching from "For You" to another filter
	// Use a ref to track if we need to scroll, and do it in onLayout of the first visible item
	const needsScrollRef = useRef(false);
	const targetScrollOffsetRef = useRef<number | null>(null);

	useEffect(() => {
		if (shouldScrollToFilterTabs && selectedFilter !== 'For You' && selectedCategory === 'All') {
			const filterTabsIndex = sections.findIndex(s => s.id === 'filterTabs');
			if (filterTabsIndex >= 0) {
				const layout = getItemLayout(null, filterTabsIndex);
				targetScrollOffsetRef.current = layout.offset;
				needsScrollRef.current = true;
				setShouldScrollToFilterTabs(false);
				
				// Try to scroll immediately if list is already mounted
				if (mainListRef.current) {
					// Use multiple strategies to scroll before paint
					const scrollNow = () => {
						if (mainListRef.current && targetScrollOffsetRef.current !== null) {
							mainListRef.current.scrollToOffset({ 
								offset: targetScrollOffsetRef.current,
								animated: false
							});
							needsScrollRef.current = false;
							targetScrollOffsetRef.current = null;
						}
					};
					
					// Try synchronously first (may not work if content not laid out)
					scrollNow();
					
					// Then try on next frame
					requestAnimationFrame(scrollNow);
					
					// And as a final fallback
					setTimeout(scrollNow, 0);
				}
			}
		}
	}, [shouldScrollToFilterTabs, selectedFilter, selectedCategory, sections, getItemLayout]);

	// Handle scroll when content size changes - this is our main opportunity to scroll
	const handleContentSizeChange = useCallback((contentWidth: number, contentHeight: number) => {
		if (needsScrollRef.current && targetScrollOffsetRef.current !== null && mainListRef.current) {
			// Content is now laid out, scroll immediately
			mainListRef.current.scrollToOffset({ 
				offset: targetScrollOffsetRef.current,
				animated: false
			});
			needsScrollRef.current = false;
			targetScrollOffsetRef.current = null;
		}
	}, []);

	// Handle infinite scroll for "For You", "New In", and "Deals" products
	const handleEndReached = useCallback(() => {
		if (selectedFilter === 'For You' && forYouHasMore && !forYouLoadingMore && !forYouLoading) {
			forYouLoadMore();
		} else if (selectedFilter === 'New In' && newArrivalsHasMore && !newArrivalsLoadingMore && !newArrivalsLoading) {
			newArrivalsLoadMore();
		} else if (selectedFilter === 'Deals' && dealProductsHasMore && !dealProductsLoadingMore) {
			loadMoreDealProducts();
		}
	}, [selectedFilter, forYouHasMore, forYouLoadingMore, forYouLoading, forYouLoadMore, newArrivalsHasMore, newArrivalsLoadingMore, newArrivalsLoading, newArrivalsLoadMore, dealProductsHasMore, dealProductsLoadingMore, loadMoreDealProducts]);

	// Track scroll position to maintain it when switching filters
	const handleScroll = useCallback((event: any) => {
		if (!isScrollingRef.current) {
			scrollPositionRef.current = event.nativeEvent.contentOffset.y;
		}
		// Check if scrolled past carousel (350px height)
		const scrollY = event.nativeEvent.contentOffset.y;
		const carouselHeight = 350;
		const scrolledPast = scrollY > carouselHeight - 50; // Start transition slightly before carousel ends
		setIsScrolledPastCarousel(scrolledPast);
		
		// Animate header transitions smoothly
		// Stop any running animations first to prevent conflicts
		headerOpacity.stopAnimation();
		headerBorderRadius.stopAnimation();
		headerShadowOpacity.stopAnimation();
		
		// Run all animations with non-native driver to avoid conflicts
		Animated.parallel([
			Animated.timing(headerOpacity, {
				toValue: scrolledPast ? 1 : 0,
				duration: 300,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: false, // backgroundColor doesn't support native driver
			}),
			Animated.timing(headerBorderRadius, {
				toValue: scrolledPast ? 20 : 0,
				duration: 300,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: false,
			}),
			Animated.timing(headerShadowOpacity, {
				toValue: scrolledPast ? 0.15 : 0,
				duration: 300,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: false,
			}),
		]).start();
		
		// Check if scrolled past filter tabs
		// filterTabsY is the position in the FlatList content (relative to FlatList)
		// scrollY is the scroll offset from the top of the FlatList
		// When scrollY >= filterTabsY, we've scrolled past the filter tabs
		const filterTabsY = sectionLayouts.current['filterTabs'];
		if (filterTabsY !== undefined && filterTabsY > 0) {
			// Set sticky when we've scrolled to where the filter tabs are
			// Small threshold before the actual position to make it smooth
			const threshold = 10;
			const shouldBeSticky = scrollY >= filterTabsY - threshold;
			setIsScrolledPastFilterTabs(shouldBeSticky);
		} else {
			// If filter tabs position hasn't been measured yet, keep it false
			setIsScrolledPastFilterTabs(false);
		}
	}, []);

	// Show loading screen on initial load
	if (isInitialLoading) {
		return <LoadingScreen />;
	}

	// Render sticky filter tabs overlay - only when scrolled past
	const renderStickyFilterTabs = () => {
		if (!isScrolledPastFilterTabs) return null;
		
		// Calculate position below header and category tabs:
		// Header: insets.top - 16 + (24 + 5) + 42 + 8 = insets.top + 63
		// Category Tabs: ~50px (with padding)
		// Total: insets.top + 113
		const topPosition = Math.max(insets.top - Spacing.PADDING_MD, 0) + (Spacing.PADDING_LG + 5) + 42 + Spacing.PADDING_SM + 50;
		
		return (
			<View 
				style={[
					styles.filterTabs,
					styles.filterTabsSticky,
					{ 
						top: topPosition,
					}
				]}
			>
				{filterTabs.map((tab) => {
					if (!tab.name) return null;
					return (
						<TouchableOpacity
							key={`sticky-${tab.id}`}
							style={[
								styles.filterTab,
								selectedFilter === tab.name && styles.filterTabActive
							]}
							onPress={() => {
								if (selectedFilter === 'For You' && tab.name !== 'For You' && selectedCategory === 'All') {
									setShouldScrollToFilterTabs(true);
								}
								setSelectedFilter(tab.name);
							}}
						>
							{tab.icon && (
								<Ionicons 
									name={tab.icon as any} 
									size={16} 
									color={selectedFilter === tab.name ? Colors.WHITE : Colors.WINE} 
								/>
							)}
							<Text style={[
								styles.filterTabText,
								{ color: selectedFilter === tab.name ? Colors.WHITE : Colors.WINE },
								selectedFilter === tab.name && styles.filterTabTextActiveStickyWhite
							]}>
								{tab.name}
							</Text>
						</TouchableOpacity>
					);
				})}
			</View>
		);
	};

	return (
		<View style={styles.container}>
			{/* Sticky filter tabs overlay - positioned absolutely over scrollable content */}
			{isScrolledPastFilterTabs && renderStickyFilterTabs()}
			<CartAnimation
				visible={showCartAnimation}
				startPosition={animationStartPos}
				endPosition={animationEndPos}
				productImage={animationProductImage}
				onComplete={() => {
					console.log('HomeScreen: Animation complete');
					setShowCartAnimation(false);
				}}
			/>
			<SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
			<Toast
				message={toastMessage}
				type="success"
				visible={toastVisible}
				onHide={() => setToastVisible(false)}
			/>
			{/* Header and Category Tabs positioned absolutely to overlay carousel */}
			{renderHeader()}
			<FlatList
				ref={mainListRef}
				key={mainListKey}
				data={sections}
				renderItem={renderSection}
				keyExtractor={(item) => item.id}
				showsVerticalScrollIndicator={false}
				ListFooterComponent={null}
				getItemLayout={getItemLayout}
				onContentSizeChange={handleContentSizeChange}
				onScroll={handleScroll}
				scrollEventThrottle={16}
				onEndReached={(selectedFilter === 'For You' || selectedFilter === 'New In' || selectedFilter === 'Deals') ? handleEndReached : undefined}
				onEndReachedThreshold={(selectedFilter === 'For You' || selectedFilter === 'New In' || selectedFilter === 'Deals') ? 0.5 : undefined}
				removeClippedSubviews={true}
				initialNumToRender={5}
				maxToRenderPerBatch={3}
				updateCellsBatchingPeriod={50}
				windowSize={10}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={Colors.SHEIN_PINK}
						colors={[Colors.SHEIN_PINK]}
					/>
				}
				maintainVisibleContentPosition={
					// Prevent scroll jumps when content changes
					needsScrollRef.current ? undefined : {
						minIndexForVisible: 0,
						autoscrollToTopThreshold: 100,
					}
				}
			/>
		</SafeAreaView>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: Colors.BACKGROUND,
		position: 'relative',
	},
	safeArea: {
		flex: 1,
	},
	recentOrdersSection: {
		marginHorizontal: 16,
		marginTop: 12,
		marginBottom: 90,
		borderRadius: 10,
		overflow: 'hidden',
		backgroundColor: Colors.WHITE,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: Colors.BORDER,
	},
	recentOrdersHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingTop: 14,
		paddingBottom: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: Colors.BORDER,
	},
	recentOrdersTitleBlock: {
		flex: 1,
		paddingRight: 12,
	},
	recentOrdersKicker: {
		fontSize: 11,
		fontWeight: '600',
		color: Colors.TEXT_SECONDARY,
		letterSpacing: 0.8,
		textTransform: 'uppercase',
		marginBottom: 4,
	},
	recentOrdersTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: Colors.TEXT_PRIMARY,
		letterSpacing: -0.3,
	},
	viewAllButton: {
		justifyContent: 'center',
		paddingTop: 2,
	},
	viewAllText: {
		fontSize: 15,
		fontWeight: '500',
		color: Colors.WINE,
	},
	recentOrdersLoadingBox: {
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 32,
		paddingHorizontal: 16,
	},
	recentOrdersLoadingText: {
		marginTop: 8,
		fontSize: Typography.FONT_SIZE_SM,
		color: Colors.TEXT_SECONDARY,
	},
	recentOrderEmptyWrap: {
		paddingVertical: 22,
		paddingHorizontal: 20,
		paddingBottom: 24,
		alignItems: 'center',
	},
	recentOrderEmptyIconWrap: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: 'rgba(139, 45, 71, 0.1)',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 10,
	},
	recentOrderEmptyTitle: {
		fontSize: 15,
		fontWeight: '600',
		color: Colors.TEXT_PRIMARY,
		marginBottom: 8,
	},
	recentOrderEmptyText: {
		fontSize: 14,
		color: Colors.TEXT_SECONDARY,
		lineHeight: 20,
		marginBottom: 14,
		textAlign: 'center',
	},
	recentOrderEmptyLink: {
		fontSize: 15,
		fontWeight: '600',
		color: Colors.WINE,
	},
	recentOrdersList: {
		paddingBottom: 2,
	},
	recentOrderRow: {
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: Colors.BORDER,
	},
	recentOrderRowLast: {
		borderBottomWidth: 0,
	},
	recentOrderRowTop: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	recentOrderIdPill: {
		backgroundColor: 'rgba(139, 45, 71, 0.08)',
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 4,
		maxWidth: width * 0.45,
	},
	recentOrderIdPillText: {
		fontSize: 12,
		fontWeight: '600',
		color: Colors.WINE,
	},
	recentOrderAmountWrap: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
	},
	recentOrderRowBottom: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: 8,
	},
	recentOrderAmount: {
		fontSize: 16,
		fontWeight: '700',
		color: Colors.TEXT_PRIMARY,
		letterSpacing: -0.3,
		fontVariant: ['tabular-nums'] as any,
	},
	recentOrderMeta: {
		flex: 1,
		fontSize: 13,
		color: Colors.TEXT_SECONDARY,
		marginRight: 12,
	},
	recentOrderStatusChip: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	recentOrderStatusLabel: {
		fontSize: 12,
		fontWeight: '600',
		flexShrink: 0,
	},
	stickyHeaderWrapper: {
		backgroundColor: 'transparent',
		zIndex: 2002,
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		width: width,
	},
	stickyHeaderWrapperScrolled: {
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowRadius: 15,
		elevation: 10,
	},
	headerContentWrapper: {
		width: '100%',
		backgroundColor: 'transparent',
	},
	categoryTabsOverlay: {
		position: 'absolute',
		top: 100, // Position below header
		left: 0,
		right: 0,
		width: width,
		zIndex: 2001,
		backgroundColor: 'transparent',
	},
	categoryTabsOverlayScrolled: {
		backgroundColor: Colors.WHITE,
		top: 0, // Will be calculated dynamically based on header height
		marginTop: 0,
		paddingTop: 0,
		marginBottom: 0,
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 8,
	},
	categoryTabsContentWrapper: {
		width: '100%',
		backgroundColor: 'transparent',
	},
	flyerCarouselContainer: {
		width: width,
		height: 350,
		position: 'relative',
		zIndex: 1,
	},
	flyerImageContainer: {
		width: width,
		height: 350,
		backgroundColor: Colors.LIGHT_GRAY,
		justifyContent: 'center',
		alignItems: 'center',
		overflow: 'hidden',
	},
	flyerImage: {
		width: '100%',
		height: '100%',
		resizeMode: 'cover',
	},
	flyerImageWrapper: {
		width: '100%',
		height: '100%',
		overflow: 'hidden',
	},
	flyerVideo: {
		width: '100%',
		height: '100%',
	},
	flyerVideoWrapper: {
		width: '100%',
		height: '100%',
		overflow: 'hidden',
		justifyContent: 'center',
		alignItems: 'center',
	},
	carouselOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.25)',
		zIndex: 2,
	},
	flyerPlaceholder: {
		width: '100%',
		height: '100%',
		backgroundColor: Colors.LIGHT_GRAY,
		justifyContent: 'center',
		alignItems: 'center',
	},
	videoPlaceholder: {
		width: '100%',
		height: '100%',
		backgroundColor: Colors.BLACK,
		justifyContent: 'center',
		alignItems: 'center',
	},
	videoPlayButton: {
		justifyContent: 'center',
		alignItems: 'center',
	},
	flyerIndicators: {
		position: 'absolute',
		bottom: 16,
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'center',
		gap: 8,
		zIndex: 10,
	},
	flyerIndicator: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: 'rgba(255, 255, 255, 0.6)',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.3,
		shadowRadius: 2,
		elevation: 2,
	},
	flyerIndicatorActive: {
		backgroundColor: Colors.WHITE,
		width: 24,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.4,
		shadowRadius: 4,
		elevation: 3,
	},
	topCustomerSection: {
		marginBottom: 0,
		width: '100%',
		overflow: 'visible',
	},
	curvyBanner: {
		width: '100%',
		height: 30,
		marginVertical: Spacing.MARGIN_SM,
		overflow: 'hidden',
	},
	waveSvg: {
		position: 'absolute',
		top: 0,
		left: 0,
	},
	trendingItemsSection: {
		width: '100%',
		marginBottom: 0,
		backgroundColor: Colors.WHITE,
		paddingVertical: Spacing.PADDING_XS,
		borderTopWidth: 2,
		borderTopColor: 'rgba(212, 175, 55, 0.15)',
		borderBottomWidth: 2,
		borderBottomColor: 'rgba(212, 175, 55, 0.1)',
	},
	trendingTitleContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'flex-start',
		paddingHorizontal: Spacing.SCREEN_PADDING,
		paddingVertical: Spacing.PADDING_XS,
		width: '100%',
		backgroundColor: Colors.WINE,
		marginBottom: Spacing.MARGIN_XS,
		borderBottomWidth: 2,
		borderBottomColor: Colors.GOLD,
		borderRadius: 12,
		marginHorizontal: Spacing.SCREEN_PADDING,
	},
	titleWithIcon: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: Spacing.MARGIN_XS,
	},
	trendingTitleText: {
		fontSize: 10,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		color: Colors.WHITE,
		letterSpacing: 0.3,
		textTransform: 'uppercase',
	},
	superDealsTitleGradient: {
		width: '100%',
		marginBottom: Spacing.MARGIN_SM,
	},
	trendingItemsTitle: {
		fontSize: Typography.FONT_SIZE_MD,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		color: Colors.TEXT_PRIMARY,
		marginBottom: Spacing.MARGIN_XS,
	},
	trendingProductsList: {
		paddingLeft: Spacing.SCREEN_PADDING,
		paddingTop: Spacing.PADDING_XS,
		paddingRight: Spacing.SCREEN_PADDING,
		paddingHorizontal: 0,
		backgroundColor: Colors.LIGHT_GRAY,
	},
	trendingProductCard: {
		width: (width - Spacing.MARGIN_SM) / 2,
		marginRight: Spacing.MARGIN_SM / 2,
		marginLeft: Spacing.MARGIN_SM / 2,
	},
	trendingLoadingContainer: {
		paddingVertical: Spacing.PADDING_MD,
		alignItems: 'center',
		justifyContent: 'center',
	},
	topCustomerScrollContent: {
		alignItems: 'center',
		paddingRight: Spacing.SCREEN_PADDING,
		gap: Spacing.MARGIN_MD,
	},
	categoryTabs: {
		paddingVertical: 0,
		borderBottomWidth: 1,
		borderBottomColor: Colors.BORDER,
	},
	categoryTab: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		marginHorizontal: 4,
		borderRadius: 20,
	},
	categoryTabActive: {
		backgroundColor: Colors.BLACK,
	},
	categoryTabText: {
		fontSize: 14,
		color: Colors.BLACK,
		fontWeight: '500',
	},
	categoryTabTextActive: {
		color: Colors.BLACK,
	},
	bannerCarouselContainer: {
		alignItems: 'center',
		paddingVertical: 0,
		marginVertical: 0,
	},
	bannerCarouselItem: {
		width: width,
		justifyContent: 'center',
		alignItems: 'center',
		marginVertical: 0,
		paddingVertical: 0,
	},
	shippingBannersContainer: {
		flexDirection: 'row',
		paddingHorizontal: Spacing.SCREEN_PADDING,
		paddingVertical: Spacing.PADDING_SM,
		gap: Spacing.MARGIN_SM,
	},
	shippingBannerContainer: {
		flex: 1,
	},
	shippingBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		backgroundColor: Colors.GOLD,
		paddingVertical: Spacing.PADDING_SM,
		paddingHorizontal: Spacing.PADDING_SM,
		borderRadius: 12,
		minHeight: 44,
		borderWidth: 2,
		borderColor: Colors.WINE,
		shadowColor: Colors.WINE,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 10,
		elevation: 5,
	},
	shippingBannerContent: {
		flex: 1,
		marginRight: Spacing.MARGIN_SM,
	},
	shippingText: {
		fontSize: Typography.FONT_SIZE_XS,
		color: Colors.BLACK,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		marginBottom: 1,
		letterSpacing: 0.3,
	},
	shippingSubtext: {
		fontSize: 10,
		color: 'rgba(0, 0, 0, 0.7)',
		letterSpacing: 0.2,
	},
	topCustomerBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		backgroundColor: Colors.WINE,
		paddingVertical: Spacing.PADDING_SM,
		paddingHorizontal: Spacing.PADDING_SM,
		borderRadius: 12,
		minHeight: 44,
		borderWidth: 2,
		borderColor: Colors.GOLD,
		shadowColor: Colors.WINE,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.25,
		shadowRadius: 10,
		elevation: 6,
	},
	topCustomerBannerContent: {
		flex: 1,
		marginRight: Spacing.MARGIN_SM,
	},
	topCustomerLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: Spacing.MARGIN_SM,
		flex: 1,
	},
	trophyIconContainer: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: Colors.WHITE,
		justifyContent: 'center',
		alignItems: 'center',
		shadowColor: Colors.GOLD,
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.3,
		shadowRadius: 2,
		elevation: 2,
	},
	topCustomerTextContainer: {
		flexDirection: 'column',
		gap: 1,
	},
	topCustomerBannerText: {
		fontSize: Typography.FONT_SIZE_SM,
		color: Colors.BLACK,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		letterSpacing: 0.3,
	},
	topCustomerBannerSubtext: {
		fontSize: 10,
		color: 'rgba(255, 255, 255, 0.85)',
		fontWeight: Typography.FONT_WEIGHT_MEDIUM,
		letterSpacing: 0.2,
	},
	topCustomerRight: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: Spacing.MARGIN_XS,
		flexShrink: 1,
	},
	topCustomerBannerLabel: {
		fontSize: 10,
		color: 'rgba(255, 255, 255, 0.9)',
		fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
		marginBottom: 1,
		letterSpacing: 0.2,
	},
	topCustomerBannerName: {
		fontSize: Typography.FONT_SIZE_XS,
		color: Colors.WHITE,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		letterSpacing: 0.3,
	},
	categoryImagesSection: {
		marginHorizontal: Spacing.SCREEN_PADDING,
		marginTop: Spacing.MARGIN_MD,
		marginBottom: Spacing.MARGIN_SM,
		paddingVertical: Spacing.PADDING_MD,
		paddingHorizontal: Spacing.PADDING_MD,
		backgroundColor: Colors.WHITE,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: 'rgba(139, 45, 71, 0.10)',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.06,
		shadowRadius: 12,
		elevation: 3,
	},
	categorySectionHeader: {
		marginBottom: Spacing.MARGIN_SM,
	},
	categorySectionTitle: {
		fontSize: Typography.FONT_SIZE_MD,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		color: Colors.TEXT_PRIMARY,
		letterSpacing: 0.2,
	},
	categorySectionSubtitle: {
		marginTop: 2,
		fontSize: Typography.FONT_SIZE_SM,
		color: Colors.TEXT_SECONDARY,
	},
	categoryImagesGrid: {
		paddingTop: Spacing.PADDING_XS,
		paddingBottom: 2,
	},
	categoryImagesRow: {
		justifyContent: 'space-between',
		marginBottom: Spacing.MARGIN_MD,
	},
	categoryImageItem: {
		alignItems: 'center',
		width: (width - Spacing.SCREEN_PADDING * 2) / 4,
	},
	categoryImageCard: {
		alignItems: 'center',
		width: 82,
		marginRight: 8,
		paddingVertical: 6,
		paddingHorizontal: 4,
		borderRadius: 10,
		backgroundColor: '#FCFCFD',
		borderWidth: 1,
		borderColor: 'rgba(0,0,0,0.04)',
	},
	categoryBadgeWrap: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: '#FFFFFF',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 6,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.06,
		shadowRadius: 2,
		elevation: 1,
	},
	categoryBadge: {
		width: 28,
		height: 28,
		borderRadius: 14,
		overflow: 'hidden',
		justifyContent: 'center',
		alignItems: 'center',
	},
	categoryBadgeImage: {
		width: '100%',
		height: '100%',
	},
	categoryImageName: {
		fontSize: 10,
		color: Colors.TEXT_PRIMARY,
		textAlign: 'center',
		fontWeight: Typography.FONT_WEIGHT_SEMIBOLD,
		lineHeight: 12,
		minHeight: 22,
		letterSpacing: 0,
	},
	section: {
		paddingTop: 0,
		paddingBottom: Spacing.PADDING_LG,
		backgroundColor: 'rgba(139, 45, 71, 0.04)',
		borderTopWidth: 1,
		borderTopColor: 'rgba(114, 47, 55, 0.08)',
		borderBottomWidth: 1,
		borderBottomColor: 'rgba(212, 175, 55, 0.08)',
	},
	sectionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 16,
		marginBottom: 12,
		gap: Spacing.MARGIN_SM,
	},
	superDealsHeaderContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
		gap: Spacing.MARGIN_SM,
	},
	headerRightActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: Spacing.MARGIN_SM,
	},
	viewMoreButton: {
		paddingHorizontal: Spacing.PADDING_SM,
	},
	sectionTitleContainer: {
		flex: 1,
	},
	superDealsTitleContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: Spacing.PADDING_MD,
		paddingVertical: Spacing.PADDING_XS,
		width: '100%',
		backgroundColor: Colors.WINE,
		marginBottom: Spacing.MARGIN_XS,
		borderBottomWidth: 2,
		borderBottomColor: Colors.GOLD,
		borderRadius: 12,
		marginHorizontal: -Spacing.SCREEN_PADDING,
	},
	superDealsTitleLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: Spacing.MARGIN_XS,
	},
	superDealsTitle: {
		fontSize: 10,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		color: Colors.WHITE,
		letterSpacing: 0.3,
		textTransform: 'uppercase',
	},
	superDealsDiscount: {
		fontSize: Typography.FONT_SIZE_XS,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		color: Colors.SHEIN_RED,
		letterSpacing: 0.3,
	},
	superDealsSaveText: {
		fontSize: Typography.FONT_SIZE_XS,
		color: Colors.WHITE,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		letterSpacing: 0.2,
	},
	sectionTitle: {
		fontSize: 11,
		fontWeight: 'bold',
		color: Colors.BLACK,
	},
	sectionSubtitle: {
		fontSize: Typography.FONT_SIZE_SM,
		color: Colors.WINE,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		letterSpacing: 0.3,
	},
	viewMoreText: {
		fontSize: Typography.FONT_SIZE_SM,
		color: Colors.WINE,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		letterSpacing: 0.3,
	},
	viewMoreTextWhite: {
		fontSize: 12,
		color: Colors.WHITE,
		fontWeight: '500',
	},
	productsList: {
		paddingHorizontal: 0,
	},
	productCard: {
		width: 80,
		marginRight: Spacing.MARGIN_XS,
		marginLeft: Spacing.MARGIN_XS,
		alignItems: 'center',
		borderWidth: 1.5,
		borderColor: Colors.WINE_LIGHT,
		borderRadius: 8,
		paddingVertical: Spacing.PADDING_XS,
		paddingHorizontal: Spacing.PADDING_XS,
	},
	productImage: {
		width: 60,
		height: 60,
		backgroundColor: Colors.LIGHT_GRAY,
		borderRadius: 6,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 4,
		position: 'relative',
		alignSelf: 'center',
	},
	productEmoji: {
		fontSize: 40,
	},
	discountTag: {
		position: 'absolute',
		top: 4,
		left: 4,
		backgroundColor: Colors.FLASH_SALE_RED,
		paddingHorizontal: 4,
		paddingVertical: 1,
		borderRadius: 3,
	},
	discountText: {
		fontSize: 8,
		color: Colors.WHITE,
		fontWeight: 'bold',
	},
	flashSaleTag: {
		position: 'absolute',
		top: 4,
		left: 4,
		backgroundColor: Colors.FLASH_SALE_RED,
		paddingHorizontal: 4,
		paddingVertical: 1,
		borderRadius: 3,
	},
	flashSaleText: {
		fontSize: 8,
		color: Colors.WHITE,
		fontWeight: 'bold',
	},
	productImageContent: {
		width: '100%',
		height: '100%',
		borderRadius: 8,
	},
	productImagePlaceholder: {
		width: '100%',
		height: '100%',
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: Colors.LIGHT_GRAY,
		borderRadius: 8,
	},
	productName: {
		fontSize: 9,
		color: Colors.TEXT_PRIMARY,
		textAlign: 'center',
		marginBottom: 2,
		minHeight: 18,
	},
	productPrice: {
		fontSize: 11,
		fontWeight: '500',
		color: Colors.BLACK,
		textAlign: 'center',
	},
	priceRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		flexWrap: 'wrap',
		maxWidth: '100%',
	},
	originalPrice: {
		fontSize: 9,
		color: Colors.TEXT_SECONDARY,
		textDecorationLine: 'line-through',
		textAlign: 'center',
		marginLeft: 2,
		flexShrink: 1,
		maxWidth: '50%',
	},
	filterTabs: {
		flexDirection: 'row',
		paddingHorizontal: Spacing.SCREEN_PADDING,
		paddingVertical: Spacing.PADDING_XS,
		borderBottomWidth: 2,
		borderBottomColor: 'rgba(212, 175, 55, 0.2)',
		backgroundColor: Colors.WHITE,
		minHeight: 40,
	},
	filterTabsNormal: {
		marginTop: -8,
	},
	filterTabsSticky: {
		position: 'absolute',
		left: 0,
		right: 0,
		width: '100%',
		zIndex: 2000,
		backgroundColor: Colors.WHITE,
		shadowColor: Colors.WINE,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 8,
		overflow: 'hidden',
	},
	filterTab: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: Spacing.PADDING_SM,
		paddingVertical: Spacing.PADDING_XS,
		marginRight: Spacing.MARGIN_XS,
		borderRadius: 20,
		gap: 6,
		borderWidth: 1.5,
		borderColor: Colors.WINE,
		backgroundColor: 'rgba(139, 45, 71, 0.06)',
		shadowColor: Colors.WINE,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 2,
	},
	filterTabActive: {
		backgroundColor: Colors.WINE,
		borderColor: Colors.WINE,
		shadowColor: Colors.WINE,
		shadowOpacity: 0.25,
		elevation: 4,
	},
	filterTabText: {
		fontSize: Typography.FONT_SIZE_XS,
		color: Colors.BLACK,
		fontWeight: Typography.FONT_WEIGHT_BOLD,
		letterSpacing: 0.2,
	},
	filterTabTextActive: {
		color: Colors.WHITE,
	},
	filterTabTextActiveStickyWhite: {
		color: Colors.GOLD,
	},
	mainProducts: {
		paddingHorizontal: 16,
		paddingVertical: 16,
	},
	mainProductCard: {
		marginBottom: 16,
	},
	mainProductImage: {
		width: '100%',
		height: 200,
		backgroundColor: Colors.LIGHT_GRAY,
		borderRadius: 8,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 8,
		position: 'relative',
	},
	mainProductEmoji: {
		fontSize: 60,
	},
	productTag: {
		position: 'absolute',
		bottom: 8,
		left: 8,
		backgroundColor: Colors.SHEIN_PINK,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 4,
	},
	productTagText: {
		fontSize: 12,
		color: Colors.WHITE,
		fontWeight: 'bold',
	},
	mainProductPrice: {
		fontSize: 16,
		fontWeight: '500',
		color: Colors.BLACK,
	},
	newArrivalsList: {
		paddingHorizontal: 16,
		paddingBottom: 16,
	},
	newArrivalCard: {
		marginRight: 12,
		width: 160,
	},
	loadingContainer: {
		padding: 60,
		alignItems: 'center',
		justifyContent: 'center',
	},
	loadingText: {
		marginTop: 16,
		fontSize: 14,
		color: Colors.TEXT_SECONDARY,
		fontWeight: '500',
	},
	errorContainer: {
		padding: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	errorText: {
		marginTop: 12,
		fontSize: 16,
		color: Colors.ERROR,
		fontWeight: '600',
	},
	errorSubtext: {
		marginTop: 8,
		fontSize: 12,
		color: Colors.TEXT_SECONDARY,
		textAlign: 'center',
	},
	emptyContainer: {
		padding: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	emptyText: {
		fontSize: 14,
		color: Colors.TEXT_SECONDARY,
	},
	categoryView: {
		flex: 1,
		paddingTop: 16,
	},
	categoryProductsList: {
		paddingHorizontal: Spacing.SCREEN_PADDING,
		paddingTop: Spacing.PADDING_MD,
		paddingBottom: 100,
	},
	categoryProductRow: {
		justifyContent: 'space-between',
		marginBottom: Spacing.MARGIN_SM,
		gap: Spacing.MARGIN_XS,
	},
	categoryProductCard: {
		width: ((width - Spacing.SCREEN_PADDING * 2 - Spacing.MARGIN_SM) / 2) * 0.85,
		marginBottom: 0, // Row spacing handled by columnWrapperStyle
	},
	emptyPageContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingVertical: 100,
	},
	emptyPageText: {
		fontSize: 16,
		color: Colors.TEXT_SECONDARY,
		marginTop: 16,
		textAlign: 'center',
	},
	forYouSection: {
		paddingVertical: 16,
	},
	forYouProductsSection: {
		paddingHorizontal: 16,
		paddingTop: Spacing.PADDING_LG,
		paddingBottom: 100,
		backgroundColor: Colors.LIGHT_GRAY,
		borderTopWidth: 2,
		borderTopColor: 'rgba(114, 47, 55, 0.1)',
	},
	forYouProductsList: {
		paddingHorizontal: Spacing.SCREEN_PADDING,
		paddingTop: Spacing.PADDING_MD,
		paddingBottom: 16,
	},
	forYouProductRow: {
		justifyContent: 'space-between',
		marginBottom: Spacing.MARGIN_SM,
	},
	forYouProductCard: {
		width: (width - Spacing.SCREEN_PADDING * 2 - Spacing.MARGIN_SM) / 2,
		marginBottom: 0, // Row spacing handled by columnWrapperStyle
	},
	newInProductsSection: {
		paddingHorizontal: 16,
		paddingTop: Spacing.PADDING_LG,
		paddingBottom: 100,
		backgroundColor: 'rgba(212, 175, 55, 0.04)',
		borderTopWidth: 2,
		borderTopColor: 'rgba(212, 175, 55, 0.2)',
	},
	newInProductsList: {
		paddingHorizontal: Spacing.SCREEN_PADDING,
		paddingTop: Spacing.PADDING_MD,
		paddingBottom: 16,
	},
	newInProductRow: {
		justifyContent: 'space-between',
		marginBottom: Spacing.MARGIN_SM,
	},
	newInProductCard: {
		width: (width - Spacing.SCREEN_PADDING * 2 - Spacing.MARGIN_SM) / 2,
		marginBottom: 0, // Row spacing handled by columnWrapperStyle
	},
	dealProductsSection: {
		paddingHorizontal: 16,
		paddingTop: Spacing.PADDING_LG,
		paddingBottom: 100,
		backgroundColor: 'rgba(114, 47, 55, 0.04)',
		borderTopWidth: 2,
		borderTopColor: 'rgba(114, 47, 55, 0.15)',
	},
	dealProductsList: {
		paddingHorizontal: Spacing.SCREEN_PADDING,
		paddingTop: Spacing.PADDING_MD,
		paddingBottom: 16,
	},
	dealProductRow: {
		justifyContent: 'space-between',
		marginBottom: Spacing.MARGIN_SM,
	},
	dealProductCard: {
		width: (width - Spacing.SCREEN_PADDING * 2 - Spacing.MARGIN_SM) / 2,
		marginBottom: 0, // Row spacing handled by columnWrapperStyle
	},
	loadMoreContainer: {
		padding: 20,
		alignItems: 'center',
		justifyContent: 'center',
	},
	loadMoreText: {
		marginTop: 8,
		fontSize: 14,
		color: Colors.TEXT_SECONDARY,
	},
	filterContainer: {
		paddingHorizontal: Spacing.PADDING_MD,
		paddingVertical: Spacing.PADDING_SM,
		backgroundColor: Colors.WHITE,
		borderBottomWidth: 1,
		borderBottomColor: Colors.BORDER,
	},
		comboDealsButton: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: Colors.WHITE,
		borderWidth: 1,
		borderColor: Colors.SHEIN_RED,
		borderRadius: Spacing.BORDER_RADIUS_SM,
		paddingVertical: Spacing.PADDING_XS,
		paddingHorizontal: Spacing.PADDING_SM,
		gap: 4,
		},
		modernCategorySection: {
			marginHorizontal: 16,
			marginTop: 12,
			marginBottom: 16,
			backgroundColor: Colors.WHITE,
			borderRadius: 12,
			padding: 12,
		},
		modernCategoryHeader: {
			marginBottom: 12,
		},
		modernCategoryTitleRow: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			alignItems: 'center',
			marginBottom: 8,
		},
		modernCategoryTitle: {
			fontSize: 16,
			fontWeight: '700',
			color: Colors.TEXT_PRIMARY,
			letterSpacing: -0.3,
		},
		sourcewaveExplainCard: {
			backgroundColor: '#F5F8FF',
			borderRadius: 10,
			padding: 12,
			borderWidth: 1,
			borderColor: 'rgba(107, 140, 232, 0.25)',
		},
		sourcewaveExplainBody: {
			fontSize: 13,
			lineHeight: 19,
			color: Colors.TEXT_SECONDARY,
			marginBottom: 10,
		},
		sourcewavePointRow: {
			flexDirection: 'row',
			alignItems: 'center',
			marginBottom: 7,
		},
		sourcewaveDot: {
			width: 6,
			height: 6,
			borderRadius: 3,
			backgroundColor: Colors.ROYAL_BLUE,
			marginRight: 8,
		},
		sourcewavePointText: {
			flex: 1,
			fontSize: 12,
			color: Colors.TEXT_PRIMARY,
			fontWeight: '500',
		},
		viewAllCategoriesBtn: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			paddingVertical: 10,
			paddingHorizontal: 20,
			borderWidth: 2,
			borderColor: Colors.WINE,
			borderRadius: 25,
			backgroundColor: Colors.WHITE,
			shadowColor: Colors.WINE,
			shadowOffset: { width: 0, height: 4 },
			shadowOpacity: 0.2,
			shadowRadius: 12,
			elevation: 6,
		},
		viewAllCategoriesText: {
			fontSize: 16,
			fontWeight: '800',
			color: Colors.WINE,
			letterSpacing: 0.5,
		},
		modernCategorySubtitle: {
			fontSize: 16,
			color: Colors.TEXT_SECONDARY,
			fontWeight: '600',
		},
		modernCategoryGrid: {
			paddingBottom: 20,
		},
		modernCategoryRow: {
			justifyContent: 'space-between',
			marginBottom: 16,
		},
		modernCategoryCard: {
			width: '48%',
			height: 160,
			borderRadius: 24,
			overflow: 'hidden',
			backgroundColor: Colors.WHITE,
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 6 },
			shadowOpacity: 0.15,
			shadowRadius: 16,
			elevation: 8,
		},
		modernCategoryCardLast: {
			marginRight: 0,
		},
		modernCategoryImageWrapper: {
			height: 120,
			overflow: 'hidden',
			borderRadius: 20,
		},
		modernCategoryImage: {
			width: '100%',
			height: '100%',
		},
		modernCategoryImagePlaceholder: {
			width: '100%',
			height: '100%',
			justifyContent: 'center',
			alignItems: 'center',
		},
		modernCategoryGradient: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: 'rgba(0,0,0,0.4)',
			justifyContent: 'flex-end',
			paddingBottom: 20,
		},
		modernCategoryContent: {
			padding: 16,
		},
		modernCategoryName: {
			fontSize: 16,
			fontWeight: '800',
			color: Colors.WHITE,
			marginBottom: 4,
		},
		modernCategoryIndicator: {
			width: 32,
			height: 3,
			backgroundColor: Colors.GOLD,
			borderRadius: 2,
		},
		loadMoreCategoriesBtn: {
			alignSelf: 'center',
			paddingVertical: 16,
			paddingHorizontal: 32,
			borderWidth: 2,
			borderColor: Colors.WINE,
			borderRadius: 30,
			backgroundColor: Colors.WHITE,
			marginTop: 20,
		},
		loadMoreCategoriesText: {
			fontSize: 18,
			fontWeight: '800',
			color: Colors.WINE,
			letterSpacing: 0.5,
		},
		categoryCircleGrid: {
			paddingBottom: 4,
		},
		categoryCircleRow: {
			justifyContent: 'space-around',
			marginBottom: 4,
		},
		categoryCircleWrapper: {
			width: '20%',
			alignItems: 'center',
			gap: 3,
		},
		categoryCircle: {
			width: 48,
			height: 48,
			borderRadius: 24,
			justifyContent: 'center',
			alignItems: 'center',
			shadowColor: '#000',
			shadowOffset: { width: 0, height: 2 },
			shadowOpacity: 0.1,
			shadowRadius: 4,
			elevation: 3,
		},
		categoryCircleLabel: {
			fontSize: 10,
			fontWeight: '500',
			color: Colors.TEXT_PRIMARY,
			textAlign: 'center',
			lineHeight: 12,
		},
});

