import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { ERP_DOC_FLAT } from '../constants/erpDocFlatUi';
import {
  FREIGHT_TAX_CHARGE_ACTUAL,
  FREIGHT_TAX_CHARGE_ON_WEIGHT,
  createBlankFreightTaxRow,
  freightTaxAmountFromRateAndWeight,
  isFreightTaxChargeOnWeight,
  type DeliveryNoteTaxRowDraft,
} from '../utils/deliveryNoteAmounts';
import { formatErpDocMoney } from './ErpDocumentPreviewLayout';

type Props = {
  rows: DeliveryNoteTaxRowDraft[];
  currency: string;
  /** DN total net weight used when charge type is On Weight. */
  totalWeight?: number;
  weightUnitLabel?: string;
  disabled?: boolean;
  onChange: React.Dispatch<React.SetStateAction<DeliveryNoteTaxRowDraft[]>>;
};

export const DeliveryNoteFreightTaxesEditor: React.FC<Props> = ({
  rows,
  currency,
  totalWeight = 0,
  weightUnitLabel = '',
  disabled = false,
  onChange,
}) => {
  const { t } = useTranslation();
  /** Only one charge expands for editing at a time. */
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    if (editingKey && !rows.some((row) => row.key === editingKey)) {
      setEditingKey(null);
    }
  }, [rows, editingKey]);

  const updateRow = useCallback(
    (key: string, patch: Partial<DeliveryNoteTaxRowDraft>) => {
      onChange((prev) =>
        prev.map((row) => {
          if (row.key !== key) return row;
          const next = { ...row, ...patch };
          const onWeight = isFreightTaxChargeOnWeight(next.charge_type);
          if (onWeight) {
            const amount = freightTaxAmountFromRateAndWeight(Number(next.rate), totalWeight);
            next.tax_amount = amount;
            next.total = amount;
            if (!String(next.description || '').trim() || next.description === 'Freight') {
              next.description = 'Freight (Weight)';
            }
          } else if (patch.tax_amount !== undefined) {
            next.rate = 0;
            next.total = Number.isFinite(patch.tax_amount) ? patch.tax_amount : 0;
            if (String(next.description || '').trim() === 'Freight (Weight)') {
              next.description = 'Freight';
            }
          }
          return next;
        })
      );
    },
    [onChange, totalWeight]
  );

  const setChargeType = useCallback(
    (key: string, chargeType: string) => {
      onChange((prev) =>
        prev.map((row) => {
          if (row.key !== key) return row;
          if (isFreightTaxChargeOnWeight(chargeType)) {
            const amount = freightTaxAmountFromRateAndWeight(Number(row.rate), totalWeight);
            return {
              ...row,
              charge_type: FREIGHT_TAX_CHARGE_ON_WEIGHT,
              tax_amount: amount,
              total: amount,
              description: 'Freight (Weight)',
            };
          }
          return {
            ...row,
            charge_type: FREIGHT_TAX_CHARGE_ACTUAL,
            rate: 0,
            description: 'Freight',
          };
        })
      );
    },
    [onChange, totalWeight]
  );

  const removeRow = useCallback(
    (key: string) => {
      onChange((prev) => prev.filter((row) => row.key !== key));
      setEditingKey((cur) => (cur === key ? null : cur));
    },
    [onChange]
  );

  const addRow = useCallback(() => {
    const blank = createBlankFreightTaxRow();
    onChange((prev) => {
      blank.idx = prev.length + 1;
      return [...prev, blank];
    });
    setEditingKey(blank.key);
  }, [onChange]);

  const rowAmount = (row: DeliveryNoteTaxRowDraft) => {
    if (isFreightTaxChargeOnWeight(row.charge_type)) {
      return freightTaxAmountFromRateAndWeight(Number(row.rate), totalWeight);
    }
    return Number.isFinite(row.tax_amount) ? row.tax_amount : 0;
  };

  const total = rows.reduce((sum, row) => sum + rowAmount(row), 0);

  return (
    <View style={styles.wrap}>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('deliveryNoteDetails.taxEmpty')}</Text>
      ) : (
        rows.map((row, index) => {
          const onWeight = isFreightTaxChargeOnWeight(row.charge_type);
          const amount = rowAmount(row);
          const editing = editingKey === row.key && !disabled;
          const typeLabel = onWeight
            ? t('deliveryNoteDetails.taxTypeWeight')
            : t('deliveryNoteDetails.taxTypeActual');

          if (!editing) {
            return (
              <View key={row.key} style={styles.compactRow}>
                <View style={styles.compactMain}>
                  <Text style={styles.compactIndex}>{index + 1}</Text>
                  <View style={styles.compactText}>
                    <Text style={styles.compactTitle} numberOfLines={1}>
                      {typeLabel}
                    </Text>
                    {onWeight ? (
                      <Text style={styles.compactSub} numberOfLines={1}>
                        {t('deliveryNoteDetails.taxWeightCalc', {
                          rate: Number.isFinite(row.rate) ? row.rate : 0,
                          weight: Number.isFinite(totalWeight) ? totalWeight : 0,
                          unit: weightUnitLabel || '',
                          amount: formatErpDocMoney(amount, currency),
                        })}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.compactAmount}>{formatErpDocMoney(amount, currency)}</Text>
                </View>
                {!disabled ? (
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => setEditingKey(row.key)}
                    hitSlop={8}
                    accessibilityLabel={t('deliveryNoteDetails.taxEditRow')}
                  >
                    <Ionicons name="pencil-outline" size={18} color={ERP_DOC_FLAT.accent} />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }

          return (
            <View key={row.key} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>
                  {t('deliveryNoteDetails.taxRowTitle', { n: index + 1 })}
                </Text>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => setEditingKey(null)}
                    hitSlop={8}
                    accessibilityLabel={t('deliveryNoteDetails.taxDoneEdit')}
                  >
                    <Ionicons name="checkmark-circle-outline" size={22} color={ERP_DOC_FLAT.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => removeRow(row.key)}
                    hitSlop={8}
                    accessibilityLabel={t('deliveryNoteDetails.taxRemoveRow')}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.ERROR} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.fieldLabel}>{t('deliveryNoteDetails.taxColType')}</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, !onWeight && styles.typeBtnOn]}
                  onPress={() => setChargeType(row.key, FREIGHT_TAX_CHARGE_ACTUAL)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.typeBtnText, !onWeight && styles.typeBtnTextOn]}>
                    {t('deliveryNoteDetails.taxTypeActual')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, onWeight && styles.typeBtnOn]}
                  onPress={() => setChargeType(row.key, FREIGHT_TAX_CHARGE_ON_WEIGHT)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.typeBtnText, onWeight && styles.typeBtnTextOn]}>
                    {t('deliveryNoteDetails.taxTypeWeight')}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>
                {onWeight
                  ? t('deliveryNoteDetails.taxRateLabel', {
                      unit: weightUnitLabel || '',
                    })
                  : t('deliveryNoteDetails.taxColAmount')}
              </Text>
              {onWeight ? (
                <>
                  <TextInput
                    style={styles.input}
                    value={row.rate ? String(row.rate) : ''}
                    keyboardType="decimal-pad"
                    onChangeText={(v) => {
                      const n = parseFloat(String(v).replace(/,/g, ''));
                      updateRow(row.key, { rate: Number.isFinite(n) ? n : 0 });
                    }}
                    placeholder={t('deliveryNoteDetails.taxRatePlaceholder')}
                    placeholderTextColor="#C7C7CC"
                  />
                  <Text style={styles.calcHint}>
                    {t('deliveryNoteDetails.taxWeightCalc', {
                      rate: Number.isFinite(row.rate) ? row.rate : 0,
                      weight: Number.isFinite(totalWeight) ? totalWeight : 0,
                      unit: weightUnitLabel || '',
                      amount: formatErpDocMoney(amount, currency),
                    })}
                  </Text>
                </>
              ) : (
                <TextInput
                  style={styles.input}
                  value={row.tax_amount ? String(row.tax_amount) : ''}
                  keyboardType="decimal-pad"
                  onChangeText={(v) => {
                    const n = parseFloat(String(v).replace(/,/g, ''));
                    updateRow(row.key, { tax_amount: Number.isFinite(n) ? n : 0 });
                  }}
                  placeholder="0.00"
                  placeholderTextColor="#C7C7CC"
                />
              )}
            </View>
          );
        })
      )}

      {rows.length > 0 ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t('deliveryNoteDetails.taxColTotal')}</Text>
          <Text style={styles.summaryValue}>{formatErpDocMoney(total, currency)}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.addBtn, disabled && styles.disabled]}
        onPress={addRow}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={18} color={ERP_DOC_FLAT.accent} />
        <Text style={styles.addBtnText}>{t('deliveryNoteDetails.taxAddRow')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
  },
  empty: {
    fontSize: 14,
    color: ERP_DOC_FLAT.muted,
    lineHeight: 20,
    paddingVertical: 4,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: ERP_DOC_FLAT.hairline,
    borderBottomColor: ERP_DOC_FLAT.border,
    gap: 4,
  },
  compactMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  compactIndex: {
    width: 18,
    fontSize: 13,
    fontWeight: '600',
    color: ERP_DOC_FLAT.muted,
  },
  compactText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: ERP_DOC_FLAT.ink,
  },
  compactSub: {
    fontSize: 12,
    color: ERP_DOC_FLAT.muted,
  },
  compactAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: ERP_DOC_FLAT.ink,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: ERP_DOC_FLAT.hairline,
    borderBottomColor: ERP_DOC_FLAT.border,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: ERP_DOC_FLAT.ink,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: ERP_DOC_FLAT.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: ERP_DOC_FLAT.hairline,
    borderColor: ERP_DOC_FLAT.border,
    backgroundColor: Colors.WHITE,
  },
  typeBtnOn: {
    borderColor: ERP_DOC_FLAT.accent,
    backgroundColor: '#F7F1F3',
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: ERP_DOC_FLAT.muted,
  },
  typeBtnTextOn: {
    color: ERP_DOC_FLAT.accent,
  },
  input: {
    minHeight: 44,
    borderWidth: ERP_DOC_FLAT.hairline,
    borderColor: ERP_DOC_FLAT.border,
    backgroundColor: Colors.WHITE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: ERP_DOC_FLAT.ink,
  },
  calcHint: {
    fontSize: 13,
    color: ERP_DOC_FLAT.muted,
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: ERP_DOC_FLAT.muted,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 16,
    color: ERP_DOC_FLAT.ink,
    fontWeight: '700',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingRight: 8,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: ERP_DOC_FLAT.accent,
  },
  disabled: {
    opacity: 0.45,
  },
});
