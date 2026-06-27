import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import { useRoute, useNavigation, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { Spacing } from '../constants/spacing';
import {
  fetchErpSupplierProfile,
  createDirectMessageChannel,
  type ErpSupplierProfile,
  type ErpSupplierFileAttachment,
} from '../services/ravenNativeApi';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import type { RootStackParamList } from '../types';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';
import { ErpAuthenticatedPdfWebView } from '../components/ErpAuthenticatedPdfWebView';
import { ErpAuthenticatedCachedFileWebView } from '../components/ErpAuthenticatedCachedFileWebView';
import { encodeErpFileUrl } from '../utils/erpImageUrl';
import { initialsFromUserId } from '../utils/ravenChatUi';
import { emitRavenOpenChatFromProfile } from '../utils/ravenOpenChatFromProfileBridge';
import { userFacingError } from '../utils/userFacingError';
import { useAutoNavigateToSubscriptionWhenInactive } from '../hooks/useAutoNavigateToSubscriptionWhenInactive';
import { resetToAuthScreen } from '../navigation/rootNavigation';
import { useTranslation } from 'react-i18next';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type RouteProps = RouteProp<RootStackParamList, 'RavenWorkspaceSupplierProfile'>;

const MEDIA_COLS = 2;
const MEDIA_GAP = 6;
const FILE_COLS = 2;

type GalleryItem = { key: string; uri: string };

function isImageFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'].includes(ext);
}

function isImageAttachment(a: ErpSupplierFileAttachment): boolean {
  return isImageFileName(a.file_name) || isImageFileName(a.file_url);
}

function isPdfFileName(fileName: string): boolean {
  return fileName.split('.').pop()?.toLowerCase() === 'pdf';
}

/** Same logical file can appear as Supplier `image` and as a File row — compare normalized paths. */
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

function fileKindLabel(fileName: string): { icon: IoniconsName; color: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return { icon: 'document-text', color: '#dc2626' };
  if (['doc', 'docx'].includes(ext)) return { icon: 'document-text', color: '#2563eb' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'grid-outline', color: '#16a34a' };
  if (['zip', 'rar', '7z'].includes(ext)) return { icon: 'archive-outline', color: '#ca8a04' };
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return { icon: 'videocam-outline', color: '#7c3aed' };
  if (['mp3', 'wav', 'm4a'].includes(ext)) return { icon: 'musical-notes-outline', color: '#db2777' };
  return { icon: 'document-attach-outline', color: RavenLight.textMuted };
}

/**
 * ERPNext **Supplier** profile: clean catalog layout, photo grid, in-app file preview (WebView + ERP auth).
 */
export const RavenWorkspaceSupplierProfileScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const { user } = useUserSession();
  const { isActive: subscriptionActive, isLoading: subscriptionLoading, refresh: refreshSubscription } =
    useSubscription();
  useAutoNavigateToSubscriptionWhenInactive(navigation as { navigate: (name: string) => void }, {
    email: user?.email,
    isLoading: subscriptionLoading,
    isActive: subscriptionActive,
  });
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { supplierDocName, workspaceAdminUser, ravenWorkspaceId, ravenWorkspaceName, shareSalesOrderName } =
    route.params;
  const shareOrderName = (shareSalesOrderName || '').trim();

  const [profile, setProfile] = useState<ErpSupplierProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  /** Any Supplier attachment (PDF, Office, etc.) — same authenticated WebView as PDFs so private `/private/files/` URLs work in-app. */
  const [fileWebPreview, setFileWebPreview] = useState<{ uri: string; title: string } | null>(null);
  const [openingChat, setOpeningChat] = useState(false);

  const sectionPad = Spacing.MD;

  const mediaTile = useMemo(() => {
    return (windowWidth - sectionPad * 2 - MEDIA_GAP * (MEDIA_COLS - 1)) / MEDIA_COLS;
  }, [windowWidth, sectionPad]);

  const fileTileWidth = useMemo(() => {
    return (windowWidth - sectionPad * 2 - MEDIA_GAP * (FILE_COLS - 1)) / FILE_COLS;
  }, [windowWidth, sectionPad]);

  const load = useCallback(async () => {
    const key = (supplierDocName || '').trim();
    if (!key) {
      setProfile(null);
      setError('No supplier was specified.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const p = await fetchErpSupplierProfile(key);
      setProfile(p);
      setError(p ? null : `Could not load this supplier profile. Try again or contact support.`);
    } catch (e: unknown) {
      setError(userFacingError(e, 'Failed to load supplier.'));
      setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supplierDocName]);

  useEffect(() => {
    if (!user?.email) {
      setLoading(false);
      setProfile(null);
      return;
    }
    if (subscriptionLoading) {
      return;
    }
    if (!subscriptionActive) {
      setLoading(false);
      setProfile(null);
      return;
    }
    setLoading(true);
    void load();
  }, [load, user?.email, subscriptionLoading, subscriptionActive]);

  useFocusEffect(
    useCallback(() => {
      void refreshSubscription();
    }, [refreshSubscription])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const galleryItems = useMemo((): GalleryItem[] => {
    if (!profile) return [];
    const seenPath = new Set<string>();
    const out: GalleryItem[] = [];

    const push = (key: string, uri: string | null | undefined) => {
      const t = (uri || '').trim();
      if (!t) return;
      const dedupe = normalizeErpFilePathForDedupe(t);
      if (!dedupe || seenPath.has(dedupe)) return;
      seenPath.add(dedupe);
      out.push({ key, uri: t });
    };

    push('field:image', profile.image);
    for (const a of profile.attachments) {
      if (!isImageAttachment(a)) continue;
      const key = a.name ? `file:${a.name}` : `url:${normalizeErpFilePathForDedupe(a.file_url)}`;
      push(key, a.file_url);
    }
    return out;
  }, [profile]);

  const fileAttachments = useMemo(() => {
    if (!profile) return [];
    return profile.attachments.filter((a) => !isImageAttachment(a));
  }, [profile]);

  const viewerId = (user?.email || user?.user || '').trim().toLowerCase();
  const adminId = (workspaceAdminUser || '').trim();
  const adminIdLower = adminId.toLowerCase();
  const wsId = (ravenWorkspaceId || '').trim();
  const canMessageAdmin = !!adminId && !!wsId && adminIdLower !== viewerId;

  const onMessageSupplier = useCallback(async () => {
    if (!adminId) {
      Alert.alert('Chat', 'No representative user is linked to this profile.');
      return;
    }
    if (!wsId) {
      Alert.alert(
        'Chat',
        'Open this supplier from the supplier group chat list so the app knows which supplier group to use.'
      );
      return;
    }
    if (adminIdLower === viewerId) {
      Alert.alert('Chat', 'You cannot start a chat with yourself.');
      return;
    }
    setOpeningChat(true);
    try {
      const channelId = await createDirectMessageChannel(adminId);
      const ch = String(channelId || '').trim();
      if (!ch) {
        Alert.alert('Chat', 'Could not create or open a direct message.');
        return;
      }
      emitRavenOpenChatFromProfile({
        workspaceId: wsId,
        channelId: ch,
        peerUserId: adminId,
      });
      navigation.goBack();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open chat.';
      Alert.alert('Chat', msg);
    } finally {
      setOpeningChat(false);
    }
  }, [adminId, adminIdLower, viewerId, wsId, navigation]);

  const onSendSalesOrder = useCallback(() => {
    if (!adminId) {
      Alert.alert(t('salesOrderShare.title'), 'No representative user is linked to this profile.');
      return;
    }
    if (adminIdLower === viewerId) {
      Alert.alert(t('salesOrderShare.title'), 'You cannot send a request to yourself.');
      return;
    }
    (navigation as { navigate: (name: string, params: object) => void }).navigate('SourcingRequest', {
      peerUserId: adminId,
      supplierLabel: profile?.supplier_name || profile?.name || '',
      supplierDocName: (supplierDocName || '').trim(),
      supplierGroup: String(profile?.supplier_group || '').trim(),
      ...((ravenWorkspaceName || '').trim()
        ? { workspaceName: (ravenWorkspaceName || '').trim() }
        : {}),
    });
  }, [
    adminId,
    adminIdLower,
    viewerId,
    navigation,
    profile?.supplier_name,
    profile?.name,
    profile?.supplier_group,
    supplierDocName,
    ravenWorkspaceName,
    t,
  ]);

  const onShareExistingOrder = useCallback(() => {
    if (!adminId) {
      Alert.alert(t('salesOrderShare.title'), 'No representative user is linked to this profile.');
      return;
    }
    if (adminIdLower === viewerId) {
      Alert.alert(t('salesOrderShare.title'), 'You cannot send a request to yourself.');
      return;
    }
    if (!shareOrderName) return;
    (navigation as { navigate: (name: string, params: object) => void }).navigate('BuyerSalesOrderShareCompose', {
      peerUserId: adminId,
      salesOrderName: shareOrderName,
      supplierLabel: profile?.supplier_name || profile?.name || '',
    });
  }, [adminId, adminIdLower, viewerId, shareOrderName, navigation, profile?.supplier_name, profile?.name, t]);

  const onOpenFile = (att: ErpSupplierFileAttachment) => {
    const t = att.file_url.trim();
    if (!t) return;
    setFileWebPreview({ uri: t, title: att.file_name });
  };

  const onOpenFileInBrowser = useCallback(() => {
    const raw = fileWebPreview?.uri?.trim();
    if (!raw) return;
    const url = encodeErpFileUrl(raw);
    if (!url) return;
    Linking.openURL(url).catch(() => {
      Alert.alert('Open in browser', 'Could not open this link on your device.');
    });
  }, [fileWebPreview?.uri]);

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const stepLightbox = useCallback(
    (delta: number) => {
      setLightboxIndex((idx) => {
        if (idx == null || galleryItems.length === 0) return idx;
        const next = idx + delta;
        if (next < 0 || next >= galleryItems.length) return idx;
        return next;
      });
    },
    [galleryItems.length]
  );

  const filePreviewIsImage = fileWebPreview ? isImageFileName(fileWebPreview.title) : false;
  const filePreviewIsPdf = fileWebPreview ? isPdfFileName(fileWebPreview.title) : false;

  const initials = useMemo(() => {
    if (!profile) return '';
    return initialsFromUserId(profile.supplier_name || profile.name);
  }, [profile]);

  const workspaceLabel = (ravenWorkspaceName || '').trim();
  const aboutPlain = profile?.supplier_details_plain?.trim() || '';
  const hasAbout =
    aboutPlain.length > 0 && !/^no description on file/i.test(aboutPlain);

  const renderNav = (title: string, kicker?: string) => (
    <>
      <StatusBar style="dark" backgroundColor={RavenLight.panel} translucent />
      <View style={[styles.statusBarFill, { height: insets.top }]} />
      <View style={styles.safeTop}>
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.navBack}
            hitSlop={14}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={RavenLight.text} />
          </TouchableOpacity>
          <View style={styles.navCenter}>
            <Text style={styles.navKicker} numberOfLines={1}>
              {kicker || t('supplierProfile.kicker')}
            </Text>
            <Text style={styles.navTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={styles.navSpacer} />
        </View>
      </View>
    </>
  );

  if (!user?.email) {
    return (
      <View style={styles.root}>
        {renderNav(t('supplierProfile.title'))}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.LG }}>
          <Text style={styles.navTitle}>{t('suppliersPremium.signInTitle')}</Text>
          <Text style={[styles.loadingText, { marginTop: 10, textAlign: 'center' }]}>
            {t('suppliersPremium.signInBody')}
          </Text>
          <TouchableOpacity
            style={{
              marginTop: Spacing.LG,
              backgroundColor: RavenLight.accent,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: 'center',
              width: '100%',
            }}
            onPress={() => resetToAuthScreen()}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('suppliersPremium.signInCta')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (subscriptionLoading) {
    return (
      <View style={styles.root}>
        {renderNav(t('supplierProfile.title'))}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={RavenLight.accent} size="large" />
        </View>
      </View>
    );
  }

  if (!subscriptionActive) {
    return (
      <View style={styles.root}>
        {renderNav(t('supplierProfile.title'))}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={RavenLight.accent} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {renderNav(profile?.supplier_name || t('supplierProfile.title'), workspaceLabel || undefined)}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Spacing.LG + Math.max(insets.bottom, 8) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.body}>
          <View style={styles.section}>
            <View style={styles.headBlock}>
              <View style={styles.avatarWrap}>
                {loading && !profile ? (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <ActivityIndicator color={RavenLight.accent} size="large" />
                  </View>
                ) : profile?.image ? (
                  <ErpAuthenticatedImage uri={profile.image} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitials}>{initials || '—'}</Text>
                  </View>
                )}
              </View>

              {loading && !profile ? (
                <View style={styles.loadingBlock}>
                  <Text style={styles.loadingText}>{t('supplierProfile.loading')}</Text>
                </View>
              ) : null}

              {error && !profile ? (
                <View style={styles.errorBlock}>
                  <Ionicons name="cloud-offline-outline" size={36} color={RavenLight.textMuted} />
                  <Text style={styles.err}>{error}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} activeOpacity={0.85}>
                    <Text style={styles.retryBtnText}>{t('supplierProfile.retry')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {profile ? (
                <>
                  {workspaceLabel ? (
                    <View style={styles.workspacePill}>
                      <Ionicons name="people-outline" size={14} color={RavenLight.accent} />
                      <Text style={styles.workspacePillText} numberOfLines={1}>
                        {t('supplierProfile.workspaceBadge', { name: workspaceLabel })}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.businessName} numberOfLines={2}>
                    {profile.supplier_name}
                  </Text>
                  {profile.supplier_type ? (
                    <Text style={styles.businessType}>{profile.supplier_type}</Text>
                  ) : null}

                  {(galleryItems.length > 0 || fileAttachments.length > 0) && (
                    <View style={styles.statsRow}>
                      {galleryItems.length > 0 ? (
                        <View style={styles.statPill}>
                          <Ionicons name="images-outline" size={14} color={RavenLight.accent} />
                          <Text style={styles.statPillText}>
                            {t('supplierProfile.statPhotos', { count: galleryItems.length })}
                          </Text>
                        </View>
                      ) : null}
                      {fileAttachments.length > 0 ? (
                        <View style={styles.statPill}>
                          <Ionicons name="folder-outline" size={14} color={RavenLight.accent} />
                          <Text style={styles.statPillText}>
                            {t('supplierProfile.statFiles', { count: fileAttachments.length })}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}

                  {user?.appMode !== 'supplier' ? (
                    <>
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            styles.actionBtnOutline,
                            (!canMessageAdmin || openingChat) && styles.actionBtnDisabled,
                          ]}
                          onPress={() => void onMessageSupplier()}
                          disabled={openingChat || !canMessageAdmin}
                          activeOpacity={0.85}
                          accessibilityLabel={t('supplierProfile.chat')}
                        >
                          {openingChat ? (
                            <ActivityIndicator size="small" color={RavenLight.accent} />
                          ) : (
                            <Ionicons name="chatbubble-ellipses-outline" size={20} color={RavenLight.accent} />
                          )}
                          <Text style={styles.actionBtnOutlineText}>{t('supplierProfile.chat')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnPrimary, !adminId && styles.actionBtnDisabled]}
                          onPress={shareOrderName ? onShareExistingOrder : onSendSalesOrder}
                          disabled={!adminId}
                          activeOpacity={0.85}
                          accessibilityLabel={
                            shareOrderName ? t('supplierProfile.shareOrder') : t('supplierProfile.sendRequest')
                          }
                        >
                          <Ionicons
                            name={shareOrderName ? 'share-outline' : 'cart-outline'}
                            size={20}
                            color={RavenLight.panel}
                          />
                          <Text style={styles.actionBtnPrimaryText} numberOfLines={2}>
                            {shareOrderName
                              ? t('supplierProfile.shareOrder', { order: shareOrderName })
                              : t('supplierProfile.sendRequest')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {shareOrderName ? (
                        <TouchableOpacity
                          style={[styles.secondaryLinkBtn, !adminId && styles.actionBtnDisabled]}
                          onPress={onSendSalesOrder}
                          disabled={!adminId}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.secondaryLinkBtnText}>{t('supplierProfile.sendNewRequestInstead')}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        styles.actionBtnOutline,
                        styles.actionBtnSolo,
                        (!canMessageAdmin || openingChat) && styles.actionBtnDisabled,
                      ]}
                      onPress={() => void onMessageSupplier()}
                      disabled={openingChat || !canMessageAdmin}
                      activeOpacity={0.85}
                      accessibilityLabel={t('supplierProfile.chat')}
                    >
                      {openingChat ? (
                        <ActivityIndicator size="small" color={RavenLight.accent} />
                      ) : (
                        <Ionicons name="chatbubble-ellipses-outline" size={20} color={RavenLight.accent} />
                      )}
                      <Text style={styles.actionBtnOutlineText}>{t('supplierProfile.chat')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : null}
            </View>
          </View>

          {profile ? (
            <>
              {(profile.country || profile.supplier_group) && (
                <View style={styles.section}>
                  {profile.country ? (
                    <View style={styles.infoRow}>
                      <View style={styles.infoIconWrap}>
                        <Ionicons name="earth-outline" size={18} color={RavenLight.accent} />
                      </View>
                      <View style={styles.infoMid}>
                        <Text style={styles.infoLabel}>{t('supplierProfile.country')}</Text>
                        <Text style={styles.infoValue}>{profile.country}</Text>
                      </View>
                    </View>
                  ) : null}
                  {profile.supplier_group ? (
                    <View style={[styles.infoRow, profile.country ? styles.infoRowBorder : null]}>
                      <View style={styles.infoIconWrap}>
                        <Ionicons name="pricetags-outline" size={18} color={RavenLight.accent} />
                      </View>
                      <View style={styles.infoMid}>
                        <Text style={styles.infoLabel}>{t('supplierProfile.group')}</Text>
                        <Text style={styles.infoValue}>{profile.supplier_group}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('supplierProfile.about')}</Text>
                {hasAbout ? (
                  <Text style={styles.aboutText}>{aboutPlain}</Text>
                ) : (
                  <Text style={styles.aboutEmpty}>{t('supplierProfile.aboutEmpty')}</Text>
                )}
              </View>

              {galleryItems.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeadRow}>
                    <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
                      {t('supplierProfile.photos')}
                    </Text>
                    <Text style={styles.sectionCount}>{galleryItems.length}</Text>
                  </View>
                  <View style={[styles.mediaGrid, { gap: MEDIA_GAP }]}>
                    {galleryItems.map((item, index) => (
                      <TouchableOpacity
                        key={item.key}
                        activeOpacity={0.9}
                        onPress={() => openLightbox(index)}
                        style={[styles.mediaTile, { width: mediaTile, height: mediaTile }]}
                      >
                        <ErpAuthenticatedImage uri={item.uri} style={styles.mediaImage} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {fileAttachments.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeadRow}>
                    <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
                      {t('supplierProfile.files')}
                    </Text>
                    <Text style={styles.sectionCount}>{fileAttachments.length}</Text>
                  </View>
                  <View style={[styles.fileGrid, { gap: MEDIA_GAP }]}>
                    {fileAttachments.map((att) => {
                      const { icon, color } = fileKindLabel(att.file_name);
                      const ext = (att.file_name.split('.').pop() || '').toUpperCase();
                      return (
                        <TouchableOpacity
                          key={att.name || att.file_url}
                          style={[styles.fileTile, { width: fileTileWidth }]}
                          onPress={() => onOpenFile(att)}
                          activeOpacity={0.85}
                        >
                          <View style={[styles.fileTileIcon, { borderColor: color }]}>
                            <Ionicons name={icon} size={24} color={color} />
                          </View>
                          <Text style={styles.fileTileExt}>{ext || 'FILE'}</Text>
                          <Text style={styles.fileTileName} numberOfLines={3}>
                            {att.file_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={lightboxIndex != null}
        transparent
        animationType="fade"
        onRequestClose={closeLightbox}
      >
        <View style={styles.lightboxRoot}>
          <StatusBar style="light" />
          <View style={[styles.lightboxTopBar, { paddingTop: Math.max(insets.top, 8) }]}>
            <TouchableOpacity onPress={closeLightbox} style={styles.lightboxTopBtn} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.lightboxCounter}>
              {lightboxIndex != null
                ? t('supplierProfile.photoCounter', {
                    current: lightboxIndex + 1,
                    total: galleryItems.length,
                  })
                : ''}
            </Text>
            <View style={styles.lightboxTopBtn} />
          </View>

          <View style={styles.lightboxImageWrap}>
            {lightboxIndex != null && galleryItems[lightboxIndex] ? (
              <ErpAuthenticatedImage
                uri={galleryItems[lightboxIndex].uri}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            ) : null}
          </View>

          {galleryItems.length > 1 ? (
            <View style={[styles.lightboxNavRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <TouchableOpacity
                style={[styles.lightboxNavBtn, lightboxIndex === 0 && styles.lightboxNavBtnOff]}
                onPress={() => stepLightbox(-1)}
                disabled={lightboxIndex === 0}
              >
                <Ionicons name="chevron-back" size={22} color="#fff" />
                <Text style={styles.lightboxNavText}>{t('supplierProfile.photoPrev')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.lightboxNavBtn,
                  lightboxIndex === galleryItems.length - 1 && styles.lightboxNavBtnOff,
                ]}
                onPress={() => stepLightbox(1)}
                disabled={lightboxIndex === galleryItems.length - 1}
              >
                <Text style={styles.lightboxNavText}>{t('supplierProfile.photoNext')}</Text>
                <Ionicons name="chevron-forward" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ height: Math.max(insets.bottom, 16) }} />
          )}
        </View>
      </Modal>

      <Modal
        visible={!!fileWebPreview}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFileWebPreview(null)}
      >
        <View style={styles.previewRoot}>
          <StatusBar style={filePreviewIsImage ? 'light' : 'dark'} />
          <View
            style={[
              styles.previewToolbar,
              { paddingTop: Math.max(insets.top, 8) },
              filePreviewIsImage && styles.previewToolbarDark,
            ]}
          >
            <TouchableOpacity
              onPress={() => setFileWebPreview(null)}
              style={styles.previewToolbarBtn}
              accessibilityLabel="Close file viewer"
              hitSlop={12}
            >
              <Ionicons
                name="close"
                size={26}
                color={filePreviewIsImage ? '#fff' : RavenLight.text}
              />
            </TouchableOpacity>
            <Text
              style={[styles.previewTitle, filePreviewIsImage && styles.previewTitleDark]}
              numberOfLines={1}
            >
              {fileWebPreview?.title}
            </Text>
            <TouchableOpacity
              onPress={() => onOpenFileInBrowser()}
              style={styles.previewToolbarBtn}
              accessibilityLabel="Open in browser"
              hitSlop={12}
            >
              <Ionicons
                name="open-outline"
                size={24}
                color={filePreviewIsImage ? '#fff' : RavenLight.accent}
              />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.previewBody,
              filePreviewIsImage && styles.previewBodyDark,
              filePreviewIsPdf && styles.previewBodyDoc,
            ]}
          >
            {fileWebPreview?.uri ? (
              filePreviewIsImage ? (
                <ErpAuthenticatedImage
                  uri={fileWebPreview.uri}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              ) : filePreviewIsPdf ? (
                <ErpAuthenticatedPdfWebView resourceUri={fileWebPreview.uri} style={styles.previewWeb} />
              ) : (
                <ErpAuthenticatedCachedFileWebView
                  resourceUri={fileWebPreview.uri}
                  fileName={fileWebPreview.title}
                  style={styles.previewWeb}
                />
              )
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RavenLight.panel },
  statusBarFill: {
    width: '100%',
    backgroundColor: RavenLight.panel,
  },
  safeTop: {
    backgroundColor: RavenLight.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.SM,
    paddingVertical: 8,
    minHeight: 48,
  },
  navBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 8,
  },
  navTitle: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: RavenLight.text,
  },
  navSpacer: { width: 44 },
  navKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: RavenLight.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  body: { flex: 1 },
  section: {
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.LG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: RavenLight.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '700',
    color: RavenLight.textSubtle,
  },
  sectionTitleInline: { marginBottom: 0 },
  headBlock: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
  },
  avatarWrap: { marginBottom: Spacing.MD },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: RavenLight.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RavenLight.accentSoft,
  },
  avatarInitials: { fontSize: 32, fontWeight: '800', color: RavenLight.accent },
  loadingBlock: { paddingVertical: 8 },
  loadingText: { fontSize: 14, color: RavenLight.textMuted },
  errorBlock: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: RavenLight.accent,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  err: {
    fontSize: 15,
    color: RavenLight.danger,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  businessName: {
    fontSize: 22,
    fontWeight: '800',
    color: RavenLight.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  businessType: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
    color: RavenLight.textMuted,
    textAlign: 'center',
  },
  workspacePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: RavenLight.accentSoft,
    marginBottom: 10,
  },
  workspacePillText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: RavenLight.accent,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: RavenLight.canvas,
  },
  statPillText: { fontSize: 12, fontWeight: '600', color: RavenLight.textMuted },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    alignSelf: 'stretch',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  actionBtnSolo: { alignSelf: 'stretch', marginTop: 16 },
  actionBtnOutline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.accent,
    backgroundColor: RavenLight.accentSoft,
  },
  actionBtnPrimary: {
    backgroundColor: RavenLight.accent,
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnOutlineText: {
    fontSize: 15,
    fontWeight: '700',
    color: RavenLight.accent,
  },
  actionBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: RavenLight.panel,
  },
  secondaryLinkBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  secondaryLinkBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: RavenLight.accent,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RavenLight.border,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: RavenLight.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoMid: { flex: 1, marginLeft: 12, minWidth: 0 },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: RavenLight.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '600',
    color: RavenLight.text,
  },
  aboutText: {
    fontSize: 15,
    lineHeight: 22,
    color: RavenLight.text,
  },
  aboutEmpty: {
    fontSize: 14,
    lineHeight: 21,
    color: RavenLight.textMuted,
    fontStyle: 'italic',
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  mediaTile: {
    overflow: 'hidden',
    backgroundColor: RavenLight.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  mediaImage: { width: '100%', height: '100%' },
  fileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  fileTile: {
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    backgroundColor: RavenLight.canvas,
    alignItems: 'center',
    minHeight: 120,
  },
  fileTileIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RavenLight.panel,
    marginBottom: 8,
  },
  fileTileExt: {
    fontSize: 10,
    fontWeight: '800',
    color: RavenLight.textSubtle,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fileTileName: {
    fontSize: 12,
    fontWeight: '600',
    color: RavenLight.text,
    textAlign: 'center',
    lineHeight: 16,
  },
  lightboxRoot: { flex: 1, backgroundColor: '#000' },
  lightboxTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  lightboxTopBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCounter: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  lightboxImageWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    gap: 12,
  },
  lightboxNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  lightboxNavBtnOff: { opacity: 0.35 },
  lightboxNavText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  previewRoot: { flex: 1, backgroundColor: RavenLight.panel },
  previewToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: RavenLight.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
  },
  previewToolbarDark: {
    backgroundColor: '#111',
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  previewToolbarBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: RavenLight.text,
    marginHorizontal: 4,
  },
  previewTitleDark: { color: '#fff' },
  previewBody: {
    flex: 1,
    backgroundColor: RavenLight.canvas,
  },
  previewBodyDark: {
    backgroundColor: '#111',
  },
  previewBodyDoc: {
    backgroundColor: RavenLight.panel,
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  previewWeb: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
