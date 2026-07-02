import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { appAlert as Alert } from '../../services/appAlert';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { RavenLight } from '../../constants/ravenLightTheme';
import { Spacing } from '../../constants/spacing';
import { Colors } from '../../constants/colors';
import { ErpAuthenticatedImage } from '../../components/ErpAuthenticatedImage';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';
import { getERPNextClient } from '../../services/erpnext';
import {
  fetchErpSupplierProfile,
  type ErpSupplierFileAttachment,
  type ErpSupplierProfile,
} from '../../services/ravenNativeApi';
import { pickSingleFormImage, imagePickLabelsFromT } from '../../utils/formImagePicker';
import { pickChatDocuments } from '../../utils/ravenChatAttachPickers';
import { userFacingError } from '../../utils/userFacingError';
import { initialsFromUserId } from '../../utils/ravenChatUi';
import { encodeErpFileUrl } from '../../utils/erpImageUrl';
import type { SupplierStackParamList } from '../../types';

type RouteProps = RouteProp<SupplierStackParamList, 'SupplierBusinessProfileEdit'>;
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const PAGE_BG = '#ECEFF1';
const CARD_BORDER = '#E0E4E8';
const MEDIA_COLS = 3;
const MEDIA_GAP = 8;
const ABOUT_MAX = 2000;
const hairline = StyleSheet.hairlineWidth;

type EditablePhoto = {
  key: string;
  uri: string;
  fileDocName?: string;
  isProfileImage: boolean;
};

function fileUrlFromUploadResponse(uploadResponse: unknown): string {
  const body = uploadResponse as { message?: unknown; file_url?: string };
  const msg = body?.message;
  if (typeof msg === 'string' && msg.startsWith('/')) return msg;
  if (msg && typeof msg === 'object' && (msg as { file_url?: string }).file_url) {
    return String((msg as { file_url: string }).file_url);
  }
  if (body?.file_url) return String(body.file_url);
  return '';
}

function isImageFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'].includes(ext);
}

function isImageAttachment(a: ErpSupplierFileAttachment): boolean {
  return isImageFileName(a.file_name) || isImageFileName(a.file_url);
}

function normalizeErpFilePathForDedupe(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  const abs = encodeErpFileUrl(s) || s;
  try {
    const u = new URL(abs);
    return u.pathname.toLowerCase().replace(/\/+/g, '/');
  } catch {
    return abs.toLowerCase().split('?')[0];
  }
}

function pathsMatch(a: string, b: string): boolean {
  const na = normalizeErpFilePathForDedupe(a);
  const nb = normalizeErpFilePathForDedupe(b);
  return !!na && !!nb && na === nb;
}

function fileKindIcon(fileName: string): { icon: IoniconsName; color: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { icon: 'document-text', color: '#dc2626' };
  if (['doc', 'docx'].includes(ext)) return { icon: 'document-text', color: '#2563eb' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'grid-outline', color: '#16a34a' };
  if (['zip', 'rar', '7z'].includes(ext)) return { icon: 'archive-outline', color: '#ca8a04' };
  return { icon: 'document-attach-outline', color: RavenLight.textMuted };
}

function buildEditablePhotos(profile: ErpSupplierProfile | null): EditablePhoto[] {
  if (!profile) return [];
  const seenPath = new Set<string>();
  const out: EditablePhoto[] = [];
  const profileImage = (profile.image || '').trim();

  const push = (item: EditablePhoto) => {
    const dedupe = normalizeErpFilePathForDedupe(item.uri);
    if (!dedupe || seenPath.has(dedupe)) return;
    seenPath.add(dedupe);
    out.push(item);
  };

  if (profileImage) {
    push({ key: 'field:image', uri: profileImage, isProfileImage: true });
  }

  for (const a of profile.attachments) {
    if (!isImageAttachment(a)) continue;
    const uri = a.file_url.trim();
    if (!uri) continue;
    push({
      key: a.name ? `file:${a.name}` : `url:${normalizeErpFilePathForDedupe(uri)}`,
      uri,
      fileDocName: a.name || undefined,
      isProfileImage: profileImage ? pathsMatch(uri, profileImage) : false,
    });
  }

  return out;
}

