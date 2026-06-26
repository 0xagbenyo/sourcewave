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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useUserSession } from '../context/UserContext';
import { completeAppSignIn } from '../utils/completeAppSignIn';
import { resetToMainScreen } from '../navigation/rootNavigation';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(null); // null = not validated yet, true/false = validation result
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { setUser } = useUserSession();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    const trimmedText = text.trim();
    if (trimmedText.length > 0) {
      setEmailValid(validateEmail(trimmedText));
    } else {
      setEmailValid(null);
    }
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
  };

  // Check if form is valid (both email/phone and password are valid)
  const isFormValid = emailValid === true && password.length > 0;

  const handleContinue = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      alert(t('login.errors.noEmail'));
      return;
    }

    if (!password) {
      alert(t('login.errors.noPassword'));
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      alert(t('login.invalidEmail'));
      return;
    }

    setIsLoading(true);

    try {
      const loginIdentifier = trimmedEmail;
      const session = await completeAppSignIn(loginIdentifier, password);
      setUser(session);
      setIsLoading(false);
      resetToMainScreen();
    } catch (error: any) {
      setIsLoading(false);
      // Extract error message - the error should already have a meaningful message from extractLoginErrorMessage
      const errorMessage = error?.message || t('login.errors.loginFailed');
      alert(errorMessage);
      console.error('Login error:', error);
      // Log original error details for debugging
      if (error?.originalError) {
        console.error('Original error:', error.originalError);
      }
    }
  };

  const handleSocialLogin = (provider: string) => {
    console.log(`Login with ${provider}`);
  };

  const handleRegister = () => {
    navigation.navigate('RegisterConsent' as never);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logo}>SOURCEWAVE</Text>
              <Text style={styles.logoSuffix}>GH</Text>
            </View>
            <View style={styles.securityInfo}>
              <Ionicons name="shield-checkmark" size={14} color={Colors.SUCCESS} />
              <Text style={styles.securityText}>{t('login.securityLine')}</Text>
            </View>
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('login.emailLabel')}</Text>
              <TextInput
                style={[
                  styles.input,
                  emailValid === false && styles.inputError
                ]}
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {emailValid === false && (
                <Text style={styles.errorText}>{t('login.invalidEmail')}</Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('login.passwordLabel')}</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChangeText={handlePasswordChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {password.length > 0 && (
                  <TouchableOpacity 
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons 
                      name={showPassword ? "eye-off" : "eye"} 
                      size={18} 
                      color={Colors.BLACK} 
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <TouchableOpacity 
              style={[
                styles.continueButton, 
                (isLoading || !isFormValid) && styles.continueButtonDisabled
              ]}
              onPress={handleContinue}
              disabled={isLoading || !isFormValid}
            >
              <Text style={styles.continueButtonText}>
                {isLoading ? t('login.signingIn') : t('login.signIn')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.forgotPasswordButton}
              onPress={() => {
                const trimmedInput = email.trim();
                const emailToPass = validateEmail(trimmedInput) ? trimmedInput : '';
                navigation.navigate('ForgotPassword' as never, { email: emailToPass } as never);
              }}
            >
              <Text style={styles.forgotPasswordText}>{t('login.forgotPassword')}</Text>
            </TouchableOpacity>

            <View style={styles.signupSection}>
              <Text style={styles.signupText}>{t('login.noAccount')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('RegisterConsent' as never)}>
                <Text style={styles.signupLink}>{t('login.signUp')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Legal Text */}
          <Text style={styles.legalText}>
            {t('login.legalPrefix')}{' '}
            <Text style={styles.linkText} onPress={() => navigation.navigate('PrivacyPolicy' as never)}>
              {t('login.privacy')}
            </Text>
            {' '}
            {t('login.and')}{' '}
            <Text style={styles.linkText} onPress={() => navigation.navigate('TermsAndConditions' as never)}>
              {t('login.terms')}
            </Text>
            {t('login.legalSuffix')}
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
    paddingTop: 100,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 24,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  logoSuffix: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    marginLeft: 4,
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityText: {
    marginLeft: 6,
    fontSize: 12,
    color: Colors.SUCCESS,
  },
  promoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'Colors.LIGHT_ORANGE_BG',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 20,
    borderRadius: 8,
    marginBottom: 24,
  },
  promoText: {
    marginLeft: 6,
    fontSize: 12,
    color: Colors.SHEIN_ORANGE,
    fontWeight: '500',
  },
  formContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  inputContainer: {
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
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  passwordInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.BLACK,
  },
  eyeButton: {
    marginLeft: 8,
    padding: 4,
  },
  inputError: {
    borderColor: Colors.ERROR,
  },
  errorText: {
    color: Colors.ERROR,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  continueButton: {
    backgroundColor: Colors.BLACK,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: 'bold',
  },
  forgotPasswordButton: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  forgotPasswordText: {
    fontSize: 12,
    color: Colors.ELECTRIC_BLUE,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.BORDER,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  socialButtons: {
    gap: 12,
    marginBottom: 30,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  googleLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'Colors.BLUE_GOOGLE',
    color: Colors.WHITE,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 12,
  },
  facebookLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'Colors.BLUE_FACEBOOK',
    color: Colors.WHITE,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 12,
  },
  socialButtonText: {
    fontSize: 16,
    color: Colors.BLACK,
    fontWeight: '500',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 30,
  },
  locationText: {
    marginHorizontal: 8,
    fontSize: 14,
    color: Colors.BLACK,
    fontWeight: '500',
  },
  signupSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  signupText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  signupLink: {
    fontSize: 14,
    color: Colors.SHEIN_PINK,
    fontWeight: '500',
  },
  legalText: {
    fontSize: 11,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 16,
  },
  linkText: {
    color: Colors.ELECTRIC_BLUE,
  },
});


