import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useRavenUnread } from '../context/RavenUnreadContext';
import { useTranslation } from 'react-i18next';
import { requestSuppliersTabReset } from '../utils/suppliersTabReset';
import { appAlert as Alert } from '../services/appAlert';

const BAR_ROW_HEIGHT = 44;
const DEFAULT_EXPANDED_SECTIONS = ['group-browse'];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type HeaderMenuLeaf = {
  key: string;
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
};

/** Expandable section in the side menu (tap to show children). */
export type HeaderMenuGroup = {
  key: string;
  type: 'group';
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: HeaderMenuLeaf[];
};

export type HeaderMenuItem = HeaderMenuLeaf | HeaderMenuGroup;

function isHeaderMenuGroup(item: HeaderMenuItem): item is HeaderMenuGroup {
  return (item as HeaderMenuGroup).type === 'group';
}

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  /** Extra rows at the top of the left menu (e.g. About SourceWave on Home). */
  prependMenuItems?: HeaderMenuItem[];
  /** Override default chat → inbox / auth behaviour. */
  onMailPress?: () => void;
  showBackButton?: boolean;
  onBackPress?: () => void;
  elevated?: boolean;
  headerBackgroundColor?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  prependMenuItems,
  onMailPress,
  showBackButton = false,
  onBackPress,
  elevated = false,
  headerBackgroundColor: customHeaderBackgroundColor,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { user, clearUser } = useUserSession();
  const { isActive: subscriptionActive, isLoading: subscriptionLoading } = useSubscription();
  const { unreadTotal, refreshUnreadCounts } = useRavenUnread();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!menuOpen) return;
    const initial: Record<string, boolean> = {};
    for (const key of DEFAULT_EXPANDED_SECTIONS) initial[key] = true;
    setExpandedSections(initial);
  }, [menuOpen]);

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadCounts();
    }, [refreshUnreadCounts])
  );

  const barBg = customHeaderBackgroundColor ?? Colors.WHITE;
  const iconColor = customHeaderBackgroundColor === Colors.BLACK ? Colors.WHITE : '#1C1C1E';
  const titleColor = customHeaderBackgroundColor === Colors.BLACK ? Colors.WHITE : '#111827';
  const subtitleColor = customHeaderBackgroundColor === Colors.BLACK ? 'rgba(255,255,255,0.75)' : '#6B7280';

  const nav = navigation as {
    navigate: (name: string, params?: object) => void;
    canGoBack?: () => boolean;
    goBack: () => void;
  };

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const closeMenuThen = useCallback(
    (fn: () => void) => {
      closeMenu();
      setTimeout(fn, 0);
    },
    [closeMenu]
  );

  const goSubscriptionForPremium = useCallback(() => {
    nav.navigate('Subscription');
  }, [nav]);

  const premiumSuppliersAction = useCallback(
    (action: () => void) => {
      if (!user?.email) {
        nav.navigate('Auth');
        return;
      }
      if (!subscriptionLoading && !subscriptionActive) {
        goSubscriptionForPremium();
        return;
      }
      action();
    },
    [user?.email, subscriptionLoading, subscriptionActive, goSubscriptionForPremium, nav]
  );

  const handleLogout = useCallback(() => {
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: () => clearUser(),
      },
    ]);
  }, [clearUser, t]);

  const defaultMenuItems: HeaderMenuItem[] = useMemo(() => {
    const accountChildren: HeaderMenuLeaf[] = [
      {
        key: 'tab-profile',
        label: t('tabs.account'),
        icon: 'person-outline',
        onPress: () => nav.navigate('Main', { screen: 'Profile' }),
      },
    ];
    if (user?.email) {
      accountChildren.push({
        key: 'account-logout',
        label: t('settings.logout'),
        icon: 'log-out-outline',
        destructive: true,
        onPress: () => handleLogout(),
      });
    }

    return [
      {
        key: 'group-browse',
        type: 'group',
        label: t('home.menuGroupBrowse'),
        icon: 'compass-outline',
        children: [
          {
            key: 'tab-home',
            label: t('tabs.activity'),
            icon: 'home-outline',
            onPress: () => nav.navigate('Main', { screen: 'Home' }),
          },
          {
            key: 'sourcing-make-order',
            label: t('home.menuMakeOrder'),
            icon: 'add-circle-outline',
            onPress: () => nav.navigate('Main', { screen: 'Sourcing' }),
          },
          {
            key: 'sourcing-orders',
            label: t('home.menuSalesOrders'),
            icon: 'receipt-outline',
            onPress: () => nav.navigate('OrderHistory'),
          },
          {
            key: 'sourcing-category',
            label: t('home.menuCategory'),
            icon: 'grid-outline',
            onPress: () => nav.navigate('Main', { screen: 'Categories' }),
          },
        ],
      },
      {
        key: 'group-suppliers',
        type: 'group',
        label: t('home.menuGroupSuppliers'),
        icon: 'storefront-outline',
        children: [
          {
            key: 'suppliers-browse',
            label: t('home.menuBrowseSuppliers'),
            icon: 'storefront-outline',
            onPress: () => {
              premiumSuppliersAction(() => {
                requestSuppliersTabReset();
                nav.navigate('Main', { screen: 'Suppliers' });
              });
            },
          },
          {
            key: 'suppliers-chat',
            label: t('home.menuChat'),
            icon: 'chatbubbles-outline',
            onPress: () => {
              premiumSuppliersAction(() => nav.navigate('RavenChatInbox'));
            },
          },
          {
            key: 'suppliers-subscription',
            label: t('home.menuSubscription'),
            icon: 'diamond-outline',
            onPress: () => nav.navigate('Subscription'),
          },
        ],
      },
      {
        key: 'group-billing',
        type: 'group',
        label: t('home.menuGroupBilling'),
        icon: 'wallet-outline',
        children: [
          {
            key: 'suppliers-invoices',
            label: t('home.menuInvoices'),
            icon: 'document-text-outline',
            onPress: () => nav.navigate('CustomerInvoices'),
          },
          {
            key: 'suppliers-delivery-notes',
            label: t('home.menuDeliveryNotes'),
            icon: 'airplane-outline',
            onPress: () => nav.navigate('CustomerDeliveryNotes'),
          },
          {
            key: 'suppliers-payments',
            label: t('profile.paymentHistory'),
            icon: 'card-outline',
            onPress: () => nav.navigate('CustomerPayments'),
          },
        ],
      },
      {
        key: 'group-account',
        type: 'group',
        label: t('home.menuGroupAccount'),
        icon: 'person-outline',
        children: accountChildren,
      },
    ];
  }, [nav, t, premiumSuppliersAction, user?.email, handleLogout]);

  const menuItems = useMemo(() => {
    const prefix = prependMenuItems ?? [];
    return [...prefix, ...defaultMenuItems];
  }, [prependMenuItems, defaultMenuItems]);

  const menuSheetWidth = useMemo(
    () => Math.min(380, Math.round(Dimensions.get('window').width * 0.92)),
    []
  );

  const handleChatPress = () => {
    if (onMailPress) {
      onMailPress();
      return;
    }
    if (!user?.email) {
      nav.navigate('Auth');
      return;
    }
    if (!subscriptionLoading && !subscriptionActive) {
      goSubscriptionForPremium();
      return;
    }
    nav.navigate('RavenChatInbox');
  };

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      if (nav.canGoBack?.()) {
        nav.goBack();
      } else {
        nav.navigate('Main', { screen: 'Home' });
      }
    }
  };

  const runMenuLeaf = (item: HeaderMenuLeaf) => {
    closeMenuThen(item.onPress);
  };

  const toggleSection = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sectionBadge = (group: HeaderMenuGroup): number | null => {
    if (group.key === 'group-suppliers' && user?.email && unreadTotal > 0) return unreadTotal;
    return null;
  };

  const renderMenuLeaf = (child: HeaderMenuLeaf, opts?: { lastInSection?: boolean; indent?: boolean }) => (
    <TouchableOpacity
      key={child.key}
      style={[
        styles.menuRow,
        opts?.indent !== false && styles.menuRowIndented,
        opts?.lastInSection && styles.menuRowLast,
        opts?.indent === false && styles.menuRowTopLevel,
      ]}
      onPress={() => runMenuLeaf(child)}
      activeOpacity={0.65}
      accessibilityRole="button"
      accessibilityLabel={child.label}
    >
      {child.icon ? (
        <Ionicons
          name={child.icon}
          size={20}
          color={child.destructive ? Colors.ERROR : '#6B7280'}
          style={styles.menuRowIcon}
        />
      ) : null}
      <Text style={[styles.menuRowLabel, child.destructive && styles.menuRowLabelDestructive]}>
        {child.label}
      </Text>
      {child.key === 'suppliers-chat' && user?.email && unreadTotal > 0 ? (
        <View style={styles.menuUnreadBadge}>
          <Text style={styles.menuUnreadBadgeText}>{unreadTotal > 99 ? '99+' : String(unreadTotal)}</Text>
        </View>
      ) : null}
      {!child.destructive ? <Ionicons name="chevron-forward" size={16} color="#C7C7CC" /> : null}
    </TouchableOpacity>
  );

  const renderMenuGroup = (group: HeaderMenuGroup) => {
    const expanded = !!expandedSections[group.key];
    const badge = sectionBadge(group);

    return (
      <View key={group.key} style={styles.menuSection}>
        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() => toggleSection(group.key)}
          activeOpacity={0.65}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${group.label}, ${expanded ? t('home.menuSectionCollapse') : t('home.menuSectionExpand')}`}
        >
          {group.icon ? (
            <Ionicons name={group.icon} size={20} color="#6B7280" style={styles.accordionHeaderIcon} />
          ) : null}
          <Text style={styles.accordionTitle}>{group.label}</Text>
          <View style={styles.accordionTrailing}>
            {badge != null ? (
              <View style={styles.menuUnreadBadge}>
                <Text style={styles.menuUnreadBadgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
              </View>
            ) : null}
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
          </View>
        </TouchableOpacity>
        {expanded ? (
          <View style={styles.accordionBody}>
            {group.children.map((child, childIdx) =>
              renderMenuLeaf(child, { lastInSection: childIdx === group.children.length - 1 })
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top > 0 ? insets.top : Platform.OS === 'ios' ? 12 : 8,
          backgroundColor: barBg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: elevated ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.06)',
        },
      ]}
    >
      <Modal visible={menuOpen} transparent animationType="none" onRequestClose={closeMenu}>
        <View style={styles.menuOverlay}>
          <View
            style={[
              styles.menuSheet,
              {
                width: menuSheetWidth,
                paddingTop: insets.top + 8,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={styles.menuSheetHeader}>
              <View style={styles.menuSheetTitleBlock}>
                <Text style={styles.menuSheetTitle}>{t('home.menuTitle')}</Text>
                {user?.email ? (
                  <Text style={styles.menuSheetSubtitle} numberOfLines={1}>
                    {user.fullName?.trim() || user.email}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={closeMenu}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('home.menuCloseA11y')}
              >
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.menuScroll}
              contentContainerStyle={styles.menuScrollContent}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              {menuItems.map((item) => {
                if (isHeaderMenuGroup(item)) return renderMenuGroup(item);
                return (
                  <View key={item.key} style={styles.menuSection}>
                    {renderMenuLeaf(item, { lastInSection: true, indent: false })}
                  </View>
                );
              })}
            </ScrollView>
          </View>
          <Pressable style={styles.menuBackdrop} onPress={closeMenu} />
        </View>
      </Modal>

      <View style={[styles.row, { minHeight: BAR_ROW_HEIGHT }]}>
        <View style={styles.sideSlot}>
          {showBackButton ? (
            <TouchableOpacity
              style={styles.iconHit}
              onPress={handleBackPress}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('home.menuBackA11y')}
            >
              <Ionicons name="arrow-back" size={22} color={iconColor} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.iconHit}
              onPress={() => setMenuOpen(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('home.menuOpenA11y')}
            >
              <Ionicons name="menu-outline" size={26} color={iconColor} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.titleArea} pointerEvents="none">
          {title ? (
            <>
              <Text style={[styles.titleText, { color: titleColor }]} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[styles.subtitleText, { color: subtitleColor }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={styles.sideSlotRight}>
          <View style={styles.chatIconWrap}>
            <TouchableOpacity
              style={styles.iconHit}
              onPress={handleChatPress}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('home.menuChatA11y')}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={iconColor} />
            </TouchableOpacity>
            {user?.email && unreadTotal > 0 ? (
              <View style={styles.chatBadge} pointerEvents="none">
                <Text style={styles.chatBadgeText}>{unreadTotal > 99 ? '99+' : String(unreadTotal)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.SCREEN_PADDING - 4,
    paddingBottom: 6,
  },
  sideSlot: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideSlotRight: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHit: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatIconWrap: {
    position: 'relative',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: Colors.SHEIN_PINK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.WHITE,
  },
  titleArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitleText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  menuOverlay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  menuSheet: {
    alignSelf: 'stretch',
    backgroundColor: Colors.WHITE,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.BORDER,
  },
  menuSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  menuSheetTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  menuSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  menuSheetSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '400',
    color: '#6B7280',
  },
  menuScroll: {
    flex: 1,
  },
  menuScrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  menuSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    minHeight: 50,
    backgroundColor: Colors.WHITE,
  },
  accordionHeaderIcon: {
    marginRight: 12,
  },
  accordionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  accordionTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accordionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.BORDER,
    backgroundColor: '#FAFAFA',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
    backgroundColor: '#FAFAFA',
  },
  menuRowIndented: {
    paddingLeft: 48,
  },
  menuRowTopLevel: {
    backgroundColor: Colors.WHITE,
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuRowIcon: {
    width: 22,
    marginRight: 12,
    textAlign: 'center',
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  menuRowLabelDestructive: {
    color: Colors.ERROR,
    fontWeight: '600',
  },
  menuUnreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Colors.SHEIN_PINK,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  menuUnreadBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.WHITE,
  },
});
