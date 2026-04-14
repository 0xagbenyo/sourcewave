import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';

interface Address {
  name?: string;
  address_title: string;
  address_type: 'Billing' | 'Shipping';
  address_line1: string;
  address_line2?: string;
  city: string;
  county?: string;
  state?: string;
  country: string;
  pincode: string;
  email_id?: string;
  phone: string;
  fax?: string;
  tax_category?: string;
  is_primary_address?: boolean;
  is_shipping_address?: boolean;
  disabled?: boolean;
  is_your_company_address?: boolean;
}

export const AddressBookScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useUserSession();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressSaving, setAddressSaving] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      if (user?.email) {
        fetchAddresses(user.email);
      }
    }, [user?.email])
  );

  const fetchAddresses = async (email: string) => {
    try {
      setAddressLoading(true);
      const client = getERPNextClient();
      const fetchedAddresses = await client.getAddressesByEmail(email);
      setAddresses(fetchedAddresses || []);
    } catch (error) {
      console.error('Error fetching addresses:', error);
      Alert.alert('Error', 'Failed to load addresses');
    } finally {
      setAddressLoading(false);
    }
  };

  const handleDeleteAddress = (index: number) => {
    Alert.alert(
      'Delete Address',
      'Are you sure you want to delete this address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setAddressSaving(true);
              const client = getERPNextClient();
              const addressToDelete = addresses[index];
              if (addressToDelete.name) {
                await client.deleteAddress(addressToDelete.name);
                await fetchAddresses(user?.email || '');
                Alert.alert('Success', 'Address deleted successfully');
              }
            } catch (error: any) {
              console.error('Error deleting address:', error);
              Alert.alert('Error', error?.message || 'Failed to delete address');
            } finally {
              setAddressSaving(false);
            }
          },
        },
      ]
    );
  };

  if (addressLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (navigation as any).goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shipping Addresses</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.ROYAL_BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shipping Addresses</Text>
        <TouchableOpacity
          onPress={() => (navigation as any).navigate('EditAddress', { address: undefined })}
        >
          <Ionicons name="add" size={24} color={Colors.ROYAL_BLUE} />
        </TouchableOpacity>
      </View>

      {/* Address List */}
      {addresses.length > 0 ? (
        <FlatList
          data={addresses}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <View style={styles.addressCard}>
              <View style={styles.addressCardHeader}>
                <View>
                  <Text style={styles.addressTitle}>{item.address_title}</Text>
                  <Text style={styles.addressType}>{item.address_type}</Text>
                </View>
                <View style={styles.addressBadges}>
                  {item.is_primary_address && (
                    <View style={styles.primaryBadge}>
                      <Text style={styles.badgeText}>Primary</Text>
                    </View>
                  )}
                  {item.is_shipping_address && (
                    <View style={styles.shippingBadge}>
                      <Text style={styles.badgeText}>Shipping</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.addressDivider} />

              <View style={styles.addressContent}>
                <View style={styles.addressLine}>
                  <Ionicons name="location-outline" size={16} color={Colors.ROYAL_BLUE} />
                  <Text style={styles.addressText}>
                    {item.address_line1}
                    {item.address_line2 && `, ${item.address_line2}`}
                  </Text>
                </View>
                <View style={styles.addressLine}>
                  <Ionicons name="globe-outline" size={16} color={Colors.ROYAL_BLUE} />
                  <Text style={styles.addressText}>
                    {item.city}, {item.state}, {item.country} {item.pincode}
                  </Text>
                </View>
                {item.phone && (
                  <View style={styles.addressLine}>
                    <Ionicons name="call-outline" size={16} color={Colors.ROYAL_BLUE} />
                    <Text style={styles.addressText}>{item.phone}</Text>
                  </View>
                )}
              </View>

              <View style={styles.addressActions}>
                <TouchableOpacity
                  onPress={() => (navigation as any).navigate('EditAddress', { address: item })}
                  style={styles.editButton}
                >
                  <Ionicons name="pencil-outline" size={16} color={Colors.ROYAL_BLUE} />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteAddress(index)}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.ERROR} />
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color={Colors.TEXT_SECONDARY} />
          <Text style={styles.emptyTitle}>No Addresses Yet</Text>
          <Text style={styles.emptySubtitle}>
            Add your first shipping address to get started
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => (navigation as any).navigate('EditAddress', { address: undefined })}
          >
            <Ionicons name="add" size={20} color={Colors.WHITE} />
            <Text style={styles.emptyButtonText}>Add Address</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.BLACK,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 24,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  addressCard: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.ROYAL_BLUE,
  },
  addressCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  addressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    marginBottom: 4,
  },
  addressType: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
  },
  addressBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryBadge: {
    backgroundColor: Colors.ROYAL_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  shippingBadge: {
    backgroundColor: Colors.ELECTRIC_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.WHITE,
  },
  addressDivider: {
    height: 1,
    backgroundColor: Colors.BORDER,
    marginHorizontal: 16,
  },
  addressContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  addressLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    flex: 1,
  },
  addressActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.ROYAL_BLUE,
    gap: 6,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ROYAL_BLUE,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.ERROR,
    gap: 6,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ERROR,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.BLACK,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: Colors.ROYAL_BLUE,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  emptyButtonText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
