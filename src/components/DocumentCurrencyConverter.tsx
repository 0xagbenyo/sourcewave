import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { CurrencyConverterPanel } from './CurrencyConverterPanel';
import { documentConverterDefaults } from '../utils/documentCurrencyDefaults';

type DocumentCurrencyConverterProps = {
  /** Document total or line amount in `currency`. */
  amount: number;
  currency: string;
  /** Compact chip under document hero amount. */
  variant?: 'chip' | 'icon';
};

/** Opens a currency converter prefilled from an ERP document amount. */
export const DocumentCurrencyConverter: React.FC<DocumentCurrencyConverterProps> = ({
  amount,
  currency,
  variant = 'chip',
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const defaults = useMemo(
    () => documentConverterDefaults(currency, amount),
    [currency, amount]
  );

  const trigger =
    variant === 'icon' ? (
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('currencyConverter.openFromDocument')}
      >
        <Ionicons name="swap-horizontal-outline" size={16} color={Colors.WINE} />
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        style={styles.chip}
        onPress={() => setOpen(true)}
        activeOpacity={0.65}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={t('currencyConverter.openFromDocument')}
      >
        <Ionicons name="swap-horizontal-outline" size={12} color={Colors.WINE} />
        <Text style={styles.chipText}>{t('currencyConverter.convertAmount')}</Text>
      </TouchableOpacity>
    );

  return (
    <>
      {trigger}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardWrap}
          >
            <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{t('currencyConverter.title')}</Text>
                <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={Colors.TEXT_SECONDARY} />
                </TouchableOpacity>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetBody}
              >
                <CurrencyConverterPanel
                  compact
                  initialFromCurrency={defaults.fromCurrency}
                  initialToCurrency={defaults.toCurrency}
                  initialAmount={defaults.initialAmount}
                />
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
  );
};

const hairline = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 0,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.WINE,
    letterSpacing: 0.1,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.OFF_WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.LG,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.SM,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
  },
  sheetBody: {
    padding: Spacing.SCREEN_PADDING,
    paddingBottom: Spacing.LG,
  },
});
