import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import { Header } from '../components/Header';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useOrders } from '../hooks/erpnext';
import { getERPNextClient } from '../services/erpnext';
import { encodeErpFileUrl } from '../utils/erpImageUrl';

const hairline = StyleSheet.hairlineWidth;

export const ProfileScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const services = useMemo(
    () =>
      [
        { id: '1', label: t('profile.contactUs'), icon: 'mail-outline' as const, route: 'ContactUs' as const },
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
        route?: 'Suppliers' | 'Subscription' | 'ContactUs';
      }[],
    [t]
  );

  const [userDetails, setUserDetails] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user, clearUser } = useUserSession();
  const { isActive, refresh: refreshSubscription } = useSubscription();
  const { data: orders } = useOrders(user?.email || '', undefined);

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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      refreshSubscription();
      if (user?.email) {
        const client = getERPNextClient();
        const userData = await client.getUserByEmail(user.email);
        setUserDetails(userData);
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const unpaidCount = orders?.filter((o) => o.status === 'pending').length || 0;
  const processingCount = orders?.filter((o) => o.status === 'processing').length || 0;
  const shippedCount = orders?.filter((o) => o.status === 'shipped').length || 0;

  const getUserDisplayName = () => {
    if (userDetails) {
      return (
        userDetails.full_name ||
        `${userDetails.first_name || ''} ${userDetails.last_name || ''}`.trim() ||
        userDetails.name ||
        user?.email?.split('@')[0] ||
        'User'
      );
    }
    return user?.email?.split('@')[0] || user?.fullName || 'User';
  };

  const getProfileImageUri = (): string | undefined => {
    const raw = userDetails?.user_image || userDetails?.image;
    if (!raw || String(raw).trim() === '') return undefined;
    return encodeErpFileUrl(String(raw).trim()) || undefined;
  };

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

  const nav = navigation as { navigate: (name: string, params?: object) => void };

  const handleLogout = () => {
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: () => {
          clearUser();
          (navigation as any).reset({
            index: 0,
            routes: [{ name: 'Auth' }],
          });
        },
      },
    ]);
  };

  const headerSubtitle = user?.email?.trim() || t('profile.guestSubtitle');

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header title={t('tabs.account')} subtitle={headerSubtitle} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.WINE}
            colors={[Colors.WINE]}
          />
        }
      >
        {loadingUser && user?.email ? (
          <View style={styles.loaderBlock}>
            <ActivityIndicator size="small" color={Colors.WINE} />
            <Text style={styles.muted}>{t('profile.loading')}</Text>
          </View>
        ) : null}

        {!user?.email ? (
          <Text style={styles.signInHint}>{t('profile.signInBody')}</Text>
        ) : null}

        {user?.email && !loadingUser ? (
          <>
            <Text style={styles.sectionLabel}>{t('profile.sectionProfile')}</Text>
            <View style={styles.group}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => nav.navigate('EditProfile')}
                activeOpacity={0.75}
              >
                <View style={styles.avatar}>
                  {getProfileImageUri() ? (
                    <ErpAuthenticatedImage uri={getProfileImageUri()!} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.avatarText}>{getUserInitials()}</Text>
                  )}
                </View>
                <View style={styles.rowMain}>
                  <View style={styles.titleRow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {getUserDisplayName()}
                    </Text>
                    <View style={[styles.badge, isActive ? styles.badgePro : styles.badgeFree]}>
                      <Text style={[styles.badgeText, isActive ? styles.badgeTextPro : styles.badgeTextFree]}>
                        {isActive ? 'PRO' : 'S0'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.rowSubtitle}>{t('profile.editProfileHint')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.row}
                onPress={() => nav.navigate('Settings')}
                activeOpacity={0.75}
              >
                <Ionicons name="settings-outline" size={22} color={Colors.WINE} style={styles.rowIcon} />
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{t('settings.title')}</Text>
                  <Text style={styles.rowSubtitle}>{t('settings.addressesSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>{t('profile.sectionOrders')}</Text>
            <View style={styles.group}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => nav.navigate('OrderHistory')}
                activeOpacity={0.75}
              >
                <Ionicons name="receipt-outline" size={22} color={Colors.WINE} style={styles.rowIcon} />
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{t('profile.myOrders')}</Text>
                  <Text style={styles.rowSubtitle}>{t('profile.orderHistoryHint')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.row}
                onPress={() => nav.navigate('InvoicesPayments')}
                activeOpacity={0.75}
              >
                <Ionicons name="wallet-outline" size={22} color={Colors.WINE} style={styles.rowIcon} />
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{t('profile.invoicesPayments')}</Text>
                  <Text style={styles.rowSubtitle}>{t('profile.invoicesHint')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>

              <View style={styles.orderStrip}>
                <View style={styles.orderStat}>
                  <Ionicons name="document-outline" size={18} color={Colors.WINE} />
                  <Text style={styles.orderStatLabel}>
                    {t('profile.unpaid')} ({unpaidCount})
                  </Text>
                </View>
                <View style={styles.orderStat}>
                  <Ionicons name="cube-outline" size={18} color={Colors.WINE} />
                  <Text style={styles.orderStatLabel}>
                    {t('profile.processing')} ({processingCount})
                  </Text>
                </View>
                <View style={styles.orderStat}>
                  <Ionicons name="car-outline" size={18} color={Colors.WINE} />
                  <Text style={styles.orderStatLabel}>
                    {t('profile.shipped')} ({shippedCount})
                  </Text>
                </View>
                <View style={styles.orderStat}>
                  <Ionicons name="chatbubble-outline" size={18} color={Colors.TEXT_SECONDARY} />
                  <Text style={styles.orderStatLabel}>{t('profile.review')}</Text>
                </View>
                <View style={styles.orderStat}>
                  <Ionicons name="arrow-undo-outline" size={18} color={Colors.TEXT_SECONDARY} />
                  <Text style={styles.orderStatLabel}>{t('profile.returns')}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionLabel}>{t('profile.sectionShortcuts')}</Text>
            <View style={styles.group}>
              {services.map((service, index) => (
                <TouchableOpacity
                  key={service.id}
                  style={[styles.row, index === services.length - 1 && styles.rowLast]}
                  onPress={() => {
                    if (service.route) nav.navigate(service.route);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name={service.icon} size={22} color={Colors.WINE} style={styles.rowIcon} />
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{service.label}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} activeOpacity={0.75}>
              <Ionicons name="log-out-outline" size={22} color={Colors.ERROR} />
              <Text style={styles.logoutText}>{t('settings.logout')}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.OFF_WHITE,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 32,
  },
  loaderBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  muted: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '500',
  },
  signInHint: {
    marginTop: 24,
    marginHorizontal: Spacing.SCREEN_PADDING,
    fontSize: 15,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  group: {
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: Colors.BORDER,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  rowSubtitle: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    marginTop: 3,
    fontWeight: '500',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.WINE,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: hairline,
  },
  badgePro: {
    backgroundColor: 'rgba(230, 0, 18, 0.1)',
    borderColor: 'rgba(230, 0, 18, 0.25)',
  },
  badgeFree: {
    backgroundColor: Colors.LIGHT_GRAY,
    borderColor: Colors.BORDER,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  badgeTextPro: {
    color: Colors.WINE,
  },
  badgeTextFree: {
    color: Colors.TEXT_SECONDARY,
  },
  orderStrip: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
    borderTopWidth: hairline,
    borderTopColor: Colors.BORDER,
    backgroundColor: Colors.OFF_WHITE,
  },
  orderStat: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  orderStatLabel: {
    fontSize: 10,
    color: Colors.TEXT_SECONDARY,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    marginHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
    backgroundColor: Colors.WHITE,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ERROR,
    marginLeft: 10,
  },
});
