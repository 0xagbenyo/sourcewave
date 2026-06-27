import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useUserSession } from '../context/UserContext';
import { completeAppSignIn } from '../utils/completeAppSignIn';
import {
  isEmailLoginIdentifier,
  isValidLoginIdentifier,
  looksLikePhoneInput,
} from '../utils/loginIdentifier';
import { resetToMainScreen } from '../navigation/rootNavigation';
import { AuthScreenShell } from '../components/auth/AuthScreenShell';
import { AuthField } from '../components/auth/AuthField';
import { AuthPrimaryButton, AuthInlineSwitch, AuthTextLink } from '../components/auth/AuthPrimaryButton';

export const LoginScreen: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [identifierValid, setIdentifierValid] = useState<boolean | null>(null);
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { setUser } = useUserSession();

  const handleIdentifierChange = (text: string) => {
    setIdentifier(text);
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      setIdentifierValid(isValidLoginIdentifier(trimmed));
    } else {
      setIdentifierValid(null);
    }
  };

  const identifierError = useMemo(() => {
    if (identifierValid !== false) return undefined;
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) return t('login.invalidEmail');
    if (looksLikePhoneInput(trimmed)) return t('login.invalidPhoneDetail');
    return t('login.invalidIdentifier');
  }, [identifier, identifierValid, t]);

  const identifierIcon = useMemo(() => {
    const trimmed = identifier.trim();
    if (looksLikePhoneInput(trimmed) && !trimmed.includes('@')) {
      return 'call-outline' as const;
    }
    return 'mail-outline' as const;
  }, [identifier]);

  const identifierKeyboard = useMemo(() => {
    const trimmed = identifier.trim();
    if (looksLikePhoneInput(trimmed) && !trimmed.includes('@')) {
      return 'phone-pad' as const;
    }
    if (trimmed.includes('@')) {
      return 'email-address' as const;
    }
    return 'default' as const;
  }, [identifier]);

  const isFormValid = identifierValid === true && password.length > 0;

  const handleContinue = async () => {
    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier) {
      alert(t('login.errors.noIdentifier'));
      return;
    }
    if (!password) {
      alert(t('login.errors.noPassword'));
      return;
    }
    if (!isValidLoginIdentifier(trimmedIdentifier)) {
      alert(identifierError || t('login.invalidIdentifier'));
      return;
    }

    setIsLoading(true);
    try {
      const session = await completeAppSignIn(trimmedIdentifier, password);
      setUser(session);
      resetToMainScreen();
    } catch (error: unknown) {
      const err = error as { message?: string; originalError?: unknown };
      const msg = err?.message || t('login.errors.loginFailed');
      if (looksLikePhoneInput(trimmedIdentifier) && !isEmailLoginIdentifier(trimmedIdentifier)) {
        alert(msg.includes('Invalid') ? t('login.errors.noAccountPhone') : msg);
      } else {
        alert(msg);
      }
      console.error('Login error:', error);
      if (err?.originalError) console.error('Original error:', err.originalError);
    } finally {
      setIsLoading(false);
    }
  };

  const legalFooter = (
    <Text style={styles.legalText}>
      {t('login.legalPrefix')}{' '}
      <Text style={styles.legalLink} onPress={() => navigation.navigate('PrivacyPolicy' as never)}>
        {t('login.privacy')}
      </Text>{' '}
      {t('login.and')}{' '}
      <Text style={styles.legalLink} onPress={() => navigation.navigate('TermsAndConditions' as never)}>
        {t('login.terms')}
      </Text>
      {t('login.legalSuffix')}
    </Text>
  );

  return (
    <AuthScreenShell
      centered
      heroLogo={require('../assets/images/sourcewave logo.png')}
      showBrandAboveHeroLogo
      heroTitle={t('login.welcomeTitle')}
      heroSubtitle={t('login.welcomeSubtitle')}
      footer={legalFooter}
    >
      <View style={styles.trustRow}>
        <Ionicons name="shield-checkmark" size={16} color={Colors.SUCCESS} />
        <Text style={styles.trustText}>{t('login.securityLine')}</Text>
      </View>

      <AuthField
        label={t('login.identifierLabel')}
        icon={identifierIcon}
        placeholder={t('login.identifierPlaceholder')}
        value={identifier}
        onChangeText={handleIdentifierChange}
        keyboardType={identifierKeyboard}
        autoCapitalize="none"
        autoCorrect={false}
        error={identifierError}
      />

      <AuthField
        label={t('login.passwordLabel')}
        icon="lock-closed-outline"
        placeholder={t('login.passwordPlaceholder')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      <AuthPrimaryButton
        title={isLoading ? t('login.signingIn') : t('login.signIn')}
        onPress={handleContinue}
        disabled={!isFormValid}
        loading={isLoading}
      />

      <AuthTextLink
        centered
        onPress={() => {
          const trimmedInput = identifier.trim();
          const emailToPass = isEmailLoginIdentifier(trimmedInput) ? trimmedInput : '';
          navigation.navigate('ForgotPassword' as never, { email: emailToPass } as never);
        }}
      >
        {t('login.forgotPassword')}
      </AuthTextLink>

      <AuthInlineSwitch
        prefix={t('login.noAccount')}
        action={t('login.signUp')}
        onPress={() => navigation.navigate('RegisterConsent' as never)}
      />
    </AuthScreenShell>
  );
};

const styles = StyleSheet.create({
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 6,
  },
  trustText: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
  },
  legalText: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    color: Colors.WINE,
    fontWeight: '600',
  },
});
