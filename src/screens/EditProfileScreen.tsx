import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';

export const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userDetails, setUserDetails] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    const fetchUserDetails = async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const client = getERPNextClient();
        const userData = await client.getUserByEmail(user.email);
        if (userData) {
          setUserDetails(userData);
          setPhone(userData.mobile_no || '');
          setLocation(userData.location || '');
        }
      } catch (error) {
        console.error('Error fetching user details:', error);
        Alert.alert('Error', 'Failed to load user details');
      } finally {
        setLoading(false);
      }
    };

    fetchUserDetails();
  }, [user?.email]);

  const handleSave = async () => {
    if (!user?.email) {
      Alert.alert('Error', 'User email not found');
      return;
    }

    try {
      setSaving(true);
      const client = getERPNextClient();
      await client.updateUser(user.email, {
        mobile_no: phone.trim(),
        location: location.trim(),
      });

      Alert.alert('Success', 'Profile updated successfully', [
        {
          text: 'OK',
          onPress: () => {
            (navigation as any).goBack();
          },
        },
      ]);
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const getUserDisplayName = () => {
    return userDetails?.full_name || user?.email || 'User';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.ROYAL_BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (navigation as any).goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Info Card */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            
            {/* User Name - Uneditable */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Name</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.disabledText}>{getUserDisplayName()}</Text>
                <Ionicons name="lock-closed" size={16} color={Colors.TEXT_SECONDARY} />
              </View>
            </View>

            {/* Email - Uneditable */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.disabledText}>{user?.email || userDetails?.email || ''}</Text>
                <Ionicons name="lock-closed" size={16} color={Colors.TEXT_SECONDARY} />
              </View>
            </View>
          </View>

          {/* Contact Info Card */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            
            {/* Phone - Editable */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Location - Editable */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter location"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={location}
                onChangeText={setLocation}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Shipping Addresses Info */}
          <View style={styles.infoCard}>
            <View style={styles.infoCardContent}>
              <Ionicons name="information-circle" size={24} color={Colors.ROYAL_BLUE} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Manage Your Addresses</Text>
                <Text style={styles.infoSubtitle}>
                  Go to Settings to add, edit, or delete your shipping addresses.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => (navigation as any).navigate('Settings')}
                style={styles.infoButton}
              >
                <Ionicons name="arrow-forward" size={18} color={Colors.WHITE} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* Save Button */}
        <View style={styles.saveButtonContainer}>
          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.WHITE} />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color={Colors.WHITE} />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.BLACK,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.BLACK,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputDisabled: {
    backgroundColor: Colors.LIGHT_GRAY,
    justifyContent: 'space-between',
  },
  disabledText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
  },
  infoCard: {
    backgroundColor: '#F5F8FF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.ROYAL_BLUE,
  },
  infoCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.BLACK,
    marginBottom: 4,
  },
  infoSubtitle: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
  },
  infoButton: {
    backgroundColor: Colors.ROYAL_BLUE,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: Colors.BACKGROUND,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
  },
  saveButton: {
    backgroundColor: Colors.SUCCESS,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
