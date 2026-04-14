import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
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

export const EditAddressScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useUserSession();
  const [saving, setSaving] = useState(false);

  const params = (route.params as any) || {};
  const isEditing = params.address !== undefined;
  const initialAddress = params.address || {
    address_title: '',
    address_type: 'Billing',
    address_line1: '',
    address_line2: '',
    city: '',
    county: '',
    state: '',
    country: 'Ghana',
    pincode: '',
    email_id: user?.email || '',
    phone: '',
    fax: '',
    tax_category: '',
    is_primary_address: false,
    is_shipping_address: false,
    disabled: false,
    is_your_company_address: false,
  };

  const [address, setAddress] = useState<Address>(initialAddress);

  const handleSave = async () => {
    // Validate required fields
    if (
      !address.address_title?.trim() ||
      !address.address_line1?.trim() ||
      !address.city?.trim() ||
      !address.country?.trim()
    ) {
      Alert.alert('Validation Error', 'Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      const client = getERPNextClient();
      const customer = await client.getOrCreateCustomer(
        user?.email || '',
        user?.email || ''
      );

      if (!customer?.name) {
        throw new Error('Customer not found for this user');
      }

      const addressTitle = `${address.address_title}-${user?.email || ''}`;

      const addressPayload = {
        address_title: addressTitle,
        address_type: address.address_type,
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        city: address.city,
        county: address.county,
        state: address.state,
        country: address.country,
        pincode: address.pincode,
        email_id: user?.email || '',
        phone: address.phone,
        fax: address.fax,
        tax_category: address.tax_category,
        is_primary_address: address.is_primary_address ? 1 : 0,
        is_shipping_address: address.is_shipping_address ? 1 : 0,
        disabled: address.disabled ? 1 : 0,
        links: [{ link_doctype: 'Customer', link_name: customer.name }],
      };

      if (isEditing && address.name) {
        await client.updateAddress(address.name, addressPayload);
        Alert.alert('Success', 'Address updated successfully', [
          {
            text: 'OK',
            onPress: () => (navigation as any).goBack(),
          },
        ]);
      } else {
        await client.createAddress(addressPayload);
        Alert.alert('Success', 'Address created successfully', [
          {
            text: 'OK',
            onPress: () => (navigation as any).goBack(),
          },
        ]);
      }
    } catch (error: any) {
      console.error('Error saving address:', error);
      Alert.alert('Error', error?.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (navigation as any).goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit Address' : 'Add New Address'}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveIconButton, saving && { opacity: 0.5 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.ROYAL_BLUE} />
            ) : (
              <Ionicons name="checkmark" size={24} color={Colors.ROYAL_BLUE} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
          {/* Basic Information Section */}
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            <View style={styles.twoColumnLayout}>
              <View style={styles.columnContainer}>
                <Text style={styles.inputLabel}>Address Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Home, Office"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  value={address.address_title}
                  onChangeText={(text) =>
                    setAddress({ ...address, address_title: text })
                  }
                />
              </View>
              <View style={styles.columnContainer}>
                <Text style={styles.inputLabel}>Address Type</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Residential/Commercial"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  value={address.address_type}
                  onChangeText={(text) =>
                    setAddress({ ...address, address_type: text as 'Billing' | 'Shipping' })
                  }
                />
              </View>
            </View>
          </View>

          {/* Street Address Section */}
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Street Address</Text>
            <Text style={styles.inputLabel}>Address Line 1</Text>
            <TextInput
              style={styles.input}
              placeholder="Street address"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              value={address.address_line1}
              onChangeText={(text) =>
                setAddress({ ...address, address_line1: text })
              }
            />
            <Text style={styles.inputLabel}>Address Line 2</Text>
            <TextInput
              style={styles.input}
              placeholder="Apt, suite, building (optional)"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              value={address.address_line2}
              onChangeText={(text) =>
                setAddress({ ...address, address_line2: text })
              }
            />
          </View>

          {/* Location Section */}
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Location Details</Text>
            <View style={styles.twoColumnLayout}>
              <View style={styles.columnContainer}>
                <Text style={styles.inputLabel}>City</Text>
                <TextInput
                  style={styles.input}
                  placeholder="City"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  value={address.city}
                  onChangeText={(text) =>
                    setAddress({ ...address, city: text })
                  }
                />
              </View>
              <View style={styles.columnContainer}>
                <Text style={styles.inputLabel}>State/Region</Text>
                <TextInput
                  style={styles.input}
                  placeholder="State"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  value={address.state}
                  onChangeText={(text) =>
                    setAddress({ ...address, state: text })
                  }
                />
              </View>
            </View>

            <View style={styles.twoColumnLayout}>
              <View style={styles.columnContainer}>
                <Text style={styles.inputLabel}>Country</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Country"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  value={address.country}
                  onChangeText={(text) =>
                    setAddress({ ...address, country: text })
                  }
                />
              </View>
              <View style={styles.columnContainer}>
                <Text style={styles.inputLabel}>Postal Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Postal code"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  value={address.pincode}
                  onChangeText={(text) =>
                    setAddress({ ...address, pincode: text })
                  }
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>County</Text>
            <TextInput
              style={styles.input}
              placeholder="County (optional)"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              value={address.county}
              onChangeText={(text) =>
                setAddress({ ...address, county: text })
              }
            />
          </View>

          {/* Contact Details Section */}
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Contact Details</Text>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              placeholder="Email"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              value={address.email_id}
              editable={false}
            />
            <View style={styles.twoColumnLayout}>
              <View style={styles.columnContainer}>
                <Text style={styles.inputLabel}>Phone</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Phone number"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  value={address.phone}
                  onChangeText={(text) =>
                    setAddress({ ...address, phone: text })
                  }
                />
              </View>
              <View style={styles.columnContainer}>
                <Text style={styles.inputLabel}>Fax</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Fax (optional)"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  value={address.fax}
                  onChangeText={(text) =>
                    setAddress({ ...address, fax: text })
                  }
                />
              </View>
            </View>
          </View>

          {/* Address Preferences Section */}
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Address Preferences</Text>
            <View style={styles.preferencesContainer}>
              <TouchableOpacity
                style={styles.preferenceRow}
                onPress={() =>
                  setAddress({
                    ...address,
                    is_primary_address: !address.is_primary_address,
                  })
                }
              >
                <View
                  style={[
                    styles.checkbox,
                    address.is_primary_address && styles.checkboxChecked,
                  ]}
                >
                  {address.is_primary_address && (
                    <Ionicons name="checkmark" size={14} color={Colors.WHITE} />
                  )}
                </View>
                <Text style={styles.preferenceText}>Set as primary address</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.preferenceRow}
                onPress={() =>
                  setAddress({
                    ...address,
                    is_shipping_address: !address.is_shipping_address,
                  })
                }
              >
                <View
                  style={[
                    styles.checkbox,
                    address.is_shipping_address && styles.checkboxChecked,
                  ]}
                >
                  {address.is_shipping_address && (
                    <Ionicons name="checkmark" size={14} color={Colors.WHITE} />
                  )}
                </View>
                <Text style={styles.preferenceText}>Use for shipping</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.preferenceRow}
                onPress={() =>
                  setAddress({
                    ...address,
                    disabled: !address.disabled,
                  })
                }
              >
                <View
                  style={[
                    styles.checkbox,
                    address.disabled && styles.checkboxChecked,
                  ]}
                >
                  {address.disabled && (
                    <Ionicons name="checkmark" size={14} color={Colors.WHITE} />
                  )}
                </View>
                <Text style={styles.preferenceText}>Disable this address</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  saveIconButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formScroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ROYAL_BLUE,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.BLACK,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.BLACK,
    marginBottom: 12,
  },
  disabledInput: {
    backgroundColor: Colors.LIGHT_GRAY,
    color: Colors.TEXT_SECONDARY,
  },
  twoColumnLayout: {
    flexDirection: 'row',
    gap: 12,
  },
  columnContainer: {
    flex: 1,
  },
  preferencesContainer: {
    backgroundColor: Colors.WHITE,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.ROYAL_BLUE,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.ROYAL_BLUE,
    borderColor: Colors.ROYAL_BLUE,
  },
  preferenceText: {
    fontSize: 14,
    color: Colors.BLACK,
  },
});
