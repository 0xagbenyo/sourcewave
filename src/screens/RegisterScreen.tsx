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
import { Typography } from '../constants/typography';
import { Spacing } from '../constants/spacing';
import { getERPNextClient } from '../services/erpnext';

export const RegisterScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const navigation = useNavigation();
  const { t } = useTranslation();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string) => {
    // Remove spaces and common formatting characters
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    // Check if it's a valid phone number (at least 9 digits, can start with + or country code)
    const phoneRegex = /^(\+?233|0)?[0-9]{9}$/;
    return phoneRegex.test(cleaned);
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

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

  const handleSendVerificationLink = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    
    try {
      const client = getERPNextClient();
      
      // Create user in ERPNext
      const userData = {
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim() || undefined,
        phone: phone.trim(),
        send_welcome_email: true, // Send welcome email with verification link
      };
      
      const createdUser = await client.createUser(userData);
      console.log('User created successfully:', createdUser);

      // Also create a matching Customer record from the same signup details.
      // If one already exists for this email, skip creation.
      const existingCustomer = await client.getCustomerByEmail(email.trim());
      if (!existingCustomer) {
        const fullName = [firstName.trim(), middleName.trim(), lastName.trim()]
          .filter(Boolean)
          .join(' ');
        try {
          const createdCustomer = await client.createCustomer({
            customer_name: fullName || `${firstName.trim()} ${lastName.trim()}`,
            email: email.trim(),
            phone: phone.trim(),
            mobile_no: phone.trim(),
            customer_type: 'Individual',
          });
          console.log('Customer created successfully:', createdCustomer);
        } catch (customerError) {
          // Do not block registration if User creation already succeeded.
          console.warn('User created, but customer creation failed:', customerError);
        }
      } else {
        console.log('Customer already exists for email, skipping creation:', existingCustomer.name);
      }
      
      // After successful user creation, navigate to login screen
      // ERPNext will send welcome email with verification link automatically
      setIsLoading(false);
      navigation.navigate('Login' as never);
    } catch (error: any) {
      setIsLoading(false);
      // Handle error - show error message to user
      const errorMessage = error?.message || t('register.alerts.sendFailed');
      Alert.alert(t('register.alerts.registrationError'), errorMessage);
      console.error('Registration error:', error);
    }
  };

  const handleBack = () => {
    navigation.goBack();
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
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color={Colors.BLACK} />
            </TouchableOpacity>
            <Text style={styles.title}>{t('register.title')}</Text>
            <Text style={styles.subtitle}>{t('register.subtitle')}</Text>
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
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
              {errors.email && <Text style={styles.errorText}>{t(errors.email)}</Text>}
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
              {errors.firstName && <Text style={styles.errorText}>{t(errors.firstName)}</Text>}
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
              {errors.lastName && <Text style={styles.errorText}>{t(errors.lastName)}</Text>}
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
              {errors.phone && <Text style={styles.errorText}>{t(errors.phone)}</Text>}
            </View>

            {/* Send Verification Link Button */}
            <TouchableOpacity 
              style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
              onPress={handleSendVerificationLink}
              disabled={isLoading}
            >
              <Text style={styles.registerButtonText}>
                {isLoading ? t('register.sending') : t('register.sendLink')}
              </Text>
            </TouchableOpacity>

            <View style={styles.signinSection}>
              <Text style={styles.signinText}>{t('register.haveAccount')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login' as never)}>
                <Text style={styles.signinLink}>{t('register.signIn')}</Text>
              </TouchableOpacity>
            </View>

            {/* Info Banner */}
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.ELECTRIC_BLUE} />
              <Text style={styles.infoText}>{t('register.infoBanner')}</Text>
            </View>
          </View>

          {/* Legal Text */}
          <Text style={styles.legalText}>
            {t('register.legalPrefix')}{' '}
            <Text style={styles.linkText}>{t('register.privacy')}</Text>
            {' '}
            {t('register.and')}{' '}
            <Text style={styles.linkText}>{t('register.terms')}</Text>
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
  emailInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  inputError: {
    borderColor: Colors.ERROR,
  },
  errorText: {
    color: Colors.ERROR,
    fontSize: 11,
    marginTop: 3,
    marginLeft: 4,
  },
  emailInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.BLACK,
  },
  editButton: {
    padding: 4,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.BLACK,
  },
  clearButton: {
    marginLeft: 8,
  },
  eyeButton: {
    marginLeft: 8,
  },
  passwordRequirement: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    marginTop: 8,
  },
  registerButton: {
    backgroundColor: Colors.BLACK,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  registerButtonDisabled: {
    opacity: 0.6,
  },
  registerButtonText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: 'bold',
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
