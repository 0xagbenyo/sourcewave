import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Linking, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { getRavenWebUrl, getRavenWorkspaceBaseUrl, ravenUrlHasWorkspaceSegment } from '../config/ravenChat';
import { getERPNextBaseUrl } from '../services/erpnext';
import { getFrappeWebCredentials } from '../services/sessionCredentials';

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const LOG_PREFIX = '[RavenChatWebView]';

type Props = {
  /** Full Raven URL; defaults from `getRavenWebUrl()`. */
  url?: string;
};

/**
 * Inline bridge page: same-origin fetch so session cookies apply, then redirect to Raven.
 * Loading `/` + injectJavaScript often races with redirects/SPA and can miss cookie setup on some WebViews.
 */
function buildFrappeLoginBridgeHtml(
  siteOrigin: string,
  ravenBase: string,
  presetRavenTarget: string,
  usr: string,
  pwd: string
): string {
  const loginUrl = `${siteOrigin.replace(/\/$/, '')}/api/method/login`;
  const workspaceListUrl = `${siteOrigin.replace(/\/$/, '')}/api/method/raven.api.workspaces.get_list`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>
<script>
(function(){
  var loginUrl = ${JSON.stringify(loginUrl)};
  var workspaceListUrl = ${JSON.stringify(workspaceListUrl)};
  var ravenBase = ${JSON.stringify(ravenBase.replace(/\/+$/, ''))};
  var presetRavenTarget = ${JSON.stringify(presetRavenTarget)};
  var usr = ${JSON.stringify(usr)};
  var pwd = ${JSON.stringify(pwd)};
  function send(ev, data) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ source: 'raven_bridge', ev: ev, data: data || {}, t: Date.now() }));
      }
    } catch (e) {
      /* no-op */
    }
  }
  function host(u) {
    try { return new URL(u).host; } catch (e) { return '?'; }
  }
  function summarizeBody(text) {
    try {
      var j = JSON.parse(text);
      var m = j.message;
      var msg =
        typeof m === 'string'
          ? m.slice(0, 280)
          : Array.isArray(m)
            ? JSON.stringify(m).slice(0, 280)
            : m != null
              ? JSON.stringify(m).slice(0, 280)
              : undefined;
      return { message: msg, exc_type: j.exc_type };
    } catch (e) {
      return { parseError: true, length: text ? text.length : 0 };
    }
  }
  async function tryMode(mode, init) {
    send(mode + '_request', {});
    try {
      var r = await fetch(loginUrl, init);
      var text = await r.text();
      send(mode + '_response', { status: r.status, ok: r.ok, body: summarizeBody(text) });
      return r.ok;
    } catch (err) {
      send(mode + '_catch', { error: String(err && err.message ? err.message : err).slice(0, 240) });
      return false;
    }
  }
  function defaultRavenHome() {
    return ravenBase + '/';
  }
  /** Public workspaces for everyone; private only when workspace_member_name is set (same as Raven get_list). */
  function filterWorkspacesByVisibility(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (w) {
      if (!w || !w.name) return false;
      var t = String(w.type == null ? '' : w.type).trim().toLowerCase();
      var hasMember = w.workspace_member_name != null && String(w.workspace_member_name).length > 0;
      if (!t) return true;
      if (t === 'public') return true;
      return hasMember;
    });
  }
  /**
   * Raven returns a default public workspace often named "Raven"; using it yields /raven/Raven/Raven/ which breaks routing.
   * Prefer workspaces the user belongs to, then any workspace whose id is not the literal "Raven".
   */
  function pickWorkspace(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    var withMember = list.filter(function (w) {
      return w && w.workspace_member_name != null && String(w.workspace_member_name).length > 0;
    });
    var pool = withMember.length > 0 ? withMember : list;
    var nonGeneric = pool.filter(function (w) {
      return w && w.name && String(w.name).toLowerCase() !== 'raven';
    });
    if (nonGeneric.length > 0) return nonGeneric[0];
    return pool[0] || null;
  }
  async function resolveRavenTarget() {
    if (presetRavenTarget) {
      send('workspace_skip', { reason: 'url_already_has_workspace', target: presetRavenTarget.slice(0, 200) });
      return presetRavenTarget;
    }
    send('workspace_list_request', {});
    try {
      var wr = await fetch(workspaceListUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: '{}',
        credentials: 'include'
      });
      var wtext = await wr.text();
      send('workspace_list_response', { status: wr.status, ok: wr.ok, body: summarizeBody(wtext) });
      var wjson;
      try {
        wjson = JSON.parse(wtext);
      } catch (pe) {
        send('workspace_parse_error', { length: wtext ? wtext.length : 0 });
        return defaultRavenHome();
      }
      var list = wjson.message;
      if (typeof list === 'string') {
        try {
          list = JSON.parse(list);
        } catch (e) {
          list = null;
        }
      }
      if (!Array.isArray(list)) list = [];
      list = filterWorkspacesByVisibility(list);
      var chosen = pickWorkspace(list);
      if (chosen && chosen.name) {
        var wid = String(chosen.name);
        var target = ravenBase + '/' + wid + '/';
        send('workspace_chosen', { workspace: wid, count: list.length, pickedFrom: list.length });
        return target;
      }
      send('workspace_fallback', { reason: 'empty_list', fallback: defaultRavenHome() });
    } catch (err) {
      send('workspace_catch', { error: String(err && err.message ? err.message : err).slice(0, 240) });
    }
    return defaultRavenHome();
  }
  (async function run() {
    send('bridge_start', { loginHost: host(loginUrl), ravenBaseHost: host(ravenBase + '/') });
    var ok = await tryMode('login_json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ usr: usr, pwd: pwd }),
      credentials: 'include'
    });
    if (!ok) {
      var body = 'usr=' + encodeURIComponent(usr) + '&pwd=' + encodeURIComponent(pwd);
      await tryMode('login_form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: body,
        credentials: 'include'
      });
    }
    var target = await resolveRavenTarget();
    send('redirect_raven', { ravenHost: host(target), path: (function(){ try { return new URL(target).pathname; } catch (e) { return '?'; }})() });
    window.location.replace(target);
  })().catch(function (err) {
    send('bridge_fatal', { error: String(err && err.message ? err.message : err).slice(0, 240) });
    try {
      window.location.replace(presetRavenTarget || defaultRavenHome());
    } catch (e2) { /* no-op */ }
  });
})();
</script></body></html>`;
}

/**
 * Opens Raven in a WebView. If Frappe email/password were saved at login (`sessionCredentials`),
 * loads a same-origin HTML bridge that POSTs `/api/method/login`, then navigates to Raven so the session applies.
 */
export const RavenChatWebView: React.FC<Props> = ({ url }) => {
  const ravenUri = url?.trim() || getRavenWebUrl();
  const ravenWorkspaceBase = getRavenWorkspaceBaseUrl(ravenUri);
  const presetRavenWithWorkspace = ravenUrlHasWorkspaceSegment(ravenUri) ? ravenUri.trim() : '';
  const siteOrigin = getERPNextBaseUrl().replace(/\/$/, '');

  const [booting, setBooting] = useState(true);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const webSource = useMemo(() => {
    if (creds) {
      const html = buildFrappeLoginBridgeHtml(
        siteOrigin,
        ravenWorkspaceBase,
        presetRavenWithWorkspace,
        creds.email,
        creds.password
      );
      return { html, baseUrl: `${siteOrigin}/` };
    }
    return { uri: ravenUri };
  }, [creds, siteOrigin, ravenUri, ravenWorkspaceBase, presetRavenWithWorkspace]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await getFrappeWebCredentials();
      if (!cancelled) {
        if (__DEV__) {
          console.log(LOG_PREFIX, 'initial credentials', {
            present: !!c,
            ravenHost: (() => {
              try {
                return new URL(ravenUri).host;
              } catch {
                return '?';
              }
            })(),
            siteHost: (() => {
              try {
                return new URL(siteOrigin).host;
              } catch {
                return '?';
              }
            })(),
          });
        }
        setCreds(c);
        setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ravenUri, siteOrigin]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getFrappeWebCredentials().then((c) => {
        if (alive) {
          if (__DEV__) {
            console.log(LOG_PREFIX, 'focus refresh credentials', { present: !!c });
          }
          setCreds(c);
        }
      });
      return () => {
        alive = false;
      };
    }, [])
  );

  const onBridgeMessage = useCallback((event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    try {
      const o = JSON.parse(raw) as { source?: string; ev?: string; data?: Record<string, unknown> };
      if (o.source !== 'raven_bridge') return;
      const ev = o.ev || 'unknown';
      const line = `${LOG_PREFIX} [bridge:${ev}]`;
      const fatal = ev === 'bridge_fatal' || (typeof ev === 'string' && ev.endsWith('_catch'));
      if (fatal) {
        console.warn(line, o.data ?? {});
      } else {
        console.log(line, o.data ?? {});
      }
      if (
        ev === 'workspace_catch' ||
        ev === 'workspace_fallback' ||
        ev === 'workspace_parse_error'
      ) {
        console.warn(`${LOG_PREFIX} [bridge] workspace resolution`, o.data ?? {});
      }
      if (ev === 'login_json_response' || ev === 'login_form_response') {
        const data = o.data as { body?: { message?: string }; ok?: boolean } | undefined;
        const msg = data?.body?.message;
        if (msg && msg !== 'Logged In' && msg !== 'No App') {
          console.warn(`${LOG_PREFIX} [bridge] Frappe login message`, { message: msg });
        }
      }
    } catch {
      console.warn(`${LOG_PREFIX} [bridge] non-json message`, raw.slice(0, 400));
    }
  }, []);

  const onLoadEnd = useCallback(() => {
    setLoading(false);
  }, []);

  const openInBrowser = () => {
    Linking.openURL(ravenUri).catch(() => {});
  };

  if (booting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.WINE} />
        <Text style={styles.hint}>Preparing chat…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Could not load chat</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity style={styles.browserBtn} onPress={openInBrowser}>
            <Text style={styles.browserBtnText}>Open in browser</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.webWrap}>
          <WebView
            key={creds?.email ?? 'guest'}
            source={webSource}
            style={styles.web}
            userAgent={DESKTOP_CHROME_UA}
            onLoadStart={() => {
              setError(null);
              setLoading(true);
              if (__DEV__) {
                console.log(LOG_PREFIX, 'loadStart', {
                  mode: creds ? 'login_bridge' : 'raven_direct',
                });
              }
            }}
            onLoadEnd={onLoadEnd}
            onNavigationStateChange={(nav) => {
              if (__DEV__) {
                console.log(LOG_PREFIX, 'nav', { url: nav.url?.slice(0, 120), loading: nav.loading });
              }
              if (nav.url.includes('/raven')) {
                setLoading(false);
              }
            }}
            onMessage={onBridgeMessage}
            onHttpError={(e) => {
              const { statusCode, url, description } = e.nativeEvent;
              console.warn(`${LOG_PREFIX} HTTP error`, { statusCode, url: url?.slice(0, 200), description });
            }}
            onRenderProcessGone={(e) => {
              console.warn(`${LOG_PREFIX} render process gone`, e.nativeEvent);
            }}
            onError={(e) => {
              setLoading(false);
              const desc = e.nativeEvent.description || 'WebView error';
              console.warn(`${LOG_PREFIX} WebView error`, {
                desc,
                code: e.nativeEvent.code,
                domain: e.nativeEvent.domain,
              });
              setError(desc);
            }}
            onConsoleMessage={
              __DEV__
                ? (e) => {
                    console.log(`${LOG_PREFIX} [web console]`, e.nativeEvent.message, {
                      level: e.nativeEvent.messageLevel,
                    });
                  }
                : undefined
            }
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            {...(Platform.OS === 'android' ? { mixedContentMode: 'compatibility' as const } : {})}
          />
          {loading ? (
            <View style={styles.overlay}>
              <ActivityIndicator size="large" color={Colors.WINE} />
              <Text style={styles.overlayHint}>{creds ? 'Signing in…' : 'Loading…'}</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.BACKGROUND },
  webWrap: { flex: 1 },
  web: { flex: 1, backgroundColor: Colors.WHITE },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  overlayHint: { marginTop: Spacing.SM, fontSize: 14, color: Colors.TEXT_SECONDARY },
  centered: {
    flex: 1,
    padding: Spacing.LG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { marginTop: Spacing.SM, fontSize: 14, color: Colors.TEXT_SECONDARY },
  errorTitle: { fontSize: 17, fontWeight: '800', color: Colors.BLACK, marginBottom: 8 },
  errorBody: { fontSize: 14, color: Colors.TEXT_SECONDARY, textAlign: 'center' },
  browserBtn: {
    marginTop: Spacing.LG,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.WINE,
  },
  browserBtnText: { color: Colors.WHITE, fontWeight: '700', fontSize: 15 },
});
