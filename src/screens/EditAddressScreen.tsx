import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { GHANA_REGIONS } from '../constants/ghanaRegions';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import type { RootStackParamList, ErpCustomerAddressRow } from '../types';

const hairline = StyleSheet.hairlineWidth;

function normalizeRegion(state: string | undefined): string {
  const s = String(state || '').trim();
  if (!s) return '';
  const found = GHANA_REGIONS.find((r) => r.toLowerCase() === s.toLowerCase());
  return found || s;
}

function isValidEmail(email: string): boolean {
  const t = email.trim();
  if (!t) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export const EditAddressScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'EditAddress'>>();
  const { user } = useUserSession();
  const [saving, setSaving] = useState(false);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);

  const params = route.params || {};
  const existing = params.address as ErpCustomerAddressRow | undefined;
  const orderId = String(params.orderId || '').trim();
  const isEditing = Boolean(existing?.name);

  const initial = useMemo(() => {
    if (existing) {
      return {
        address_title: (existing.address_title || '').trim(),
        address_line1: (existing.address_line1 || '').trim(),
        city: (existing.city || '').trim(),
        state: normalizeRegion(existing.state),
        country: (existing.country || 'Ghana').trim() || 'Ghana',
        pincode: (existing.pincode || '').trim(),
        email_id: (existing.email_id || user?.email || '').trim(),
        phone: (existing.phone || '').trim(),
        is_primary_address:
          existing.is_primary_address === true || existing.is_primary_address === 1,
      };
    }
    return {
      address_title: '',
      address_line1: '',
      city: '',
      state: '',
      country: 'Ghana',
      pincode: '',
      email_id: (user?.email || '').trim(),
      phone: '',
      is_primary_address: false,
    };
  }, [existing, user?.email]);

  const [addressTitle, setAddressTitle] = useState(initial.address_title);
  const [addressLine1, setAddressLine1] = useState(initial.address_line1);
  const [city, setCity] = useState(initial.city);
  const [region, setRegion] = useState(initial.state);
  const [emailId, setEmailId] = useState(initial.email_id);
  const [phone, setPhone] = useState(initial.phone);
  const [isPrimary, setIsPrimary] = useState(initial.is_primary_address);

  const handleSave = async () => {
    const title = addressTitle.trim();
    const line1 = addressLine1.trim();
    const cityT = city.trim();
    const regionNorm = normalizeRegion(region.trim());
    const email = emailId.trim();
    const phoneT = phone.trim();

    if (!title) {
      Alert.alert('Required', 'Please enter an address title.');
      return;
    }
    if (!line1) {
      Alert.alert('Required', 'Please enter your residential address details.');
      return;
    }
    if (!cityT) {
      Alert.alert('Required', 'Please enter city or town.');
      return;
    }
    if (!regionNorm || !GHANA_REGIONS.some((r) => r === regionNorm)) {
      Alert.alert('Required', 'Please select a region in Ghana.');
      return;
    }
    if (!phoneT) {
      Alert.alert('Required', 'Please enter a phone number.');
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Required', 'Please enter a valid email address.');
      return;
    }

    try {
      setSaving(true);
      const client = getERPNextClient();
      const customer = await client.getOrCreateCustomer(user?.email || '', user?.email || '');
      if (!customer?.name) {
        throw new Error('Customer not found for this user');
      }

      const pincode = (initial.pincode || '-').trim() || '-';

      const addressPayload = {
        address_title: title,
        address_type: 'Shipping',
        address_line1: line1,
        city: cityT,
        state: regionNorm,
        country: 'Ghana',
        pincode,
        email_id: email,
        phone: phoneT,
        is_primary_address: isPrimary ? 1 : 0,
        is_shipping_address: 1,
        disabled: 0,
        links: [{ link_doctype: 'Customer', link_name: customer.name }],
      };

      if (isEditing && existing?.name) {
        await client.updateAddress(existing.name, addressPayload);
        const savedName = existing.name;
        if (orderId) {
          await client.updateSalesOrder(orderId, { shipping_address_name: savedName });
          navigation.navigate('OrderDetails', { orderId });
          return;
        }
        Alert.alert('Saved', 'Address updated.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        const created = await client.createAddress(addressPayload);
        const savedName = String(created?.name || '').trim();
        if (orderId && savedName) {
          await client.updateSalesOrder(orderId, { shipping_address_name: savedName });
          navigation.navigate('OrderDetails', { orderId });
          return;
        }
        Alert.alert('Saved', 'Address added.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save address';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const headerTitle = isEditing ? 'Edit address' : 'Add address';

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header showBackButton title={headerTitle} subtitle="Shipping details" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Address</Text>
          <View style={styles.group}>
            <View style={styles.fieldPad}>
              <Text style={styles.label}>Address title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Home, Office"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={addressTitle}
                onChangeText={setAddressTitle}
                editable={!saving}
              />
            </View>
            <View style={styles.fieldPad}>
              <Text style={styles.label}>Residential address details</Text>
              <Text style={styles.hint}>e.g. EW-0000-0000 — street, house number, area</Text>
              <TextInput
                style={[styles.textInput, styles.textInputTall]}
                placeholder="Enter full residential details"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={addressLine1}
                onChangeText={setAddressLine1}
                multiline
                textAlignVertical="top"
                editable={!saving}
              />
            </View>
            <View style={[styles.fieldPad, styles.fieldPadLast]}>
              <Text style={styles.label}>City / town</Text>
              <TextInput
                style={styles.textInput}
                placeholder="City or town"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={city}
                onChangeText={setCity}
                editable={!saving}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Region</Text>
          <View style={styles.group}>
            <TouchableOpacity
              style={styles.selectRow}
              onPress={() => !saving && setRegionPickerOpen(true)}
              activeOpacity={0.75}
            >
              <View style={styles.selectMain}>
                <Text style={region ? styles.selectValue : styles.selectPlaceholder}>
                  {region || 'Select region in Ghana'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Contact</Text>
          <View style={styles.group}>
            <View style={styles.fieldPad}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Mobile number"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                editable={!saving}
              />
            </View>
            <View style={[styles.fieldPad, styles.fieldPadLast]}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.textInput}
                placeholder="you@example.com"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={emailId}
                onChangeText={setEmailId}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Options</Text>
          <View style={styles.group}>
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsPrimary((v) => !v)}
              activeOpacity={0.75}
            >
              <Ionicons name="star-outline" size={22} color={Colors.WINE} style={styles.rowIcon} />
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>Primary shipping address</Text>
                <Text style={styles.rowSubtitle}>Use as default when placing orders</Text>
              </View>
              <View style={[styles.switchBox, isPrimary && styles.switchBoxOn]}>
                {isPrimary ? <Ionicons name="checkmark" size={16} color={Colors.WHITE} /> : null}
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>

        <View style={styles.saveFooter}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color={Colors.WHITE} />
                <Text style={styles.saveButtonText}>{isEditing ? 'Save changes' : 'Save address'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={regionPickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setRegionPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalGrab}>
              <View style={styles.modalHandle} />
            </View>
            <Text style={styles.modalTitle}>Region</Text>
            <FlatList
              data={[...GHANA_REGIONS]}
              keyExtractor={(item) => item}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    setRegion(item);
                    setRegionPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{item}</Text>
                  {item === region ? (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.WINE} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
            <SafeAreaView edges={['bottom']} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.OFF_WHITE,
  },
  kav: {
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 8,
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
  fieldPad: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  fieldPadLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.BLACK,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 8,
    lineHeight: 17,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.BLACK,
    backgroundColor: Colors.OFF_WHITE,
  },
  textInputTall: {
    minHeight: 88,
    paddingTop: 10,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  selectMain: {
    flex: 1,
    minWidth: 0,
  },
  selectValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    letterSpacing: -0.2,
  },
  selectPlaceholder: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: -0.2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    letterSpacing: -0.2,
  },
  rowSubtitle: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    marginTop: 3,
    fontWeight: '500',
  },
  switchBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.WINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchBoxOn: {
    backgroundColor: Colors.WINE,
  },
  saveFooter: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderTopColor: Colors.BORDER,
  },
  saveButton: {
    backgroundColor: Colors.SUCCESS,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.WHITE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '72%',
    paddingBottom: Spacing.SM,
  },
  modalGrab: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.MEDIUM_GRAY,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.BLACK,
    paddingHorizontal: Spacing.MD,
    marginBottom: Spacing.SM,
  },
  modalList: {
    paddingHorizontal: Spacing.SM,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SM,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  modalRowText: {
    fontSize: 16,
    color: Colors.BLACK,
    flex: 1,
  },
});
