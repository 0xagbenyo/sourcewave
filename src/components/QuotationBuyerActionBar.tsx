import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/colors';
import { ERP_DOC_FLAT } from '../constants/erpDocFlatUi';

type Props = {
  busy?: boolean;
  compact?: boolean;
  onAccept: () => void;
  onReject: () => void;
};

export const QuotationBuyerActionBar: React.FC<Props> = ({ busy, compact, onAccept, onReject }) => (
  <View style={[styles.row, compact && styles.rowCompact]}>
    <TouchableOpacity
      style={[styles.btn, compact && styles.btnCompact, styles.rejectBtn, compact && styles.rejectBtnCompact]}
      onPress={onReject}
      disabled={busy}
      activeOpacity={0.82}
      accessibilityLabel="Reject quotation"
    >
      <Text style={[styles.rejectText, compact && styles.btnTextCompact]}>Reject</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.btn, compact && styles.btnCompact, styles.acceptBtn, compact && styles.acceptBtnCompact]}
      onPress={onAccept}
      disabled={busy}
      activeOpacity={0.82}
      accessibilityLabel="Accept quotation"
    >
      {busy ? (
        <ActivityIndicator color={Colors.WHITE} size="small" />
      ) : (
        <Text style={[styles.acceptText, compact && styles.btnTextCompact]}>Accept</Text>
      )}
    </TouchableOpacity>
  </View>
);

const hairline = ERP_DOC_FLAT.hairline;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
    minWidth: 0,
    marginBottom: 16,
  },
  rowCompact: {
    marginBottom: 0,
    width: 'auto',
    alignSelf: 'flex-start',
  },
  btn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginHorizontal: 4,
  },
  btnCompact: {
    flex: 0,
    minHeight: 28,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginHorizontal: 2,
    borderRadius: 999,
  },
  rejectBtn: {
    backgroundColor: ERP_DOC_FLAT.surface,
    borderWidth: hairline,
    borderColor: ERP_DOC_FLAT.border,
  },
  rejectBtnCompact: {
    backgroundColor: '#D32F2F',
    borderColor: '#B71C1C',
  },
  rejectText: { fontSize: 15, fontWeight: '600', color: Colors.WHITE },
  acceptBtn: { backgroundColor: ERP_DOC_FLAT.accent },
  acceptBtnCompact: { backgroundColor: Colors.SUCCESS },
  acceptText: { fontSize: 15, fontWeight: '600', color: Colors.WHITE },
  btnTextCompact: { fontSize: 12, fontWeight: '700' },
});
