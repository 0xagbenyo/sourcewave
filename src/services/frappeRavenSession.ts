/**
 * Cookie-based Frappe session for Raven-only HTTP calls.
 * After password `login()`, we capture `Set-Cookie` and send `Cookie` on Raven requests so
 * `send_message` etc. run as the logged-in user (same as Raven web). Falls back to API-key
 * `getERPNextClient()` when no session cookies were captured (e.g. RN stripped Set-Cookie).
 * Cookie requests send `X-Frappe-CSRF-Token` when a `csrf_token` cookie is present (required for `/api/resource` POST).
 *
 * Resource helpers (`ravenCreateResourceDoc`, `ravenGetResourceDoc`, `ravenCallFrappeMethod`)
 * use the same session so Supplier Quotation create/submit/reject (`set_value`) run as the session user when available.
 */
import axios, { AxiosHeaders, AxiosInstance } from 'axios';
import { getERPNextClient, postFormDataMultipartWithSlidingIdle } from './erpnext';

const API_RESOURCE = '/api/resource';

const RAVEN_SESSION_TIMEOUT = process.env.EXPO_PUBLIC_ERPNEXT_TIMEOUT
  ? parseInt(process.env.EXPO_PUBLIC_ERPNEXT_TIMEOUT, 10)
  : 45000;

let sessionAxios: AxiosInstance | null = null;

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

export function establishFrappeRavenSessionFromLoginResponses(
  baseUrl: string,
  ...headerSources: Array<Record<string, unknown> | undefined>
): void {
  const pairs = collectSetCookiePairs(headerSources);
  if (pairs.size === 0) {
    sessionAxios = null;
    console.warn(
      '[frappeRavenSession] No Set-Cookie from login; Raven will use API key (messages may appear as the integration user).'
    );
    return;
  }
  const cookieHeader = [...pairs.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  /** Frappe rejects many cookie-authenticated POSTs with 403 unless this header matches the `csrf_token` cookie. */
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
    baseURL: baseUrl.replace(/\/+$/, ''),
    timeout: RAVEN_SESSION_TIMEOUT,
    headers,
  });
  // Same as ERPNextClient: RN is not "standard browser" for axios, so FormData posts keep
  // default Content-Type: application/json unless we strip it (multipart breaks → Network Error).
  sessionAxios.interceptors.request.use((config) => {
    const data = config.data as unknown;
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      const h = AxiosHeaders.from(config.headers);
      h.delete('Content-Type');
      config.headers = h;
    }
    return config;
  });
}

export function clearFrappeRavenSession(): void {
  sessionAxios = null;
}

export function hasFrappeRavenSession(): boolean {
  return sessionAxios != null;
}

function responseBodyLooksLikeHtml(data: unknown, ct: string | undefined): boolean {
  if (typeof data === 'string' && data.trim().startsWith('<')) return true;
  if (ct && ct.includes('text/html')) return true;
  return false;
}

function htmlInsteadOfJsonError(label: string): Error {
  return new Error(`Unexpected HTML response instead of JSON (${label}). Session may have expired.`);
}

export async function ravenCallFrappeMethod(method: string, kwargs: Record<string, unknown> = {}): Promise<any> {
  if (sessionAxios) {
    const response = await sessionAxios.post(`/api/method/${method}`, kwargs);
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
    const response = await sessionAxios.post(`${API_RESOURCE}/${encodeURIComponent(doctype)}`, data);
    const h = response.headers;
    const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
    if (responseBodyLooksLikeHtml(response.data, ct)) {
      throw htmlInsteadOfJsonError(`POST ${API_RESOURCE}/${doctype}`);
    }
    return response.data?.data ?? response.data;
  }
  return getERPNextClient().createResourceDoc(doctype, data);
}

/** GET `/api/resource/{doctype}/{name}` as the logged-in Frappe user (session cookie). */
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

/**
 * GET file bytes using session cookie when established, else API-key Basic auth (same as JSON `/api`).
 */
export async function ravenFetchBinary(absoluteUrl: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const url = absoluteUrl.trim();
  if (sessionAxios) {
    const response = await sessionAxios.get(url, {
      responseType: 'arraybuffer',
      headers: { Accept: '*/*' },
    });
    const ct = String(
      response.headers['content-type'] || response.headers['Content-Type'] || 'application/octet-stream'
    );
    return { data: response.data as ArrayBuffer, contentType: ct };
  }
  return getERPNextClient().fetchBinaryWithAuth(url);
}
