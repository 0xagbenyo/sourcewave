import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';
import { useFlyers, useOrders } from '../hooks/erpnext';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const width = SCREEN_WIDTH;
const FLYER_H = Math.min(Math.round(SCREEN_WIDTH * 0.52), 280);
const HOME_FLYER_CAROUSEL_HEIGHT = FLYER_H;
const FLYER_AUTO_ADVANCE_MS = 5500;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [resolvedCustomerId, setResolvedCustomerId] = useState('');
  const { user } = useUserSession();
  const { isActive: subscriptionActive, isLoading: subscriptionLoading } = useSubscription();

  const { data: flyers, loading: flyersLoading, error: flyersError, refetch: refetchFlyers } = useFlyers();
  const flyerScrollRef = useRef<ScrollView>(null);
  const flyerIndexRef = useRef(0);
  const flyersLenRef = useRef(0);
  const flyersSigRef = useRef('');

  const {
    data: orders,
    loading: ordersLoading,
    error: ordersError,
    refresh: refreshOrders,
  } = useOrders(resolvedCustomerId, undefined, 20);

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
        const client = (await import('../services/erpnext')).getERPNextClient();
        const customer = await client.getCustomerByEmail(user.email);
        if (isMounted) setResolvedCustomerId(customer?.name || '');
      } catch {
        if (isMounted) setResolvedCustomerId('');
      }
    };
    void resolveCustomer();
    return () => {
      isMounted = false;
    };
  }, [user?.user, user?.email]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchFlyers();
      refreshOrders();
    } finally {
      setRefreshing(false);
    }
  }, [refetchFlyers, refreshOrders]);

  const recentOrders = useMemo(() => {
    if (!orders?.length) return [];
    return [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [orders]);

  useEffect(() => {
    flyersLenRef.current = flyers?.length ?? 0;
  }, [flyers?.length]);

  useEffect(() => {
    const list = flyers ?? [];
    const sig = list.map((f: { name: string }) => f.name).join('\u0001');
    if (sig === flyersSigRef.current) return;
    flyersSigRef.current = sig;
    flyerIndexRef.current = 0;
    if (list.length > 0) {
      requestAnimationFrame(() => {
        flyerScrollRef.current?.scrollTo({ x: 0, animated: false });
      });
    }
  }, [flyers]);

  const onFlyerMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const len = flyers?.length ?? 0;
    if (len < 1) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    flyerIndexRef.current = Math.min(Math.max(0, page), len - 1);
  }, [flyers?.length]);

  useFocusEffect(
    useCallback(() => {
      const len = flyers?.length ?? 0;
      if (len < 2) return undefined;
      const id = setInterval(() => {
        const n = flyersLenRef.current;
        if (n < 2) return;
        flyerIndexRef.current = (flyerIndexRef.current + 1) % n;
        flyerScrollRef.current?.scrollTo({
          x: flyerIndexRef.current * SCREEN_WIDTH,
          animated: true,
        });
      }, FLYER_AUTO_ADVANCE_MS);
      return () => clearInterval(id);
    }, [flyers?.length])
  );

  const goMessages = () => {
    if (!user?.email) {
      (navigation as any).navigate('Auth');
      return;
    }
    if (!subscriptionLoading && !subscriptionActive) {
      (navigation as { navigate: (name: string) => void }).navigate('Subscription');
      return;
    }
    (navigation as any).navigate('RavenChatInbox');
  };

  const goOrders = () => {
    (navigation as any).navigate('OrderHistory');
  };

  const goAccount = () => {
    (navigation as any).navigate('Profile');
  };

  const renderQuickActions = () => (
    <View style={homeLayout.shortcutRow}>
      <TouchableOpacity
        style={[homeLayout.shortcutCell, homeLayout.shortcutCellBorder]}
        activeOpacity={0.75}
        onPress={goMessages}
        accessibilityRole="button"
        accessibilityLabel={t('home.quickMessages')}
      >
        <Ionicons name="chatbubbles-outline" size={22} color="#374151" />
        <Text style={homeLayout.shortcutLabel}>{t('home.quickMessages')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[homeLayout.shortcutCell, homeLayout.shortcutCellBorder]}
        activeOpacity={0.75}
        onPress={goOrders}
        accessibilityRole="button"
        accessibilityLabel={t('home.quickOrders')}
      >
        <Ionicons name="receipt-outline" size={22} color="#374151" />
        <Text style={homeLayout.shortcutLabel}>{t('home.quickOrders')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={homeLayout.shortcutCell}
        activeOpacity={0.75}
        onPress={goAccount}
        accessibilityRole="button"
        accessibilityLabel={t('home.quickAccount')}
      >
        <Ionicons name="person-circle-outline" size={22} color="#374151" />
        <Text style={homeLayout.shortcutLabel}>{t('home.quickAccount')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFlyerCarousel = () => {
    if (flyersLoading) {
      return (
        <View style={homeLayout.flyerShell}>
          <View style={[homeLayout.flyerFrame, { justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator size="large" color={Colors.SHEIN_PINK} />
          </View>
        </View>
      );
    }
    if (flyersError || !flyers?.length) {
      return (
        <View style={homeLayout.flyerShell}>
          <View style={[homeLayout.flyerEmpty, { minHeight: FLYER_H * 0.45 }]}>
            <Ionicons name="images-outline" size={36} color="#D1D5DB" />
            <Text style={homeLayout.flyerEmptyTitle}>{t('home.flyersHeading')}</Text>
            <Text style={homeLayout.flyerEmptyText}>Nothing to show right now. Pull to refresh.</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={homeLayout.flyerShell}>
        <ScrollView
          ref={flyerScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={SCREEN_WIDTH}
          snapToAlignment="start"
          style={[styles.flyerCarouselScroll, { height: FLYER_H, width: SCREEN_WIDTH }]}
          onMomentumScrollEnd={onFlyerMomentumEnd}
        >
          {flyers.map((flyer: { name: string; image: string | null }) => (
            <TouchableOpacity
              key={flyer.name}
              activeOpacity={0.92}
              style={[styles.flyerImageContainer, { width: SCREEN_WIDTH, height: FLYER_H }]}
              onPress={() => {
                (navigation as any).navigate('FlyerDetail', { flyerName: flyer.name });
              }}
            >
              {flyer.image ? (
                <ErpAuthenticatedImage uri={flyer.image} style={styles.flyerImage} resizeMode="cover" />
              ) : (
                <View style={styles.flyerPlaceholder}>
                  <Ionicons name="image-outline" size={48} color={Colors.TEXT_SECONDARY} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderRecentOrders = () => {
    if (!resolvedCustomerId.trim()) {
      return (
        <View style={homeLayout.ordersBlock}>
          <Text style={homeLayout.ordersKicker}>{t('home.ordersHeading')}</Text>
          <Text style={homeLayout.ordersEmpty}>{t('home.ordersSignIn')}</Text>
        </View>
      );
    }
    if (ordersLoading && !orders?.length) {
      return (
        <View style={homeLayout.ordersBlock}>
          <View style={homeLayout.ordersBlockHeader}>
            <Text style={homeLayout.ordersBlockTitle}>{t('home.ordersHeading')}</Text>
          </View>
          <ActivityIndicator style={homeLayout.ordersLoading} color={Colors.TEXT_SECONDARY} />
        </View>
      );
    }
    if (ordersError) return null;
    if (!recentOrders.length) {
      return (
        <View style={homeLayout.ordersBlock}>
          <Text style={homeLayout.ordersKicker}>{t('home.ordersHeading')}</Text>
          <Text style={homeLayout.ordersEmpty}>{t('home.ordersEmpty')}</Text>
        </View>
      );
    }
    return (
      <View style={homeLayout.ordersBlock}>
        <View style={homeLayout.ordersBlockHeader}>
          <Text style={homeLayout.ordersBlockTitle}>{t('home.ordersHeading')}</Text>
          <TouchableOpacity onPress={() => (navigation as any).navigate('OrderHistory')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={homeLayout.seeAll}>{t('home.seeAll')}</Text>
          </TouchableOpacity>
        </View>
        {recentOrders.map((o, idx) => (
          <TouchableOpacity
            key={o.id}
            style={[homeLayout.orderRow, idx === recentOrders.length - 1 && homeLayout.orderRowLast]}
            onPress={() => (navigation as any).navigate('OrderDetails', { orderId: o.id })}
            activeOpacity={0.7}
          >
            <View style={homeLayout.orderRowText}>
              <Text style={homeLayout.orderId} numberOfLines={1}>
                {o.orderNumber || o.id}
              </Text>
              <Text style={homeLayout.orderMeta} numberOfLines={1}>
                {new Date(o.createdAt).toLocaleDateString()} · {o.status || '—'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={homeLayout.root} edges={['bottom']}>
      <Header
        title={t('tabs.activity')}
        prependMenuItems={[
          {
            key: 'about-sourcewave',
            label: t('home.menuAboutSourceWave'),
            icon: 'information-circle-outline',
            onPress: () => setInfoModalVisible(true),
          },
        ]}
      />
      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <View style={homeLayout.modalRoot}>
          <Pressable style={homeLayout.modalBackdrop} onPress={() => setInfoModalVisible(false)} />
          <View style={homeLayout.modalCard}>
            <Text style={homeLayout.modalTitle}>{t('home.sourcewaveInfoTitle')}</Text>
            <Text style={homeLayout.modalBody}>{t('home.sourcewaveInfoLead')}</Text>
            <Text style={[homeLayout.modalBody, homeLayout.modalBodyGap]}>{t('home.sourcewaveInfoMore')}</Text>
            <TouchableOpacity
              style={homeLayout.modalButton}
              onPress={() => setInfoModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={homeLayout.modalButtonText}>{t('home.infoModalClose')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ScrollView
        style={homeLayout.scroll}
        contentContainerStyle={homeLayout.scrollContent}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.SHEIN_PINK]} />}
      >
        {renderFlyerCarousel()}
        <View style={homeLayout.belowFlyerPanel}>
          {renderQuickActions()}
          {renderRecentOrders()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const homeLayout = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.PADDING_XL,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.WHITE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
    borderRadius: 4,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    zIndex: 2,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4B5563',
  },
  modalBodyGap: {
    marginTop: 12,
  },
  modalButton: {
    marginTop: 20,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#111827',
    borderRadius: 4,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.WHITE,
  },
  belowFlyerPanel: {
    width: SCREEN_WIDTH,
    alignSelf: 'center',
    backgroundColor: Colors.WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  shortcutCell: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    minHeight: 76,
  },
  shortcutCellBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.BORDER,
  },
  shortcutLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  ordersBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.BORDER,
    paddingBottom: 2,
  },
  ordersBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  ordersBlockTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#6B7280',
  },
  ordersKicker: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#6B7280',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  ordersLoading: {
    marginVertical: 22,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  orderRowLast: {
    borderBottomWidth: 0,
  },
  orderRowText: {
    flex: 1,
    marginRight: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.2,
  },
  orderMeta: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B7280',
  },
  flyerShell: {
    width: SCREEN_WIDTH,
    alignSelf: 'center',
    marginTop: 0,
    marginHorizontal: 0,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: Colors.WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
  },
  flyerFrame: {
    width: '100%',
    height: FLYER_H,
    backgroundColor: '#F2F2F7',
  },
  flyerEmpty: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flyerEmptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  flyerEmptyText: {
    marginTop: 6,
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  ordersEmpty: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 2,
  },
});

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
		marginBottom: 12,
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
		height: HOME_FLYER_CAROUSEL_HEIGHT,
		position: 'relative',
		zIndex: 1,
	},
	/** Horizontal ScrollView must have explicit height or it can collapse / clip on some layouts. */
	flyerCarouselScroll: {
		height: HOME_FLYER_CAROUSEL_HEIGHT,
		width: '100%',
	},
	flyerImageContainer: {
		width: width,
		height: HOME_FLYER_CAROUSEL_HEIGHT,
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
