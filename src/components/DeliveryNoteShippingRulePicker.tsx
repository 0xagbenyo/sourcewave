import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';

export type ShippingRuleOption = {
  name: string;
  label: string;
  shipping_rule_type?: string;
};

/** Sentinel for “no shipping rule yet — logistics will suggest”. */
export const EMPTY_SHIPPING_RULE = '';

type Props = {
  visible: boolean;
  busy?: boolean;
  loading?: boolean;
  options: ShippingRuleOption[];
  selectedName?: string | null;
  /** When true, include an empty-rule choice for customers (“let logistics suggest”). Suppliers should pass false. */
  allowEmpty?: boolean;
  onClose: () => void;
  onConfirm: (ruleName: string) => void;
};

export const DeliveryNoteShippingRulePicker: React.FC<Props> = ({
  visible,
  busy = false,
  loading = false,
  options,
  selectedName,
  allowEmpty = false,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(
    selectedName === undefined || selectedName === null ? null : String(selectedName)
  );

  useEffect(() => {
    if (!visible) return;
    setSelected(selectedName === undefined || selectedName === null ? null : String(selectedName));
  }, [visible, selectedName]);

  const handleClose = () => {
    if (busy) return;
    setSelected(selectedName === undefined || selectedName === null ? null : String(selectedName));
    onClose();
  };

  const listData: ShippingRuleOption[] = allowEmpty
    ? [
        {
          name: EMPTY_SHIPPING_RULE,
          label: t('deliveryNoteDetails.shippingRuleUnknown'),
          shipping_rule_type: t('deliveryNoteDetails.shippingRuleUnknownSub'),
        },
        ...options,
      ]
    : options;

  const canConfirm = selected !== null && !busy && !loading;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <SafeAreaView edges={['bottom']} style={styles.safe}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('deliveryNoteDetails.shippingRuleTitle')}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={12} disabled={busy}>
                <Ionicons name="close" size={24} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>{t('deliveryNoteDetails.shippingRuleSubtitle')}</Text>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={Colors.WINE} />
              </View>
            ) : listData.length === 0 ? (
              <Text style={styles.empty}>{t('deliveryNoteDetails.shippingRuleEmpty')}</Text>
            ) : (
              <FlatList
                data={listData}
                keyExtractor={(item, index) => (item.name ? item.name : `empty-${index}`)}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const active = selected === item.name;
                  return (
                    <TouchableOpacity
                      style={[styles.optionRow, active && styles.optionRowActive]}
                      onPress={() => setSelected(item.name)}
                      disabled={busy}
                      activeOpacity={0.85}
                    >
                      <View style={styles.optionText}>
                        <Text style={styles.optionLabel}>{item.label || item.name}</Text>
                        {item.shipping_rule_type ? (
                          <Text style={styles.optionSubtitle}>{item.shipping_rule_type}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.radio, active && styles.radioActive]}>
                        {active ? <View style={styles.radioDot} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnOff]}
              onPress={() => {
                if (selected === null) return;
                onConfirm(selected);
              }}
              disabled={!canConfirm}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Text style={styles.confirmBtnText}>{t('deliveryNoteDetails.applyShippingRule')}</Text>
              )}
            </TouchableOpacity>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.WHITE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '78%',
  },
  safe: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.BLACK,
    flex: 1,
    paddingRight: 12,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 12,
    lineHeight: 20,
  },
  loadingBox: { paddingVertical: 32, alignItems: 'center' },
  empty: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    paddingVertical: 24,
    textAlign: 'center',
  },
  list: { maxHeight: 320, marginBottom: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  optionRowActive: {
    borderColor: Colors.WINE,
    backgroundColor: '#FFF8F8',
  },
  optionText: { flex: 1, paddingRight: 12 },
  optionLabel: { fontSize: 16, fontWeight: '600', color: Colors.BLACK },
  optionSubtitle: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.WINE },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.WINE,
  },
  confirmBtn: {
    marginTop: 8,
    backgroundColor: Colors.WINE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  confirmBtnOff: { opacity: 0.45 },
  confirmBtnText: { color: Colors.WHITE, fontSize: 16, fontWeight: '700' },
});
