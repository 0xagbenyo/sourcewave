import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/colors';

type Props = {
  busy?: boolean;
  compact?: boolean;
  onAccept: () => void;
  onReject: () => void;
};

export const QuotationBuyerActionBar: React.FC<Props> = ({ busy, compact, onAccept, onReject }) => (
  <View style={[styles.row, compact && styles.rowCompact]}>
    <TouchableOpacity
      style={[styles.btn, compact && styles.btnCompact, styles.rejectBtn]}
      onPress={onReject}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityLabel="Reject quotation"
    >
      <Text style={[styles.rejectText, compact && styles.btnTextCompact]}>Reject</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.btn, compact && styles.btnCompact, styles.acceptBtn]}
      onPress={onAccept}
      disabled={busy}
      activeOpacity={0.85}
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  rowCompact: {
    marginBottom: 0,
    gap: 6,
    justifyContent: 'flex-end',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnCompact: {
    flex: 0,
    minHeight: 32,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  rejectBtn: {
    backgroundColor: Colors.WHITE,
    borderWidth: 1.5,
    borderColor: Colors.ERROR,
  },
  rejectText: { fontSize: 15, fontWeight: '700', color: Colors.ERROR },
  acceptBtn: { backgroundColor: Colors.SUCCESS },
  acceptText: { fontSize: 15, fontWeight: '800', color: Colors.WHITE },
  btnTextCompact: { fontSize: 12, fontWeight: '700' },
});
