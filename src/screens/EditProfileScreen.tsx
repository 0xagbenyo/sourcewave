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
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import { encodeErpFileUrl } from '../utils/erpImageUrl';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';

const hairline = StyleSheet.hairlineWidth;

function profileImageUrl(userData: any): string | undefined {
  const raw = userData?.user_image || userData?.image;
  if (!raw || String(raw).trim() === '') return undefined;
  return encodeErpFileUrl(String(raw).trim()) || undefined;
}

export const EditProfileScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user } = useUserSession();
  const isSupplierUser = user?.appMode === 'supplier' || !!user?.supplierId?.trim();
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
      Alert.alert('Error', t('editProfile.loadError'));
    } finally {
      setLoading(false);
    }
  }, [user?.email, t]);

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
      Alert.alert('Error', t('editProfile.notLoaded'));
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', t('editProfile.permissionPhotos'));
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
      Alert.alert(t('editProfile.photoUpdatedTitle'), t('editProfile.photoUpdatedBody'));
    } catch (error: unknown) {
      console.error('Profile photo upload failed:', error);
      const msg = error instanceof Error ? error.message : t('editProfile.saveFailed');
      Alert.alert(t('editProfile.photoFailedTitle'), msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveProfilePhoto = () => {
    if (!user?.email) return;
    Alert.alert(t('editProfile.removePhotoTitle'), t('editProfile.removePhotoBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('editProfile.removePhoto'),
        style: 'destructive',
        onPress: async () => {
          try {
            setUploadingPhoto(true);
            const client = getERPNextClient();
            await client.updateUser(user.email, { user_image: '' });
            const refreshed = await client.getUserByEmail(user.email);
            if (refreshed) setUserDetails(refreshed);
            Alert.alert(t('editProfile.photoRemovedTitle'), t('editProfile.photoRemovedBody'));
          } catch {
            Alert.alert('Error', t('editProfile.removeFailed'));
          } finally {
            setUploadingPhoto(false);
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!user?.email) {
      Alert.alert('Error', t('editProfile.noEmail'));
      return;
    }

    try {
      setSaving(true);
      const client = getERPNextClient();
      await client.updateUser(user.email, {
        mobile_no: phone.trim(),
        location: location.trim(),
      });

      Alert.alert(t('editProfile.saveSuccessTitle'), t('editProfile.saveSuccessBody'), [
        {
          text: 'OK',
          onPress: () => {
            (navigation as any).goBack();
          },
        },
      ]);
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', t('editProfile.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const nav = navigation as { navigate: (name: string) => void; goBack: () => void };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <Header showBackButton title={t('editProfile.title')} subtitle={t('editProfile.subtitle')} />
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.WINE} />
        </View>
      </SafeAreaView>
    );
  }

  const avatarUri = profileImageUrl(userDetails);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header showBackButton title={t('editProfile.title')} subtitle={t('editProfile.subtitle')} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>{t('editProfile.sectionPhoto')}</Text>
          <View style={styles.group}>
            <View style={styles.photoBlock}>
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
              <View style={styles.photoActionsRow}>
                <TouchableOpacity
                  style={[styles.photoBtnHalf, styles.photoBtnPrimary]}
                  onPress={handlePickProfilePhoto}
                  disabled={uploadingPhoto || saving}
                  activeOpacity={0.85}
                >
                  <Ionicons name="image-outline" size={18} color={Colors.WINE} />
                  <Text style={styles.photoBtnText} numberOfLines={1}>
                    {avatarUri ? t('editProfile.changePhoto') : t('editProfile.addPhoto')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.photoBtnHalf, styles.photoBtnDanger]}
                  onPress={() => {
                    if (!avatarUri) {
                      Alert.alert(t('editProfile.noPhotoTitle'), t('editProfile.noPhotoBody'));
                      return;
                    }
                    handleRemoveProfilePhoto();
                  }}
                  disabled={uploadingPhoto || saving}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.ERROR} />
                  <Text style={styles.photoBtnDangerText} numberOfLines={1}>
                    {t('editProfile.removePhoto')}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.photoHint}>{t('editProfile.photoHint')}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>{t('editProfile.sectionPersonal')}</Text>
          <View style={styles.group}>
            <View style={styles.fieldPad}>
              <Text style={styles.label}>{t('editProfile.name')}</Text>
              <View style={[styles.readonlyBox, styles.readonlyRow]}>
                <Text style={styles.readonlyText} numberOfLines={1}>
                  {getUserDisplayName()}
                </Text>
                <Ionicons name="lock-closed-outline" size={16} color={Colors.TEXT_SECONDARY} />
              </View>
              <Text style={styles.fieldHint}>{t('editProfile.lockedHint')}</Text>
            </View>
            <View style={[styles.fieldPad, styles.fieldPadLast]}>
              <Text style={styles.label}>{t('editProfile.email')}</Text>
              <View style={[styles.readonlyBox, styles.readonlyRow]}>
                <Text style={styles.readonlyText} numberOfLines={1}>
                  {user?.email || userDetails?.email || ''}
                </Text>
                <Ionicons name="lock-closed-outline" size={16} color={Colors.TEXT_SECONDARY} />
              </View>
              <Text style={styles.fieldHint}>{t('editProfile.lockedHint')}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>{t('editProfile.sectionContact')}</Text>
          <View style={styles.group}>
            <View style={styles.fieldPad}>
              <Text style={styles.label}>{t('editProfile.phone')}</Text>
              <TextInput
                style={styles.textInput}
                placeholder={t('editProfile.phonePlaceholder')}
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving && !uploadingPhoto}
              />
            </View>
            <View style={[styles.fieldPad, styles.fieldPadLast]}>
              <Text style={styles.label}>{t('editProfile.location')}</Text>
              <TextInput
                style={styles.textInput}
                placeholder={t('editProfile.locationPlaceholder')}
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={location}
                onChangeText={setLocation}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!saving && !uploadingPhoto}
              />
            </View>
          </View>

          {!isSupplierUser ? (
            <>
              <Text style={styles.sectionLabel}>{t('editProfile.sectionAddresses')}</Text>
              <View style={styles.group}>
                <TouchableOpacity
                  style={styles.rowNav}
                  onPress={() => nav.navigate('AddressBook')}
                  activeOpacity={0.75}
                >
                  <Ionicons name="location-outline" size={22} color={Colors.WINE} style={styles.rowIcon} />
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{t('editProfile.addressesTitle')}</Text>
                    <Text style={styles.rowSubtitle}>{t('editProfile.addressesSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <View style={{ height: 24 }} />
        </ScrollView>

        <View style={styles.saveFooter}>
          <TouchableOpacity
            style={[styles.saveButton, (saving || uploadingPhoto) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving || uploadingPhoto}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color={Colors.WHITE} />
                <Text style={styles.saveButtonText}>{t('editProfile.save')}</Text>
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
    backgroundColor: Colors.OFF_WHITE,
  },
  keyboardView: {
    flex: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  group: {
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: Colors.BORDER,
  },
  photoBlock: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 16,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: Colors.LIGHT_GRAY,
    alignSelf: 'center',
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
    backgroundColor: 'rgba(230, 0, 18, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.WINE,
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 14,
    width: '100%',
  },
  photoBtnHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: hairline,
    minHeight: 48,
  },
  photoBtnPrimary: {
    borderColor: Colors.WINE,
    backgroundColor: Colors.WHITE,
  },
  photoBtnDanger: {
    borderColor: 'rgba(255, 59, 48, 0.45)',
    backgroundColor: Colors.WHITE,
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.WINE,
    flexShrink: 1,
  },
  photoBtnDangerText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ERROR,
    flexShrink: 1,
  },
  photoHint: {
    marginTop: 12,
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 17,
    textAlign: 'center',
  },
  fieldPad: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  fieldPadLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.BLACK,
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 11,
    color: Colors.TEXT_SECONDARY,
    marginTop: 6,
  },
  readonlyBox: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.OFF_WHITE,
  },
  readonlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  readonlyText: {
    flex: 1,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    minWidth: 0,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.BLACK,
    backgroundColor: Colors.OFF_WHITE,
  },
  rowNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    letterSpacing: -0.2,
  },
  rowSubtitle: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    marginTop: 3,
    fontWeight: '500',
  },
  saveFooter: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
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
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
