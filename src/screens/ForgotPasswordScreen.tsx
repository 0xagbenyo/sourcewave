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
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { getERPNextClient } from '../services/erpnext';

interface RouteParams {
  email?: string;
}

export const ForgotPasswordScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { email: initialEmail } = (route.params || {}) as RouteParams;
  const [email, setEmail] = useState(initialEmail || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  
  // Update email if route params change
  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    
    if (!trimmedEmail) {
      Alert.alert('Email Required', 'Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    
    try {
      const client = getERPNextClient();
      await client.resetPassword(trimmedEmail);
      
      setIsLoading(false);
      setIsEmailSent(true);
    } catch (error: any) {
      setIsLoading(false);
      const errorMessage = error?.message || 'Failed to send password reset link. Please try again.';
      Alert.alert('Error', errorMessage);
      console.error('Password reset error:', error);
    }
  };

  const handleBackToLogin = () => {
    navigation.goBack();
  };

  const handleResendEmail = () => {
    setIsEmailSent(false);
    setEmail('');
  };

  if (isEmailSent) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          >
            <TouchableOpacity
            style={styles.backButtonTop}
              onPress={handleBackToLogin}
            >
            <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
            </TouchableOpacity>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <View style={styles.successIconContainer}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.SUCCESS} />
              </View>
            </View>

            <View style={styles.formContainer}>
            <Text style={styles.title}>Check Your Email</Text>
            <Text style={styles.subtitle}>
              We've sent a password reset link to:
            </Text>
            <Text style={styles.emailText}>{email}</Text>
            
            <Text style={styles.instructions}>
                Click the link in the email to reset your password. The link will expire in 15 minutes.
            </Text>

              <TouchableOpacity 
                style={styles.primaryButton}
                onPress={handleBackToLogin}
              >
                <Text style={styles.primaryButtonText}>Back to Login</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={handleResendEmail}
              >
                <Text style={styles.secondaryButtonText}>Resend Email</Text>
              </TouchableOpacity>

            <View style={styles.helpContainer}>
              <Text style={styles.helpText}>Didn't receive the email?</Text>
              <Text style={styles.helpSubtext}>
                Check your spam folder or try a different email address
              </Text>
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
        <TouchableOpacity
          style={styles.backButtonTop}
          onPress={handleBackToLogin}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
          </View>

          <View style={styles.formContainer}>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your email address and we'll send you a password reset link.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email address"
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
              style={[
                styles.primaryButton,
                (isLoading || !email.trim()) && styles.primaryButtonDisabled
              ]}
              onPress={handleResetPassword}
              disabled={isLoading || !email.trim()}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? 'SENDING...' : 'SEND RESET LINK'}
              </Text>
            </TouchableOpacity>

            <View style={styles.backToLoginContainer}>
              <Text style={styles.backToLoginText}>Remember your password? </Text>
              <TouchableOpacity onPress={handleBackToLogin}>
                <Text style={styles.backToLoginLink}>Sign In</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.helpContainer}>
              <Text style={styles.helpText}>Need help?</Text>
              <Text style={styles.helpSubtext}>
                Contact our support team at support@glamora.com
              </Text>
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
