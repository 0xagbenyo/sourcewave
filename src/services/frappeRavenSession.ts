/**
 * Cookie-based Frappe session for Raven / portal writes.
 * After password `login()`, we reuse the same axios client (Android keeps cookies in OkHttp)
 * and mirror `Set-Cookie` into SecureStore when headers are available.
 */
import axios, { AxiosHeaders, AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { getERPNextClient, postFormDataMultipartWithSlidingIdle } from './erpnext';
import { logFrappeHttpError, parseFrappeResponseData } from '../utils/frappeHttpError';

const API_RESOURCE = '/api/resource';
const SESSION_COOKIES_KEY = 'frappe_session_cookies_v1';

const RAVEN_SESSION_TIMEOUT = process.env.EXPO_PUBLIC_ERPNEXT_TIMEOUT
  ? parseInt(process.env.EXPO_PUBLIC_ERPNEXT_TIMEOUT, 10)
  : 45000;

let sessionAxios: AxiosInstance | null = null;
let sessionBaseUrl: string | null = null;
let sessionCookiePairs = new Map<string, string>();
/** True when `sessionAxios` is the post-login client (OkHttp cookie jar); do not override with manual Cookie headers. */
let sessionUsesAdoptedClient = false;

function currentCsrfHeader(): string {
  const common = sessionAxios?.defaults.headers.common as Record<string, string> | undefined;
  const fromHeader = String(common?.['X-Frappe-CSRF-Token'] ?? '').trim();
  if (fromHeader) return fromHeader;
  return String(sessionCookiePairs.get('csrf_token') ?? sessionCookiePairs.get('csrf') ?? '').trim();
}

async function probeFrappeSessionAlive(): Promise<boolean> {
  if (!sessionAxios) return false;
  try {
    const res = await sessionAxios.get('/api/method/frappe.auth.get_logged_user', {
      headers: { 'X-Frappe-CSRF-Token': '' },
    });
    const u = res.data?.message;
    return typeof u === 'string' ? u.trim().length > 0 : u != null;
  } catch {
    return false;
  }
}

function collectSetCookiePairs(headerSources: Array<Record<string, unknown> | undefined>): Map<string, string> {
  const map = new Map<string, string>();
  for (const headers of headerSources) {
    if (!headers) continue;
    const raw = headers['set-cookie'] ?? headers['Set-Cookie'];
    if (raw == null) continue;
    const lines = Array.isArray(raw) ? raw : [String(raw)];
    for (const line of lines) {
      const first = String(line).split(';')[0].trim();
      const eq = first.indexOf('=');
      if (eq <= 0) continue;
      const name = first.slice(0, eq);
      const value = first.slice(eq + 1);
      if (name) map.set(name, value);
    }
  }
  return map;
}

function mergeSessionCookiePairs(incoming: Map<string, string>): void {
  for (const [k, v] of incoming) {
    if (k && v) sessionCookiePairs.set(k, v);
  }
}

async function persistSessionCookiesToStore(): Promise<void> {
  try {
    if (sessionCookiePairs.size === 0) {
      await SecureStore.deleteItemAsync(SESSION_COOKIES_KEY);
      return;
    }
    const obj = Object.fromEntries(sessionCookiePairs);
    await SecureStore.setItemAsync(SESSION_COOKIES_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn('[frappeRavenSession] persist cookies failed', e);
  }
}

async function loadSessionCookiesFromStore(): Promise<Map<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_COOKIES_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string>;
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(parsed || {})) {
      const key = String(k || '').trim();
      const val = String(v ?? '').trim();
      if (key && val) map.set(key, val);
    }
    return map;
  } catch {
    return new Map();
  }
}

