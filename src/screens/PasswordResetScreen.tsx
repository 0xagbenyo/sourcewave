import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { frappeGuestUpdatePasswordWithKey } from '../services/erpnext';
import type { RootStackParamList } from '../types';

type R = RouteProp<RootStackParamList, 'PasswordReset'>;

export const PasswordResetScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<R>();
  const keyFromLink = useMemo(() => String(route.params?.key || '').trim(), [route.params?.key]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const goAuthLogin = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Auth' }],
      })
    );
  };

  const onSubmit = async () => {
    if (!keyFromLink) {
      Alert.alert(t('passwordReset.missingKeyTitle'), t('passwordReset.missingKeyBody'));
      return;
    }
    const p = password.trim();
    const c = confirm.trim();
    if (p.length < 8) {
      Alert.alert(t('passwordReset.weakTitle'), t('passwordReset.weakBody'));
      return;
    }
    if (p !== c) {
      Alert.alert(t('passwordReset.mismatchTitle'), t('passwordReset.mismatchBody'));
      return;
    }

    setBusy(true);
    try {
      await frappeGuestUpdatePasswordWithKey({ key: keyFromLink, newPassword: p, logoutAllSessions: 1 });
      Alert.alert(t('passwordReset.successTitle'), t('passwordReset.successBody'), [
        { text: t('contactUs.ok'), onPress: goAuthLogin },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('passwordReset.genericError');
      Alert.alert(t('passwordReset.errorTitle'), msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <TouchableOpacity style={styles.backTop} onPress={goAuthLogin} hitSlop={12} accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t('passwordReset.title')}</Text>
          <Text style={styles.subtitle}>{t('passwordReset.subtitle')}</Text>

          {!keyFromLink ? (
            <Text style={styles.warn}>{t('passwordReset.missingKeyBody')}</Text>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>{t('passwordReset.newPassword')}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy && !!keyFromLink}
              placeholder={t('passwordReset.newPasswordPh')}
              placeholderTextColor={Colors.TEXT_SECONDARY}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t('passwordReset.confirmPassword')}</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy && !!keyFromLink}
              placeholder={t('passwordReset.confirmPasswordPh')}
              placeholderTextColor={Colors.TEXT_SECONDARY}
            />
          </View>

          <TouchableOpacity
            style={[styles.primary, (!keyFromLink || busy) && styles.primaryDisabled]}
            onPress={onSubmit}
            disabled={!keyFromLink || busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <Text style={styles.primaryText}>{t('passwordReset.submit')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondary} onPress={goAuthLogin} disabled={busy}>
            <Text style={styles.secondaryText}>{t('passwordReset.backSignIn')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.BACKGROUND },
  flex: { flex: 1 },
  backTop: { position: 'absolute', top: 8, left: 12, zIndex: 2, padding: 8 },
  scroll: { paddingHorizontal: Spacing.LG, paddingTop: 56, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.BLACK, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.TEXT_SECONDARY, lineHeight: 20, marginBottom: Spacing.LG },
  warn: { color: Colors.ERROR, marginBottom: Spacing.MD, fontSize: 14 },
  field: { marginBottom: Spacing.MD },
  label: { fontSize: 13, fontWeight: '600', color: Colors.TEXT_SECONDARY, marginBottom: 6 },
  input: {
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.BLACK,
  },
  primary: {
    marginTop: Spacing.MD,
    backgroundColor: Colors.BLACK,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.55 },
  primaryText: { color: Colors.WHITE, fontWeight: '700', fontSize: 16 },
  secondary: { marginTop: Spacing.LG, alignItems: 'center', padding: 8 },
  secondaryText: { color: Colors.WINE, fontWeight: '700', fontSize: 15 },
});
