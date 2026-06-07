import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { ProductCard } from '../components/ProductCard';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useWishlist } from '../hooks/erpnext';
import { useShoppingCart } from '../hooks/erpnext';
import { useOrders } from '../hooks/erpnext';
import { getERPNextClient } from '../services/erpnext';
import { mapERPItemToProduct } from '../services/mappers';
import { encodeErpFileUrl } from '../utils/erpImageUrl';
import { Product } from '../types';

export const ProfileScreen: React.FC = () => {
  const { t } = useTranslation();
  const services = useMemo(
    () =>
      [
        { id: '1', label: t('profile.customerService'), icon: 'headset-outline' as const },
        { id: '2', label: t('profile.suppliers'), icon: 'people-outline' as const, route: 'Suppliers' as const },
        {
          id: '3',
          label: t('profile.subscription'),
          icon: 'diamond-outline' as const,
          route: 'Subscription' as const,
        },
      ] as {
        id: string;
        label: string;
        icon: keyof typeof Ionicons.glyphMap;
        route?: 'Suppliers' | 'Subscription';
      }[],
    [t]
  );
  const [userDetails, setUserDetails] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();
  const { user, clearUser } = useUserSession();
  const { isActive, refresh: refreshSubscription } = useSubscription();

  useFocusEffect(
    React.useCallback(() => {
      refreshSubscription();
      let cancelled = false;
      (async () => {
        if (!user?.email) {
          setLoadingUser(false);
          return;
        }
        try {
          setLoadingUser(true);
          const client = getERPNextClient();
          const userData = await client.getUserByEmail(user.email);
          if (!cancelled) setUserDetails(userData);
        } catch (error) {
          console.error('Error fetching user details:', error);
        } finally {
          if (!cancelled) setLoadingUser(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [refreshSubscription, user?.email])
  );

  // (user details loaded in useFocusEffect above so avatar updates after Edit Profile)
  // Fetch wishlist count
  const { wishlistItems, refresh: refreshWishlist } = useWishlist(user?.email || null);
  const wishlistCount = wishlistItems?.length || 0;
  
  // Fetch cart count
  const { cartItems, refresh: refreshCart } = useShoppingCart(user?.email || null);
  const cartCount = cartItems?.length || 0;
  
  // Fetch orders - using user email as customer identifier
  // Note: This might need adjustment if your ERPNext uses Customer doctype
  const { data: orders } = useOrders(user?.email || '', undefined);
  const orderCount = orders?.length || 0;
  
  // State for infinity scroll items
  const [scrollItems, setScrollItems] = useState<Product[]>([]);
  const [scrollItemsLoading, setScrollItemsLoading] = useState(false);
  const [hasMoreScrollItems, setHasMoreScrollItems] = useState(true);
  const [scrollItemsOffset, setScrollItemsOffset] = useState(0);
  const initialFetchRef = useRef(false);
  
  // Fetch infinity scroll items with randomization
  useEffect(() => {
    const fetchScrollItems = async () => {
      if (initialFetchRef.current) return;
      
      try {
        initialFetchRef.current = true;
        setScrollItemsLoading(true);
        const client = getERPNextClient();
        
        // Fetch items just like HomeScreen does - no offset, no filters
        const itemsPerPage = 12;
        
        console.log('ProfileScreen: Fetching scroll items');
        const items = await client.getWebsiteItems(undefined, itemsPerPage, 0);
        
        console.log('ProfileScreen: Fetched items:', items?.length || 0);
        
        if (items && items.length > 0) {
          // Shuffle the fetched items for more randomness
          const shuffledItems = items.sort(() => Math.random() - 0.5);
          const products = shuffledItems.map((item: any) => {
            try {
              const product = mapERPItemToProduct(item);
              console.log('ProfileScreen: Mapped product:', product?.id, product?.name);
              return product;
            } catch (err) {
              console.error('ProfileScreen: Error mapping item:', err, 'item:', item);
              return null;
            }
          });
          
          console.log('ProfileScreen: Mapped products sample:', products.slice(0, 2));
          
          // Filter out invalid products
          const validProducts = products.filter(p => {
            const isValid = p && p.id;
            if (!isValid) {
              console.log('ProfileScreen: Filtered out product:', p);
            }
            return isValid;
          });
          
          console.log('ProfileScreen: Valid products:', validProducts.length);
          setScrollItems(validProducts);
          setScrollItemsOffset(itemsPerPage);
          
          // Check if there are more items to load
          if (items.length < itemsPerPage) {
            setHasMoreScrollItems(false);
          }
        } else {
          console.log('ProfileScreen: No items returned from API');
          setHasMoreScrollItems(false);
        }
      } catch (error) {
        console.error('ProfileScreen: Error fetching scroll items:', error);
        setHasMoreScrollItems(false);
      } finally {
        setScrollItemsLoading(false);
      }
    };
    
    fetchScrollItems();
  }, []);
  
  const loadMoreScrollItems = () => {
    if (scrollItemsLoading || !hasMoreScrollItems) return;
    
    const loadMore = async () => {
      try {
        setScrollItemsLoading(true);
        const client = getERPNextClient();
        
        const itemsPerPage = 12;
        const items = await client.getWebsiteItems(undefined, itemsPerPage, scrollItemsOffset);
        
        if (items && items.length > 0) {
          const shuffledItems = items.sort(() => Math.random() - 0.5);
          const products = shuffledItems.map((item: any) => mapERPItemToProduct(item));
          
          // Filter out invalid products and duplicates
          setScrollItems(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const validNewProducts = products.filter(p => p && p.id && !existingIds.has(p.id));
            return [...prev, ...validNewProducts];
          });
          
          setScrollItemsOffset(prev => prev + itemsPerPage);
          
          if (items.length < itemsPerPage) {
            setHasMoreScrollItems(false);
          }
        } else {
          setHasMoreScrollItems(false);
        }
      } catch (error) {
        console.error('Error loading more items:', error);
        setHasMoreScrollItems(false);
      } finally {
        setScrollItemsLoading(false);
      }
    };
    
    loadMore();
  };

  // Randomize items when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (scrollItems.length > 0) {
        // Shuffle the current items for visual variety
        setScrollItems(prev => {
          const shuffled = [...prev].sort(() => Math.random() - 0.5);
          return shuffled;
        });
      }
      // Don't reset itemsFetched here - let the useEffect handle initial fetch
    }, [scrollItems.length])
  );

  // Handle infinite scroll - load more items when reaching bottom
  const handleScrollEndReached = () => {
    if (!scrollItemsLoading && hasMoreScrollItems && scrollItems.length > 0) {
      loadMoreScrollItems();
    }
  };
  
  // Handle pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh user details
      if (user?.email) {
        const client = getERPNextClient();
        const userData = await client.getUserByEmail(user.email);
        setUserDetails(userData);
      }
      
      // Refresh wishlist and cart
      if (refreshWishlist) refreshWishlist();
      if (refreshCart) refreshCart();
      
      // Reset explore items to fetch new random ones
      setScrollItems([]);
      setScrollItemsOffset(0);
      setHasMoreScrollItems(true);
      initialFetchRef.current = false;
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setRefreshing(false);
    }
  };
  
  // Calculate order status counts
  const unpaidCount = orders?.filter(o => o.status === 'pending').length || 0;
  const processingCount = orders?.filter(o => o.status === 'processing').length || 0;
  const shippedCount = orders?.filter(o => o.status === 'shipped').length || 0;
  
  // Get user display name
  const getUserDisplayName = () => {
    if (userDetails) {
      return userDetails.full_name || 
             `${userDetails.first_name || ''} ${userDetails.last_name || ''}`.trim() ||
             userDetails.name ||
             user?.email?.split('@')[0] ||
             'User';
    }
    return user?.email?.split('@')[0] || user?.fullName || 'User';
  };
  
  const getProfileImageUri = (): string | undefined => {
    const raw = userDetails?.user_image || userDetails?.image;
    if (!raw || String(raw).trim() === '') return undefined;
    return encodeErpFileUrl(String(raw).trim()) || undefined;
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    const name = getUserDisplayName();
    if (name && name.length > 0) {
      const parts = name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return name[0].toUpperCase();
    }
    return 'U';
  };

  const renderHeader = () => {
    if (loadingUser) {
      return (
        <View style={styles.header}>
          <View style={styles.profileInfo}>
            <ActivityIndicator size="small" color={Colors.ROYAL_BLUE} />
            <Text style={styles.loadingText}>Loading profile...</Text>
          </View>
        </View>
      );
    }
    
    if (!user?.email) {
      return (
        <View style={styles.header}>
          <View style={styles.profileInfo}>
            <Text style={styles.loadingText}>Please log in to view your profile</Text>
          </View>
        </View>
      );
    }
    
    return (
    <View style={styles.header}>
      <View style={styles.profileInfo}>
        <View style={styles.avatar}>
          {getProfileImageUri() ? (
            <ErpAuthenticatedImage uri={getProfileImageUri()!} style={styles.avatarImage} resizeMode="cover" />
          ) : (
            <Text style={styles.avatarText}>{getUserInitials()}</Text>
          )}
        </View>
        <View style={styles.userInfo}>
          <View style={styles.usernameRow}>
              <Text style={styles.username}>{getUserDisplayName()}</Text>
            <View style={styles.membershipBadge}>
              <Text style={styles.membershipText}>{isActive ? 'PRO' : 'S0'}</Text>
            </View>
          </View>
            <TouchableOpacity 
              style={styles.profileEditRow}
              onPress={() => (navigation as any).navigate('EditProfile')}
            >
            <Text style={styles.profileLabel}>My Profile</Text>
            <Ionicons name="pencil" size={14} color={Colors.BLACK} />
            </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIcon}>
            <Ionicons name="grid" size={16} color={Colors.BLACK} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerIcon}
              onPress={() => (navigation as any).navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={16} color={Colors.BLACK} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
  };

  const renderOrdersSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Orders</Text>
        <TouchableOpacity onPress={() => (navigation as any).navigate('OrderHistory')}>
          <Text style={styles.viewAllText}>View all {'>'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.invoicesLink}
        onPress={() => (navigation as any).navigate('InvoicesPayments')}
        activeOpacity={0.85}
      >
        <Ionicons name="wallet-outline" size={20} color={Colors.BLACK} style={{ marginRight: 10 }} />
        <Text style={styles.invoicesLinkText}>Invoices & payments</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
      </TouchableOpacity>
      <View style={styles.orderStatuses}>
        <View style={styles.orderStatus}>
          <Ionicons name="document-outline" size={18} color={Colors.BLACK} />
          <Text style={styles.orderStatusLabel}>Unpaid ({unpaidCount})</Text>
        </View>
        <View style={styles.orderStatus}>
          <Ionicons name="cube-outline" size={18} color={Colors.BLACK} />
          <Text style={styles.orderStatusLabel}>Processing ({processingCount})</Text>
        </View>
        <View style={styles.orderStatus}>
          <Ionicons name="car-outline" size={18} color={Colors.BLACK} />
          <Text style={styles.orderStatusLabel}>Shipped ({shippedCount})</Text>
        </View>
        <View style={styles.orderStatus}>
          <Ionicons name="chatbubble-outline" size={18} color={Colors.BLACK} />
          <Text style={styles.orderStatusLabel}>Review</Text>
        </View>
        <View style={styles.orderStatus}>
          <Ionicons name="arrow-undo-outline" size={18} color={Colors.BLACK} />
          <Text style={styles.orderStatusLabel}>Returns</Text>
          </View>
      </View>
    </View>
  );

  const renderActivitiesSection = () => null;

  const renderServicesSection = () => (
    <View style={styles.section}>
      <View style={styles.servicesContainer}>
        {services.map((service) => (
          <TouchableOpacity
            key={service.id}
            style={styles.serviceItem}
            onPress={() => {
              if (service.route) {
                (navigation as any).navigate(service.route);
              }
            }}
          >
            <Ionicons name={service.icon} size={18} color={Colors.BLACK} />
            <Text style={styles.serviceLabel}>{service.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderScrollItemsSection = () => {
    // Show nothing if no items and not loading and we've finished fetching
    if (scrollItems.length === 0 && !scrollItemsLoading && initialFetchRef.current) {
      console.log('ProfileScreen: No items to show');
      return null;
    }

    console.log('ProfileScreen: Rendering scroll items section, items:', scrollItems.length, 'loading:', scrollItemsLoading);

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Explore Items</Text>
        </View>
        {scrollItemsLoading && scrollItems.length === 0 ? (
          // Loading state
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.ROYAL_BLUE} />
            <Text style={styles.loadingText}>Loading explore items...</Text>
          </View>
        ) : (
          <FlatList
            scrollEnabled={false}
            nestedScrollEnabled={false}
            data={scrollItems}
            renderItem={({ item, index }) => {
              if (!item || !item.id) {
                console.log('ProfileScreen: Invalid item at index', index);
                return null;
              }
              console.log('ProfileScreen: Rendering item', item.id, item.name);
              return (
                <ProductCard
                  product={item}
                  onPress={(productId) => (navigation as any).navigate('ProductDetails', { productId })}
                  style={styles.scrollItemCard}
                />
              );
            }}
            keyExtractor={(item, index) => `scroll-item-${item.id}-${index}`}
            numColumns={2}
            columnWrapperStyle={styles.flatListColumnWrapper}
            ListFooterComponent={
              scrollItemsLoading && scrollItems.length > 0 ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.ROYAL_BLUE} />
                </View>
              ) : null
            }
          />
        )}
      </View>
    );
  };

  const handleCreateBundle = async () => {
    // Function removed - bundle creation moved to dedicated CreateBundleScreen
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            clearUser();
            // Navigate to Auth stack (Login screen)
            (navigation as any).reset({
              index: 0,
              routes: [{ name: 'Auth' }],
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderLogoutSection = () => {
    if (!user?.email) {
      return null;
    }

    return (
    <View style={styles.section}>
        <View style={styles.logoutContainer}>
          <TouchableOpacity 
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={18} color={Colors.ERROR} />
            <Text style={styles.logoutText}>Log Out</Text>
              </TouchableOpacity>
      </View>
    </View>
  );
  };

  const renderCreateBundleSection = () => {
    if (!user?.email) {
      return null;
    }

    return (
      <View style={styles.section}>
        <TouchableOpacity 
          style={styles.createBundleButton}
          onPress={() => (navigation as any).navigate('CreateBundle')}
          activeOpacity={0.7}
        >
          <Ionicons name="gift-outline" size={18} color={Colors.WHITE} />
          <View style={styles.createBundleContent}>
            <Text style={styles.createBundleTitle}>Create Bundle</Text>
            <Text style={styles.createBundleSubtitle}>Package items together</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={Colors.WHITE} />
        </TouchableOpacity>
      </View>
    );
  };


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.ROYAL_BLUE}
            colors={[Colors.ROYAL_BLUE]}
          />
        }
        onScroll={(event) => {
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          const paddingToBottom = 200; // Load more when 200px from bottom
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
            handleScrollEndReached();
          }
        }}
        scrollEventThrottle={400}
      >
        {renderHeader()}
        {renderOrdersSection()}
        {renderActivitiesSection()}
        {renderServicesSection()}
        {renderLogoutSection()}
        {false && renderCreateBundleSection()}
        {false && renderScrollItemsSection()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  userInfo: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  username: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginRight: 6,
  },
  googleBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  googleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.WHITE,
  },
  membershipBadge: {
    backgroundColor: Colors.ROYAL_BLUE,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  membershipText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: Colors.WHITE,
  },
  profileEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  profileLabel: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pricingRuleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F8FF',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  pricingRuleBannerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.ROYAL_BLUE,
    fontWeight: '500',
  },
  loadingText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    paddingVertical: 16,
  },
  section: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  viewAllText: {
    fontSize: 12,
    color: Colors.ROYAL_BLUE,
    fontWeight: '500',
  },
  invoicesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.WHITE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  invoicesLinkText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  orderStatuses: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  orderStatus: {
    flex: 1,
    alignItems: 'center',
  },
  orderStatusLabel: {
    fontSize: 10,
    color: Colors.TEXT_SECONDARY,
    marginTop: 3,
  },
  activitiesContainer: {
    paddingHorizontal: 16,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  activityContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityLabel: {
    fontSize: 12,
    color: Colors.BLACK,
    flex: 1,
  },
  activityValue: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
  },
  servicesContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  serviceItem: {
    flex: 1,
    alignItems: 'center',
  },
  serviceLabel: {
    fontSize: 10,
    color: Colors.TEXT_SECONDARY,
    marginTop: 6,
    textAlign: 'center',
  },
  productsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  productCard: {
    flex: 1,
    backgroundColor: Colors.WHITE,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  faveBanner: {
    backgroundColor: Colors.SHEIN_ORANGE,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  faveText: {
    fontSize: 10,
    color: Colors.WHITE,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  productImage: {
    width: '100%',
    height: 120,
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  productEmoji: {
    fontSize: 50,
  },
  brandInfo: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  categoryBadge: {
    backgroundColor: Colors.SHEIN_PINK,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },
  categoryText: {
    fontSize: 8,
    color: Colors.WHITE,
    fontWeight: 'bold',
  },
  timerContainer: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
  },
  timerText: {
    fontSize: 10,
    color: Colors.FLASH_SALE_RED,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  colorSwatches: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    gap: 4,
  },
  colorSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.WHITE,
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontSize: 12,
    color: Colors.BLACK,
    marginBottom: 4,
    lineHeight: 16,
  },
  bestsellerText: {
    fontSize: 10,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginBottom: 2,
  },
  originalPrice: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  estimatedText: {
    fontSize: 10,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 8,
  },
  addToCartButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.SHEIN_PINK,
    justifyContent: 'center',
    alignItems: 'center',
  },
  discountTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.SHEIN_ORANGE,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountText: {
    fontSize: 10,
    color: Colors.WHITE,
    fontWeight: 'bold',
  },
  logoutContainer: {
    paddingHorizontal: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.ERROR,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ERROR,
  },
  createBundleContainer: {
    paddingHorizontal: 16,
  },
  createBundleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ROYAL_BLUE,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  createBundleContent: {
    flex: 1,
  },
  createBundleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.WHITE,
  },
  createBundleSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BLACK,
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  bundleDropdownForm: {
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    gap: 12,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.BLACK,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.BLACK,
    backgroundColor: Colors.BACKGROUND,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: Colors.BORDER,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
  },
  submitButton: {
    flex: 1,
    backgroundColor: Colors.ROYAL_BLUE,
    paddingVertical: 10,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.WHITE,
  },
  dropdownFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  itemsTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addItemButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ROYAL_BLUE,
  },
  itemSearchContainer: {
    marginBottom: 8,
  },
  searchDropdown: {
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 6,
    marginTop: 4,
    maxHeight: 200,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    gap: 8,
  },
  searchResultImage: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  searchResultImageContainer: {
    width: 40,
    height: 40,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: Colors.LIGHT_GRAY,
  },
  searchResultImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  searchResultCode: {
    fontSize: 10,
    color: Colors.TEXT_SECONDARY,
    marginTop: 2,
  },
  searchResultText: {
    fontSize: 12,
    color: Colors.BLACK,
  },
  itemsTable: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 4,
    marginTop: 8,
    backgroundColor: Colors.WHITE,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: Colors.LIGHT_GRAY,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  tableHeaderCell: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.BLACK,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    alignItems: 'center',
  },
  tableCell: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    fontSize: 11,
    color: Colors.BLACK,
  },
  noColumn: {
    flex: 0.4,
    textAlign: 'center',
  },
  itemColumn: {
    flex: 1.2,
  },
  qtyColumn: {
    flex: 0.8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    justifyContent: 'center',
  },
  descColumn: {
    flex: 0.8,
  },
  actionColumn: {
    flex: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    width: 24,
    textAlign: 'center',
    fontSize: 11,
    color: Colors.BLACK,
  },
  descInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    backgroundColor: Colors.BACKGROUND,
    borderRadius: 2,
    paddingHorizontal: 4,
  },
  emptyItemsMessage: {
    padding: 12,
    alignItems: 'center',
  },
  emptyItemsText: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
  },
  scrollItemsList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  scrollItemsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  flatListColumnWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    justifyContent: 'space-between',
    gap: 12,
  },
  scrollItemCard: {
    width: '48%',
  },
  loadingContainer: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    alignSelf: 'center',
  },
  loadMoreButton: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: Colors.ROYAL_BLUE,
    borderRadius: 8,
    alignItems: 'center',
  },
  loadMoreButtonText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
});

