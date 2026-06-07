import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

type Props = {
  visible: boolean;
  currency: string;
  /** Maximum amount supplier can record this time (invoice outstanding). */
  maxAmount: number;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (amount: number) => void | Promise<void>;
};

export const SupplierQuotationPaymentModal: React.FC<Props> = ({
  visible,
  currency,
  maxAmount,
  loading,
  onClose,
  onSubmit,
}) => {
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) {
      setText('');
    }
  }, [visible, maxAmount]);

  const submit = () => {
    const v = parseFloat(String(text).replace(/,/g, '').trim());
    if (!Number.isFinite(v) || v <= 0) return;
    void onSubmit(Math.min(v, maxAmount));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={loading ? undefined : onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
          style={styles.kav}
        >
          <View style={styles.sheet}>
            <View style={styles.head}>
              <Text style={styles.title}>Record payment</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} disabled={loading}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>
            <Text style={styles.caption}>
              Outstanding up to {currency}{' '}
              {maxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.label}>Amount paid</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#8E8E93"
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.primary, loading && styles.primaryOff]}
              onPress={submit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>Submit payment</Text>
              )}
            </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>
    </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  kav: { width: '100%' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', flex: 1, marginRight: 8 },
  caption: { fontSize: 13, color: '#636366', marginBottom: 16, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', color: '#636366', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#C6C6C8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    marginBottom: 18,
    color: '#1C1C1E',
  },
  primary: {
    backgroundColor: Colors.WINE,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryOff: { opacity: 0.65 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
