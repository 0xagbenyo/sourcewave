import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import type { DeliveryNoteSupplierHeaderDraft } from '../utils/deliveryNoteSupplierFields';
import { SUPPLIER_VISIBLE_DN_HEADER_KEYS } from '../utils/deliveryNoteSupplierFields';

type Props = {
  draft: DeliveryNoteSupplierHeaderDraft;
  disabled?: boolean;
  onChange: (next: DeliveryNoteSupplierHeaderDraft) => void;
};

type FieldKey = (typeof SUPPLIER_VISIBLE_DN_HEADER_KEYS)[number];

const hairline = StyleSheet.hairlineWidth;

export const DeliveryNoteSupplierHeaderForm: React.FC<Props> = ({
  draft,
  disabled = false,
  onChange,
}) => {
  const { t } = useTranslation();

  const setField = (key: FieldKey, value: string) => {
    onChange({ ...draft, [key]: value });
  };

  const fields: { key: FieldKey; label: string; multiline?: boolean }[] = [
    { key: 'instructions', label: t('deliveryNoteDetails.fieldInstructions'), multiline: true },
  ];

  return (
    <View>
      {fields.map(({ key, label, multiline }, index) => (
        <View
          key={key}
          style={[styles.fieldRow, index === fields.length - 1 && styles.fieldRowLast]}
        >
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={[styles.input, multiline && styles.inputMulti]}
            value={draft[key]}
            onChangeText={(v) => setField(key, v)}
            editable={!disabled}
            multiline={multiline}
            textAlignVertical={multiline ? 'top' : 'center'}
            placeholderTextColor="#C7C7CC"
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  fieldRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: hairline,
    borderBottomColor: '#E5E5E7',
    gap: 6,
  },
  fieldRowLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 13,
    color: '#8E8E93',
    letterSpacing: -0.1,
  },
  input: {
    fontSize: 15,
    color: Colors.BLACK,
    paddingVertical: 4,
    letterSpacing: -0.2,
  },
  inputMulti: {
    minHeight: 64,
    paddingTop: 2,
  },
});
