import React, { useEffect, useMemo, useState } from 'react';
import { Image, type ImageContentFit, type ImageErrorEventData, type ImageLoadEventData } from 'expo-image';
import { ActivityIndicator, View, type StyleProp, type ImageStyle } from 'react-native';
import { buildAuthenticatedErpImageSource } from '../utils/erpImageUrl';
import { fetchErpSiteFileAsDataUri } from '../services/erpnext';

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
 * - **Public `/files/` URLs**: expo-image with optional Basic auth headers.
 * - **`/private/files/`**: load with the same axios client as `/api` (Basic auth) and show a `data:` URI.
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
  const isPrivateSiteFile = useMemo(() => {
    if (!src?.uri) return false;
    return src.uri.toLowerCase().includes('/private/files/');
  }, [src?.uri]);

  const [dataUri, setDataUri] = useState<string | null>(null);
  const [privateFetch, setPrivateFetch] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!src?.uri || !isPrivateSiteFile) {
      setDataUri(null);
      setPrivateFetch('idle');
      return;
    }
    let cancelled = false;
    setPrivateFetch('loading');
    setDataUri(null);
    void fetchErpSiteFileAsDataUri(src.uri)
      .then((d) => {
        if (cancelled) return;
        if (d) {
          setDataUri(d);
          setPrivateFetch('done');
        } else {
          setPrivateFetch('error');
          onError?.({
            error: 'Could not load private file (API user needs File read permission, or use public files).',
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPrivateFetch('error');
        onError?.({ error: 'Private file request failed.' });
      });
    return () => {
      cancelled = true;
    };
  }, [src?.uri, isPrivateSiteFile]);

  if (!src?.uri) {
    return null;
  }

  const contentFit = fitMap[resizeMode] ?? 'cover';

  if (isPrivateSiteFile) {
    if (privateFetch === 'done' && dataUri) {
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
    if (privateFetch === 'error') {
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
