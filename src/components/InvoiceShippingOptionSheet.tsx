import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { SHIPPING_OPTIONS, shippingOptionByErpValue, type ShippingOptionId } from '../constants/shippingOptions';

type Props = {
  visible: boolean;
  busy?: boolean;
  /** Pre-select when reopening to change an existing option. */
  currentErpValue?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (optionId: ShippingOptionId) => void;
};

export const InvoiceShippingOptionSheet: React.FC<Props> = ({
  visible,
  busy = false,
  currentErpValue,
  confirmLabel,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ShippingOptionId | null>(null);

  useEffect(() => {
    if (!visible) return;
    const existing = shippingOptionByErpValue(currentErpValue || '');
    setSelected(existing?.id ?? null);
  }, [visible, currentErpValue]);

  const handleClose = () => {
    if (busy) return;
    setSelected(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('invoiceDelivery.shippingTitle')}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={12} disabled={busy}>
                <Ionicons name="close" size={24} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>{t('invoiceDelivery.shippingSubtitle')}</Text>

            {SHIPPING_OPTIONS.map((opt) => {
              const active = selected === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => setSelected(opt.id)}
                  disabled={busy}
                  activeOpacity={0.85}
                >
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                  </View>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.confirmBtn, (!selected || busy) && styles.confirmBtnOff]}
              onPress={() => selected && onConfirm(selected)}
              disabled={!selected || busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {confirmLabel || t('invoiceDelivery.createDeliveryNote')}
                </Text>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
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
    marginBottom: 16,
    lineHeight: 20,
  },
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
    justifyContent: 'center',
    minHeight: 48,
  },
  confirmBtnOff: { opacity: 0.45 },
  confirmBtnText: { color: Colors.WHITE, fontSize: 16, fontWeight: '700' },
});