function extractCsrfFromResponseHeaders(headers: Record<string, unknown> | undefined): string | null {
  if (!headers) return null;
  const direct =
    headers['x-frappe-csrf-token'] ??
    headers['X-Frappe-CSRF-Token'] ??
    headers['X-Frappe-Csrf-Token'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const fromCookies = collectSetCookiePairs([headers]);
  const cookie = fromCookies.get('csrf_token') || fromCookies.get('csrf');
  return cookie?.trim() || null;
}

function isCsrfMethodBlockedError(e: unknown): boolean {
  const msg = parseFrappeResponseData((e as { response?: { data?: unknown } })?.response?.data) || '';
  return /get_csrf_token/i.test(msg) && /not whitelisted|not permitted/i.test(msg);
}

function attachSessionInterceptors(client: AxiosInstance): void {
  const tagged = client as AxiosInstance & { __frappeSessionInterceptors?: boolean };
  if (tagged.__frappeSessionInterceptors) return;
  tagged.__frappeSessionInterceptors = true;

  client.interceptors.request.use((config) => {
    const h = AxiosHeaders.from(config.headers);
    if (sessionCookiePairs.size > 0) {
      const cookieHeader = [...sessionCookiePairs.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      h.set('Cookie', cookieHeader);
    }
    const csrf = currentCsrfHeader();
    if (csrf) {
      h.set('X-Frappe-CSRF-Token', csrf);
    }
    config.headers = h;
    return config;
  });

  client.interceptors.response.use((res) => {
    mergeSessionCookiePairs(collectSetCookiePairs([res.headers as Record<string, unknown>]));
    const csrf = extractCsrfFromResponseHeaders(res.headers as Record<string, unknown>);
    if (csrf) {
      applyCsrfTokenToSession(csrf);
      void persistSessionCookiesToStore();
    }
    return res;
  });
}

async function bootstrapCsrfFromSessionProbe(): Promise<boolean> {
  if (!sessionAxios) return false;
  if (currentCsrfHeader()) return true;
  try {
    const res = await sessionAxios.get('/api/method/frappe.auth.get_logged_user');
    mergeSessionCookiePairs(collectSetCookiePairs([res.headers as Record<string, unknown>]));
    const csrf = extractCsrfFromResponseHeaders(res.headers as Record<string, unknown>);
    if (csrf) {
      applyCsrfTokenToSession(csrf);
      await persistSessionCookiesToStore();
      return true;
    }
    const fromCookie = sessionCookiePairs.get('csrf_token') || sessionCookiePairs.get('csrf');
    if (fromCookie?.trim()) {
      applyCsrfTokenToSession(fromCookie);
      await persistSessionCookiesToStore();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function attachFormDataInterceptor(client: AxiosInstance): void {
  if ((client as AxiosInstance & { __frappeFormInterceptor?: boolean }).__frappeFormInterceptor) return;
  client.interceptors.request.use((config) => {
    const data = config.data as unknown;
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      const h = AxiosHeaders.from(config.headers);
      h.delete('Content-Type');
      config.headers = h;
    }
    return config;
  });
  (client as AxiosInstance & { __frappeFormInterceptor?: boolean }).__frappeFormInterceptor = true;
}

function rebuildSessionAxios(baseUrl: string, pairs: Map<string, string>): void {
  if (pairs.size === 0) {
    sessionAxios = null;
    sessionBaseUrl = null;
    sessionUsesAdoptedClient = false;
    return;
  }
  sessionUsesAdoptedClient = false;
  sessionBaseUrl = baseUrl.replace(/\/+$/, '');
  const cookieHeader = [...pairs.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const csrfToken = pairs.get('csrf_token') || pairs.get('csrf') || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Cookie: cookieHeader,
  };
  if (csrfToken) {
    headers['X-Frappe-CSRF-Token'] = csrfToken;
  }
  sessionAxios = axios.create({
    baseURL: sessionBaseUrl,
    timeout: RAVEN_SESSION_TIMEOUT,
    headers,
    withCredentials: true,
  });
  attachFormDataInterceptor(sessionAxios);
  attachSessionInterceptors(sessionAxios);
}

function applyCsrfTokenToSession(token: string): void {
  const t = token.trim();
  if (!t) return;
  sessionCookiePairs.set('csrf_token', t);
  if (sessionAxios) {
    sessionAxios.defaults.headers.common['X-Frappe-CSRF-Token'] = t;
    const h = sessionAxios.defaults.headers as Record<string, string>;
    if (h) h['X-Frappe-CSRF-Token'] = t;
  }
}

/** Apply CSRF from login `get_csrf_token` body when Set-Cookie headers are unavailable (Android). */
export function applyFrappeSessionCsrfToken(token: string): void {
  applyCsrfTokenToSession(token);
  void persistSessionCookiesToStore();
}

/**
 * After password login: keep the login axios instance (Android cookie jar) and merge Set-Cookie headers.
 */
export async function adoptFrappeSessionFromLoginClient(
  baseUrl: string,
  loginClient: AxiosInstance,
  ...headerSources: Array<Record<string, unknown> | undefined>
): Promise<void> {
  // Fresh login — do not merge stale SecureStore cookies into the live client.
  sessionCookiePairs = collectSetCookiePairs(headerSources);
  for (const src of headerSources) {
    const csrf = extractCsrfFromResponseHeaders(src);
    if (csrf) applyCsrfTokenToSession(csrf);
  }

  sessionBaseUrl = baseUrl.replace(/\/+$/, '');
  sessionAxios = loginClient;
  sessionUsesAdoptedClient = true;
  sessionAxios.defaults.baseURL = sessionBaseUrl;
  sessionAxios.defaults.timeout = RAVEN_SESSION_TIMEOUT;
  sessionAxios.defaults.withCredentials = true;
  if (!sessionAxios.defaults.headers.common) {
    sessionAxios.defaults.headers.common = {};
  }
  sessionAxios.defaults.headers.common['Content-Type'] = 'application/json';
  sessionAxios.defaults.headers.common['Accept'] = 'application/json';
  delete sessionAxios.defaults.headers.common['X-Frappe-CSRF-Token'];

  attachFormDataInterceptor(sessionAxios);
  attachSessionInterceptors(sessionAxios);
  await persistSessionCookiesToStore();
  await refreshFrappeRavenSessionCsrf({ quiet: true });
}

export async function refreshFrappeRavenSessionCsrf(opts?: { quiet?: boolean; force?: boolean }): Promise<void> {
  if (!sessionAxios) return;
  if (!opts?.force && currentCsrfHeader()) return;

  const bootstrapped = await bootstrapCsrfFromSessionProbe();
  if (bootstrapped || currentCsrfHeader()) return;

  try {
    const res = await sessionAxios.post('/api/method/frappe.sessions.get_csrf_token', {});
    mergeSessionCookiePairs(collectSetCookiePairs([res.headers as Record<string, unknown>]));
    const token = res.data?.message;
    if (typeof token === 'string' && token.trim()) {
      applyCsrfTokenToSession(token);
      await persistSessionCookiesToStore();
    }
  } catch (e) {
    if (isCsrfMethodBlockedError(e)) {
      if (!opts?.quiet) {
        console.warn(
          '[frappeRavenSession] get_csrf_token blocked on server; using session cookie CSRF when available'
        );
      }
      return;
    }
    if (!opts?.quiet) {
      logFrappeHttpError('frappeRavenSession/csrf', e, getFrappeRavenSessionDebug());
    }
    const alive = await probeFrappeSessionAlive();
    if (!alive && !opts?.quiet) {
      console.warn('[frappeRavenSession] refresh CSRF failed — session expired', e);
      if (!sessionUsesAdoptedClient) {
        sessionAxios = null;
        sessionBaseUrl = null;
        sessionCookiePairs = new Map();
      }
    }
  }
}

async function restoreFrappeRavenSessionFromStore(baseUrl: string): Promise<boolean> {
  const stored = await loadSessionCookiesFromStore();
  if (!stored.has('sid') && !stored.has('user_id')) {
    return false;
  }
  sessionCookiePairs = stored;
  rebuildSessionAxios(baseUrl, sessionCookiePairs);
  return sessionAxios != null;
}

/** Ensure portal-user session + CSRF before workflow / submit POSTs. */
export async function ensureFrappeRavenSessionReady(baseUrl: string): Promise<void> {
  if (!sessionAxios) {
    const ok = await restoreFrappeRavenSessionFromStore(baseUrl);
    if (!ok) {
      throw new Error('Your login session expired. Sign out and sign in again, then retry.');
    }
  }
  if (!(await probeFrappeSessionAlive())) {
    if (!sessionUsesAdoptedClient) {
      const ok = await restoreFrappeRavenSessionFromStore(baseUrl);
      if (!ok || !(await probeFrappeSessionAlive())) {
        throw new Error('Your login session expired. Sign out and sign in again, then retry.');
      }
    } else {
      throw new Error('Your login session expired. Sign out and sign in again, then retry.');
    }
  }
  await refreshFrappeRavenSessionCsrf({ force: !currentCsrfHeader() });
}

/** @deprecated Use {@link adoptFrappeSessionFromLoginClient}. Kept for callers that only have headers. */
export function establishFrappeRavenSessionFromLoginResponses(
  baseUrl: string,
  ...headerSources: Array<Record<string, unknown> | undefined>
): void {
  const incoming = collectSetCookiePairs(headerSources);
  mergeSessionCookiePairs(incoming);
  if (sessionCookiePairs.size === 0) {
    sessionAxios = null;
    sessionBaseUrl = null;
    console.warn(
      '[frappeRavenSession] No Set-Cookie from login; portal writes may use the API integration user.'
    );
    return;
  }
  rebuildSessionAxios(baseUrl, sessionCookiePairs);
  void persistSessionCookiesToStore();
}

export function clearFrappeRavenSession(): void {
  sessionAxios = null;
  sessionBaseUrl = null;
  sessionCookiePairs = new Map();
  sessionUsesAdoptedClient = false;
  void SecureStore.deleteItemAsync(SESSION_COOKIES_KEY).catch(() => {});
}

export function hasFrappeRavenSession(): boolean {
  return sessionAxios != null;
}

/** Debug snapshot for Metro logs when portal writes fail. */
export function getFrappeRavenSessionDebug(): Record<string, unknown> {
  return {
    hasSession: sessionAxios != null,
    adoptedClient: sessionUsesAdoptedClient,
    baseUrl: sessionBaseUrl,
    csrfSet: currentCsrfHeader().length > 0,
    cookieKeys: [...sessionCookiePairs.keys()],
  };
}

function responseBodyLooksLikeHtml(data: unknown, ct: string | undefined): boolean {
  if (typeof data === 'string' && data.trim().startsWith('<')) return true;
  if (ct && ct.includes('text/html')) return true;
  return false;
}

function htmlInsteadOfJsonError(label: string): Error {
  return new Error(`Unexpected HTML response instead of JSON (${label}). Session may have expired.`);
}

function isAxios403(e: unknown): boolean {
  return (e as { response?: { status?: number } })?.response?.status === 403;
}

async function refreshSessionAfter403(): Promise<void> {
  if (!sessionBaseUrl) return;
  await refreshFrappeRavenSessionCsrf({ force: true, quiet: true });
  if (sessionUsesAdoptedClient) return;
  if (await probeFrappeSessionAlive()) return;
  await restoreFrappeRavenSessionFromStore(sessionBaseUrl);
  await refreshFrappeRavenSessionCsrf({ force: true, quiet: true });
}

async function sessionPost(path: string, data?: unknown, retried = false): Promise<any> {
  if (!sessionAxios) throw new Error('No Frappe session');
  if (!currentCsrfHeader()) {
    await bootstrapCsrfFromSessionProbe();
  }
  try {
    return await sessionAxios.post(path, data);
  } catch (e) {
    if (isAxios403(e)) {
      logFrappeHttpError('frappeRavenSession/post', e, {
        path,
        retried,
        session: getFrappeRavenSessionDebug(),
        frappeMessage: parseFrappeResponseData((e as AxiosLike).response?.data),
      });
    }
    if (isAxios403(e) && !retried) {
      await refreshSessionAfter403();
      return sessionPost(path, data, true);
    }
    throw e;
  }
}

type AxiosLike = { response?: { data?: unknown } };

export async function ravenCallFrappeMethod(method: string, kwargs: Record<string, unknown> = {}): Promise<any> {
  if (sessionAxios) {
    const response = await sessionPost(`/api/method/${method}`, kwargs);
    const h = response.headers;
    const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
    if (responseBodyLooksLikeHtml(response.data, ct)) {
      throw htmlInsteadOfJsonError(method);
    }
    return response.data;
  }
  return getERPNextClient().callFrappeMethod(method, kwargs);
}

export async function ravenListResourceRows(
  doctype: string,
  options?: {
    filters?: any[][];
    fields?: string[];
    order_by?: string;
    limit_page_length?: number;
    limit_start?: number;
  }
): Promise<any[]> {
  const params: Record<string, string> = {
    limit_page_length: String(options?.limit_page_length ?? 50),
  };
  if (options?.limit_start != null && options.limit_start > 0) {
    params.limit_start = String(options.limit_start);
  }
  if (options?.filters) params.filters = JSON.stringify(options.filters);
  if (options?.fields) params.fields = JSON.stringify(options.fields);
  if (options?.order_by) params.order_by = options.order_by;

  if (sessionAxios) {
    const response = await sessionAxios.get(`${API_RESOURCE}/${encodeURIComponent(doctype)}`, { params });
    const h = response.headers;
    const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
    if (responseBodyLooksLikeHtml(response.data, ct)) {
      throw htmlInsteadOfJsonError(`${API_RESOURCE}/${doctype}`);
    }
    return response.data?.data || [];
  }
  return getERPNextClient().listResourceRows(doctype, options);
}

export async function ravenCreateResourceDoc(doctype: string, data: Record<string, unknown>): Promise<any> {
  if (sessionAxios) {
    const response = await sessionPost(`${API_RESOURCE}/${encodeURIComponent(doctype)}`, data);
    const h = response.headers;
    const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
    if (responseBodyLooksLikeHtml(response.data, ct)) {
      throw htmlInsteadOfJsonError(`POST ${API_RESOURCE}/${doctype}`);
    }
    return response.data?.data ?? response.data;
  }
  return getERPNextClient().createResourceDoc(doctype, data);
}

export async function ravenGetResourceDoc(doctype: string, name: string): Promise<any> {
  if (!sessionAxios) {
    throw new Error('No Frappe session; use API-key client for resource GET.');
  }
  const n = String(name || '').trim();
  if (!n) throw new Error('Document name required');
  const response = await sessionAxios.get(
    `${API_RESOURCE}/${encodeURIComponent(doctype)}/${encodeURIComponent(n)}`
  );
  const h = response.headers;
  const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
  if (responseBodyLooksLikeHtml(response.data, ct)) {
    throw htmlInsteadOfJsonError(`GET ${API_RESOURCE}/${doctype}/${n}`);
  }
  return response.data?.data ?? null;
}

export async function ravenCallMultipartFrappeMethod(method: string, formData: FormData): Promise<any> {
  if (sessionAxios) {
    console.log('[RavenSessionMultipart]', 'START', { method, hasSession: true });
    const response = await postFormDataMultipartWithSlidingIdle(
      sessionAxios,
      `/api/method/${method}`,
      formData
    );
    const h = response.headers;
    const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
    if (responseBodyLooksLikeHtml(response.data, ct)) {
      throw htmlInsteadOfJsonError(`/api/method/${method}`);
    }
    return response.data;
  }
  console.log('[RavenSessionMultipart]', 'START', { method, hasSession: false, fallback: 'API key client' });
  return getERPNextClient().callMultipartFrappeMethod(method, formData);
}

function binaryResponseLooksLikeAuthFailure(contentType: string, data: ArrayBuffer): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('text/html') || ct.includes('json')) return true;
  if (data.byteLength < 64) return false;
  try {
    const head = new TextDecoder().decode(data.slice(0, 32)).trimStart().toLowerCase();
    return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{');
  } catch {
    return false;
  }
}

export async function ravenFetchBinary(absoluteUrl: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const url = absoluteUrl.trim();
  if (sessionAxios) {
    try {
      const response = await sessionAxios.get(url, {
        responseType: 'arraybuffer',
        headers: { Accept: '*/*' },
      });
      const ct = String(
        response.headers['content-type'] || response.headers['Content-Type'] || 'application/octet-stream'
      );
      const data = response.data as ArrayBuffer;
      if (!binaryResponseLooksLikeAuthFailure(ct, data)) {
        return { data, contentType: ct };
      }
    } catch {
      /* fall through to API-key client */
    }
  }
  return getERPNextClient().fetchBinaryWithAuth(url);
}
