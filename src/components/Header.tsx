import React, { useCallback, useMemo, useState } from 'react';
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

const BAR_ROW_HEIGHT = 44;

export type HeaderMenuLeaf = {
  key: string;
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
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
  const { user } = useUserSession();
  const { isActive: subscriptionActive, isLoading: subscriptionLoading } = useSubscription();
  const { unreadTotal, refreshUnreadCounts } = useRavenUnread();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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
    setOpenGroups({});
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

  const toggleGroup = useCallback((key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const defaultMenuItems: HeaderMenuItem[] = useMemo(
    () => [
      {
        key: 'tab-home',
        label: t('tabs.activity'),
        icon: 'home-outline',
        onPress: () => nav.navigate('Main', { screen: 'Home' }),
      },
      {
        key: 'group-sourcing',
        type: 'group',
        label: t('home.menuGroupSourcing'),
        icon: 'briefcase-outline',
        children: [
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
        icon: 'people-outline',
        children: [
          {
            key: 'suppliers-browse',
            label: t('home.menuBrowseSuppliers'),
            icon: 'storefront-outline',
            onPress: () => {
              if (!user?.email) {
                nav.navigate('Auth');
                return;
              }
              if (!subscriptionLoading && !subscriptionActive) {
                goSubscriptionForPremium();
                return;
              }
              nav.navigate('Main', { screen: 'Suppliers' });
            },
          },
          {
            key: 'suppliers-chat',
            label: t('home.menuChat'),
            icon: 'chatbubbles-outline',
            onPress: () => {
              if (!user?.email) {
                nav.navigate('Auth');
                return;
              }
              if (!subscriptionLoading && !subscriptionActive) {
                goSubscriptionForPremium();
                return;
              }
              nav.navigate('RavenChatInbox');
            },
          },
          {
            key: 'suppliers-subscription',
            label: t('home.menuSubscription'),
            icon: 'diamond-outline',
            onPress: () => nav.navigate('Subscription'),
          },
          {
            key: 'suppliers-invoices',
            label: t('home.menuInvoices'),
            icon: 'wallet-outline',
            onPress: () => nav.navigate('InvoicesPayments'),
          },
        ],
      },
      {
        key: 'tab-profile',
        label: t('tabs.account'),
        icon: 'person-outline',
        onPress: () => nav.navigate('Main', { screen: 'Profile' }),
      },
    ],
    [nav, t, user?.email, subscriptionActive, subscriptionLoading, goSubscriptionForPremium]
  );

  const menuItems = useMemo(() => {
    const prefix = prependMenuItems ?? [];
    return [...prefix, ...defaultMenuItems];
  }, [prependMenuItems, defaultMenuItems]);

  const menuSheetWidth = useMemo(
    () => Math.min(340, Math.round(Dimensions.get('window').width * 0.86)),
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
          <View style={[styles.menuSheet, { width: menuSheetWidth, paddingTop: insets.top + 8 }]}>
            <View style={styles.menuSheetHeader}>
              <Text style={styles.menuSheetTitle}>{t('home.menuTitle')}</Text>
              <TouchableOpacity
                onPress={closeMenu}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('home.menuCloseA11y')}
              >
                <Ionicons name="close" size={26} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.menuScroll} bounces={false} showsVerticalScrollIndicator={false}>
              {menuItems.map((item) => {
                if (isHeaderMenuGroup(item)) {
                  const open = !!openGroups[item.key];
                  return (
                    <View key={item.key}>
                      <TouchableOpacity
                        style={styles.menuRow}
                        onPress={() => toggleGroup(item.key)}
                        activeOpacity={0.65}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                        accessibilityState={{ expanded: open }}
                      >
                        <Ionicons
                          name={item.icon ?? 'ellipse-outline'}
                          size={22}
                          color="#374151"
                          style={styles.menuRowIcon}
                        />
                        <Text style={styles.menuRowLabel}>{item.label}</Text>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#6B7280" />
                      </TouchableOpacity>
                      {open
                        ? item.children.map((child) => (
                            <TouchableOpacity
                              key={child.key}
                              style={[styles.menuRow, styles.menuSubRow]}
                              onPress={() => runMenuLeaf(child)}
                              activeOpacity={0.65}
                              accessibilityRole="button"
                              accessibilityLabel={child.label}
                            >
                              <Ionicons
                                name={child.icon ?? 'ellipse-outline'}
                                size={20}
                                color="#6B7280"
                                style={styles.menuSubIcon}
                              />
                              <Text style={styles.menuSubLabel}>{child.label}</Text>
                              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
                            </TouchableOpacity>
                          ))
                        : null}
                    </View>
                  );
                }
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.menuRow}
                    onPress={() => runMenuLeaf(item)}
                    activeOpacity={0.65}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <Ionicons name={item.icon ?? 'ellipse-outline'} size={22} color="#374151" style={styles.menuRowIcon} />
                    <Text style={styles.menuRowLabel}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
                  </TouchableOpacity>
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
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  menuSheet: {
    backgroundColor: Colors.WHITE,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.BORDER,
  },
  menuSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  menuSheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  menuScroll: {
    flexGrow: 0,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  menuRowIcon: {
    marginRight: 14,
    width: 26,
    textAlign: 'center',
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  menuSubRow: {
    backgroundColor: '#F9FAFB',
    paddingLeft: 12,
  },
  menuSubIcon: {
    marginRight: 12,
    width: 26,
    textAlign: 'center',
  },
  menuSubLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
});
