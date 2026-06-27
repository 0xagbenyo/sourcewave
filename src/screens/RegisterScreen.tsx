import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { getERPNextClient } from '../services/erpnext';
import { OTP_PURPOSE_SIGN_UP } from '../constants/otpPurposes';
import { appAlert as Alert } from '../services/appAlert';
import { userFacingError } from '../utils/userFacingError';
import { hasAcceptedLegalTerms } from '../legal/legalAcceptance';
import { useOtpResendCooldown } from '../hooks/useOtpResendCooldown';
import { useUserSession } from '../context/UserContext';
import { completeAppSignIn } from '../utils/completeAppSignIn';
import { resetToMainScreen } from '../navigation/rootNavigation';
import { AuthScreenShell, AuthStepIndicator } from '../components/auth/AuthScreenShell';
import { AuthField } from '../components/auth/AuthField';
import { AuthPrimaryButton, AuthInlineSwitch, AuthTextLink } from '../components/auth/AuthPrimaryButton';

export const RegisterScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [phone, setPhone] = useState('');
  const [otpStep, setOtpStep] = useState<'details' | 'verify'>('details');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { setUser } = useUserSession();
  const { secondsLeft, canResend, startCooldown, resetCooldown } = useOtpResendCooldown();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const accepted = await hasAcceptedLegalTerms();
        if (active && !accepted) {
          navigation.navigate('RegisterConsent' as never);
        }
      })();
      return () => {
        active = false;
      };
    }, [navigation])
  );

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const validatePhone = (value: string) => {
    const cleaned = value.replace(/[\s\-()]/g, '');
    return /^(\+?233|0)?[0-9]{9}$/.test(cleaned);
  };

  const validateDetailsForm = () => {
    const newErrors: Record<string, string> = {};
    if (!email.trim()) newErrors.email = 'register.errors.emailRequired';
    else if (!validateEmail(email.trim())) newErrors.email = 'register.errors.emailInvalid';
    if (!firstName.trim()) newErrors.firstName = 'register.errors.firstRequired';
    if (!lastName.trim()) newErrors.lastName = 'register.errors.lastRequired';
    if (!phone.trim()) newErrors.phone = 'register.errors.phoneRequired';
    else if (!validatePhone(phone.trim())) newErrors.phone = 'register.errors.phoneInvalid';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateVerifyForm = () => {
    const newErrors: Record<string, string> = {};
    if (!otpCode.trim()) newErrors.otp = 'register.errors.otpRequired';
    if (!password.trim()) newErrors.password = 'register.errors.passwordRequired';
    else if (password.trim().length < 8) newErrors.password = 'register.errors.passwordShort';
    if (password.trim() !== confirmPassword.trim()) {
      newErrors.confirmPassword = 'register.errors.passwordMismatch';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendOtp = async () => {
    if (!validateDetailsForm()) return;
    setIsLoading(true);
    setErrors({});
    try {
      await getERPNextClient().sendOtp({ email: email.trim(), purpose: OTP_PURPOSE_SIGN_UP });
      setOtpStep('verify');
      startCooldown();
    } catch (error: unknown) {
      Alert.alert(t('register.alerts.registrationError'), userFacingError(error, t('register.alerts.otpSendFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend || resendingOtp) return;
    setResendingOtp(true);
    setErrors({});
    try {
      await getERPNextClient().sendOtp({ email: email.trim(), purpose: OTP_PURPOSE_SIGN_UP });
      setOtpCode('');
      startCooldown();
      Alert.alert(t('register.alerts.otpResentTitle'), t('register.alerts.otpResentBody'));
    } catch (error: unknown) {
      Alert.alert(t('register.alerts.registrationError'), userFacingError(error, t('register.alerts.otpSendFailed')));
    } finally {
      setResendingOtp(false);
    }
  };

  const handleCompleteRegistration = async () => {
    if (!validateVerifyForm()) return;

    setIsLoading(true);
    const passwordTrim = password.trim();
    const emailTrim = email.trim();
    try {
      const client = getERPNextClient();
      await client.validateOtp({
        email: emailTrim,
        purpose: OTP_PURPOSE_SIGN_UP,
        otpCode: otpCode.trim(),
      });

      const userData = {
        email: emailTrim,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim() || undefined,
        phone: phone.trim(),
        password: passwordTrim,
        send_welcome_email: false,
        deferRavenCustomerLink: true,
      };

      const created = await client.createUser(userData);
      const frappeUserName = String((created as { name?: string })?.name ?? emailTrim).trim();
      const fullName = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');

      let customerId: string | null = null;
      const existingCustomer = await client.getCustomerByEmail(emailTrim, {
        includePortalUsersChildScan: false,
      });
      if (existingCustomer?.name) {
        customerId = String(existingCustomer.name).trim();
      } else {
        try {
          const createdCust = await client.createCustomer({
            customer_name: fullName || `${firstName.trim()} ${lastName.trim()}`,
            email: emailTrim,
            phone: phone.trim(),
            mobile_no: phone.trim(),
            customer_type: 'Individual',
            portal_user_name: frappeUserName,
          });
          const cid = String((createdCust as { name?: string })?.name ?? '').trim();
          if (cid) customerId = cid;
        } catch (customerError) {
          console.warn('User created, but customer creation failed:', customerError);
        }
      }

      try {
        await client.ensureRavenUserCustomCustomerForUser(frappeUserName, {
          customerId,
          ravenUserMatchKeys: [emailTrim],
        });
      } catch (e) {
        console.warn('Link Raven User → Customer skipped or failed:', e);
      }

      try {
        const session = await completeAppSignIn(emailTrim, passwordTrim);
        setUser(session);
        resetToMainScreen();
      } catch (signInError) {
        console.warn('Registration succeeded but auto sign-in failed:', signInError);
        Alert.alert(t('register.alerts.createdTitle'), t('register.alerts.createdSignInManually'), [
          { text: t('contactUs.ok'), onPress: () => navigation.navigate('Login' as never) },
        ]);
      }
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : '';
      const msg = userFacingError(raw, t('register.alerts.sendFailed'));
      if (/otp|code|expired|invalid/i.test(raw) || /otp|code|expired|invalid/i.test(msg)) {
        Alert.alert(t('register.alerts.registrationError'), t('register.alerts.otpInvalid'));
      } else {
        Alert.alert(t('register.alerts.registrationError'), msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (otpStep === 'verify') {
      setOtpStep('details');
      setOtpCode('');
      setPassword('');
      setConfirmPassword('');
      setErrors({});
      resetCooldown();
      return;
    }
    navigation.goBack();
  };

  const legalFooter = (
    <Text style={styles.legalText}>
      {t('register.legalPrefix')}{' '}
      <Text style={styles.legalLink} onPress={() => navigation.navigate('PrivacyPolicy' as never)}>
        {t('register.privacy')}
      </Text>{' '}
      {t('register.and')}{' '}
      <Text style={styles.legalLink} onPress={() => navigation.navigate('TermsAndConditions' as never)}>
        {t('register.terms')}
      </Text>
      {t('register.legalSuffix')}
    </Text>
  );

  return (
    <AuthScreenShell
      heroTitle={otpStep === 'details' ? t('register.heroTitle') : t('register.verifyHeroTitle')}
      heroSubtitle={otpStep === 'details' ? t('register.heroSubtitle') : t('register.verifyHeroSubtitle')}
      showBack
      onBack={handleBack}
      footer={legalFooter}
      contentStyle={styles.scrollExtra}
    >
      <AuthStepIndicator
        currentKey={otpStep}
        progressCaption={t('register.stepOf', {
          current: otpStep === 'details' ? 1 : 2,
          total: 2,
        })}
        steps={[
          { key: 'details', label: t('register.stepDetails') },
          { key: 'verify', label: t('register.stepVerify') },
        ]}
      />

      {otpStep === 'details' ? (
        <>
          <AuthField
            label={t('register.email')}
            icon="mail-outline"
            placeholder={t('register.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.email ? t(errors.email) : undefined}
          />

          <View style={styles.nameRow}>
            <AuthField
              label={t('register.firstName')}
              icon="person-outline"
              placeholder={t('register.firstNamePlaceholder')}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoCorrect={false}
              containerStyle={styles.nameCol}
              error={errors.firstName ? t(errors.firstName) : undefined}
            />
            <AuthField
              label={t('register.lastName')}
              placeholder={t('register.lastNamePlaceholder')}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoCorrect={false}
              containerStyle={styles.nameCol}
              error={errors.lastName ? t(errors.lastName) : undefined}
            />
          </View>

          <AuthField
            label={t('register.middleName')}
            placeholder={t('register.middleNamePlaceholder')}
            value={middleName}
            onChangeText={setMiddleName}
            autoCapitalize="words"
            autoCorrect={false}
          />

          <AuthField
            label={t('register.phone')}
            icon="call-outline"
            placeholder={t('register.phonePlaceholder')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.phone ? t(errors.phone) : undefined}
          />

          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.TEXT_SECONDARY} />
            <Text style={styles.infoText}>{t('register.infoBanner')}</Text>
          </View>

          <AuthPrimaryButton
            title={isLoading ? t('register.sending') : t('register.sendCode')}
            onPress={handleSendOtp}
            loading={isLoading}
          />
        </>
      ) : (
        <>
          <View style={styles.otpBanner}>
            <Ionicons name="mail-outline" size={18} color={Colors.TEXT_SECONDARY} />
            <View style={styles.otpBannerText}>
              <Text style={styles.otpSentMessage}>{t('register.otpSentMessage')}</Text>
              <Text style={styles.emailSummary}>{email.trim()}</Text>
              <Text style={styles.otpSpamNote}>{t('register.otpSpamNote')}</Text>
            </View>
          </View>

          <AuthField
            label={t('register.otpLabel')}
            icon="keypad-outline"
            placeholder={t('register.otpPlaceholder')}
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.otp ? t(errors.otp) : undefined}
          />

          <AuthField
            label={t('register.password')}
            icon="lock-closed-outline"
            placeholder={t('register.passwordPlaceholder')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.password ? t(errors.password) : undefined}
          />

          <AuthField
            label={t('register.confirmPassword')}
            icon="lock-closed-outline"
            placeholder={t('register.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.confirmPassword ? t(errors.confirmPassword) : undefined}
          />

          <AuthPrimaryButton
            title={isLoading ? t('register.sending') : t('register.createAccount')}
            onPress={handleCompleteRegistration}
            loading={isLoading}
          />

          <AuthTextLink
            centered
            onPress={() => {
              resetCooldown();
              setOtpStep('details');
            }}
          >
            {t('register.backEditDetails')}
          </AuthTextLink>

          <AuthTextLink
            centered
            disabled={isLoading || resendingOtp || !canResend}
            onPress={handleResendOtp}
          >
            {resendingOtp
              ? t('register.sending')
              : canResend
                ? t('register.resendOtp')
                : t('register.resendOtpIn', { seconds: secondsLeft })}
          </AuthTextLink>
        </>
      )}

      <AuthInlineSwitch
        prefix={t('register.haveAccount')}
        action={t('register.signIn')}
        onPress={() => navigation.navigate('Login' as never)}
      />
    </AuthScreenShell>
  );
};

const styles = StyleSheet.create({
  scrollExtra: {
    paddingBottom: Spacing.XXL,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameCol: {
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    marginBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.TEXT_SECONDARY,
  },
  otpBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    marginBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.BORDER,
  },
  otpBannerText: {
    flex: 1,
  },
  otpSentMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 6,
  },
  emailSummary: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.BRAND_NAVY,
    marginBottom: 6,
  },
  otpSpamNote: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.TEXT_SECONDARY,
    fontStyle: 'italic',
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
