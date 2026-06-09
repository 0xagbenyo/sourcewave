import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { getERPNextClient } from '../services/erpnext';
import { OTP_PURPOSE_SIGN_UP } from '../constants/otpPurposes';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigation = useNavigation();
  const { t } = useTranslation();

  const validateEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const validatePhone = (value: string) => {
    const cleaned = value.replace(/[\s\-()]/g, '');
    const phoneRegex = /^(\+?233|0)?[0-9]{9}$/;
    return phoneRegex.test(cleaned);
  };

  const validateDetailsForm = () => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = 'register.errors.emailRequired';
    } else if (!validateEmail(email.trim())) {
      newErrors.email = 'register.errors.emailInvalid';
    }

    if (!firstName.trim()) {
      newErrors.firstName = 'register.errors.firstRequired';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'register.errors.lastRequired';
    }

    if (!phone.trim()) {
      newErrors.phone = 'register.errors.phoneRequired';
    } else if (!validatePhone(phone.trim())) {
      newErrors.phone = 'register.errors.phoneInvalid';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateVerifyForm = () => {
    const newErrors: Record<string, string> = {};
    if (!otpCode.trim()) {
      newErrors.otp = 'register.errors.otpRequired';
    }
    if (!password.trim()) {
      newErrors.password = 'register.errors.passwordRequired';
    } else if (password.trim().length < 8) {
      newErrors.password = 'register.errors.passwordShort';
    }
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
      const client = getERPNextClient();
      await client.sendOtp({ email: email.trim(), purpose: OTP_PURPOSE_SIGN_UP });
      setOtpStep('verify');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('register.alerts.otpSendFailed');
      Alert.alert(t('register.alerts.registrationError'), msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteRegistration = async () => {
    if (!validateVerifyForm()) return;

    setIsLoading(true);
    try {
      const client = getERPNextClient();
      await client.validateOtp({
        email: email.trim(),
        purpose: OTP_PURPOSE_SIGN_UP,
        otpCode: otpCode.trim(),
      });

      const userData = {
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim() || undefined,
        phone: phone.trim(),
        password: password.trim(),
        send_welcome_email: false,
        deferRavenCustomerLink: true,
      };

      const created = await client.createUser(userData);
      const frappeUserName = String((created as { name?: string })?.name ?? email.trim()).trim();
      const emailTrim = email.trim();
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

      navigation.navigate('Login' as never);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('register.alerts.sendFailed');
      if (/otp|code|expired|invalid/i.test(msg)) {
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
      setShowPassword(false);
      setShowConfirmPassword(false);
      setErrors({});
      return;
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color={Colors.BLACK} />
            </TouchableOpacity>
            <Text style={styles.title}>{t('register.title')}</Text>
            <Text style={styles.subtitle}>{t('register.subtitle')}</Text>
          </View>

          <View style={styles.formContainer}>
            {otpStep === 'details' ? (
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('register.email')}</Text>
                  <TextInput
                    style={[styles.input, errors.email && styles.inputError]}
                    placeholder={t('register.emailPlaceholder')}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {errors.email ? <Text style={styles.errorText}>{t(errors.email)}</Text> : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('register.firstName')}</Text>
                  <TextInput
                    style={[styles.input, errors.firstName && styles.inputError]}
                    placeholder={t('register.firstNamePlaceholder')}
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  {errors.firstName ? <Text style={styles.errorText}>{t(errors.firstName)}</Text> : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('register.middleName')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('register.middleNamePlaceholder')}
                    value={middleName}
                    onChangeText={setMiddleName}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('register.lastName')}</Text>
                  <TextInput
                    style={[styles.input, errors.lastName && styles.inputError]}
                    placeholder={t('register.lastNamePlaceholder')}
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  {errors.lastName ? <Text style={styles.errorText}>{t(errors.lastName)}</Text> : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('register.phone')}</Text>
                  <TextInput
                    style={[styles.input, errors.phone && styles.inputError]}
                    placeholder={t('register.phonePlaceholder')}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {errors.phone ? <Text style={styles.errorText}>{t(errors.phone)}</Text> : null}
                </View>

                <TouchableOpacity
                  style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
                  onPress={handleSendOtp}
                  disabled={isLoading}
                >
                  <Text style={styles.registerButtonText}>
                    {isLoading ? t('register.sending') : t('register.sendCode')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emailSummary}>{email.trim()}</Text>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('register.otpLabel')}</Text>
                  <TextInput
                    style={[styles.input, errors.otp && styles.inputError]}
                    placeholder={t('register.otpPlaceholder')}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {errors.otp ? <Text style={styles.errorText}>{t(errors.otp)}</Text> : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('register.password')}</Text>
                  <View
                    style={[
                      styles.passwordInputWrapper,
                      errors.password && styles.passwordInputWrapperError,
                    ]}
                  >
                    <TextInput
                      style={styles.passwordInput}
                      placeholder={t('register.passwordPlaceholder')}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {password.length > 0 ? (
                      <TouchableOpacity
                        style={styles.eyeButton}
                        onPress={() => setShowPassword(!showPassword)}
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off' : 'eye'}
                          size={18}
                          color={Colors.BLACK}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {errors.password ? <Text style={styles.errorText}>{t(errors.password)}</Text> : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>{t('register.confirmPassword')}</Text>
                  <View
                    style={[
                      styles.passwordInputWrapper,
                      errors.confirmPassword && styles.passwordInputWrapperError,
                    ]}
                  >
                    <TextInput
                      style={styles.passwordInput}
                      placeholder={t('register.confirmPasswordPlaceholder')}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
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
                  {errors.confirmPassword ? (
                    <Text style={styles.errorText}>{t(errors.confirmPassword)}</Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
                  onPress={handleCompleteRegistration}
                  disabled={isLoading}
                >
                  <Text style={styles.registerButtonText}>
                    {isLoading ? t('register.sending') : t('register.createAccount')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setOtpStep('details')} style={styles.textLinkWrap}>
                  <Text style={styles.textLink}>{t('register.backEditDetails')}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.signinSection}>
              <Text style={styles.signinText}>{t('register.haveAccount')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login' as never)}>
                <Text style={styles.signinLink}>{t('register.signIn')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.ELECTRIC_BLUE} />
              <Text style={styles.infoText}>
                {otpStep === 'details' ? t('register.infoBanner') : t('register.otpInfoBanner')}
              </Text>
            </View>
          </View>

          <Text style={styles.legalText}>
            {t('register.legalPrefix')} <Text style={styles.linkText}>{t('register.privacy')}</Text>{' '}
            {t('register.and')} <Text style={styles.linkText}>{t('register.terms')}</Text>
            {t('register.legalSuffix')}
          </Text>
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
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  formContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 18,
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
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.BLACK,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 46,
  },
  passwordInputWrapperError: {
    borderColor: Colors.ERROR,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    fontSize: 14,
    color: Colors.BLACK,
  },
  eyeButton: {
    padding: 6,
  },
  inputError: {
    borderColor: Colors.ERROR,
  },
  errorText: {
    color: Colors.ERROR,
    fontSize: 11,
    marginTop: 3,
    marginLeft: 4,
  },
  emailSummary: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.BLACK,
    marginBottom: Spacing.MD,
    textAlign: 'center',
  },
  registerButton: {
    backgroundColor: Colors.BLACK,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  registerButtonDisabled: {
    opacity: 0.6,
  },
  registerButtonText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: 'bold',
  },
  textLinkWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  textLink: {
    fontSize: 14,
    color: Colors.ELECTRIC_BLUE,
    fontWeight: '500',
  },
  signinSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  signinText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  signinLink: {
    fontSize: 14,
    color: Colors.SHEIN_PINK,
    fontWeight: '500',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    marginLeft: 6,
    fontSize: 12,
    color: Colors.ELECTRIC_BLUE,
    lineHeight: 18,
  },
  legalText: {
    fontSize: 11,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 16,
    marginTop: 16,
  },
  linkText: {
    color: Colors.ELECTRIC_BLUE,
  },
});
