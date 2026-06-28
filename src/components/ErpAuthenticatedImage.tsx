import React, { useEffect, useMemo, useState } from 'react';
import { Image, type ImageContentFit, type ImageErrorEventData, type ImageLoadEventData } from 'expo-image';
import { ActivityIndicator, View, type StyleProp, type ImageStyle } from 'react-native';
import { buildAuthenticatedErpImageSource } from '../utils/erpImageUrl';
import { fetchErpSiteFileAsDataUri, getERPNextAuthorizationHeader } from '../services/erpnext';
import { hasFrappeRavenSession } from '../services/frappeRavenSession';

type ResizeMode = 'cover' | 'contain' | 'stretch' | 'center' | 'repeat';

const fitMap: Record<ResizeMode, ImageContentFit> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'contain',
  repeat: 'cover',
};

export type ErpAuthenticatedImageProps = {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ResizeMode;
  onError?: (event: ImageErrorEventData) => void;
  /** Fires when pixels are decoded; includes intrinsic pixel size (expo-image). */
  onLoad?: (dims: { width: number; height: number }) => void;
};

/**
 * Loads catalog images from your connected site.
 *
 * - **Default (iOS, or unauthenticated public URLs)**: expo-image with optional Basic auth headers.
 * - **Binary path (`data:` URI)**: `/private/files/` everywhere, and on **Android** any same-site `/files/` URL
 *   when we need auth (Basic header or cookie session only) — native image loaders often ignore `headers`
 *   and never send cookies, so previews would stay blank.
 */
export const ErpAuthenticatedImage: React.FC<ErpAuthenticatedImageProps> = ({
  uri,
  style,
  resizeMode = 'cover',
  onError,
  onLoad,
}) => {
  const handleLoad = (event: ImageLoadEventData) => {
    const w = event.source?.width;
    const h = event.source?.height;
    if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
      onLoad?.({ width: w, height: h });
    }
  };
  const src = useMemo(() => buildAuthenticatedErpImageSource(uri), [uri]);

  const useBinaryFetchPath = useMemo(() => {
    if (!src?.uri) return false;
    const low = src.uri.toLowerCase();
    if (!low.includes('/files/')) return false;
    // Native image loaders often ignore `headers` (iOS + Android) and never send session cookies.
    if (low.includes('/private/files/')) return true;
    if (src.headers?.Authorization) return true;
    let auth: string | undefined;
    try {
      auth = getERPNextAuthorizationHeader();
    } catch {
      auth = undefined;
    }
    return hasFrappeRavenSession() && !auth;
  }, [src?.uri, src?.headers]);

  const [dataUri, setDataUri] = useState<string | null>(null);
  const [binaryFetch, setBinaryFetch] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!src?.uri || !useBinaryFetchPath) {
      setDataUri(null);
      setBinaryFetch('idle');
      return;
    }
    let cancelled = false;
    setBinaryFetch('loading');
    setDataUri(null);
    void fetchErpSiteFileAsDataUri(src.uri)
      .then((d) => {
        if (cancelled) return;
        if (d) {
          setDataUri(d);
          setBinaryFetch('done');
        } else {
          setBinaryFetch('error');
          onError?.({
            error: 'Could not load this file. Try signing in again.',
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setBinaryFetch('error');
        onError?.({ error: 'File request failed.' });
      });
    return () => {
      cancelled = true;
    };
  }, [src?.uri, useBinaryFetchPath]);

  if (!src?.uri) {
    return null;
  }

  const contentFit = fitMap[resizeMode] ?? 'cover';

  if (useBinaryFetchPath) {
    if (binaryFetch === 'done' && dataUri) {
      return (
        <Image
          source={{ uri: dataUri }}
          style={style}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          onLoad={handleLoad}
        />
      );
    }
    if (binaryFetch === 'error') {
      return null;
    }
    return (
      <View style={style}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Image
      source={src.headers ? { uri: src.uri, headers: src.headers } : { uri: src.uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      onError={onError}
      onLoad={handleLoad}
    />
  );
};
