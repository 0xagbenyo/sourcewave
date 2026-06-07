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
  Pressable,
  Alert,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { RavenLight } from '../constants/ravenLightTheme';
import { Spacing } from '../constants/spacing';
import {
  fetchErpSupplierProfile,
  createDirectMessageChannel,
  type ErpSupplierProfile,
  type ErpSupplierFileAttachment,
} from '../services/ravenNativeApi';
import { useUserSession } from '../context/UserContext';
import type { RootStackParamList } from '../types';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';
import { ErpAuthenticatedPdfWebView } from '../components/ErpAuthenticatedPdfWebView';
import { buildAuthenticatedErpImageSource, encodeErpFileUrl } from '../utils/erpImageUrl';
import { initialsFromUserId } from '../utils/ravenChatUi';
import { emitRavenOpenChatFromProfile } from '../utils/ravenOpenChatFromProfileBridge';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type RouteProps = RouteProp<RootStackParamList, 'RavenWorkspaceSupplierProfile'>;

const MEDIA_COLS = 3;
const MEDIA_GAP = 8;
const PDF_TOOLBAR_BASE_H = 52;

type GalleryItem = { key: string; uri: string };

function representativeDisplayName(user?: string): string {
  const t = (user || '').trim();
  if (!t) return '';
  if (t.includes('@')) {
    const local = t.split('@')[0];
    if (local) return local.replace(/[._]/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
  }
  return t;
}

function isPrivateAttachment(a: ErpSupplierFileAttachment): boolean {
  const v = a.is_private as unknown;
  return v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1';
}

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
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const { user } = useUserSession();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { supplierDocName, workspaceAdminUser, ravenWorkspaceId } = route.params;

  const [profile, setProfile] = useState<ErpSupplierProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  /** Any Supplier attachment (PDF, Office, etc.) — same authenticated WebView as PDFs so private `/private/files/` URLs work in-app. */
  const [fileWebPreview, setFileWebPreview] = useState<{ uri: string; title: string } | null>(null);
  const [openingChat, setOpeningChat] = useState(false);

  const fileWebSource = useMemo(
    () => (fileWebPreview ? buildAuthenticatedErpImageSource(fileWebPreview.uri) : null),
    [fileWebPreview]
  );

  const mediaTile = useMemo(() => {
    const pad = Spacing.MD * 2;
    return (windowWidth - pad - MEDIA_GAP * (MEDIA_COLS - 1)) / MEDIA_COLS;
  }, [windowWidth]);

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
      setError(p ? null : `Could not load Supplier "${key}" from ERPNext. Check the document name and API access.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load supplier.';
      setError(msg);
      setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supplierDocName]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

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

  const repName = representativeDisplayName(workspaceAdminUser);
  const viewerId = (user?.email || user?.user || '').trim().toLowerCase();
  const adminId = (workspaceAdminUser || '').trim();
  const adminIdLower = adminId.toLowerCase();
  const wsId = (ravenWorkspaceId || '').trim();
  const canMessageAdmin = !!adminId && !!wsId && adminIdLower !== viewerId;

  const onMessageRepresentative = useCallback(async () => {
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

  const initials = useMemo(() => {
    if (!profile) return '';
    return initialsFromUserId(profile.supplier_name || profile.name);
  }, [profile]);

  return (
    <View style={styles.root}>
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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, paddingHorizontal: 8 }}>
            <Text style={styles.navKicker}>Supplier</Text>
            <Text style={styles.navTitle} numberOfLines={1}>
              Profile
            </Text>
          </View>
          <View style={styles.navSpacer} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Spacing.LG + Math.max(insets.bottom, 8) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.bodyPad}>
          <View style={styles.heroCard}>
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
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : null}

            {error && !profile ? <Text style={styles.err}>{error}</Text> : null}

            {profile ? (
              <>
                <Text style={styles.businessName} numberOfLines={2}>
                  {profile.supplier_name}
                </Text>
                {profile.supplier_type ? (
                  <Text style={styles.businessType}>{profile.supplier_type}</Text>
                ) : null}

                <View style={styles.chipRow}>
                  {profile.country ? (
                    <View style={styles.chip}>
                      <Ionicons name="earth-outline" size={14} color={RavenLight.textMuted} />
                      <Text style={styles.chipText}>{profile.country}</Text>
                    </View>
                  ) : null}
                  {profile.supplier_group ? (
                    <View style={styles.chip}>
                      <Ionicons name="pricetags-outline" size={14} color={RavenLight.textMuted} />
                      <Text style={styles.chipText}>{profile.supplier_group}</Text>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
          </View>
          </View>

          {profile ? (
            <>
              {repName ? (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="person-outline" size={18} color={RavenLight.textMuted} />
                    <Text style={styles.cardTitle}>Representative</Text>
                    {canMessageAdmin ? (
                      <TouchableOpacity
                        onPress={() => void onMessageRepresentative()}
                        disabled={openingChat}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Message representative"
                        style={styles.repChatBtn}
                        activeOpacity={0.7}
                      >
                        {openingChat ? (
                          <ActivityIndicator size="small" color={RavenLight.accent} />
                        ) : (
                          <Ionicons name="chatbubble-ellipses-outline" size={22} color={RavenLight.text} />
                        )}
                      </TouchableOpacity>
                    ) : adminId && !wsId ? (
                      <TouchableOpacity
                        onPress={() =>
                          Alert.alert(
                            'Chat',
                            'Open this supplier from the supplier group chat list so the app knows which supplier group to use.'
                          )
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Why chat is unavailable"
                        style={styles.repChatBtn}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={22} color={RavenLight.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={styles.repName}>{repName}</Text>
                </View>
              ) : null}

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="reader-outline" size={18} color={RavenLight.textMuted} />
                  <Text style={styles.cardTitle}>About</Text>
                </View>
                <Text style={styles.aboutText}>{profile.supplier_details_plain}</Text>
                <Text style={styles.docFoot}>Document · {profile.name}</Text>
              </View>

              {galleryItems.length > 0 ? (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="images-outline" size={18} color={RavenLight.textMuted} />
                    <Text style={styles.cardTitle}>Photos</Text>
                    <Text style={styles.cardBadge}>{galleryItems.length}</Text>
                  </View>
                  <Text style={styles.cardHint}>All thumbnails below — tap to enlarge.</Text>
                  <View style={[styles.mediaGrid, { gap: MEDIA_GAP }]}>
                    {galleryItems.map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        activeOpacity={0.88}
                        onPress={() => setLightboxUri(item.uri)}
                        style={[styles.mediaTile, { width: mediaTile, height: mediaTile }]}
                      >
                        <ErpAuthenticatedImage uri={item.uri} style={styles.mediaImage} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {fileAttachments.length > 0 ? (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="folder-outline" size={18} color={RavenLight.textMuted} />
                    <Text style={styles.cardTitle}>Files</Text>
                    <Text style={styles.cardBadge}>{fileAttachments.length}</Text>
                  </View>
                  <Text style={styles.cardHint}>
                    Files open inside the app with your ERPNext session when needed. Use “Browser” in the viewer toolbar
                    if you prefer Safari/Chrome or another app (Office may still need that).
                  </Text>
                  {fileAttachments.map((att) => {
                    const { icon, color } = fileKindLabel(att.file_name);
                    const priv = isPrivateAttachment(att);
                    const pdf = isPdfFileName(att.file_name);
                    return (
                      <TouchableOpacity
                        key={att.name || att.file_url}
                        style={styles.fileRow}
                        onPress={() => onOpenFile(att)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.fileIconWrap, { backgroundColor: `${color}18` }]}>
                          <Ionicons name={icon} size={22} color={color} />
                        </View>
                        <View style={styles.fileMid}>
                          <Text style={styles.fileName} numberOfLines={2}>
                            {att.file_name}
                          </Text>
                          <Text style={styles.fileMeta}>
                            {pdf ? 'PDF · in-app viewer' : priv ? 'Private · in-app (signed in)' : 'In-app viewer'}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={RavenLight.textSubtle} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <View style={styles.lightboxRoot}>
          <Pressable style={styles.lightboxScrim} onPress={() => setLightboxUri(null)} />
          <View style={styles.lightboxBody}>
            <TouchableOpacity
              style={[
                styles.lightboxClose,
                { top: Math.max(insets.top, 12) + 6, right: Math.max(insets.right, 16) },
              ]}
              onPress={() => setLightboxUri(null)}
              hitSlop={16}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {lightboxUri ? (
              <ErpAuthenticatedImage uri={lightboxUri} style={styles.lightboxImage} resizeMode="contain" />
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!fileWebPreview}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFileWebPreview(null)}
      >
        <View style={styles.pdfRoot}>
          <View style={[styles.pdfWebShell, { paddingTop: PDF_TOOLBAR_BASE_H + Math.max(insets.top, 12) }]}>
            {fileWebPreview?.uri ? (
              isPdfFileName(fileWebPreview.title) ? (
                <ErpAuthenticatedPdfWebView resourceUri={fileWebPreview.uri} style={styles.pdfWebView} />
              ) : Platform.OS === 'android' ? (
                <View style={[styles.pdfWebView, styles.filePreviewFallback]}>
                  <Ionicons name="document-outline" size={44} color={RavenLight.textMuted} />
                  <Text style={styles.filePreviewFallbackTitle}>No in-app preview on Android</Text>
                  <Text style={styles.filePreviewFallbackSub}>
                    This file type usually opens in your browser or an Office app instead of inside WebView.
                  </Text>
                  <TouchableOpacity style={styles.filePreviewFallbackBtn} onPress={onOpenFileInBrowser}>
                    <Text style={styles.filePreviewFallbackBtnText}>Open in browser</Text>
                  </TouchableOpacity>
                </View>
              ) : fileWebSource?.uri ? (
                <WebView
                  source={{
                    uri: fileWebSource.uri,
                    headers: fileWebSource.headers as Record<string, string> | undefined,
                  }}
                  style={styles.pdfWebView}
                  originWhitelist={['*']}
                />
              ) : null
            ) : null}
          </View>
          <View
            style={[
              styles.pdfToolbar,
              {
                paddingTop: Math.max(insets.top, 12) + 4,
                minHeight: PDF_TOOLBAR_BASE_H + Math.max(insets.top, 12) + 4,
              },
            ]}
            collapsable={false}
          >
            <TouchableOpacity
              onPress={() => setFileWebPreview(null)}
              style={styles.pdfToolbarBtn}
              accessibilityLabel="Close file viewer"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-down-circle" size={34} color={RavenLight.text} />
            </TouchableOpacity>
            <Text style={styles.pdfTitle} numberOfLines={1}>
              {fileWebPreview?.title}
            </Text>
            <TouchableOpacity
              onPress={() => onOpenFileInBrowser()}
              style={styles.pdfToolbarBtn}
              accessibilityLabel="Open in browser"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="open-outline" size={26} color={RavenLight.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFileWebPreview(null)}
              style={styles.pdfToolbarBtn}
              accessibilityLabel="Close"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={28} color={RavenLight.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RavenLight.bg },
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
  bodyPad: { paddingHorizontal: Spacing.MD },
  heroCard: {
    backgroundColor: RavenLight.panel,
    borderRadius: RavenLight.radiusLg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.LG,
    paddingBottom: Spacing.MD,
    marginBottom: Spacing.MD,
    ...Platform.select({
      ios: {
        shadowColor: RavenLight.shadowSoft,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  headBlock: {
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: Spacing.SM,
  },
  avatarWrap: {
    marginBottom: Spacing.MD,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: RavenLight.canvas,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: RavenLight.text },
  card: {
    marginTop: Spacing.SM,
    backgroundColor: RavenLight.panel,
    borderRadius: RavenLight.radiusLg,
    padding: Spacing.MD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    ...Platform.select({
      ios: {
        shadowColor: RavenLight.shadowSoft,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  repChatBtn: {
    padding: 4,
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: RavenLight.text },
  cardBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: RavenLight.textMuted,
    backgroundColor: RavenLight.canvas,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardHint: {
    fontSize: 12,
    color: RavenLight.textSubtle,
    marginBottom: 10,
    marginTop: -4,
  },
  repName: { fontSize: 16, fontWeight: '600', color: RavenLight.text },
  aboutText: {
    fontSize: 15,
    lineHeight: 22,
    color: RavenLight.text,
  },
  docFoot: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: '600',
    color: RavenLight.textSubtle,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  mediaTile: {
    borderRadius: RavenLight.radiusMd,
    overflow: 'hidden',
    backgroundColor: RavenLight.canvas,
  },
  mediaImage: { width: '100%', height: '100%' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RavenLight.border,
  },
  fileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileMid: { flex: 1, marginLeft: 12, minWidth: 0 },
  fileName: { fontSize: 15, fontWeight: '600', color: RavenLight.text },
  fileMeta: { marginTop: 3, fontSize: 12, color: RavenLight.textMuted },
  lightboxRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  lightboxScrim: { ...StyleSheet.absoluteFillObject },
  lightboxBody: { flex: 1, justifyContent: 'center', padding: 12 },
  lightboxClose: {
    position: 'absolute',
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '78%',
    alignSelf: 'center',
  },
  pdfRoot: { flex: 1, backgroundColor: RavenLight.panel },
  pdfWebShell: {
    flex: 1,
    backgroundColor: RavenLight.panel,
  },
  pdfWebView: { flex: 1, backgroundColor: RavenLight.panel },
  filePreviewFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  filePreviewFallbackTitle: { fontSize: 17, fontWeight: '800', color: RavenLight.text, textAlign: 'center' },
  filePreviewFallbackSub: {
    fontSize: 14,
    color: RavenLight.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  filePreviewFallbackBtn: {
    backgroundColor: RavenLight.accent,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
  },
  filePreviewFallbackBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pdfToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
    backgroundColor: RavenLight.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
    zIndex: 1000,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  pdfToolbarBtn: { padding: 8 },
  pdfTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: RavenLight.text,
    marginHorizontal: 4,
  },
});
