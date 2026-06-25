import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { buildAuthenticatedErpImageSource } from '../utils/erpImageUrl';
import { fetchAuthenticatedUriAsBase64 } from '../utils/fetchAuthenticatedUriAsBase64';
import { guessMimeTypeForExtension } from '../utils/ravenDownloadAttachment';

type Props = {
  /** Absolute ERP URL or path that {@link buildAuthenticatedErpImageSource} understands. */
  resourceUri: string;
  /** Original file name — used for extension when caching on Android. */
  fileName: string;
  style?: object;
};

function fileExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ext || 'bin';
}

function isImageExt(ext: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'].includes(ext);
}

function isTextLikeExt(ext: string): boolean {
  return ['txt', 'csv', 'json', 'xml', 'html', 'htm', 'md', 'log'].includes(ext);
}

function safeCacheName(fileName: string): string {
  const base = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file';
  return base.includes('.') ? base : `${base}.bin`;
}

/**
 * Android: remote ERP file URLs often fail in WebView (auth headers ignored or file downloads).
 * Download to cache with the same auth, then load `file://…` in WebView.
 * iOS: direct authenticated `uri` + headers (same as before).
 */
export const ErpAuthenticatedCachedFileWebView: React.FC<Props> = ({ resourceUri, fileName, style }) => {
  const ext = fileExtension(fileName);
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

        const path = `${base}erp-file-preview-${Date.now()}-${safeCacheName(fileName)}`;
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

        if (isImageExt(ext)) {
          const imgHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5"/><style>html,body{margin:0;padding:0;height:100%;background:#fff;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body><img src="${result.uri}" alt=""/></body></html>`;
          setHtml(imgHtml);
          setPhase('html');
          return;
        }

        setPhase('file');
      } catch {
        if (cancelled) return;
        try {
          const b64 = await fetchAuthenticatedUriAsBase64(uri);
          if (cancelled) return;
          const mime = guessMimeTypeForExtension(ext);
          if (ext === 'pdf') {
            const h = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5"/><style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#fff}</style></head><body><embed type="application/pdf" width="100%" height="100%" style="position:fixed;left:0;top:0;right:0;bottom:0;border:0" src="data:application/pdf;base64,${b64}"/></body></html>`;
            setHtml(h);
          } else if (isImageExt(ext)) {
            const h = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5"/><style>html,body{margin:0;padding:0;height:100%;background:#fff;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body><img src="data:${mime};base64,${b64}" alt=""/></body></html>`;
            setHtml(h);
          } else if (isTextLikeExt(ext)) {
            const decoded = atob(b64);
            const escaped = decoded
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            const h = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><style>body{margin:12px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;background:#fff;color:#111}</style></head><body>${escaped}</body></html>`;
            setHtml(h);
          } else {
            throw new Error('unsupported');
          }
          setPhase('html');
        } catch {
          if (!cancelled) setPhase('err');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resourceUri, fileName, ext]);

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
        <Text style={styles.err}>Could not load file preview.</Text>
        <Text style={styles.hint}>Use Browser in the toolbar to open this file.</Text>
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
        source={{ html, baseUrl: localFileUri || 'about:blank' }}
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
