import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useUserSession } from '../../context/UserContext';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';

export const SupplierProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, clearUser } = useUserSession();
  const { supplierDocId, loading: sidLoading, error: sidError } = useSupplierDocumentId();

  const signOut = () => {
    Alert.alert('Sign out', 'You will return to the login screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          clearUser();
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Auth' as never }],
            })
          );
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="business-outline" size={22} color={Colors.TEXT_SECONDARY} />
          <View style={styles.rowText}>
            <Text style={styles.label}>Supplier</Text>
            <Text style={styles.value}>{user?.supplierName || '—'}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Ionicons name="pricetag-outline" size={22} color={Colors.TEXT_SECONDARY} />
          <View style={styles.rowText}>
            <Text style={styles.label}>Supplier ID (ERPNext)</Text>
            <Text style={styles.value}>
              {sidLoading ? 'Resolving…' : supplierDocId || user?.supplierId || sidError || '—'}
            </Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Ionicons name="mail-outline" size={22} color={Colors.TEXT_SECONDARY} />
          <View style={styles.rowText}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{user?.email || '—'}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={22} color={Colors.WHITE} />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.BACKGROUND },
  header: { paddingHorizontal: 20, paddingBottom: 8, marginTop: 8 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.BLACK },
  card: {
    marginHorizontal: 16,
    backgroundColor: Colors.WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    paddingVertical: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowText: { marginLeft: 12, flex: 1 },
  label: { fontSize: 12, color: Colors.TEXT_SECONDARY, fontWeight: '600' },
  value: { fontSize: 16, color: Colors.BLACK, marginTop: 2, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.BORDER, marginLeft: 50 },
  signOut: {
    marginHorizontal: 16,
    marginTop: 28,
    backgroundColor: Colors.BLACK,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  signOutText: { color: Colors.WHITE, fontSize: 16, fontWeight: '700', marginLeft: 10 },
});
