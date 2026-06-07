import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { buildAuthenticatedErpImageSource } from '../utils/erpImageUrl';
import { fetchAuthenticatedUriAsBase64 } from '../utils/fetchAuthenticatedUriAsBase64';

type Props = {
  /** Absolute ERP URL or path that {@link buildAuthenticatedErpImageSource} understands. */
  resourceUri: string;
  style?: object;
};

/**
 * Android: remote PDF URLs often download instead of rendering, and `data:` PDF iframes often paint **black**
 * in WebView. We download to the app cache with the same auth and load `file://…` (reliable inline preview).
 * iOS: direct `uri` + headers.
 */
export const ErpAuthenticatedPdfWebView: React.FC<Props> = ({ resourceUri, style }) => {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'file' | 'html' | 'direct' | 'err'>(
    Platform.OS === 'android' ? 'loading' : 'direct'
  );
  const [localFileUri, setLocalFileUri] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const localFileRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setPhase('direct');
      return;
    }
    let cancelled = false;
    const uri = resourceUri.trim();
    if (!uri) {
      setPhase('err');
      return;
    }

    const prev = localFileRef.current;
    if (prev?.startsWith('file')) {
      void FileSystem.deleteAsync(prev, { idempotent: true }).catch(() => {});
      localFileRef.current = null;
    }

    setPhase('loading');
    setLocalFileUri(null);
    setHtml(null);

    (async () => {
      try {
        const src = buildAuthenticatedErpImageSource(uri);
        if (!src?.uri) throw new Error('Invalid URL');
        const base = FileSystem.cacheDirectory;
        if (!base) throw new Error('No cache directory');

        const path = `${base}erp-pdf-preview-${Date.now()}.pdf`;
        const result = await FileSystem.downloadAsync(src.uri, path, {
          headers: src.headers as Record<string, string> | undefined,
        });
        if (cancelled) {
          void FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
          return;
        }
        if (result.status < 200 || result.status >= 400) {
          throw new Error(`HTTP ${result.status}`);
        }
        localFileRef.current = result.uri;
        setLocalFileUri(result.uri);
        setPhase('file');
      } catch {
        if (cancelled) return;
        try {
          const b64 = await fetchAuthenticatedUriAsBase64(uri);
          if (cancelled) return;
          const h = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5"/><style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#fff}</style></head><body><embed type="application/pdf" width="100%" height="100%" style="position:fixed;left:0;top:0;right:0;bottom:0;border:0" src="data:application/pdf;base64,${b64}"/></body></html>`;
          setHtml(h);
          setPhase('html');
        } catch {
          if (!cancelled) setPhase('err');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resourceUri]);

  useEffect(
    () => () => {
      const p = localFileRef.current;
      if (p?.startsWith('file')) {
        void FileSystem.deleteAsync(p, { idempotent: true }).catch(() => {});
        localFileRef.current = null;
      }
    },
    []
  );

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

  if (phase === 'file' && localFileUri) {
    return (
      <WebView
        source={{ uri: localFileUri }}
        style={webStyle}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        androidLayerType="hardware"
      />
    );
  }

  if (phase === 'html' && html) {
    return (
      <WebView
        source={{ html, baseUrl: 'about:blank' }}
        style={webStyle}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        allowFileAccess
        androidLayerType="hardware"
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
