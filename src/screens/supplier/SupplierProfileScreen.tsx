import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { useUserSession } from '../../context/UserContext';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';

const hairline = StyleSheet.hairlineWidth;

export const SupplierProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
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

  const openFaq = () => {
    (navigation as { navigate: (n: string, p?: object) => void }).navigate('Faq', {
      scope: 'supplier',
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
              <Text style={styles.label}>Supplier ID</Text>
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

        <Text style={styles.sectionLabel}>{t('supplierProfile.faqSection')}</Text>
        <TouchableOpacity
          style={styles.faqRow}
          onPress={openFaq}
          activeOpacity={0.75}
        >
          <Ionicons name="help-circle-outline" size={22} color={Colors.WINE} />
          <View style={styles.faqTextWrap}>
            <Text style={styles.faqTitle}>{t('supplierProfile.faqLink')}</Text>
            <Text style={styles.faqSub}>{t('supplierProfile.faqLinkSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={22} color={Colors.WHITE} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.OFF_WHITE },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 32,
  },
  header: { paddingHorizontal: Spacing.SCREEN_PADDING, paddingBottom: 8, marginTop: 8 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.BLACK },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  card: {
    marginHorizontal: Spacing.SCREEN_PADDING,
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: Colors.BORDER,
    paddingVertical: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowText: { marginLeft: 12, flex: 1 },
  label: { fontSize: 12, color: Colors.TEXT_SECONDARY, fontWeight: '600' },
  value: { fontSize: 16, color: Colors.BLACK, marginTop: 2, fontWeight: '600' },
  divider: { height: hairline, backgroundColor: Colors.BORDER, marginLeft: 50 },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    marginHorizontal: Spacing.SCREEN_PADDING,
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: Colors.BORDER,
  },
  faqTextWrap: { flex: 1, marginLeft: 12, minWidth: 0 },
  faqTitle: { fontSize: 16, fontWeight: '600', color: Colors.BLACK },
  faqSub: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 3, fontWeight: '500' },
  signOut: {
    marginHorizontal: Spacing.SCREEN_PADDING,
    marginTop: 28,
    backgroundColor: Colors.BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
  },
  signOutText: { color: Colors.WHITE, fontSize: 16, fontWeight: '700', marginLeft: 10 },
});
