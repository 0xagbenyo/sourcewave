import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { getERPNextClient } from '../services/erpnext';
import { OTP_PURPOSE_RESET_PASSWORD } from '../constants/otpPurposes';
import { appAlert as Alert } from '../services/appAlert';
import { userFacingError } from '../utils/userFacingError';
import { useOtpResendCooldown } from '../hooks/useOtpResendCooldown';
import { AuthScreenShell, AuthStepIndicator } from '../components/auth/AuthScreenShell';
import { AuthField } from '../components/auth/AuthField';
import { AuthPrimaryButton, AuthInlineSwitch, AuthTextLink } from '../components/auth/AuthPrimaryButton';

interface RouteParams {
  email?: string;
}

export const ForgotPasswordScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { secondsLeft, canResend, startCooldown, resetCooldown } = useOtpResendCooldown();
  const { email: initialEmail } = (route.params || {}) as RouteParams;
  const [email, setEmail] = useState(initialEmail || '');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert(t('forgot.alerts.emailRequiredTitle'), t('forgot.alerts.emailRequiredBody'));
      return;
    }
    if (!validateEmail(trimmedEmail)) {
      Alert.alert(t('forgot.alerts.invalidTitle'), t('forgot.alerts.invalidBody'));
      return;
    }

    setIsLoading(true);
    try {
      const client = getERPNextClient();
      const user = await client.getUserByEmail(trimmedEmail);
      if (!user?.name) {
        Alert.alert(t('forgot.alerts.errorTitle'), t('forgot.alerts.userNotFound'));
        return;
      }
      await client.sendOtp({ email: trimmedEmail, purpose: OTP_PURPOSE_RESET_PASSWORD });
      setStep('otp');
      startCooldown();
    } catch (error: unknown) {
      Alert.alert(t('forgot.alerts.errorTitle'), userFacingError(error, t('forgot.alerts.otpSendFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetWithOtp = async () => {
    const trimmedEmail = email.trim();
    if (!otpCode.trim()) {
      Alert.alert(t('forgot.alerts.errorTitle'), t('register.errors.otpRequired'));
      return;
    }
    if (!newPassword.trim() || newPassword.trim().length < 8) {
      Alert.alert(t('forgot.alerts.errorTitle'), t('register.errors.passwordShort'));
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      Alert.alert(t('forgot.alerts.errorTitle'), t('register.errors.passwordMismatch'));
      return;
    }

    setIsLoading(true);
    try {
      await getERPNextClient().resetPasswordWithOtp(trimmedEmail, otpCode.trim(), newPassword.trim());
      setIsSuccess(true);
    } catch (error: unknown) {
      Alert.alert(t('forgot.alerts.errorTitle'), userFacingError(error, t('forgot.alerts.resetFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !canResend || resendingOtp) return;

    setResendingOtp(true);
    try {
      await getERPNextClient().sendOtp({ email: trimmedEmail, purpose: OTP_PURPOSE_RESET_PASSWORD });
      setOtpCode('');
      startCooldown();
      Alert.alert(t('forgot.alerts.otpResentTitle'), t('forgot.alerts.otpResentBody'));
    } catch (error: unknown) {
      Alert.alert(t('forgot.alerts.errorTitle'), userFacingError(error, t('forgot.alerts.otpSendFailed')));
    } finally {
      setResendingOtp(false);
    }
  };

  const handleBack = () => {
    if (isSuccess) {
      navigation.goBack();
      return;
    }
    if (step === 'otp') {
      setStep('email');
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
      resetCooldown();
      return;
    }
    navigation.goBack();
  };

  const handleStartOver = () => {
    setIsSuccess(false);
    setStep('email');
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    resetCooldown();
  };

  if (isSuccess) {
    return (
      <AuthScreenShell
        centered
        heroLogo={require('../assets/images/sourcewave logo.png')}
        heroTitle={t('forgot.successTitleOtp')}
        heroSubtitle={t('forgot.successSubtitleOtp')}
        showBack
        onBack={handleBack}
        contentStyle={styles.scrollExtra}
      >
        <View style={styles.successIconWrap}>
          <Ionicons name="checkmark-circle" size={56} color={Colors.SUCCESS} />
        </View>
        <Text style={styles.successEmail}>{email.trim()}</Text>
        <Text style={styles.successNote}>{t('forgot.successInstructionsOtp')}</Text>

        <AuthPrimaryButton title={t('forgot.backLogin')} onPress={handleBack} />

        <AuthTextLink centered onPress={handleStartOver}>
          {t('forgot.resend')}
        </AuthTextLink>

        <View style={styles.helpBlock}>
          <Text style={styles.helpTitle}>{t('forgot.noEmailTitle')}</Text>
          <Text style={styles.helpBody}>{t('forgot.noEmailBody')}</Text>
        </View>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      heroTitle={step === 'email' ? t('forgot.heroTitle') : t('forgot.heroTitleOtp')}
      heroSubtitle={step === 'email' ? t('forgot.heroSubtitleEmail') : t('forgot.heroSubtitleOtp')}
      showBack
      onBack={handleBack}
      contentStyle={styles.scrollExtra}
    >
      <AuthStepIndicator
        currentKey={step}
        progressCaption={t('forgot.stepOf', { current: step === 'email' ? 1 : 2, total: 2 })}
        steps={[
          { key: 'email', label: t('forgot.stepEmail') },
          { key: 'otp', label: t('forgot.stepReset') },
        ]}
      />

      {step === 'email' ? (
        <>
          <AuthField
            label={t('forgot.emailLabel')}
            icon="mail-outline"
            placeholder={t('forgot.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <AuthPrimaryButton
            title={isLoading ? t('forgot.sending') : t('forgot.sendCode')}
            onPress={handleSendOtp}
            disabled={!email.trim()}
            loading={isLoading}
          />
        </>
      ) : (
        <>
          <View style={styles.otpBanner}>
            <Ionicons name="mail-outline" size={18} color={Colors.TEXT_SECONDARY} />
            <View style={styles.otpBannerText}>
              <Text style={styles.otpHint}>{t('forgot.otpStepHint')}</Text>
              <Text style={styles.emailSummary}>{email.trim()}</Text>
            </View>
          </View>

          <AuthField
            label={t('forgot.otpLabel')}
            icon="keypad-outline"
            placeholder={t('forgot.otpPlaceholder')}
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            autoCapitalize="none"
            editable={!isLoading}
          />

          <AuthField
            label={t('forgot.newPassword')}
            icon="lock-closed-outline"
            placeholder={t('forgot.newPasswordPlaceholder')}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <AuthField
            label={t('forgot.confirmPassword')}
            icon="lock-closed-outline"
            placeholder={t('forgot.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <AuthPrimaryButton
            title={isLoading ? t('forgot.sending') : t('forgot.resetWithOtp')}
            onPress={handleResetWithOtp}
            disabled={!otpCode.trim() || !newPassword.trim()}
            loading={isLoading}
          />

          <AuthTextLink
            centered
            disabled={isLoading}
            onPress={() => {
              resetCooldown();
              setStep('email');
            }}
          >
            {t('forgot.backEditEmail')}
          </AuthTextLink>

          <AuthTextLink
            centered
            disabled={isLoading || resendingOtp || !canResend}
            onPress={handleResendOtp}
          >
            {resendingOtp
              ? t('forgot.sending')
              : canResend
                ? t('forgot.resendOtp')
                : t('forgot.resendOtpIn', { seconds: secondsLeft })}
          </AuthTextLink>
        </>
      )}

      <AuthInlineSwitch
        prefix={t('forgot.remember')}
        action={t('forgot.signIn')}
        onPress={() => navigation.goBack()}
      />

      <View style={styles.helpBlock}>
        <Text style={styles.helpTitle}>{t('forgot.helpTitle')}</Text>
        <Text style={styles.helpBody}>{t('forgot.helpBody')}</Text>
      </View>
    </AuthScreenShell>
  );
};

const styles = StyleSheet.create({
  scrollExtra: {
    paddingBottom: Spacing.XXL,
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
  otpHint: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 4,
  },
  emailSummary: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.BRAND_NAVY,
  },
  helpBlock: {
    marginTop: Spacing.LG,
    paddingTop: Spacing.MD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.BORDER,
  },
  helpTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.BRAND_NAVY,
    marginBottom: 4,
  },
  helpBody: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.TEXT_SECONDARY,
  },
  successIconWrap: {
    alignItems: 'center',
    marginBottom: Spacing.MD,
  },
  successEmail: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.BRAND_NAVY,
    textAlign: 'center',
    marginBottom: Spacing.MD,
  },
  successNote: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: Spacing.MD,
  },
});
