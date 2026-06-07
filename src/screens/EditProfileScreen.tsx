import React, { useState, useEffect, useCallback } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import { encodeErpFileUrl } from '../utils/erpImageUrl';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';

function profileImageUrl(userData: any): string | undefined {
  const raw = userData?.user_image || userData?.image;
  if (!raw || String(raw).trim() === '') return undefined;
  return encodeErpFileUrl(String(raw).trim()) || undefined;
}

export const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [userDetails, setUserDetails] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');

  const loadUser = useCallback(async () => {
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
        setPhone((userData.mobile_no || userData.phone || '').trim());
        setLocation((userData.location || '').trim());
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
      Alert.alert('Error', 'Failed to load user details');
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const getUserDisplayName = () => {
    return userDetails?.full_name || user?.email || 'User';
  };

  const getUserInitials = () => {
    const name = getUserDisplayName();
    if (!name?.length) return 'U';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name[0].toUpperCase();
  };

  const applyUploadedFileToUser = async (fileUrl: string) => {
    if (!user?.email) return;
    const client = getERPNextClient();
    await client.updateUser(user.email, { user_image: fileUrl });
    const refreshed = await client.getUserByEmail(user.email);
    if (refreshed) setUserDetails(refreshed);
  };

  const handlePickProfilePhoto = async () => {
    if (!user?.email || !userDetails?.name) {
      Alert.alert('Error', 'User profile is not loaded yet.');
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to set a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const ext = asset.mimeType?.includes('png') ? 'png' : 'jpg';
      const mime = asset.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg');
      const fileName = `profile-${userDetails.name}-${Date.now()}.${ext}`;

      setUploadingPhoto(true);
      const client = getERPNextClient();
      const uploadResponse = await client.uploadFileToDoc(
        uri,
        fileName,
        'User',
        userDetails.name,
        false,
        mime
      );

      const msg = uploadResponse?.message;
      const fileUrl =
        (typeof msg === 'string' && msg.startsWith('/files') ? msg : null) ||
        (typeof msg === 'object' && msg?.file_url ? String(msg.file_url) : '') ||
        (uploadResponse?.file_url ? String(uploadResponse.file_url) : '');
      if (!fileUrl) {
        throw new Error('Upload did not return a file URL');
      }

      await applyUploadedFileToUser(typeof fileUrl === 'string' ? fileUrl : String(fileUrl));
      Alert.alert('Photo updated', 'Your profile picture has been saved.');
    } catch (error: unknown) {
      console.error('Profile photo upload failed:', error);
      const msg = error instanceof Error ? error.message : 'Could not update profile photo.';
      Alert.alert('Photo upload failed', msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveProfilePhoto = () => {
    if (!user?.email) return;
    Alert.alert('Remove photo?', 'Your account will show initials instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setUploadingPhoto(true);
            const client = getERPNextClient();
            await client.updateUser(user.email, { user_image: '' });
            const refreshed = await client.getUserByEmail(user.email);
            if (refreshed) setUserDetails(refreshed);
            Alert.alert('Photo removed', 'You can add a new picture anytime.');
          } catch (e) {
            Alert.alert('Error', 'Could not remove the photo.');
          } finally {
            setUploadingPhoto(false);
          }
        },
      },
    ]);
  };

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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.ROYAL_BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  const avatarUri = profileImageUrl(userDetails);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
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
          <View style={styles.avatarCard}>
            <Text style={styles.sectionTitle}>Profile photo</Text>
            <View style={styles.avatarRow}>
              <View style={styles.avatarWrap}>
                {avatarUri ? (
                  <ErpAuthenticatedImage uri={avatarUri} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{getUserInitials()}</Text>
                  </View>
                )}
                {(uploadingPhoto || saving) && (
                  <View style={styles.avatarLoading}>
                    <ActivityIndicator color={Colors.WHITE} />
                  </View>
                )}
              </View>
              <View style={styles.avatarActions}>
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={handlePickProfilePhoto}
                  disabled={uploadingPhoto || saving}
                >
                  <Ionicons name="image-outline" size={18} color={Colors.ROYAL_BLUE} />
                  <Text style={styles.photoBtnText}>{avatarUri ? 'Change photo' : 'Add photo'}</Text>
                </TouchableOpacity>
                {avatarUri ? (
                  <TouchableOpacity
                    style={styles.photoBtnSecondary}
                    onPress={handleRemoveProfilePhoto}
                    disabled={uploadingPhoto || saving}
                  >
                    <Text style={styles.photoBtnSecondaryText}>Remove photo</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <Text style={styles.avatarHint}>Square photos look best. Image is saved to your profile on the server.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Personal Information</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Name</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.disabledText}>{getUserDisplayName()}</Text>
                <Ionicons name="lock-closed" size={16} color={Colors.TEXT_SECONDARY} />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.disabledText}>{user?.email || userDetails?.email || ''}</Text>
                <Ionicons name="lock-closed" size={16} color={Colors.TEXT_SECONDARY} />
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Contact Information</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter phone number"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter location"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={location}
                onChangeText={setLocation}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          </View>

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

        <View style={styles.saveButtonContainer}>
          <TouchableOpacity
            style={[styles.saveButton, (saving || uploadingPhoto) && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving || uploadingPhoto}
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
  avatarCard: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MD,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: Colors.LIGHT_GRAY,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.ROYAL_BLUE + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.ROYAL_BLUE,
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActions: {
    flex: 1,
    gap: 8,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.ROYAL_BLUE,
    alignSelf: 'flex-start',
  },
  photoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ROYAL_BLUE,
  },
  photoBtnSecondary: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  photoBtnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ERROR,
  },
  avatarHint: {
    marginTop: 12,
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 16,
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
  textInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.BLACK,
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
