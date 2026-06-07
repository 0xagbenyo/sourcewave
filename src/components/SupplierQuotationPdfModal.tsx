import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { RavenLight } from '../constants/ravenLightTheme';
import { ErpAuthenticatedPdfWebView } from './ErpAuthenticatedPdfWebView';
import { buildSupplierQuotationPdfApiUrl } from '../utils/supplierQuotationPdfUrl';
import { downloadErpFileAndShare } from '../utils/ravenDownloadAttachment';

const PDF_TOOLBAR_BASE_H = 52;

type Props = {
  visible: boolean;
  docName: string;
  /** ERPNext Print Format name (default Standard). */
  printFormat?: string;
  onClose: () => void;
};

export const SupplierQuotationPdfModal: React.FC<Props> = ({
  visible,
  docName,
  printFormat = 'Standard',
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [busyDownload, setBusyDownload] = useState(false);
  const name = String(docName || '').trim();
  const pdfUri = name ? buildSupplierQuotationPdfApiUrl(name, printFormat) : '';
  const title = name ? `${name}.pdf` : 'Quotation';

  const runDownload = useCallback(async () => {
    if (!pdfUri || busyDownload) return;
    setBusyDownload(true);
    try {
      await downloadErpFileAndShare(pdfUri, title);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not download PDF.';
      Alert.alert('Download', msg);
    } finally {
      setBusyDownload(false);
    }
  }, [busyDownload, pdfUri, title]);

  if (Platform.OS === 'web') {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.webOverlay}>
          <View style={[styles.webCard, { marginTop: Math.max(insets.top, 16) }]}>
            <Text style={styles.webTitle}>PDF preview</Text>
            <Text style={styles.webBody}>
              PDF preview and download use authenticated requests and are not available in the web preview. Use the
              mobile app or open this quotation in ERPNext to print.
            </Text>
            <TouchableOpacity style={styles.webBtn} onPress={onClose}>
              <Text style={styles.webBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible && !!name}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={styles.pdfRoot}>
        <View style={[styles.pdfWebShell, { paddingTop: PDF_TOOLBAR_BASE_H + Math.max(insets.top, 12) }]}>
          {pdfUri ? <ErpAuthenticatedPdfWebView resourceUri={pdfUri} style={styles.webView} /> : null}
        </View>
        <View
          style={[
            styles.pdfToolbarOverlay,
            {
              paddingTop: Math.max(insets.top, 12) + 4,
              minHeight: PDF_TOOLBAR_BASE_H + Math.max(insets.top, 12) + 4,
            },
          ]}
          collapsable={false}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.pdfToolbarIcon}
            accessibilityLabel="Close PDF"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-down-circle" size={34} color={RavenLight.textMuted} />
          </TouchableOpacity>
          <Text style={styles.pdfTitle} numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity
            onPress={() => void runDownload()}
            style={styles.pdfToolbarIcon}
            disabled={busyDownload}
            accessibilityLabel="Download PDF"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {busyDownload ? (
              <ActivityIndicator color={RavenLight.accent} size="small" />
            ) : (
              <Ionicons name="download-outline" size={26} color={RavenLight.accent} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={styles.pdfToolbarIcon}
            accessibilityLabel="Close"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={28} color={RavenLight.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  pdfRoot: { flex: 1, backgroundColor: Colors.WHITE },
  pdfWebShell: {
    flex: 1,
    backgroundColor: Colors.WHITE,
  },
  pdfToolbarOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    zIndex: 1000,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  pdfToolbarIcon: { padding: 8 },
  pdfTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.BLACK,
    marginHorizontal: 4,
  },
  webView: { flex: 1, backgroundColor: Colors.WHITE },
  webOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  webCard: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    padding: 20,
  },
  webTitle: { fontSize: 17, fontWeight: '800', color: Colors.BLACK, marginBottom: 10 },
  webBody: { fontSize: 14, color: Colors.TEXT_SECONDARY, lineHeight: 20, marginBottom: 16 },
  webBtn: {
    alignSelf: 'flex-end',
    backgroundColor: RavenLight.accent,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  webBtnText: { color: Colors.WHITE, fontWeight: '700', fontSize: 15 },
});
