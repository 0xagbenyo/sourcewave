import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';

/**
 * Hub for buyer billing — links to dedicated invoice and payment list screens.
 */
export const InvoicesPaymentsScreen: React.FC = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <Text style={styles.title}>Invoices & payments</Text>
        <View style={styles.backBtn} />
      </View>

      <Text style={styles.hint}>View sales invoices and your payment history.</Text>

      <TouchableOpacity
        style={styles.card}
        onPress={() => (navigation as { navigate: (n: string) => void }).navigate('CustomerInvoices')}
        activeOpacity={0.85}
      >
        <View style={[styles.cardIcon, { backgroundColor: 'rgba(128, 0, 32, 0.1)' }]}>
          <Ionicons name="document-text-outline" size={28} color={Colors.WINE} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>My invoices</Text>
          <Text style={styles.cardSub}>Sales invoices, status, and pay online</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={Colors.TEXT_SECONDARY} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => (navigation as { navigate: (n: string) => void }).navigate('CustomerPayments')}
        activeOpacity={0.85}
      >
        <View style={[styles.cardIcon, { backgroundColor: 'rgba(52, 199, 89, 0.12)' }]}>
          <Ionicons name="card-outline" size={28} color="#248A3D" />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Payment history</Text>
          <Text style={styles.cardSub}>All payments recorded on your account</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={Colors.TEXT_SECONDARY} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.BACKGROUND },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.SM,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  backBtn: { width: 40, padding: 4 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: Colors.BLACK },
  hint: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    paddingBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.MD,
    marginTop: 12,
    padding: 16,
    backgroundColor: Colors.WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.BLACK },
  cardSub: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 4 },
});
