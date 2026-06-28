import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { getERPNextClient } from '../services/erpnext';
import type { ErpCustomerAddressRow, RootStackParamList } from '../types';

function addressRowLabel(row: ErpCustomerAddressRow): string {
  const title = (row.address_title || '').trim();
  const line1 = (row.address_line1 || '').trim();
  const city = (row.city || '').trim();
  const state = (row.state || '').trim();
  if (title) return title;
  return [line1, city, state].filter(Boolean).join(', ') || row.name || 'Address';
}

function addressRowSubtitle(row: ErpCustomerAddressRow): string {
  const parts = [
    (row.address_line1 || '').trim(),
    [(row.city || '').trim(), (row.state || '').trim()].filter(Boolean).join(', '),
    (row.phone || '').trim(),
  ].filter(Boolean);
  return parts.join(' · ');
}

function pickDefaultAddress(rows: ErpCustomerAddressRow[]): ErpCustomerAddressRow | null {
  if (!rows.length) return null;
  const primary = rows.find((r) => r.is_primary_address === true || r.is_primary_address === 1);
  if (primary) return primary;
  const shipping = rows.find((r) => r.is_shipping_address === true || r.is_shipping_address === 1);
  return shipping ?? rows[0] ?? null;
}

export type ShipToAddressFieldProps = {
  value: string;
  onChange: (addressName: string, row: ErpCustomerAddressRow) => void;
  userEmail?: string | null;
  orderId?: string;
  disabled?: boolean;
  required?: boolean;
};

