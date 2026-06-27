import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { ErpDocumentPdfModal } from './ErpDocumentPdfModal';

type Props = {
  doctype: string;
  docName: string;
  printFormat?: string;
  /** Header icon-only or full-width bar button. */
  variant?: 'icon' | 'bar';
  label?: string;
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
};

/** Opens ERPNext print PDF preview; download/share from the modal toolbar. */
export const DocumentPrintButton: React.FC<Props> = ({
  doctype,
  docName,
  printFormat,
  variant = 'bar',
  label = 'Print / download PDF',
  style,
  accentColor = Colors.WINE,
}) => {
  const [open, setOpen] = useState(false);
  const name = String(docName || '').trim();
  if (!name) return null;

  if (variant === 'icon') {
    return (
      <>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          hitSlop={12}
          style={[styles.iconBtn, style]}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Ionicons name="print-outline" size={22} color={Colors.WINE} />
        </TouchableOpacity>
        <ErpDocumentPdfModal
          visible={open}
          doctype={doctype}
          docName={name}
          printFormat={printFormat}
          onClose={() => setOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.barBtn, { borderColor: accentColor }, style]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="print-outline" size={20} color={accentColor} style={{ marginRight: 8 }} />
        <Text style={[styles.barBtnText, { color: accentColor }]}>{label}</Text>
      </TouchableOpacity>
      <ErpDocumentPdfModal
        visible={open}
        doctype={doctype}
        docName={name}
        printFormat={printFormat}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  iconBtn: { padding: 4, minWidth: 36, alignItems: 'flex-end' },
  barBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: Colors.WHITE,
  },
  barBtnText: { fontSize: 15, fontWeight: '700' },
});
