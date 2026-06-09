import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useUserSession } from '../../context/UserContext';
import { useRavenUnread } from '../../context/RavenUnreadContext';

const shadowCard =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      }
    : { elevation: 2 };

type MenuItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export const SupplierHomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const { unreadTotal, refreshUnreadCounts } = useRavenUnread();

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadCounts();
    }, [refreshUnreadCounts])
  );

  const displayName = user?.supplierName || user?.fullName || 'Supplier';

  const openStack = (route: string) => {
    const parent = navigation.getParent();
    if (parent) {
      (parent as any).navigate(route);
    }
  };

  const documentItems: MenuItem[] = [
    {
      key: 'inv',
      icon: 'layers-outline',
      title: 'Invoices & payments',
      subtitle: 'Sales invoices linked to your quotations and related payments',
      onPress: () => openStack('SupplierOrdersInvoices'),
    },
    {
      key: 'quo',
      icon: 'reader-outline',
      title: 'Quotations',
      subtitle: 'Submitted supplier quotations and statuses',
      onPress: () => openStack('SupplierQuotationList'),
    },
  ];

  const accountItems: MenuItem[] = [
    {
      key: 'new',
      icon: 'create-outline',
      title: 'New quotation',
      subtitle: 'Draft a quotation to share with a buyer in chat',
      onPress: () => {
        const parent = navigation.getParent();
        if (parent) {
          (parent as { navigate: (n: string, p?: object) => void }).navigate('SupplierQuotationList', {
            initialTab: 'new',
          });
        }
      },
    },
    {
      key: 'chat',
      icon: 'chatbubble-ellipses-outline',
      title: 'Messages',
      subtitle: 'Open the Chat tab for buyer conversations',
      onPress: () => navigation.navigate('SupplierMessages' as never),
    },
    {
      key: 'profile',
      icon: 'id-card-outline',
      title: 'Profile & account',
      subtitle: 'Supplier details and sign out',
      onPress: () => navigation.navigate('SupplierProfile' as never),
    },
  ];

  const renderGroup = (items: MenuItem[]) => (
    <View style={[styles.group, shadowCard]}>
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          style={({ pressed }) => [
            styles.row,
            index < items.length - 1 && styles.rowBorder,
            pressed && styles.rowPressed,
          ]}
          android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
        >
          <Ionicons name={item.icon} size={22} color={Colors.DARK_GRAY} style={styles.rowIcon} />
          <View style={styles.rowText}>
            <View style={styles.titleRow}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {item.key === 'chat' && unreadTotal > 0 ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {unreadTotal > 99 ? '99+' : String(unreadTotal)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.MEDIUM_GRAY} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>Supplier portal</Text>
          <Text style={styles.headline} numberOfLines={2}>
            {displayName}
          </Text>
          <View style={styles.accentRule} />
        </View>

        <Text style={styles.sectionLabel}>Operations</Text>
        {renderGroup(documentItems)}

        <Text style={styles.sectionLabel}>Account</Text>
        {renderGroup(accountItems)}

        <Text style={styles.footerNote}>
          Use the tabs below to switch between this overview, messages, and your profile.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ECECEF',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  header: {
    marginBottom: 28,
    paddingTop: 4,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  headline: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1C1C1E',
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  accentRule: {
    marginTop: 16,
    width: 40,
    height: 2,
    backgroundColor: Colors.WINE,
    borderRadius: 1,
    opacity: 0.85,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636366',
    marginBottom: 10,
    marginTop: 22,
    letterSpacing: -0.1,
  },
  group: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 72,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.29)',
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  rowIcon: {
    marginRight: 14,
    width: 26,
    textAlign: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  countBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: Colors.WINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: Colors.WHITE,
    fontSize: 12,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    letterSpacing: -0.2,
  },
  rowSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: Colors.TEXT_SECONDARY,
    marginTop: 3,
    lineHeight: 18,
  },
  footerNote: {
    marginTop: 28,
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 17,
    paddingHorizontal: 4,
  },
});
