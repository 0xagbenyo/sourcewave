import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildAuthenticatedErpImageSource } from '../utils/erpImageUrl';
import { fetchAuthenticatedPdfBase64 } from '../utils/fetchAuthenticatedPdfBase64';
import { buildPdfJsViewerHtml } from '../utils/pdfJsViewerHtml';

type Props = {
  /** Absolute ERP URL or path that {@link buildAuthenticatedErpImageSource} understands. */
  resourceUri: string;
  style?: object;
};

const androidPdfWebViewProps = {
  originWhitelist: ['*'] as string[],
  javaScriptEnabled: true,
  domStorageEnabled: true,
  mixedContentMode: 'always' as const,
  setSupportMultipleWindows: false,
  allowFileAccess: true,
  androidLayerType: 'software' as const,
  cacheEnabled: true,
  thirdPartyCookiesEnabled: true,
};

/**
 * Android WebView cannot render PDFs via `file://` or `<embed data:…>` (blank/black screen).
 * We fetch the PDF with ERP auth and paint pages with PDF.js in a WebView.
 * iOS: direct authenticated `uri` + headers (native PDF support).
 */
export const ErpAuthenticatedPdfWebView: React.FC<Props> = ({ resourceUri, style }) => {
  const [phase, setPhase] = useState<'loading' | 'html' | 'direct' | 'err'>(
    Platform.OS === 'android' ? 'loading' : 'direct'
  );
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setPhase('direct');
      setHtml(null);
      return;
    }

    let cancelled = false;
    const uri = resourceUri.trim();
    if (!uri) {
      setPhase('err');
      setHtml(null);
      return;
    }

    setPhase('loading');
    setHtml(null);

    void (async () => {
      try {
        const b64 = await fetchAuthenticatedPdfBase64(uri);
        if (cancelled) return;
        setHtml(buildPdfJsViewerHtml(b64));
        setPhase('html');
      } catch {
        if (!cancelled) {
          setPhase('err');
          setHtml(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resourceUri]);

  if (phase === 'loading') {
    return (
      <View style={[styles.center, style]}>
        <ActivityIndicator size="large" />
        <Text style={styles.hint}>Loading preview…</Text>
      </View>
    );
  }

  if (phase === 'err') {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.err}>Could not load PDF preview.</Text>
        <Text style={styles.hint}>Use Download or open in browser.</Text>
      </View>
    );
  }

  const webStyle = [style, styles.webBg];

  if (phase === 'html' && html) {
    return (
      <WebView
        source={{ html, baseUrl: 'https://cdnjs.cloudflare.com' }}
        style={webStyle}
        {...androidPdfWebViewProps}
      />
    );
  }

  const src = buildAuthenticatedErpImageSource(resourceUri);
  if (!src?.uri) return null;
  return (
    <WebView
      source={{ uri: src.uri, headers: src.headers as Record<string, string> | undefined }}
      style={webStyle}
      originWhitelist={['*']}
      mixedContentMode="always"
      setSupportMultipleWindows={false}
    />
  );
};

const styles = StyleSheet.create({
  webBg: { backgroundColor: '#fff' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  hint: { marginTop: 10, fontSize: 13, color: '#666', textAlign: 'center' },
  err: { fontSize: 14, fontWeight: '700', color: '#b71c1c', textAlign: 'center' },
});
