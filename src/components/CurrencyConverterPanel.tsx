import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import {
  CONVERTER_CURRENCIES,
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  type ConverterCurrency,
} from '../constants/currencies';
import { getERPNextClient } from '../services/erpnext';
import {
  formatConvertedAmount,
  formatRateLine,
  parseAmountInput,
} from '../utils/currencyConversion';
import { userFacingError } from '../utils/userFacingError';

type PickerTarget = 'from' | 'to' | null;

export type CurrencyConverterPanelProps = {
  initialFromCurrency?: ConverterCurrency;
  initialToCurrency?: ConverterCurrency;
  initialAmount?: string;
  compact?: boolean;
};

export const CurrencyConverterPanel: React.FC<CurrencyConverterPanelProps> = ({
  initialFromCurrency = 'USD',
  initialToCurrency = 'GHS',
  initialAmount = '1',
  compact = false,
}) => {
  const { t } = useTranslation();
  const [fromCurrency, setFromCurrency] = useState<ConverterCurrency>(initialFromCurrency);
  const [toCurrency, setToCurrency] = useState<ConverterCurrency>(initialToCurrency);
  const [amountInput, setAmountInput] = useState(initialAmount);
  const [rate, setRate] = useState<number | null>(null);
  const [loadingRate, setLoadingRate] = useState(true);
  const [rateError, setRateError] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  useEffect(() => {
    setFromCurrency(initialFromCurrency);
    setToCurrency(initialToCurrency);
    setAmountInput(initialAmount);
  }, [initialFromCurrency, initialToCurrency, initialAmount]);

  const loadRate = useCallback(async () => {
    setLoadingRate(true);
    setRateError(null);
    try {
      const quote = await getERPNextClient().getExchangeRateQuote(fromCurrency, toCurrency);
      setRate(quote.rate);
    } catch (error: unknown) {
      setRate(null);
      setRateError(userFacingError(error, t('currencyConverter.rateLoadFailed')));
    } finally {
      setLoadingRate(false);
    }
  }, [fromCurrency, toCurrency, t]);

  useEffect(() => {
    void loadRate();
  }, [loadRate]);

  const parsedAmount = useMemo(() => parseAmountInput(amountInput), [amountInput]);

  const convertedAmount = useMemo(() => {
    if (parsedAmount == null || rate == null) return null;
    return parsedAmount * rate;
  }, [parsedAmount, rate]);

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const selectCurrency = (code: ConverterCurrency, target: 'from' | 'to') => {
    if (target === 'from') setFromCurrency(code);
    else setToCurrency(code);
    setPickerTarget(null);
  };

  const openPicker = (target: PickerTarget) => setPickerTarget(target);

  return (
    <>
      {!compact ? (
        <Text style={styles.lead}>{t('currencyConverter.subtitle')}</Text>
      ) : null}

      <View style={styles.shell}>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>{t('currencyConverter.from')}</Text>
          <View style={styles.blockRow}>
            <Text style={styles.currencyGlyph}>{CURRENCY_SYMBOLS[fromCurrency] ?? fromCurrency}</Text>
            <TextInput
              style={styles.amountInput}
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={Colors.TEXT_DISABLED}
            />
            <TouchableOpacity
              style={styles.currencyChip}
              onPress={() => openPicker('from')}
              activeOpacity={0.75}
            >
              <Text style={styles.currencyChipText}>{fromCurrency}</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.WINE} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.swapWrap}>
          <TouchableOpacity
            style={styles.swapFab}
            onPress={swapCurrencies}
            activeOpacity={0.85}
            accessibilityLabel={t('currencyConverter.swap')}
          >
            <Ionicons name="swap-vertical" size={20} color={Colors.WHITE} />
          </TouchableOpacity>
        </View>

        <View style={[styles.block, styles.blockTo]}>
          <Text style={styles.blockLabel}>{t('currencyConverter.to')}</Text>
          <View style={styles.blockRow}>
            <Text style={[styles.currencyGlyph, styles.currencyGlyphTo]}>
              {CURRENCY_SYMBOLS[toCurrency] ?? toCurrency}
            </Text>
            <Text style={styles.resultAmount}>
              {convertedAmount != null ? formatConvertedAmount(convertedAmount, toCurrency) : '—'}
            </Text>
            <TouchableOpacity
              style={styles.currencyChip}
              onPress={() => openPicker('to')}
              activeOpacity={0.75}
            >
              <Text style={styles.currencyChipText}>{toCurrency}</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.WINE} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.quickRow}>
        {CONVERTER_CURRENCIES.map((code) => (
          <TouchableOpacity
            key={code}
            style={[styles.quickPill, fromCurrency === code && styles.quickPillActive]}
            onPress={() => setFromCurrency(code)}
            activeOpacity={0.75}
          >
            <Text style={[styles.quickPillText, fromCurrency === code && styles.quickPillTextActive]}>
              {code}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.rateStrip}>
        {loadingRate ? (
          <View style={styles.rateLoading}>
            <ActivityIndicator size="small" color={Colors.WINE} />
            <Text style={styles.rateLoadingText}>{t('currencyConverter.loadingRate')}</Text>
          </View>
        ) : rateError ? (
          <>
            <Text style={styles.rateError}>{rateError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void loadRate()}>
              <Text style={styles.retryText}>{t('currencyConverter.retry')}</Text>
            </TouchableOpacity>
          </>
        ) : rate != null ? (
          <>
            <Text style={styles.rateLabel}>{t('currencyConverter.erpRate')}</Text>
            <Text style={styles.rateLine}>{formatRateLine(fromCurrency, toCurrency, rate)}</Text>
          </>
        ) : null}
      </View>

      <Modal
        visible={pickerTarget != null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerTarget(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerTarget(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('currencyConverter.pickCurrency')}</Text>
              <TouchableOpacity onPress={() => setPickerTarget(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>
            </View>
            {CONVERTER_CURRENCIES.map((code) => {
              const active =
                pickerTarget === 'from'
                  ? fromCurrency === code
                  : pickerTarget === 'to'
                    ? toCurrency === code
                    : false;
              return (
                <TouchableOpacity
                  key={`${pickerTarget}-${code}`}
                  style={styles.modalRow}
                  onPress={() => selectCurrency(code, pickerTarget === 'from' ? 'from' : 'to')}
                  activeOpacity={0.7}
                >
                  <View style={styles.modalRowTextWrap}>
                    <Text style={[styles.modalRowCode, active && styles.modalRowActive]}>{code}</Text>
                    <Text style={styles.modalRowLabel}>{CURRENCY_LABELS[code]}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark" size={18} color={Colors.WINE} /> : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const hairline = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.TEXT_SECONDARY,
    marginBottom: Spacing.MD,
  },
  shell: {
    backgroundColor: Colors.WHITE,
    borderRadius: 16,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  block: {
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.LG,
    backgroundColor: '#FAFAFB',
  },
  blockTo: {
    backgroundColor: Colors.WHITE,
    paddingTop: Spacing.LG,
  },
  blockLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyGlyph: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
    minWidth: 36,
  },
  currencyGlyphTo: {
    color: Colors.WINE,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
    paddingVertical: 0,
  },
  resultAmount: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: Colors.WINE,
  },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.WHITE,
    borderWidth: hairline,
    borderColor: Colors.WINE,
  },
  currencyChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.WINE,
  },
  swapWrap: {
    alignItems: 'center',
    marginTop: -18,
    marginBottom: -18,
    zIndex: 2,
  },
  swapFab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.WINE,
    borderWidth: 3,
    borderColor: Colors.WHITE,
    shadowColor: Colors.WINE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.MD,
    justifyContent: 'center',
  },
  quickPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.WHITE,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
  },
  quickPillActive: {
    backgroundColor: '#FDF2F4',
    borderColor: Colors.WINE,
  },
  quickPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
  },
  quickPillTextActive: {
    color: Colors.WINE,
  },
  rateStrip: {
    marginTop: Spacing.MD,
    paddingVertical: 12,
    paddingHorizontal: Spacing.MD,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: hairline,
    borderColor: Colors.BORDER,
    alignItems: 'center',
  },
  rateLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  rateLine: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
    textAlign: 'center',
  },
  rateLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rateLoadingText: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
  },
  rateError: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.ERROR,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.WHITE,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.WINE,
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
    paddingBottom: Spacing.LG,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.LIGHT_GRAY,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.LG,
    paddingVertical: 16,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.LIGHT_GRAY,
  },
  modalRowTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  modalRowCode: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.DARK_GRAY,
    marginBottom: 2,
  },
  modalRowActive: {
    color: Colors.WINE,
  },
  modalRowLabel: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
  },
});
