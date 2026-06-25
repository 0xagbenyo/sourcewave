import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import type { RootStackParamList, ErpCustomerAddressRow } from '../types';
import { appAlert as Alert } from '../services/appAlert';

const hairline = StyleSheet.hairlineWidth;

export const AddressBookScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useUserSession();

  const [addresses, setAddresses] = useState<ErpCustomerAddressRow[]>([]);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressSaving, setAddressSaving] = useState(false);

  const fetchAddresses = useCallback(async (email: string) => {
    try {
      setAddressLoading(true);
      const client = getERPNextClient();
      const fetched = await client.getAddressesByEmail(email);
      setAddresses((fetched || []) as ErpCustomerAddressRow[]);
    } catch (error) {
      console.error('Error fetching addresses:', error);
      Alert.alert('Error', 'Failed to load addresses');
    } finally {
      setAddressLoading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (user?.email) {
        fetchAddresses(user.email);
      }
    }, [user?.email, fetchAddresses])
  );

  const handleDeleteAddress = (index: number) => {
    Alert.alert('Delete address', 'Remove this shipping address?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setAddressSaving(true);
            const client = getERPNextClient();
            const row = addresses[index];
            if (row.name) {
              await client.deleteAddress(row.name);
              await fetchAddresses(user?.email || '');
            }
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Failed to delete address';
            Alert.alert('Error', msg);
          } finally {
            setAddressSaving(false);
          }
        },
      },
    ]);
  };

  const goEdit = (addr?: ErpCustomerAddressRow) => {
    navigation.navigate('EditAddress', { address: addr });
  };

  if (addressLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <Header showBackButton title="Shipping addresses" subtitle="Delivery locations" />
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={Colors.WINE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header showBackButton title="Shipping addresses" subtitle="Delivery locations" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={addressSaving}
            onRefresh={() => user?.email && fetchAddresses(user.email)}
            tintColor={Colors.WINE}
            colors={[Colors.WINE]}
          />
        }
      >
        <Text style={styles.sectionLabel}>New</Text>
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={() => goEdit(undefined)} activeOpacity={0.75}>
            <Ionicons name="add-circle-outline" size={22} color={Colors.WINE} style={styles.rowIcon} />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>Add shipping address</Text>
              <Text style={styles.rowSubtitle}>Create a new delivery address</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
          </TouchableOpacity>
        </View>

        {addresses.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Saved addresses</Text>
            <View style={styles.group}>
              {addresses.map((item, index) => {
                const primary =
                  item.is_primary_address === true || item.is_primary_address === 1;
                const region = (item.state || '').trim() || '—';
                const city = (item.city || '').trim() || '—';
                const line1 = (item.address_line1 || '').trim();
                const phone = (item.phone || '').trim();
                const email = (item.email_id || '').trim();

                return (
                  <View
                    key={item.name || `addr-${index}`}
                    style={[styles.row, styles.addressRowWrap]}
                  >
                    <TouchableOpacity
                      style={styles.addressRowTap}
                      onPress={() => goEdit(item)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="location-outline" size={22} color={Colors.WINE} style={styles.addressIcon} />
                      <View style={styles.rowMain}>
                        <View style={styles.titleRow}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {item.address_title || 'Address'}
                          </Text>
                          {primary ? (
                            <View style={styles.primaryPill}>
                              <Text style={styles.primaryPillText}>Primary</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.rowSubtitle} numberOfLines={1}>
                          {city} · {region}
                        </Text>
                        {line1 ? (
                          <Text style={styles.rowDetail} numberOfLines={2}>
                            {line1}
                          </Text>
                        ) : null}
                        {(phone || email) ? (
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {[phone, email].filter(Boolean).join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteHit}
                      onPress={() => handleDeleteAddress(index)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Delete address"
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.TEXT_SECONDARY} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <Text style={styles.emptyHint}>No saved addresses yet. Use “Add shipping address” above.</Text>
        )}
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
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  addressRowWrap: {
    alignItems: 'flex-start',
  },
  addressRowTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
    paddingRight: 4,
  },
  rowIcon: {
    marginRight: 12,
  },
  addressIcon: {
    marginRight: 12,
    marginTop: 2,
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
  primaryPill: {
    backgroundColor: 'rgba(230, 0, 18, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: hairline,
    borderColor: 'rgba(230, 0, 18, 0.25)',
  },
  primaryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.WINE,
  },
  rowSubtitle: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    marginTop: 2,
    fontWeight: '500',
  },
  rowDetail: {
    fontSize: 13,
    color: Colors.DARK_GRAY,
    marginTop: 6,
    lineHeight: 18,
  },
  rowMeta: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginTop: 6,
    fontWeight: '500',
  },
  deleteHit: {
    justifyContent: 'flex-start',
    paddingTop: 4,
    paddingLeft: 8,
    paddingRight: 2,
  },
  emptyHint: {
    marginTop: 16,
    marginHorizontal: Spacing.SCREEN_PADDING,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
});
