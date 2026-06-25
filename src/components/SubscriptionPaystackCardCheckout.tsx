import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { isPaystackCheckoutCompleteUrl, extractPaystackReferenceFromUrl } from '../services/paystack';

const CHECKOUT_HEIGHT = 420;
/** Crop the Paystack checkout header (merchant logo bar at top). */
const CHECKOUT_HEADER_CROP = 52;

/** Lightweight — runs once after paint; avoids heavy MutationObserver overhead. */
const HIDE_PAYSTACK_HEADER_JS = `
(function () {
  var style = document.getElementById('sw-hide-paystack-brand');
  if (!style) {
    style = document.createElement('style');
    style.id = 'sw-hide-paystack-brand';
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = 'header, header img, header a, [class*="logo" i] { display: none !important; height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; }';
})();
true;
`;

type Props = {
  authorizationUrl?: string | null;
  reference?: string;
  preparing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onPaymentRedirect: (reference: string) => void;
};

export const SubscriptionPaystackCardCheckout: React.FC<Props> = ({
  authorizationUrl,
  reference = '',
  preparing = false,
  error,
  onRetry,
  onPaymentRedirect,
}) => {
  const { t } = useTranslation();
  const [webLoading, setWebLoading] = useState(Boolean(authorizationUrl));
  const completedRef = useRef(false);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    completedRef.current = false;
    setWebLoading(Boolean(authorizationUrl));
  }, [authorizationUrl]);

  const injectHideBranding = useCallback(() => {
    webViewRef.current?.injectJavaScript(HIDE_PAYSTACK_HEADER_JS);
  }, []);

  const dismissWebLoading = useCallback(() => {
    setWebLoading(false);
    injectHideBranding();
  }, [injectHideBranding]);

  const handleNavigation = useCallback(
    (nav: WebViewNavigation) => {
      if (completedRef.current || !reference) return;
      const url = nav.url || '';
      if (!isPaystackCheckoutCompleteUrl(url)) return;

      completedRef.current = true;
      const refFromUrl = extractPaystackReferenceFromUrl(url) || reference;
      onPaymentRedirect(refFromUrl);
    },
    [onPaymentRedirect, reference]
  );

  const showFrameSpinner = preparing || error || !authorizationUrl;
  const showWebSpinner = Boolean(authorizationUrl) && webLoading && !error;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webFallback}>
        <Text style={styles.webFallbackText}>{t('subscriptionPage.cardWebUnavailable')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('subscriptionPage.cardFormLabel')}</Text>
      <Text style={styles.hint}>{t('subscriptionPage.cardFormHint')}</Text>
      <View style={styles.frame}>
        {showFrameSpinner ? (
          <View style={styles.loadingOverlay}>
            {error ? (
              <>
                <Ionicons name="alert-circle-outline" size={28} color={Colors.ERROR} />
                <Text style={styles.errorText}>{error}</Text>
                {onRetry ? (
                  <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.8}>
                    <Text style={styles.retryText}>{t('subscriptionPage.cardRetry')}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={Colors.WINE} />
                <Text style={styles.loadingText}>
                  {preparing ? t('subscriptionPage.cardPreparing') : t('subscriptionPage.cardLoading')}
                </Text>
              </>
            )}
          </View>
        ) : null}

        {authorizationUrl && !error ? (
          <>
            {showWebSpinner ? (
              <View style={styles.webLoadingBar}>
                <ActivityIndicator size="small" color={Colors.WINE} />
              </View>
            ) : null}
            <WebView
              ref={webViewRef}
              source={{ uri: authorizationUrl }}
              onLoadProgress={({ nativeEvent }) => {
                if (nativeEvent.progress >= 0.65) {
                  dismissWebLoading();
                }
              }}
              onLoadEnd={dismissWebLoading}
              onNavigationStateChange={(nav) => {
                handleNavigation(nav);
              }}
              injectedJavaScript={HIDE_PAYSTACK_HEADER_JS}
              onShouldStartLoadWithRequest={(req) => {
                if (completedRef.current) return false;
                if (isPaystackCheckoutCompleteUrl(req.url)) {
                  handleNavigation({ url: req.url } as WebViewNavigation);
                  return false;
                }
                return true;
              }}
              javaScriptEnabled
              domStorageEnabled
              cacheEnabled
              sharedCookiesEnabled
              nestedScrollEnabled
              setSupportMultipleWindows={false}
              originWhitelist={['https://*']}
              style={styles.webview}
              onError={() => dismissWebLoading()}
              onHttpError={() => dismissWebLoading()}
            />
          </>
        ) : null}
      </View>
      <View style={styles.secureRow}>
        <Ionicons name="lock-closed" size={14} color={Colors.TEXT_SECONDARY} />
        <Text style={styles.secureText}>{t('subscriptionPage.cardSecureNote')}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.BLACK,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 17,
    marginBottom: 10,
  },
  frame: {
    height: CHECKOUT_HEIGHT,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.WHITE,
  },
  webview: {
    height: CHECKOUT_HEIGHT + CHECKOUT_HEADER_CROP,
    marginTop: -CHECKOUT_HEADER_CROP,
    backgroundColor: Colors.WHITE,
    opacity: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.WHITE,
    zIndex: 2,
    gap: 10,
    paddingHorizontal: 20,
  },
  webLoadingBar: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 6,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  secureText: {
    flex: 1,
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 16,
  },
  errorText: {
    fontSize: 14,
    color: Colors.ERROR,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: Colors.WINE,
  },
  retryText: {
    color: Colors.WHITE,
    fontSize: 15,
    fontWeight: '600',
  },
  webFallback: {
    padding: 16,
  },
  webFallbackText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 20,
  },
});
