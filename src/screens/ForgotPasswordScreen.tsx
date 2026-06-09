import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { getERPNextClient } from '../services/erpnext';
import { OTP_PURPOSE_RESET_PASSWORD } from '../constants/otpPurposes';

interface RouteParams {
  email?: string;
}

export const ForgotPasswordScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { email: initialEmail } = (route.params || {}) as RouteParams;
  const [email, setEmail] = useState(initialEmail || '');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      Alert.alert(t('forgot.alerts.emailRequiredTitle'), t('forgot.alerts.emailRequiredBody'));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('forgot.alerts.otpSendFailed');
      Alert.alert(t('forgot.alerts.errorTitle'), msg);
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
      const client = getERPNextClient();
      await client.resetPasswordWithOtp(trimmedEmail, otpCode.trim(), newPassword.trim());
      setIsSuccess(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('forgot.alerts.resetFailed');
      Alert.alert(t('forgot.alerts.errorTitle'), msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigation.goBack();
  };

  const handleResend = () => {
    setIsSuccess(false);
    setStep('email');
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  if (isSuccess) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <TouchableOpacity style={styles.backButtonTop} onPress={handleBackToLogin}>
            <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
          </TouchableOpacity>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <View style={styles.successIconContainer}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.SUCCESS} />
              </View>
            </View>

            <View style={styles.formContainer}>
              <Text style={styles.title}>{t('forgot.successTitleOtp')}</Text>
              <Text style={styles.subtitle}>{t('forgot.successSubtitleOtp')}</Text>
              <Text style={styles.emailText}>{email.trim()}</Text>

              <Text style={styles.instructions}>{t('forgot.successInstructionsOtp')}</Text>

              <TouchableOpacity style={styles.primaryButton} onPress={handleBackToLogin}>
                <Text style={styles.primaryButtonText}>{t('forgot.backLogin')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={handleResend}>
                <Text style={styles.secondaryButtonText}>{t('forgot.resend')}</Text>
              </TouchableOpacity>

              <View style={styles.helpContainer}>
                <Text style={styles.helpText}>{t('forgot.noEmailTitle')}</Text>
                <Text style={styles.helpSubtext}>{t('forgot.noEmailBody')}</Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableOpacity style={styles.backButtonTop} onPress={handleBackToLogin}>
          <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header} />

          <View style={styles.formContainer}>
            <Text style={styles.title}>{t('forgot.title')}</Text>
            <Text style={styles.subtitle}>
              {step === 'email' ? t('forgot.subtitleOtp') : t('forgot.otpStepHint')}
            </Text>

            {step === 'email' ? (
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('forgot.emailLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('forgot.emailPlaceholder')}
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, (isLoading || !email.trim()) && styles.primaryButtonDisabled]}
                  onPress={handleSendOtp}
                  disabled={isLoading || !email.trim()}
                >
                  <Text style={styles.primaryButtonText}>
                    {isLoading ? t('forgot.sending') : t('forgot.sendCode')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emailText}>{email.trim()}</Text>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('forgot.otpLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('forgot.otpPlaceholder')}
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    editable={!isLoading}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('forgot.newPassword')}</Text>
                  <View style={styles.passwordInputWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder={t('forgot.newPasswordPlaceholder')}
                      placeholderTextColor={Colors.TEXT_SECONDARY}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                    />
                    {newPassword.length > 0 ? (
                      <TouchableOpacity
                        style={styles.eyeButton}
                        onPress={() => setShowNewPassword(!showNewPassword)}
                        accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
                      >
                        <Ionicons
                          name={showNewPassword ? 'eye-off' : 'eye'}
                          size={18}
                          color={Colors.BLACK}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('forgot.confirmPassword')}</Text>
                  <View style={styles.passwordInputWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder={t('forgot.confirmPasswordPlaceholder')}
                      placeholderTextColor={Colors.TEXT_SECONDARY}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                    />
                    {confirmPassword.length > 0 ? (
                      <TouchableOpacity
                        style={styles.eyeButton}
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        <Ionicons
                          name={showConfirmPassword ? 'eye-off' : 'eye'}
                          size={18}
                          color={Colors.BLACK}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (isLoading || !otpCode.trim() || !newPassword.trim()) && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleResetWithOtp}
                  disabled={isLoading || !otpCode.trim() || !newPassword.trim()}
                >
                  <Text style={styles.primaryButtonText}>
                    {isLoading ? t('forgot.sending') : t('forgot.resetWithOtp')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setStep('email')} disabled={isLoading}>
                  <Text style={styles.backEditLink}>{t('forgot.backEditEmail')}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.backToLoginContainer}>
              <Text style={styles.backToLoginText}>{t('forgot.remember')}</Text>
              <TouchableOpacity onPress={handleBackToLogin}>
                <Text style={styles.backToLoginLink}>{t('forgot.signIn')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.helpContainer}>
              <Text style={styles.helpText}>{t('forgot.helpTitle')}</Text>
              <Text style={styles.helpSubtext}>{t('forgot.helpBody')}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
    paddingTop: 40,
    justifyContent: 'center',
  },
  backButtonTop: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 24,
    alignItems: 'center',
  },
  successIconContainer: {
    marginBottom: 24,
  },
  formContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.TEXT_SECONDARY,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
    color: Colors.BLACK,
    width: '100%',
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 10,
    width: '100%',
    minHeight: 48,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 4,
    fontSize: 14,
    color: Colors.BLACK,
  },
  eyeButton: {
    padding: 6,
  },
  primaryButton: {
    backgroundColor: Colors.BLACK,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  secondaryButtonText: {
    color: Colors.BLACK,
    fontSize: 14,
    fontWeight: '500',
  },
  backEditLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.WINE,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginBottom: 12,
  },
  backToLoginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  backToLoginText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  backToLoginLink: {
    fontSize: 14,
    color: Colors.SHEIN_PINK,
    fontWeight: '500',
  },
  helpContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  helpText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.BLACK,
    marginBottom: 6,
  },
  helpSubtext: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 18,
  },
  emailText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.SHEIN_PINK,
    textAlign: 'center',
    marginBottom: 16,
  },
  instructions: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
});