export const ShipToAddressField: React.FC<ShipToAddressFieldProps> = ({
  value,
  onChange,
  userEmail,
  orderId,
  disabled = false,
  required = false,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addresses, setAddresses] = useState<ErpCustomerAddressRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const selectedRow = useMemo(
    () => addresses.find((a) => String(a.name || '').trim() === value.trim()) ?? null,
    [addresses, value]
  );

  const loadAddresses = useCallback(async () => {
    const email = (userEmail || '').trim();
    if (!email) {
      setAddresses([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await getERPNextClient().getAddressesByEmail(email);
      const list = Array.isArray(rows) ? (rows as ErpCustomerAddressRow[]) : [];
      setAddresses(list);
      if (!value.trim() && list.length) {
        const def = pickDefaultAddress(list);
        if (def?.name) onChange(String(def.name).trim(), def);
      }
    } catch {
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail, value, onChange]);

  useFocusEffect(
    useCallback(() => {
      void loadAddresses();
    }, [loadAddresses])
  );

  const openPicker = useCallback(() => {
    if (disabled) return;
    setPickerOpen(true);
    void loadAddresses();
  }, [disabled, loadAddresses]);

  const selectAddress = useCallback(
    async (row: ErpCustomerAddressRow) => {
      const nm = String(row.name || '').trim();
      if (!nm) return;
      setApplying(true);
      try {
        if (orderId) {
          await getERPNextClient().updateSalesOrder(orderId, { shipping_address_name: nm });
        }
        onChange(nm, row);
        setPickerOpen(false);
      } finally {
        setApplying(false);
      }
    },
    [onChange, orderId]
  );

  const onAddNew = useCallback(() => {
    setPickerOpen(false);
    navigation.navigate('EditAddress', orderId ? { orderId } : undefined);
  }, [navigation, orderId]);

  const hasSelection = !!value.trim() && !!selectedRow;
  const showRequiredError = required && !value.trim() && !loading;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>
        {t('orderDetails.shippingAddress')}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <Text style={styles.hint}>{t('sourcing.shipToHint')}</Text>

      {hasSelection ? (
        <View style={styles.selectedCard}>
          <Ionicons name="location" size={20} color={Colors.WINE} style={styles.selectedIcon} />
          <View style={styles.selectedText}>
            <Text style={styles.selectedTitle} numberOfLines={1}>
              {addressRowLabel(selectedRow!)}
            </Text>
            <Text style={styles.selectedSub} numberOfLines={2}>
              {addressRowSubtitle(selectedRow!)}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.empty}>
          {showRequiredError ? t('sourcing.shipToRequired') : t('orderDetails.noSavedAddresses')}
        </Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, disabled && styles.actionBtnOff]}
          onPress={openPicker}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <Ionicons name="list-outline" size={18} color={Colors.WINE} />
          <Text style={styles.actionBtnText}>
            {hasSelection ? t('orderDetails.changeShipTo') : t('orderDetails.selectShipTo')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnOutline, disabled && styles.actionBtnOff]}
          onPress={onAddNew}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={18} color={Colors.WINE} />
          <Text style={styles.actionBtnText}>{t('orderDetails.addNewAddress')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('orderDetails.selectShipTo')}</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color={Colors.BLACK} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={Colors.WINE} />
              </View>
            ) : (
              <FlatList
                data={addresses}
                keyExtractor={(item) => String(item.name)}
                style={styles.modalList}
                contentContainerStyle={addresses.length === 0 ? styles.modalListEmpty : undefined}
                ListEmptyComponent={
                  <Text style={styles.modalEmptyText}>{t('orderDetails.noSavedAddresses')}</Text>
                }
                renderItem={({ item }) => {
                  const nm = String(item.name || '').trim();
                  const selected = value.trim() === nm;
                  return (
                    <TouchableOpacity
                      style={[styles.pickRow, selected && styles.pickRowSelected]}
                      onPress={() => void selectAddress(item)}
                      disabled={applying || !nm}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="home-outline" size={22} color={Colors.WINE} style={{ marginRight: 12 }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.pickTitle} numberOfLines={1}>
                          {addressRowLabel(item)}
                        </Text>
                        <Text style={styles.pickSub} numberOfLines={2}>
                          {addressRowSubtitle(item)}
                        </Text>
                      </View>
                      {applying ? (
                        <ActivityIndicator size="small" color={Colors.WINE} />
                      ) : selected ? (
                        <Ionicons name="checkmark-circle" size={22} color={Colors.WINE} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity style={styles.addNewBtn} onPress={onAddNew} activeOpacity={0.85}>
              <Ionicons name="add-circle-outline" size={22} color={Colors.WINE} />
              <Text style={styles.addNewBtnText}>{t('orderDetails.addNewAddress')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  requiredMark: {
    color: Colors.ERROR,
    fontWeight: '800',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 12,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.OFF_WHITE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
    marginBottom: 12,
  },
  selectedIcon: { marginRight: 10, marginTop: 2 },
  selectedText: { flex: 1, minWidth: 0 },
  selectedTitle: { fontSize: 15, fontWeight: '700', color: Colors.BLACK },
  selectedSub: { marginTop: 4, fontSize: 13, color: Colors.TEXT_SECONDARY, lineHeight: 18 },
  empty: { fontSize: 14, color: Colors.TEXT_SECONDARY, marginBottom: 12, lineHeight: 20 },
  actions: { gap: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(230, 0, 18, 0.06)',
  },
  actionBtnOutline: {
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.WINE,
  },
  actionBtnOff: { opacity: 0.5 },
  actionBtnText: { fontSize: 15, fontWeight: '600', color: Colors.WINE },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.WHITE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '78%',
    paddingBottom: Spacing.LG,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.BLACK, marginRight: 8 },
  modalLoading: { paddingVertical: 40, alignItems: 'center' },
  modalList: { maxHeight: 360 },
  modalListEmpty: { paddingVertical: 28, paddingHorizontal: Spacing.LG },
  modalEmptyText: { textAlign: 'center', color: Colors.TEXT_SECONDARY, fontSize: 14, lineHeight: 20 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.MD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  pickRowSelected: { backgroundColor: 'rgba(230, 0, 18, 0.04)' },
  pickTitle: { fontSize: 15, fontWeight: '700', color: Colors.BLACK },
  pickSub: { marginTop: 3, fontSize: 13, color: Colors.TEXT_SECONDARY, lineHeight: 18 },
  addNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Spacing.MD,
    marginTop: Spacing.MD,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.WINE,
    backgroundColor: 'rgba(230, 0, 18, 0.04)',
  },
  addNewBtnText: { fontSize: 15, fontWeight: '700', color: Colors.WINE },
});