function SectionLabel({ children, trailing }: { children: string; trailing?: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{children}</Text>
      {trailing ? <Text style={styles.sectionTrailing}>{trailing}</Text> : null}
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const SupplierBusinessProfileEditScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { supplierDocId } = useSupplierDocumentId();
  const supplierKey = (route.params?.supplierDocName || supplierDocId || '').trim();

  const [profile, setProfile] = useState<ErpSupplierProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [about, setAbout] = useState('');

  const contentPad = Spacing.MD;
  const mediaTile = useMemo(() => {
    return (windowWidth - contentPad * 2 - MEDIA_GAP * (MEDIA_COLS - 1)) / MEDIA_COLS;
  }, [windowWidth, contentPad]);

  const editablePhotos = useMemo(() => buildEditablePhotos(profile), [profile]);
  const galleryPhotos = useMemo(
    () => editablePhotos.filter((p) => !p.isProfileImage || !!p.fileDocName),
    [editablePhotos]
  );
  const fileAttachments = useMemo(
    () => (profile?.attachments ?? []).filter((a) => !isImageAttachment(a)),
    [profile]
  );

  const load = useCallback(async () => {
    if (!supplierKey) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const p = await fetchErpSupplierProfile(supplierKey);
      setProfile(p);
      const plain = p?.supplier_details_plain?.trim() || '';
      setAbout(/^no description on file/i.test(plain) ? '' : plain);
    } catch (e) {
      Alert.alert(t('supplierProfile.editTitle'), userFacingError(e, t('supplierProfile.editLoadFailed')));
    } finally {
      setLoading(false);
    }
  }, [supplierKey, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const initials = profile ? initialsFromUserId(profile.supplier_name || profile.name) : '—';
  const hasProfileImage = !!(profile?.image || '').trim();
  const busy = uploading || !!removingKey || saving;

  const clearProfileImageIfMatches = async (uri: string) => {
    const current = (profile?.image || '').trim();
    if (current && pathsMatch(current, uri)) {
      await getERPNextClient().updateSupplierProfile(supplierKey, { image: '' });
    }
  };

  const uploadToSupplier = async (
    uri: string,
    fileName: string,
    mimeType: string,
    opts?: { setAsProfileImage?: boolean }
  ) => {
    if (!supplierKey) return;
    setUploading(true);
    try {
      const client = getERPNextClient();
      const uploadResponse = await client.uploadFileToDoc(
        uri,
        fileName,
        'Supplier',
        supplierKey,
        false,
        mimeType
      );
      const fileUrl = fileUrlFromUploadResponse(uploadResponse);
      if (!fileUrl) throw new Error('Upload did not return a file URL');

      if (opts?.setAsProfileImage) {
        await client.updateSupplierProfile(supplierKey, { image: fileUrl });
      }

      await load();
      Alert.alert(t('supplierProfile.editSavedTitle'), t('supplierProfile.editUploadDone'));
    } catch (e) {
      Alert.alert(t('supplierProfile.editTitle'), userFacingError(e, t('supplierProfile.editUploadFailed')));
    } finally {
      setUploading(false);
    }
  };

  const runRemove = async (key: string, action: () => Promise<void>, successMessage: string) => {
    setRemovingKey(key);
    try {
      await action();
      await load();
      Alert.alert(t('supplierProfile.editSavedTitle'), successMessage);
    } catch (e) {
      Alert.alert(t('supplierProfile.editTitle'), userFacingError(e, t('supplierProfile.editRemoveFailed')));
    } finally {
      setRemovingKey(null);
    }
  };

  const onRemoveProfilePhoto = () => {
    if (!hasProfileImage) return;
    Alert.alert(t('supplierProfile.editRemovePhotoTitle'), t('supplierProfile.editRemovePhotoBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('supplierProfile.editRemovePhoto'),
        style: 'destructive',
        onPress: () =>
          void runRemove(
            'profile-image',
            () => getERPNextClient().updateSupplierProfile(supplierKey, { image: '' }),
            t('supplierProfile.editPhotoRemoved')
          ),
      },
    ]);
  };

  const onRemovePhoto = (photo: EditablePhoto) => {
    Alert.alert(t('supplierProfile.editRemoveMediaTitle'), t('supplierProfile.editRemoveMediaBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('supplierProfile.editRemovePhoto'),
        style: 'destructive',
        onPress: () =>
          void runRemove(photo.key, async () => {
            if (photo.fileDocName) {
              await getERPNextClient().deleteResourceDoc('File', photo.fileDocName);
            }
            if (photo.isProfileImage || photo.key === 'field:image') {
              await getERPNextClient().updateSupplierProfile(supplierKey, { image: '' });
            } else {
              await clearProfileImageIfMatches(photo.uri);
            }
          }, t('supplierProfile.editMediaRemoved')),
      },
    ]);
  };

  const onRemoveFile = (att: ErpSupplierFileAttachment) => {
    if (!att.name) return;
    Alert.alert(t('supplierProfile.editRemoveMediaTitle'), t('supplierProfile.editRemoveMediaBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('supplierProfile.editRemoveItem'),
        style: 'destructive',
        onPress: () =>
          void runRemove(`file:${att.name}`, async () => {
            await getERPNextClient().deleteResourceDoc('File', att.name);
            await clearProfileImageIfMatches(att.file_url);
          }, t('supplierProfile.editMediaRemoved')),
      },
    ]);
  };

  const onChangeProfilePhoto = async () => {
    const pick = await pickSingleFormImage(imagePickLabelsFromT(t));
    if (!pick.ok) {
      if (!pick.canceled && pick.message) Alert.alert(t('supplierProfile.editTitle'), pick.message);
      return;
    }
    const ext = pick.uri.toLowerCase().includes('.png') ? 'png' : 'jpg';
    await uploadToSupplier(pick.uri, `supplier-avatar-${supplierKey}-${Date.now()}.${ext}`, `image/${ext}`, {
      setAsProfileImage: true,
    });
  };

  const onAddPhoto = async () => {
    const pick = await pickSingleFormImage(imagePickLabelsFromT(t));
    if (!pick.ok) {
      if (!pick.canceled && pick.message) Alert.alert(t('supplierProfile.editTitle'), pick.message);
      return;
    }
    const ext = pick.uri.toLowerCase().includes('.png') ? 'png' : 'jpg';
    await uploadToSupplier(pick.uri, `supplier-photo-${supplierKey}-${Date.now()}.${ext}`, `image/${ext}`);
  };

  const onAddFile = async () => {
    const pick = await pickChatDocuments();
    if (!pick.ok) {
      if (!pick.canceled && pick.message) Alert.alert(t('supplierProfile.editTitle'), pick.message);
      return;
    }
    setUploading(true);
    try {
      for (const file of pick.data) {
        await uploadToSupplier(file.uri, file.name, file.mimeType);
      }
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    if (!supplierKey) return;
    setSaving(true);
    try {
      await getERPNextClient().updateSupplierProfile(supplierKey, {
        supplier_details: about.trim(),
      });
      Alert.alert(t('supplierProfile.editSavedTitle'), t('supplierProfile.editSavedBody'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert(t('supplierProfile.editTitle'), userFacingError(e, t('supplierProfile.editSaveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const renderHeader = () => (
    <>
      <StatusBar style="dark" backgroundColor={PAGE_BG} translucent />
      <View style={[styles.statusBarFill, { height: insets.top }]} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={14}>
          <Ionicons name="chevron-back" size={24} color={RavenLight.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('supplierProfile.editTitle')}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={2}>
            {t('supplierProfile.editSubtitle')}
          </Text>
        </View>
        <View style={styles.headerBtn} />
      </View>
    </>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        {renderHeader()}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={RavenLight.accent} />
          <Text style={styles.loadingText}>{t('supplierProfile.loading')}</Text>
        </View>
      </View>
    );
  }

  if (!supplierKey) {
    return (
      <View style={styles.root}>
        {renderHeader()}
        <View style={styles.center}>
          <Ionicons name="business-outline" size={40} color={RavenLight.textSubtle} />
          <Text style={styles.err}>{t('supplierProfile.editNoSupplier')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {renderHeader()}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.heroCard}>
            <View style={styles.avatarWrap}>
              {profile?.image ? (
                <ErpAuthenticatedImage uri={profile.image} style={styles.avatar} resizeMode="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              {(uploading || removingKey === 'profile-image') && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
            <Text style={styles.businessName} numberOfLines={2}>
              {profile?.supplier_name || supplierKey}
            </Text>
            {profile?.supplier_type ? (
              <Text style={styles.businessType}>{profile.supplier_type}</Text>
            ) : null}
            <View style={styles.photoActionsRow}>
              <TouchableOpacity
                style={[styles.photoBtn, styles.photoBtnPrimary]}
                onPress={() => void onChangeProfilePhoto()}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-outline" size={18} color={RavenLight.accent} />
                <Text style={styles.photoBtnPrimaryText} numberOfLines={1}>
                  {hasProfileImage ? t('supplierProfile.editChangePhoto') : t('supplierProfile.editAddPhotoBtn')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.photoBtn, styles.photoBtnDanger, !hasProfileImage && styles.photoBtnDisabled]}
                onPress={onRemoveProfilePhoto}
                disabled={busy || !hasProfileImage}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={18} color={RavenLight.danger} />
                <Text style={styles.photoBtnDangerText} numberOfLines={1}>
                  {t('supplierProfile.editRemovePhoto')}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.photoHint}>{t('supplierProfile.editPhotoHint')}</Text>
          </Card>

          <SectionLabel children={t('supplierProfile.about')} trailing={`${about.length}/${ABOUT_MAX}`} />
          <Card>
            <TextInput
              style={styles.aboutInput}
              value={about}
              onChangeText={(v) => setAbout(v.slice(0, ABOUT_MAX))}
              placeholder={t('supplierProfile.editAboutPlaceholder')}
              placeholderTextColor={RavenLight.textSubtle}
              multiline
              textAlignVertical="top"
              editable={!busy}
            />
          </Card>

          <SectionLabel
            children={t('supplierProfile.editCurrentPhotos')}
            trailing={galleryPhotos.length ? String(galleryPhotos.length) : undefined}
          />
          <Card>
            {galleryPhotos.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Ionicons name="images-outline" size={28} color={RavenLight.textSubtle} />
                <Text style={styles.emptyText}>{t('supplierProfile.editEmptyPhotos')}</Text>
              </View>
            ) : (
              <View style={[styles.mediaGrid, { gap: MEDIA_GAP }]}>
                {galleryPhotos.map((photo) => {
                  const removing = removingKey === photo.key;
                  return (
                    <View key={photo.key} style={[styles.mediaTile, { width: mediaTile, height: mediaTile }]}>
                      <ErpAuthenticatedImage uri={photo.uri} style={styles.mediaImage} resizeMode="cover" />
                      <TouchableOpacity
                        style={styles.mediaRemoveBtn}
                        onPress={() => onRemovePhoto(photo)}
                        disabled={busy}
                        hitSlop={8}
                        accessibilityLabel={t('supplierProfile.editRemovePhoto')}
                      >
                        {removing ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="close" size={15} color="#fff" />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.addRow}>
              <TouchableOpacity
                style={styles.addTile}
                onPress={() => void onAddPhoto()}
                disabled={busy}
                activeOpacity={0.85}
              >
                <View style={styles.addTileIcon}>
                  <Ionicons name="image-outline" size={22} color={RavenLight.accent} />
                </View>
                <Text style={styles.addTileLabel}>{t('supplierProfile.editAddPhoto')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addTile}
                onPress={() => void onAddFile()}
                disabled={busy}
                activeOpacity={0.85}
              >
                <View style={styles.addTileIcon}>
                  <Ionicons name="document-outline" size={22} color={RavenLight.accent} />
                </View>
                <Text style={styles.addTileLabel}>{t('supplierProfile.editAddFile')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardHint}>{t('supplierProfile.editMediaHint')}</Text>
          </Card>

          {fileAttachments.length > 0 ? (
            <>
              <SectionLabel
                children={t('supplierProfile.editCurrentFiles')}
                trailing={String(fileAttachments.length)}
              />
              <Card style={styles.filesCard}>
                {fileAttachments.map((att, idx) => {
                  const key = `file:${att.name || att.file_url}`;
                  const removing = removingKey === key;
                  const { icon, color } = fileKindIcon(att.file_name);
                  const ext = (att.file_name.split('.').pop() || 'FILE').toUpperCase();
                  const isLast = idx === fileAttachments.length - 1;
                  return (
                    <View key={key} style={[styles.fileRow, !isLast && styles.fileRowBorder]}>
                      <View style={[styles.fileIconWrap, { borderColor: color }]}>
                        <Ionicons name={icon} size={20} color={color} />
                      </View>
                      <View style={styles.fileMeta}>
                        <Text style={styles.fileExt}>{ext}</Text>
                        <Text style={styles.fileName} numberOfLines={2}>
                          {att.file_name}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.fileRemoveBtn}
                        onPress={() => onRemoveFile(att)}
                        disabled={busy || !att.name}
                        hitSlop={8}
                      >
                        {removing ? (
                          <ActivityIndicator size="small" color={RavenLight.danger} />
                        ) : (
                          <Ionicons name="trash-outline" size={20} color={RavenLight.danger} />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </Card>
            </>
          ) : null}

          {profile?.country || profile?.supplier_group ? (
            <>
              <SectionLabel children={t('supplierProfile.editReadOnly')} />
              <Card>
                {profile.country ? (
                  <View style={styles.infoRow}>
                    <View style={styles.infoIcon}>
                      <Ionicons name="earth-outline" size={18} color={RavenLight.accent} />
                    </View>
                    <View style={styles.infoText}>
                      <Text style={styles.infoLabel}>{t('supplierProfile.country')}</Text>
                      <Text style={styles.infoValue}>{profile.country}</Text>
                    </View>
                  </View>
                ) : null}
                {profile.supplier_group ? (
                  <View style={[styles.infoRow, profile.country ? styles.infoRowBorder : null]}>
                    <View style={styles.infoIcon}>
                      <Ionicons name="pricetags-outline" size={18} color={RavenLight.accent} />
                    </View>
                    <View style={styles.infoText}>
                      <Text style={styles.infoLabel}>{t('supplierProfile.group')}</Text>
                      <Text style={styles.infoValue}>{profile.supplier_group}</Text>
                    </View>
                  </View>
                ) : null}
                <Text style={styles.adminHint}>{t('supplierProfile.editAdminHint')}</Text>
              </Card>
            </>
          ) : null}

          <View style={{ height: 8 }} />
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, busy && styles.saveBtnDisabled]}
            onPress={() => void onSave()}
            disabled={busy}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                <Text style={styles.saveBtnText}>{t('supplierProfile.editSave')}</Text>
              </>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  flex: { flex: 1 },
  statusBarFill: { width: '100%', backgroundColor: PAGE_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.SM,
    paddingBottom: 10,
    paddingTop: 4,
  },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: RavenLight.text, letterSpacing: -0.3 },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: RavenLight.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  scrollContent: { paddingHorizontal: Spacing.MD, paddingTop: 4 },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: RavenLight.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionTrailing: { fontSize: 12, fontWeight: '700', color: RavenLight.textSubtle },
  card: {
    backgroundColor: RavenLight.panel,
    borderRadius: 12,
    borderWidth: hairline,
    borderColor: CARD_BORDER,
    padding: Spacing.MD,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  heroCard: { alignItems: 'center', marginBottom: 2 },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    marginBottom: 12,
  },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RavenLight.accentSoft,
  },
  avatarInitials: { fontSize: 34, fontWeight: '800', color: RavenLight.accent },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessName: {
    fontSize: 20,
    fontWeight: '800',
    color: RavenLight.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  businessType: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: RavenLight.textMuted,
    textAlign: 'center',
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    alignSelf: 'stretch',
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: hairline,
  },
  photoBtnPrimary: {
    borderColor: RavenLight.accent,
    backgroundColor: RavenLight.accentSoft,
  },
  photoBtnDanger: {
    borderColor: 'rgba(229, 72, 77, 0.35)',
    backgroundColor: 'rgba(255, 235, 238, 0.8)',
  },
  photoBtnDisabled: { opacity: 0.45 },
  photoBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: RavenLight.accent },
  photoBtnDangerText: { fontSize: 13, fontWeight: '700', color: RavenLight.danger },
  photoHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: RavenLight.textSubtle,
    textAlign: 'center',
  },
  aboutInput: {
    minHeight: 148,
    fontSize: 15,
    lineHeight: 22,
    color: RavenLight.text,
    padding: 0,
  },
  emptyBlock: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 14, color: RavenLight.textMuted, textAlign: 'center' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  mediaTile: {
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: RavenLight.canvas,
    borderWidth: hairline,
    borderColor: CARD_BORDER,
  },
  mediaImage: { width: '100%', height: '100%' },
  mediaRemoveBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: { flexDirection: 'row', gap: 10 },
  addTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    borderStyle: 'dashed',
    backgroundColor: RavenLight.canvas,
  },
  addTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RavenLight.panel,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: hairline,
    borderColor: CARD_BORDER,
  },
  addTileLabel: { fontSize: 12, fontWeight: '700', color: RavenLight.text, textAlign: 'center' },
  cardHint: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    color: RavenLight.textSubtle,
  },
  filesCard: { paddingVertical: 4, paddingHorizontal: 0 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.MD,
    gap: 12,
  },
  fileRowBorder: {
    borderBottomWidth: hairline,
    borderBottomColor: RavenLight.border,
  },
  fileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RavenLight.canvas,
  },
  fileMeta: { flex: 1, minWidth: 0 },
  fileExt: {
    fontSize: 10,
    fontWeight: '800',
    color: RavenLight.textSubtle,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  fileName: { fontSize: 14, fontWeight: '600', color: RavenLight.text, lineHeight: 18 },
  fileRemoveBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  infoRowBorder: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: hairline,
    borderTopColor: RavenLight.border,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: RavenLight.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { flex: 1, marginLeft: 12 },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: RavenLight.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: { marginTop: 2, fontSize: 15, fontWeight: '600', color: RavenLight.text },
  adminHint: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    color: RavenLight.textSubtle,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: Spacing.MD,
    paddingTop: 10,
    backgroundColor: PAGE_BG,
    borderTopWidth: hairline,
    borderTopColor: CARD_BORDER,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.WINE,
    paddingVertical: 15,
    borderRadius: 12,
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  loadingText: { fontSize: 14, color: RavenLight.textMuted, fontWeight: '500' },
  err: { fontSize: 15, color: RavenLight.danger, textAlign: 'center', lineHeight: 22 },
});
