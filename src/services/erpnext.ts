/**
 * ERPNext Integration Service
 * 
 * This service handles all communication with ERPNext backend.
 * Supports multi-company setup with shared customers.
 * 
 * For Website Item field reference, see: src/services/websiteItemFields.ts
 * Use getWebsiteItemAllFields() to fetch all fields from a Website Item for reference.
 */

import axios, { AxiosHeaders, AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { Platform } from 'react-native';
import { OTP_PURPOSE_RESET_PASSWORD } from '../constants/otpPurposes';
import type { AppliedSubscriptionPromo } from '../utils/subscriptionPromoCode';
import {
  normalizePromoCode,
  pricingRuleMatchesPromoCode,
  getSubscriptionDiscountFromRule,
  buildAppliedSubscriptionPromo,
  isPricingRuleValidForPromo,
} from '../utils/subscriptionPromoCode';

// Configuration
const ERPNEXT_BASE_URL = process.env.EXPO_PUBLIC_ERPNEXT_URL || 'http://localhost:8000';
const API_VERSION = '/api/resource';

// Default API timeout (JSON / resource calls). Override via EXPO_PUBLIC_ERPNEXT_TIMEOUT.
const FIXED_TIMEOUT = process.env.EXPO_PUBLIC_ERPNEXT_TIMEOUT
  ? parseInt(process.env.EXPO_PUBLIC_ERPNEXT_TIMEOUT, 10)
  : 45000;

/** Fallback ceiling when sliding idle upload is unavailable (no AbortController). */
const MULTIPART_UPLOAD_TIMEOUT = process.env.EXPO_PUBLIC_ERPNEXT_UPLOAD_TIMEOUT
  ? parseInt(process.env.EXPO_PUBLIC_ERPNEXT_UPLOAD_TIMEOUT, 10)
  : 600000;

/** No upload progress for this long → abort (bytes reset this clock). Polled every ~4s. */
const MULTIPART_STALL_MS = process.env.EXPO_PUBLIC_ERPNEXT_UPLOAD_STALL_MS
  ? parseInt(process.env.EXPO_PUBLIC_ERPNEXT_UPLOAD_STALL_MS, 10)
  : 180000;

/** Hard cap from request start (even if upload keeps trickling). */
const MULTIPART_MAX_MS = process.env.EXPO_PUBLIC_ERPNEXT_UPLOAD_MAX_MS
  ? parseInt(process.env.EXPO_PUBLIC_ERPNEXT_UPLOAD_MAX_MS, 10)
  : 1200000;

/** How often to re-fetch NetInfo so retry logic sees fresh connectivity. */
const NETINFO_REFRESH_MS = 5000;

// Network state management for retry logic
let networkState: {
  isConnected: boolean | null;
  networkType: string | null;
} = {
  isConnected: null,
  networkType: null,
};

let networkListener: (() => void) | null = null;
let netInfoPollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Check if network is stable (connected and not slow)
 * Used for retry logic
 */
const isNetworkStable = (): boolean => {
  if (networkState.isConnected === false) {
    return false;
  }
  
  // Consider network stable if connected (regardless of type)
  // We'll retry if network is connected
  return networkState.isConnected === true;
};

/**
 * Initialize network monitoring for retry logic: live listener plus a periodic NetInfo fetch
 * every few seconds so `networkState` stays fresh on devices where events are sparse.
 *
 * Note: Requires @react-native-community/netinfo package
 * Install with: npm install @react-native-community/netinfo
 * If not installed, will assume network is always stable for retries
 */
export const initializeNetworkAwareTimeout = async () => {
  try {
    // Dynamically import NetInfo to avoid issues if not installed
    // Note: @react-native-community/netinfo is optional
    // Install with: npm install @react-native-community/netinfo
    let NetInfo: any = null;
    try {
      // @ts-ignore - NetInfo is optional, handled gracefully if not installed
      NetInfo = await import('@react-native-community/netinfo');
    } catch (importError) {
      console.warn('NetInfo not available. Install with: npm install @react-native-community/netinfo');
      console.warn('Using fixed timeout:', FIXED_TIMEOUT, 'ms');
      // Assume network is stable if NetInfo not available
      networkState = { isConnected: true, networkType: 'unknown' };
      return;
    }
    
    if (!NetInfo || !NetInfo.default) {
      console.warn('NetInfo not available. Using fixed timeout:', FIXED_TIMEOUT);
      networkState = { isConnected: true, networkType: 'unknown' };
      return;
    }

    // Get initial network state
    const state = await NetInfo.default.fetch();
    networkState = {
      networkType: state?.type || null,
      isConnected: state?.isConnected ?? null,
    };
    
    console.log(`Network detected: ${networkState.networkType}, Connected: ${networkState.isConnected}, Timeout: ${FIXED_TIMEOUT}ms`);

    // Listen for network state changes
    networkListener = NetInfo.default.addEventListener((state: any) => {
      const networkType = state?.type || null;
      const isConnected = state?.isConnected ?? null;
      
      const wasConnected = networkState.isConnected;
      networkState = { networkType, isConnected };
      
      if (wasConnected !== isConnected) {
        console.log(`Network changed: ${networkType}, Connected: ${isConnected}`);
      }
    });

    // Periodically refresh reachability (listener alone can miss transient drops on some devices).
    if (netInfoPollTimer) clearInterval(netInfoPollTimer);
    netInfoPollTimer = setInterval(async () => {
      try {
        const s = await NetInfo.default.fetch();
        networkState = {
          networkType: s?.type || null,
          isConnected: s?.isConnected ?? null,
        };
      } catch {
        /* ignore */
      }
    }, NETINFO_REFRESH_MS);
  } catch (error) {
    console.warn('Failed to initialize network monitoring:', error);
    // Assume network is stable for retries
    networkState = { isConnected: true, networkType: 'unknown' };
  }
};

/**
 * Cleanup network listener
 */
export const cleanupNetworkAwareTimeout = () => {
  if (networkListener) {
    networkListener();
    networkListener = null;
  }
  if (netInfoPollTimer) {
    clearInterval(netInfoPollTimer);
    netInfoPollTimer = null;
  }
};

/**
 * Get fixed timeout value (same for all API calls)
 */
export const getCurrentTimeout = (): number => {
  return FIXED_TIMEOUT;
};

export const getMultipartUploadTimeout = (): number => {
  return MULTIPART_UPLOAD_TIMEOUT;
};

const LOG_MULTIPART = '[ERPNextMultipart]';

function logMultipartFailure(
  phase: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const e = error as AxiosError & { cause?: unknown };
  let responsePreview: string | undefined;
  try {
    const d = e?.response?.data as unknown;
    if (typeof d === 'string') responsePreview = d.slice(0, 600);
    else if (d != null && typeof d === 'object') responsePreview = JSON.stringify(d).slice(0, 800);
  } catch {
    responsePreview = '[unserializable]';
  }
  const h = e?.config?.headers;
  let ctSent: unknown;
  if (h && typeof (h as any).get === 'function') {
    ctSent = (h as AxiosHeaders).get('Content-Type');
  } else if (h && typeof h === 'object') {
    ctSent = (h as Record<string, unknown>)['Content-Type'] ?? (h as Record<string, unknown>)['content-type'];
  }
  const payload = {
    phase,
    platform: Platform.OS,
    message: e?.message,
    code: e?.code,
    name: (e as { name?: string })?.name,
    status: e?.response?.status,
    statusText: e?.response?.statusText,
    responsePreview,
    requestUrl: e?.config?.url,
    requestBaseURL: e?.config?.baseURL,
    requestMethod: e?.config?.method,
    requestTimeout: e?.config?.timeout,
    contentTypeHeader: ctSent,
    cause: e?.cause != null ? String(e.cause) : undefined,
    stack: typeof e?.stack === 'string' ? e.stack.slice(0, 1200) : undefined,
    ...extra,
  };
  try {
    console.warn(`${LOG_MULTIPART} FAIL`, JSON.stringify(payload));
  } catch {
    console.warn(LOG_MULTIPART, 'FAIL', payload);
  }
}

/**
 * Hermes / RN FormData often does not pass axios's strict `utils.isFormData` (instanceof),
 * so the default transformRequest treats it as a plain object → wrong Content-Type
 * (`application/x-www-form-urlencoded`) and immediate ERR_NETWORK on Android.
 */
function isLikelyNativeFormData(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;
  if (typeof FormData !== 'undefined' && data instanceof FormData) return true;
  const d = data as { append?: unknown };
  return typeof d.append === 'function';
}

/**
 * Multipart POST with a sliding idle deadline on iOS (and other platforms with reliable AbortController).
 * Android: axios + XMLHttpRequest + `signal` often fails immediately with "Network Error"; use a plain
 * long timeout only (see postFormDataMultipartWithSlidingIdle).
 */
export async function postFormDataMultipartWithSlidingIdle(
  client: AxiosInstance,
  url: string,
  formData: FormData
): Promise<AxiosResponse> {
  const fullUrl = `${(client.defaults.baseURL || '').replace(/\/+$/, '')}${url}`;
  const useSlidingAbort =
    typeof AbortController !== 'undefined' && Platform.OS !== 'android';
  const controller = useSlidingAbort ? new AbortController() : null;
  let lastActivity = Date.now();
  const startedAt = Date.now();
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let lastProgressLog = 0;
  let maxLoaded = 0;

  console.log(LOG_MULTIPART, 'START', {
    platform: Platform.OS,
    url,
    fullUrl,
    slidingIdle: !!controller,
    axiosTimeout: controller ? 0 : MULTIPART_UPLOAD_TIMEOUT,
    stallMs: MULTIPART_STALL_MS,
    maxMs: MULTIPART_MAX_MS,
  });

  if (controller) {
    watchdog = setInterval(() => {
      const now = Date.now();
      if (now - startedAt > MULTIPART_MAX_MS) {
        try {
          controller.abort();
        } catch {
          /* noop */
        }
        return;
      }
      // Allow time for TLS / first byte before stall-only abort (some RN stacks delay progress events).
      const connectGraceMs = 60000;
      if (now - startedAt < connectGraceMs) return;
      if (now - lastActivity > MULTIPART_STALL_MS) {
        try {
          controller.abort();
        } catch {
          /* noop */
        }
      }
    }, 4000);
  }

  try {
    const response = await client.post(url, formData, {
      ...(controller ? { signal: controller.signal as any } : {}),
      timeout: controller ? (0 as any) : MULTIPART_UPLOAD_TIMEOUT,
      /** `false` = omit header; also blocks axios post-transform urlencoded default (dispatchRequest.js). */
      headers: new AxiosHeaders({ 'Content-Type': false }),
      /**
       * Per-request transform replaces axios defaults. RN/Hermes FormData often fails
       * `data instanceof FormData`, so the default serializer sets urlencoded and breaks uploads.
       */
      transformRequest: [
        (data, headers) => {
          if (isLikelyNativeFormData(data) && headers) {
            const h = headers as AxiosHeaders;
            // Deleting Content-Type lets axios inject application/x-www-form-urlencoded on POST
            // after transforms (Android XHR rejects that + FormData). `false` = omit + skip injection.
            h.setContentType(false);
            return data;
          }
          return data;
        },
      ],
      onUploadProgress: (ev: { loaded?: number; total?: number }) => {
        lastActivity = Date.now();
        const loaded = ev?.loaded ?? 0;
        const total = ev?.total;
        if (loaded > maxLoaded) maxLoaded = loaded;
        const now = Date.now();
        if (now - lastProgressLog > 3000) {
          lastProgressLog = now;
          console.log(LOG_MULTIPART, 'progress', { loaded, total, maxLoaded, elapsedMs: now - startedAt });
        }
      },
    });
    console.log(LOG_MULTIPART, 'OK', {
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      maxLoaded,
    });
    return response;
  } catch (err) {
    logMultipartFailure('post', err, { fullUrl, maxLoaded, elapsedMs: Date.now() - startedAt });
    throw err;
  } finally {
    if (watchdog) clearInterval(watchdog);
  }
}

// Base64 encoding utility for React Native
// Note: React Native doesn't have btoa by default
// If btoa is not available, you may need to install: npm install base-64
// and use: import { encode } from 'base-64'; encode(credentials)
const base64Encode = (str: string): string => {
  if (typeof btoa !== 'undefined') {
    return btoa(str);
  }
  // Fallback: simple base64 implementation for React Native
  // For production, consider using the 'base-64' package
  try {
    // @ts-ignore - btoa may be polyfilled
    return btoa(str);
  } catch (e) {
    // If btoa is not available, throw an error suggesting to install base-64
    throw new Error(
      'Base64 encoding not available. Please install base-64: npm install base-64'
    );
  }
};

// Types
export interface ERPNextConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  defaultCompany?: string;
  defaultPriceList?: string; // Default price list for fetching prices
}

export interface ERPNextResponse<T> {
  data: T;
}

export interface ERPNextListResponse<T> {
  data: T[];
  keys: string[];
}

export interface ERPNextError {
  status?: number;
  message?: string;
  exc?: string;
  exc_type?: string;
  exception?: string;
  [key: string]: any; // Allow other properties
}

/** Frappe `/api/*` must return JSON; HTML means wrong base URL, auth wall, or proxy misrouting. */
function responseBodyLooksLikeHtml(data: unknown, contentType: string | undefined): boolean {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('text/html')) return true;
  if (typeof data === 'string') {
    const probe = data.slice(0, 2500).trimStart().toLowerCase();
    if (probe.startsWith('<!doctype') || probe.startsWith('<html')) return true;
    if (
      probe.startsWith('<') &&
      (data.includes('<head') || data.includes('<body') || data.includes('</html>') || data.includes('<script'))
    ) {
      return true;
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === 'string' && msg.length > 100) {
      const p = msg.slice(0, 600).trimStart().toLowerCase();
      if (p.startsWith('<!doctype') || p.startsWith('<html')) return true;
    }
    const exc = o.exception;
    if (typeof exc === 'string' && exc.includes('<!DOCTYPE')) return true;
  }
  return false;
}

/**
 * Frappe REST lives at `{site}/api/...`. If EXPO_PUBLIC_ERPNEXT_URL is a Raven or Desk URL,
 * axios joins `/api/...` under that path (e.g. `.../raven/Raven/api/...`) and the server returns HTML.
 */
export function normalizeFrappeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return 'http://localhost:8000';
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u: URL;
  try {
    u = new URL(withProto);
  } catch {
    return trimmed;
  }
  let path = (u.pathname || '').replace(/\/+$/, '') || '';
  const lower = path.toLowerCase();

  if (lower.startsWith('/raven/') || lower === '/raven') {
    path = '';
  } else {
    const stripTail = ['/app', '/desk', '/login'];
    for (const tail of stripTail) {
      if (lower.endsWith(tail) && path.length >= tail.length) {
        path = path.slice(0, -tail.length).replace(/\/+$/, '') || '';
        break;
      }
    }
  }
  if (path.toLowerCase().endsWith('/api')) {
    path = path.slice(0, -4).replace(/\/+$/, '') || '';
  }
  const suffix = path && path !== '/' ? path : '';
  return `${u.origin}${suffix}`.replace(/\/$/, '');
}

function htmlInsteadOfJsonError(url?: string): Error {
  const path = url ? ` (${url})` : '';
  return new Error(
    `The server returned HTML instead of JSON${path}. ` +
      'Set EXPO_PUBLIC_ERPNEXT_URL to your site root only (e.g. https://yoursite.com) — not /app, /desk, or /login. ' +
      'Check API credentials and that /api is reachable (proxies must forward /api).'
  );
}

/**
 * Legacy filters targeted `Website Item`. Catalog + images use the `Item` doctype instead.
 */
function mapWebsiteItemFiltersToItem(filters: any[][]): any[][] {
  const out: any[][] = [];
  for (const row of filters) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [dt, field, op, val] = row;
    if (dt !== 'Website Item') {
      out.push(row);
      continue;
    }
    if (field === 'published') {
      out.push(['Item', 'disabled', '=', val === 1 ? 0 : 1]);
      continue;
    }
    if (field === 'web_item_name') {
      out.push(['Item', 'item_name', op, val]);
      continue;
    }
    out.push(['Item', field, op, val]);
  }
  return out;
}

/** Frappe `TimestampMismatchError` — document changed on server between fetch and submit; submit can be retried. */
function isFrappeTimestampMismatchMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('timestampmismatch') ||
    m.includes('timestamp mismatch') ||
    m.includes('modified after you have opened') ||
    m.includes('please refresh to get the latest document')
  );
}

// API Client Class
class ERPNextClient {
  private client: AxiosInstance;
  private config: ERPNextConfig;
  /**
   * After a **Portal User** list returns “insufficient permission”, skip further list calls on that
   * child DocType for this client lifetime (same API key / site policy).
   */
  private skipPortalUserListQueries = false;

  constructor(config: ERPNextConfig) {
    this.config = config;
    // Create axios instance with dynamic timeout
    // Timeout will be updated based on network conditions
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: getCurrentTimeout(), // Dynamic timeout based on network conditions
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // DO NOT use withCredentials for resource API calls
      // Resource API calls should use API key/secret authentication, not session cookies
      withCredentials: false,
    });

    // Set default timeout per request (multipart uploads use a longer limit — see below).
    // React Native has navigator.product === 'ReactNative', so axios does not treat it as a
    // "standard browser" and never clears Content-Type for FormData (see resolveConfig.js).
    // The instance default `application/json` plus axios dispatchRequest's POST default of
    // application/x-www-form-urlencoded when Content-Type is missing breaks RN FormData;
    // we set Content-Type to `false` (omit + block injection) for native FormData payloads.
    this.client.interceptors.request.use((config) => {
      const data = config.data as unknown;
      if (isLikelyNativeFormData(data)) {
        const headers = AxiosHeaders.from(config.headers);
        headers.setContentType(false);
        if (typeof __DEV__ !== 'undefined' && __DEV__ && Platform.OS === 'android') {
          console.log(LOG_MULTIPART, 'interceptor', {
            url: config.url,
            timeoutWillBe: !(typeof config.timeout === 'number' && config.timeout === 0)
              ? MULTIPART_UPLOAD_TIMEOUT
              : 0,
            contentTypeAfterStrip: headers.get('Content-Type'),
          });
        }
        config.headers = headers;
        // Allow `timeout: 0` (sliding idle multipart helper); otherwise use long ceiling.
        if (!(typeof config.timeout === 'number' && config.timeout === 0)) {
          config.timeout = MULTIPART_UPLOAD_TIMEOUT;
        }
      } else {
        config.timeout = getCurrentTimeout();
      }
      return config;
    });

    // Add authentication interceptor
    // IMPORTANT: Always use API key/secret for resource API calls
    // Do NOT use session cookies - login is separate from resource API access
    this.client.interceptors.request.use((config) => {
      // Always use API key authentication for resource API calls
      if (this.config.apiKey && this.config.apiSecret) {
        // Base64 encode credentials for Basic Auth
        const credentials = `${this.config.apiKey}:${this.config.apiSecret}`;
        const auth = base64Encode(credentials);
        config.headers.Authorization = `Basic ${auth}`;
      }
      // Ensure cookies are not sent with resource API calls
      config.withCredentials = false;
      return config;
    });

    // Add retry logic with error interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        const cfgUrl = response.config?.url || '';
        const abs =
          typeof (response.request as { responseURL?: string } | undefined)?.responseURL === 'string'
            ? String((response.request as { responseURL: string }).responseURL)
            : '';
        const hitsApi = cfgUrl.includes('/api/') || abs.includes('/api/');
        if (hitsApi) {
          const h = response.headers;
          const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
          if (responseBodyLooksLikeHtml(response.data, ct)) {
            return Promise.reject(htmlInsteadOfJsonError(abs || cfgUrl));
          }
        }
        return response;
      },
      async (error: AxiosError<ERPNextError>) => {
        const originalRequest = error.config as any;

        // Check if this is a retryable error and we haven't exceeded max retries
        // Only retry network/timeout errors, not server-side parsing errors (500 with JSONDecodeError)
        const errorData = error.response?.data as ERPNextError | undefined;
        const isJsonDecodeError = errorData?.exc_type === 'JSONDecodeError' || errorData?.exception?.includes('JSONDecodeError');
        const isRetryableError = 
          (error.code === 'ECONNABORTED' || // Timeout
          error.code === 'ECONNREFUSED' || // Connection refused
          error.code === 'ENOTFOUND' || // DNS error
          error.message === 'Network Error') && // Network error
          !isJsonDecodeError; // Don't retry JSON decode errors - these are server-side issues

        const maxRetries = 3;
        const retryCount = originalRequest._retryCount || 0;

        // Retry if: error is retryable, network is stable, and we haven't exceeded max retries
        if (isRetryableError && isNetworkStable() && retryCount < maxRetries) {
          originalRequest._retryCount = retryCount + 1;
          
          // Exponential backoff: wait 1s, 2s, 4s before retrying
          const delay = Math.pow(2, retryCount) * 1000;
          
          console.log(`Retrying request (attempt ${retryCount + 1}/${maxRetries}) after ${delay}ms:`, originalRequest.url);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Retry the request
          return this.client(originalRequest);
        }

        // Better error logging for network errors
        if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
          console.error('ERPNext Network Error:', {
            message: error.message,
            code: error.code,
            url: error.config?.url,
            timeout: error.config?.timeout,
            retryCount,
            networkStable: isNetworkStable(),
          });
        } else if (error.response) {
          // Suppress "not found" errors - these are expected when items don't exist
          const errorData = error.response?.data as any;
          const serverMessages = errorData?._server_messages;
          const isNotFoundError = 
            errorData?.exc_type === 'DoesNotExistError' ||
            (typeof errorData === 'string' && errorData.includes('not found')) ||
            (serverMessages && 
              typeof serverMessages === 'string' && 
              (serverMessages as string).includes('not found'));

          const excStr = String(errorData?.exception || errorData?.exc_type || '');
          const smStr = typeof serverMessages === 'string' ? serverMessages : '';
          const isTimestampMismatch =
            errorData?.exc_type === 'TimestampMismatchError' ||
            excStr.includes('TimestampMismatchError') ||
            (typeof serverMessages === 'string' &&
              (serverMessages.includes('modified after you have opened') ||
                serverMessages.includes('TimestampMismatchError')));

          const blob = `${excStr} ${smStr}`.toLowerCase();
          const errMsg = String(errorData?._error_message || '').toLowerCase();
          const suppressExpectedProbeNoise =
            (blob.includes('validate_otp') && blob.includes('not whitelisted')) ||
            (blob.includes('insufficient permission') && blob.includes('portal user')) ||
            (errMsg.includes('write') && errMsg.includes('permission') && errMsg.includes('raven user'));

          if (!isNotFoundError && !isTimestampMismatch && !suppressExpectedProbeNoise) {
            console.error('ERPNext API Error:', errorData);
          }
        } else {
          console.error('ERPNext Request Error:', {
            message: error.message,
            code: error.code,
            url: error.config?.url,
            retryCount,
          });
        }
        
        throw error;
      }
    );
  }

  // AUTHENTICATION
  // Note: Login uses session-based auth (cookies) for user authentication
  // But resource API calls (/api/resource/*) should use API key/secret authentication
  
  async resetPassword(email: string): Promise<{ message?: string; [key: string]: any }> {
    try {
      // Use the admin reset_password endpoint with API key/secret authentication
      // This endpoint requires admin permissions and sends a password reset email to the user
      // The API key/secret must have admin permissions to use this endpoint
      // Using POST method as required by ERPNext for this endpoint
      const response = await this.client.post('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: email.trim(),
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * ERPNext **OTP Generation** app (`otp_generation`): sends a one-time code by email/SMS per site settings.
   * POST `/api/method/otp_generation.api.send_otp` — guest-whitelisted on standard installs.
   */
  async sendOtp(params: {
    purpose: string;
    email?: string;
    phone?: string;
    user?: string;
  }): Promise<{ status?: string; message?: string }> {
    const body: Record<string, string> = { purpose: params.purpose };
    if (params.email?.trim()) body.email = params.email.trim();
    if (params.phone?.trim()) body.phone = params.phone.trim();
    if (params.user?.trim()) body.user = params.user.trim();
    try {
      const response = await this.client.post('/api/method/otp_generation.api.send_otp', body);
      const msg = response.data?.message;
      if (msg && typeof msg === 'object' && (msg as { status?: string }).status === 'error') {
        throw new Error(String((msg as { message?: string }).message || 'Failed to send OTP'));
      }
      return typeof msg === 'object' && msg !== null ? (msg as { status?: string; message?: string }) : {};
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Verifies an OTP for the given email/phone and purpose.
   * 1) Tries RPC `validate_otp` (and `EXPO_PUBLIC_OTP_VALIDATE_METHOD` if set).
   * 2) If the server returns **403/417** or “not whitelisted”, falls back to the **Resource API**: list `OTP`
   *    rows with the integration key, check `expiry`, then set `status` to **Expired** (requires read/write
   *    on the OTP DocType for your API user).
   */
  async validateOtp(params: {
    purpose: string;
    otpCode: string;
    email?: string;
    phone?: string;
  }): Promise<{ status?: string; message?: string }> {
    const body: Record<string, string> = {
      purpose: params.purpose,
      otp_code: params.otpCode.trim(),
    };
    if (params.email?.trim()) body.email = params.email.trim();
    if (params.phone?.trim()) body.phone = params.phone.trim();

    const custom = (process.env.EXPO_PUBLIC_OTP_VALIDATE_METHOD || '').trim();
    const candidates = [
      ...new Set([
        ...(custom ? [custom] : []),
        'otp_generation.api.validate_otp',
        'otp_generation.api.otp.validate_otp',
      ]),
    ];

    let lastError: unknown;
    let sawPermissionDenied = false;
    for (const method of candidates) {
      try {
        const response = await this.client.post(`/api/method/${method}`, body);
        const msg = response.data?.message;
        if (msg && typeof msg === 'object' && (msg as { status?: string }).status === 'error') {
          throw new Error(String((msg as { message?: string }).message || 'Invalid or expired OTP'));
        }
        return typeof msg === 'object' && msg !== null ? (msg as { status?: string; message?: string }) : {};
      } catch (error) {
        lastError = error;
        const ax = error as AxiosError<{ exc_type?: string; exception?: string }>;
        const status = ax.response?.status;
        const excType = ax.response?.data?.exc_type;
        const exceptionStr = String(ax.response?.data?.exception || '');
        const isPermission =
          status === 403 ||
          status === 417 ||
          excType === 'PermissionError' ||
          exceptionStr.includes('not whitelisted');
        if (status === 404 || isPermission) {
          if (isPermission) sawPermissionDenied = true;
          continue;
        }
        throw this.handleError(error);
      }
    }

    if (sawPermissionDenied) {
      try {
        await this.validateOtpViaOtpResource(params);
        return { status: 'success', message: 'OTP verified successfully' };
      } catch (resourceErr) {
        const doctype = (process.env.EXPO_PUBLIC_OTP_DOCTYPE || 'OTP').trim();
        const base = resourceErr instanceof Error ? resourceErr.message : String(resourceErr);
        throw new Error('Verification code could not be checked. Try again or request a new code.');
      }
    }

    if (lastError) {
      throw this.handleError(lastError);
    }
    throw new Error(
      'Verification is not available right now. Try again later or contact support.'
    );
  }

  /**
   * Fallback when `validate_otp` RPC is not whitelisted: match a **Valid** OTP row and expire it.
   * DocType name: `EXPO_PUBLIC_OTP_DOCTYPE` (default `OTP`).
   */
  async validateOtpViaOtpResource(params: {
    purpose: string;
    otpCode: string;
    email?: string;
    phone?: string;
  }): Promise<void> {
    const doctype = (process.env.EXPO_PUBLIC_OTP_DOCTYPE || 'OTP').trim();
    const purpose = params.purpose;
    const code = params.otpCode.trim();
    const email = params.email?.trim();
    const phone = params.phone?.trim();
    if (!email && !phone) {
      throw new Error('Email or phone is required to verify the OTP.');
    }

    const filters: unknown[][] = [
      ['otp_code', '=', code],
      ['purpose', '=', purpose],
      ['status', '=', 'Valid'],
    ];
    if (email) {
      filters.push(['email', '=', email]);
    } else if (phone) {
      filters.push(['phone', '=', phone]);
    }

    let rows: Array<Record<string, unknown>> = [];
    try {
      const response = await this.client.get(`${API_VERSION}/${encodeURIComponent(doctype)}`, {
        params: {
          fields: JSON.stringify(['name', 'otp_code', 'status', 'expiry', 'purpose', 'email', 'phone']),
          filters: JSON.stringify(filters),
          limit_page_length: 5,
        },
      });
      rows = Array.isArray(response.data?.data) ? response.data.data : [];
    } catch {
      throw new Error(
        `Could not read OTP documents (${doctype}). Check EXPO_PUBLIC_OTP_DOCTYPE and API permissions.`
      );
    }

    const now = Date.now();
    const validRows = rows.filter((row) => {
      const expRaw = row.expiry;
      if (expRaw == null || expRaw === '') return true;
      const exp = new Date(typeof expRaw === 'string' ? expRaw : String(expRaw));
      if (Number.isNaN(exp.getTime())) return true;
      return exp.getTime() >= now;
    });

    if (validRows.length === 0) {
      throw new Error('Invalid or expired verification code.');
    }

    const row = validRows[0];
    const name = row.name != null ? String(row.name).trim() : '';
    if (!name) {
      throw new Error('Invalid or expired verification code.');
    }

    try {
      await this.client.put(
        `${API_VERSION}/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
        { status: 'Expired' }
      );
    } catch {
      // Matched row; consuming is best-effort (permissions / concurrency).
    }
  }

  /**
   * Sets **new_password** on the Frappe User for this email (integration user must be allowed to write User).
   * Used after OTP verification for in-app password reset.
   */
  async setUserPasswordByEmail(email: string, newPassword: string): Promise<void> {
    const trimmed = email.trim();
    const user = await this.getUserByEmail(trimmed);
    if (!user?.name) {
      throw new Error('No account exists for this email address.');
    }
    try {
      await this.client.put(`${API_VERSION}/User/${encodeURIComponent(String(user.name))}`, {
        new_password: newPassword,
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /** Verify OTP then set password (no reset email link). */
  async resetPasswordWithOtp(email: string, otpCode: string, newPassword: string): Promise<void> {
    await this.validateOtp({
      email,
      purpose: OTP_PURPOSE_RESET_PASSWORD,
      otpCode,
    });
    await this.setUserPasswordByEmail(email, newPassword);
  }

  async getTopCustomers(year?: number, month?: number): Promise<{
    month: string;
    year: string;
    top_customers: Array<{
      rank?: number;
      customer: string;
      total_sales: number;
      invoice_count?: number;
    }>;
    top_items: Array<{
      rank?: number;
      item_name: string;
      total_qty: number;
      image: string | null;
    }>;
  }> {
    try {
      const currentDate = new Date();
      const currentYear = year || currentDate.getFullYear();
      const currentMonth = month || (currentDate.getMonth() + 1);
      
      const response = await this.client.get('/api/method/get_monthly_leaderboard', {
        params: {
          year: currentYear.toString(),
          month: currentMonth.toString(),
        },
      });
      return response.data.message || response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async login(email: string, password: string): Promise<{ message?: string; full_name?: string; [key: string]: any }> {
    try {
      // Create a separate axios instance for login to avoid cookie interference
      // Login endpoint uses session-based authentication (cookies)
      const loginClient = axios.create({
        baseURL: this.config.baseUrl,
        timeout: getCurrentTimeout(),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        withCredentials: true, // Enable cookies for login only
      });

      // ERPNext password-based authentication endpoint
      // Uses /api/method/login with usr and pwd fields
      // ERPNext sets a session cookie after successful login
      const response = await loginClient.post('/api/method/login', {
        usr: email,
        pwd: password,
      });
      
      // Check if login was successful
      if (response.data && (response.data.message === 'Logged In' || response.data.message === 'No App')) {
        const ravenHeaders: Array<Record<string, unknown>> = [response.headers as Record<string, unknown>];
        // Optionally verify the logged-in user
        try {
          const userInfoResponse = await loginClient.get('/api/method/frappe.auth.get_logged_user');
          ravenHeaders.push(userInfoResponse.headers as Record<string, unknown>);
          console.log('User info response:', userInfoResponse.data);

          // Extract user info from response
          const userInfo = userInfoResponse?.data?.message;
          const userName = userInfo?.user || email;
          const fullName = userInfo?.full_name || userInfo?.name || undefined;

          const { establishFrappeRavenSessionFromLoginResponses } = await import('./frappeRavenSession');
          establishFrappeRavenSessionFromLoginResponses(this.config.baseUrl, ...ravenHeaders);

          return {
            ...response.data,
            user: userName,
            full_name: fullName,
          };
        } catch (userInfoError) {
          // If getting user info fails, still return login success
          console.warn('Login successful but could not fetch user info:', userInfoError);
          const { establishFrappeRavenSessionFromLoginResponses } = await import('./frappeRavenSession');
          establishFrappeRavenSessionFromLoginResponses(this.config.baseUrl, ...ravenHeaders);
          return {
            ...response.data,
            user: email,
            full_name: undefined,
          };
        }
      }
      
      return response.data;
    } catch (error: any) {
      // Extract meaningful error message from ERPNext response
      const errorMessage = this.extractLoginErrorMessage(error);
      const loginError = new Error(errorMessage);
      (loginError as any).originalError = error;
      throw loginError;
    }
  }

  /**
   * Whitelisted `/api/method/...` calls using the same API key auth as `/api/resource`.
   * Returns full `response.data` — use `.message` for the method result.
   */
  async callFrappeMethod(method: string, kwargs: Record<string, unknown> = {}): Promise<any> {
    try {
      const response = await this.client.post(`/api/method/${method}`, kwargs);
      const h = response.headers;
      const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
      if (responseBodyLooksLikeHtml(response.data, ct)) {
        throw htmlInsteadOfJsonError(`/api/method/${method}`);
      }
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * GET `/api/resource/{DocType}` list rows (used for Raven DocTypes, etc.).
   */
  async listResourceRows(
    doctype: string,
    options?: {
      filters?: any[][];
      fields?: string[];
      order_by?: string;
      limit_page_length?: number;
      limit_start?: number;
    }
  ): Promise<any[]> {
    try {
      const params: Record<string, string> = {
        limit_page_length: String(options?.limit_page_length ?? 50),
      };
      if (options?.limit_start != null && options.limit_start > 0) {
        params.limit_start = String(options.limit_start);
      }
      if (options?.filters) params.filters = JSON.stringify(options.filters);
      if (options?.fields) params.fields = JSON.stringify(options.fields);
      if (options?.order_by) params.order_by = options.order_by;
      const response = await this.client.get(`${API_VERSION}/${encodeURIComponent(doctype)}`, { params });
      const h = response.headers;
      const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
      if (responseBodyLooksLikeHtml(response.data, ct)) {
        throw htmlInsteadOfJsonError(`${API_VERSION}/${doctype}`);
      }
      return response.data?.data || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * POST `/api/resource/{DocType}` — create a document (same path Raven web uses for new channels).
   */
  async createResourceDoc(doctype: string, data: Record<string, unknown>): Promise<any> {
    try {
      const response = await this.client.post(`${API_VERSION}/${encodeURIComponent(doctype)}`, data);
      const h = response.headers;
      const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
      if (responseBodyLooksLikeHtml(response.data, ct)) {
        throw htmlInsteadOfJsonError(`POST ${API_VERSION}/${doctype}`);
      }
      return response.data?.data ?? response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /** Basic auth header value for authenticated file URLs (e.g. private Raven attachments). */
  getAuthorizationHeader(): string | undefined {
    if (!this.config.apiKey || !this.config.apiSecret) return undefined;
    const credentials = `${this.config.apiKey}:${this.config.apiSecret}`;
    return `Basic ${base64Encode(credentials)}`;
  }

  /**
   * GET a same-origin URL with this client's API key auth (identical to `/api` calls).
   * Native image components never receive the browser Frappe session cookie; use this for
   * `/private/files/...` when expo-image must not depend on optional header behaviour.
   */
  async fetchBinaryWithAuth(absoluteUrl: string): Promise<{ data: ArrayBuffer; contentType: string }> {
    const url = absoluteUrl.trim();
    const response = await this.client.get(url, {
      responseType: 'arraybuffer',
      headers: { Accept: '*/*' },
    });
    const ct = String(
      response.headers['content-type'] || response.headers['Content-Type'] || 'application/octet-stream'
    );
    return { data: response.data as ArrayBuffer, contentType: ct };
  }

  /**
   * POST `/api/method/...` with multipart body (e.g. Raven `upload_file_with_message`).
   * Do not set Content-Type manually — axios sets the multipart boundary.
   */
  async callMultipartFrappeMethod(method: string, formData: FormData): Promise<any> {
    console.log(LOG_MULTIPART, 'callMultipartFrappeMethod (API key client)', { method });
    try {
      const response = await postFormDataMultipartWithSlidingIdle(
        this.client,
        `/api/method/${method}`,
        formData
      );
      const h = response.headers;
      const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
      if (responseBodyLooksLikeHtml(response.data, ct)) {
        throw htmlInsteadOfJsonError(`/api/method/${method}`);
      }
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private extractLoginErrorMessage(error: any): string {
    // Log full error for debugging
    console.error('Login error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });

    // Check for ERPNext login-specific error messages
    if (error.response?.data) {
      const responseData = error.response.data;
      
      // Check message field first
      if (responseData.message) {
        const message = responseData.message;
        // ERPNext login errors often come in the message field
        if (message && message !== 'Logged In') {
          // Common ERPNext login error messages
          if (message.includes('Invalid Login') || message.includes('Invalid User') || message.includes('Invalid Password')) {
            return 'Invalid email or password. Please check your credentials and try again.';
          }
          if (message.includes('Not Allowed')) {
            return 'Login not allowed. Please contact support.';
          }
          if (message.includes('User disabled')) {
            return 'Your account has been disabled. Please contact support.';
          }
          if (message.includes('Incorrect password')) {
            return 'Incorrect password. Please check your password and try again.';
          }
          return message;
        }
      }

      // Check exc_type for specific error types
      if (responseData.exc_type) {
        if (responseData.exc_type.includes('AuthenticationError') || responseData.exc_type.includes('InvalidLogin')) {
          return 'Invalid email or password. Please check your credentials and try again.';
        }
      }
    }

    // Check for ERPNext server messages
    if (error.response?.data?._server_messages) {
      try {
        const serverMessages = JSON.parse(error.response.data._server_messages);
        if (Array.isArray(serverMessages) && serverMessages.length > 0) {
          const firstMessage = JSON.parse(serverMessages[0]);
          if (firstMessage?.message) {
            return firstMessage.message;
          }
        }
      } catch (parseError) {
        // If parsing fails, try to extract message from string
        const serverMessages = error.response.data._server_messages;
        if (typeof serverMessages === 'string') {
          const match = serverMessages.match(/"message":\s*"([^"]+)"/);
          if (match && match[1]) {
            return match[1];
          }
        }
      }
    }

    // Check HTTP status codes
    if (error.response?.status === 401) {
      // For 401, try to get more specific error message
      const responseData = error.response?.data;
      if (responseData) {
        // Check if there's a specific error message
        if (responseData.message && responseData.message !== 'Logged In') {
          return responseData.message;
        }
        // Check exc for error details
        if (responseData.exc) {
          try {
            const excMessages = JSON.parse(responseData.exc);
            if (Array.isArray(excMessages) && excMessages.length > 0) {
              const excText = excMessages[0];
              if (excText.includes('Invalid Login') || excText.includes('Invalid User') || excText.includes('Invalid Password')) {
                return 'Invalid email or password. Please check your credentials and try again.';
              }
              if (excText.includes('Incorrect password')) {
                return 'Incorrect password. Please check your password and try again.';
              }
            }
          } catch (parseError) {
            // If parsing fails, check if exc is a string
            if (typeof responseData.exc === 'string') {
              if (responseData.exc.includes('Invalid Login') || responseData.exc.includes('Invalid User')) {
                return 'Invalid email or password. Please check your credentials and try again.';
              }
            }
          }
        }
      }
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (error.response?.status === 403) {
      return 'Access denied. Please contact support.';
    }
    if (error.response?.status === 404) {
      return 'Login endpoint not found. Please check your server configuration.';
    }
    if (error.response?.status === 500) {
      return 'Server error. Please try again later.';
    }

    // Network/timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return 'Connection timeout. Please check your internet connection and try again.';
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return 'Cannot connect to server. Please check your internet connection.';
    }
    if (error.message === 'Network Error') {
      return 'Network error. Please check your internet connection and try again.';
    }

    // Default error message
    return error.message || 'Login failed. Please check your credentials and try again.';
  }

  // USERS
  async createUser(userData: {
    email: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    phone?: string;
    /** When set, stored as Frappe `new_password` (user can sign in immediately). */
    password?: string;
    send_welcome_email?: boolean;
    /**
     * When false (default), assigns **Raven User** alongside **Customer** so Raven’s `User` hooks
     * (`raven_user.add_user_to_raven`) create a **Raven User** row for in-app chat. Set true only if
     * your site does not have the Raven app or that role is intentionally omitted.
     * After a successful create with the Raven role, we set **Raven User.custom_customer** from the
     * portal-linked Customer (retries briefly while hooks create the Raven User row).
     */
    skipRavenMessagingRole?: boolean;
    /**
     * When true, skips **`ensureRavenUserCustomCustomerForUser`** inside create (call it yourself after
     * **Customer** exists). Avoids many slow permission probes during signup when the Customer row is
     * created only after the User.
     */
    deferRavenCustomerLink?: boolean;
  }): Promise<any> {
    const userPayload: any = {
      email: userData.email.trim(),
      first_name: userData.first_name.trim(),
      last_name: userData.last_name.trim(),
      send_welcome_email:
        userData.send_welcome_email !== undefined
          ? userData.send_welcome_email !== false
            ? 1
            : 0
          : userData.password?.trim()
            ? 0
            : 1,
    };

    if (userData.password?.trim()) {
      userPayload.new_password = userData.password.trim();
    }

    if (userData.middle_name?.trim()) {
      userPayload.middle_name = userData.middle_name.trim();
    }

    if (userData.phone?.trim()) {
      userPayload.mobile_no = userData.phone.trim();
    }

    const roleAttempts: { role: string }[][] = userData.skipRavenMessagingRole
      ? [[{ role: 'Customer' }]]
      : [
          [{ role: 'Customer' }, { role: 'Raven User' }],
          [{ role: 'Customer' }],
        ];

    for (let i = 0; i < roleAttempts.length; i++) {
      const roles = roleAttempts[i];
      try {
        const response = await this.client.post(`${API_VERSION}/User`, { ...userPayload, roles });
        const data = response.data.data;
        const frappeUserName = String(data?.name ?? userPayload.email ?? '').trim();
        const hadRavenRole = roles.some((r) => r.role === 'Raven User');
        if (frappeUserName && hadRavenRole) {
          try {
            await this.addNewUserToAllRavenWorkspaces(frappeUserName);
          } catch (e) {
            console.warn('[ERPNext] createUser: add to Raven workspaces failed', e);
          }
          if (!userData.deferRavenCustomerLink) {
            try {
              await this.ensureRavenUserCustomCustomerForUser(frappeUserName);
            } catch (e) {
              console.warn('[ERPNext] createUser: ensureRavenUserCustomCustomerForUser failed', e);
            }
          }
        }
        return data;
      } catch (error) {
        const isLast = i === roleAttempts.length - 1;
        const hadRaven = roles.some((r) => r.role === 'Raven User');
        if (!isLast && hadRaven) {
          console.warn('[ERPNext] createUser: retrying without Raven User role (role may be missing on site)', error);
          continue;
        }
        throw this.handleError(error);
      }
    }
    throw new Error('[ERPNext] createUser: unreachable');
  }

  /**
   * Add a Frappe **`User.name`** to **every Raven Workspace** the API user can list, using
   * **`raven.api.workspaces.add_workspace_members`** (same as desk bulk add; runs with
   * `ignore_permissions` on the server for each member insert).
   *
   * **Listing:** Paginates `GET /api/resource/Raven Workspace` with **no type filter** so **Public and
   * Private** workspaces are included, as long as your integration user can **read** them (e.g.
   * **Administrator** / **System Manager**).
   *
   * **Adding:** Stock Raven still checks workspace **write** before `add_workspace_members` runs; that
   * is usually limited to **workspace admins**. If some workspaces fail, make the API user a **workspace
   * admin** on those rows, or add a small custom whitelisted method on the site that uses
   * `ignore_permissions` for bulk membership.
   */
  async addNewUserToAllRavenWorkspaces(userName: string): Promise<void> {
    const key = (userName || '').trim();
    if (!key) return;
    const pageSize = 100;
    const seenWs = new Set<string>();

    for (let start = 0; ; start += pageSize) {
      let batch: Array<Record<string, unknown>> = [];
      try {
        batch = await this.listResourceRows('Raven Workspace', {
          fields: ['name', 'type'],
          limit_page_length: pageSize,
          limit_start: start,
        });
      } catch (e) {
        console.warn('[ERPNext] addNewUserToAllRavenWorkspaces: list Raven Workspace failed', e);
        return;
      }
      if (!Array.isArray(batch) || batch.length === 0) break;

      for (const ws of batch) {
        const wid = String(ws.name ?? '').trim();
        if (!wid || seenWs.has(wid)) continue;
        seenWs.add(wid);
        try {
          await this.callFrappeMethod('raven.api.workspaces.add_workspace_members', {
            workspace: wid,
            members: [key],
          });
        } catch (e: unknown) {
          const err = e as { message?: string; response?: { data?: { message?: string; exc?: string } } };
          const msg = `${err?.message ?? ''} ${err?.response?.data?.message ?? ''} ${err?.response?.data?.exc ?? ''}`.toLowerCase();
          if (
            msg.includes('duplicate') ||
            msg.includes('already exists') ||
            msg.includes('unique') ||
            msg.includes('same document') ||
            msg.includes('link already exists')
          ) {
            continue;
          }
          console.warn(`[ERPNext] add_workspace_members workspace=${wid} user=${key}`, e);
        }
      }

      if (batch.length < pageSize) break;
    }
  }

  /**
   * Set **Raven User.custom_customer** (Link → Customer). Order:
   * 1. **`EXPO_PUBLIC_RAVEN_USER_SET_CUSTOMER_METHOD`** — your whitelisted server method (e.g. uses
   *    `ignore_permissions` or runs as Administrator) when the integration user cannot **Write** Raven User.
   * 2. **`frappe.client.set_value`**
   * 3. **REST PUT** `/api/resource/Raven User/{name}`
   *
   * @returns true if an update succeeded
   */
  private async setRavenUserCustomCustomerOnServer(ravenUserDocName: string, customerName: string): Promise<boolean> {
    const ru = String(ravenUserDocName || '').trim();
    const cust = String(customerName || '').trim();
    if (!ru || !cust) return false;

    const customMethod = (process.env.EXPO_PUBLIC_RAVEN_USER_SET_CUSTOMER_METHOD || '').trim();
    if (customMethod) {
      const kwargAttempts: Record<string, string>[] = [
        { raven_user: ru, customer: cust },
        { raven_user_name: ru, customer: cust },
        { name: ru, customer: cust },
      ];
      for (const kwargs of kwargAttempts) {
        try {
          await this.callFrappeMethod(customMethod, kwargs);
          return true;
        } catch {
          /* try next shape or fall through */
        }
      }
    }

    try {
      await this.callFrappeMethod('frappe.client.set_value', {
        doctype: 'Raven User',
        name: ru,
        fieldname: 'custom_customer',
        value: cust,
      });
      return true;
    } catch {
      /* continue */
    }

    try {
      await this.client.put(
        `${API_VERSION}/${encodeURIComponent('Raven User')}/${encodeURIComponent(ru)}`,
        { custom_customer: cust }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * After signup, **Raven User** is created by server hooks. Set **`custom_customer`** to the **Customer**
   * resolved from portal / User (or pass **`customerId`** when the app already created the Customer).
   */
  async ensureRavenUserCustomCustomerForUser(
    frappeUserName: string,
    opts?: {
      maxAttempts?: number;
      delayMs?: number;
      /** ERPNext **Customer** `name` when already known (e.g. right after **createCustomer**). */
      customerId?: string | null;
      /** Extra values to match **Raven User.user** (e.g. login email if it differs from **User.name**). */
      ravenUserMatchKeys?: string[];
    }
  ): Promise<void> {
    const u = String(frappeUserName || '').trim();
    if (!u) return;
    const maxAttempts = opts?.maxAttempts ?? 8;
    const delayMs = opts?.delayMs ?? 450;

    const explicit = opts?.customerId != null ? String(opts.customerId).trim() : '';
    let cachedCustomerId: string | null = explicit || null;

    const matchKeys = [
      ...new Set(
        [u, ...(opts?.ravenUserMatchKeys ?? []).map((x) => String(x || '').trim())].filter(Boolean)
      ),
    ];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let customerId: string | null = cachedCustomerId;
      if (!customerId) {
        try {
          customerId = await this.getCustomerIdForFrappeUserName(u);
          if (customerId) cachedCustomerId = customerId;
        } catch {
          customerId = null;
        }
      }
      if (!customerId && attempt === maxAttempts - 1) {
        console.warn('[ERPNext] ensureRavenUserCustomCustomerForUser: no Customer resolved for user', u);
        return;
      }
      if (!customerId) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      let rows: any[] = [];
      for (const key of matchKeys) {
        try {
          const found = await this.listResourceRows('Raven User', {
            filters: [['user', '=', key]],
            fields: ['name', 'custom_customer'],
            limit_page_length: 20,
          });
          if (Array.isArray(found) && found.length > 0) {
            rows = found;
            break;
          }
        } catch {
          /* try next key */
        }
      }
      if (Array.isArray(rows) && rows.length > 0) {
        let anyNeededUpdate = false;
        let anyFailed = false;
        for (const row of rows) {
          const ruName = String(row?.name || '').trim();
          if (!ruName) continue;
          const existing = String(row?.custom_customer || '').trim();
          if (existing === customerId) continue;
          anyNeededUpdate = true;
          const ok = await this.setRavenUserCustomCustomerOnServer(ruName, customerId);
          if (!ok) anyFailed = true;
        }
        if (anyNeededUpdate && anyFailed) {
          console.warn(
            '[ERPNext] Raven User.custom_customer was not updated. Grant the integration user **Write** on DocType **Raven User**, ' +
              'or set **EXPO_PUBLIC_RAVEN_USER_SET_CUSTOMER_METHOD** to a whitelisted server method that sets the field (see .env.example).',
            { user: u, customerId, ravenRows: rows.map((r: { name?: string }) => r?.name) }
          );
        }
        return;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    console.warn('[ERPNext] ensureRavenUserCustomCustomerForUser: no Raven User row found for user', u);
  }

  async getUserByPhone(phone: string): Promise<any> {
    try {
      // Normalize phone number (remove spaces, handle country codes)
      const normalizedPhone = phone.replace(/\s/g, '').replace(/^\+233/, '0').replace(/^233/, '0');
      const phoneVariants = [
        normalizedPhone,
        phone.replace(/\s/g, ''), // Original format
        `+233${normalizedPhone.slice(1)}`, // With +233
        `233${normalizedPhone.slice(1)}`, // With 233
        normalizedPhone.slice(-9), // Last 9 digits
      ];
      
      // Try each phone variant
      for (const phoneVariant of phoneVariants) {
        try {
          const response = await this.client.get(`${API_VERSION}/User`, {
            params: {
              fields: JSON.stringify(['name', 'email', 'phone']),
              filters: JSON.stringify([
                ['phone', '=', phoneVariant]
              ]),
              limit_page_length: 1,
            },
          });
          
          if (response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
          }
        } catch (variantError) {
          // Continue to next variant
          continue;
        }
      }
      
      // If not found with exact match, try partial match with last 9 digits
      try {
        const last9Digits = normalizedPhone.slice(-9);
        const searchResponse = await this.client.get(`${API_VERSION}/User`, {
          params: {
            fields: JSON.stringify(['name', 'email', 'phone']),
            filters: JSON.stringify([
              ['phone', 'like', `%${last9Digits}%`]
            ]),
            limit_page_length: 1,
          },
        });
        
        if (searchResponse.data.data && searchResponse.data.data.length > 0) {
          return searchResponse.data.data[0];
        }
      } catch (searchError) {
        // Ignore search errors
      }
      
      return null;
    } catch (error) {
      // If user not found, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        return null;
      }
      throw this.handleError(error);
    }
  }

  // Get User by email
  async getUserByEmail(email: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/User`, {
        params: {
          fields: JSON.stringify([
            'name',
            'email',
            'full_name',
            'first_name',
            'last_name',
            'middle_name',
            'phone',
            'mobile_no',
            'location',
          ]),
          filters: JSON.stringify([
            ['email', '=', email]
          ]),
          limit_page_length: 1,
        },
      });

      if (response.data.data && response.data.data.length > 0) {
        const user = response.data.data[0];
        // Fetch full user document to get image field (not queryable in list views)
        if (user.name) {
          try {
            const fullUser = await this.client.get(`${API_VERSION}/User/${user.name}`);
            if (fullUser.data.data) {
              const d = fullUser.data.data;
              const userImage = d.user_image || d.image || null;
              return {
                ...user,
                user_image: userImage,
                image: userImage,
                location: d.location,
                mobile_no: d.mobile_no ?? user.mobile_no,
                phone: d.phone ?? user.phone,
              };
            }
          } catch (error) {
            // If fetching full document fails, return user without image
            console.warn('Could not fetch full user document for image:', error);
          }
        }
        return user;
      }
      return null;
    } catch (error) {
      // If user not found, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        return null;
      }
      throw this.handleError(error);
    }
  }

  async updateUser(
    userEmail: string,
    userData: {
      phone?: string;
      mobile_no?: string;
      location?: string;
      /** ERPNext User attach field (file URL after upload_file). */
      user_image?: string | null;
    }
  ): Promise<any> {
    try {
      const user = await this.getUserByEmail(userEmail);
      if (!user || !user.name) {
        throw new Error('User not found');
      }

      const updateData: Record<string, unknown> = {};
      if (userData.phone !== undefined) {
        updateData.phone = userData.phone;
      }
      if (userData.mobile_no !== undefined) {
        updateData.mobile_no = userData.mobile_no;
      }
      if (userData.location !== undefined) {
        updateData.location = userData.location;
      }
      if (userData.user_image !== undefined) {
        updateData.user_image = userData.user_image === '' ? null : userData.user_image;
      }

      const response = await this.client.put(
        `${API_VERSION}/User/${encodeURIComponent(user.name)}`,
        updateData
      );

      console.log('User updated successfully:', response.data);
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw this.handleError(error);
    }
  }

  // CUSTOMERS
  async getCustomer(customerId: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Customer/${customerId}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createCustomer(customerData: {
    customer_name: string;
    email: string;
    phone?: string;
    mobile_no?: string;
    customer_type: 'Company' | 'Individual';
    /**
     * Frappe **User.name** for **Customer → Portal Users → User** (defaults to **email**).
     * Use the value returned from **createUser** so the portal row matches Raven’s **User** link.
     */
    portal_user_name?: string;
  }): Promise<any> {
    try {
      const payload: any = {
        customer_name: customerData.customer_name,
        customer_type: customerData.customer_type,
        email_id: customerData.email,
        phone: customerData.phone,
        mobile_no: customerData.mobile_no,
      };

      // Ensure the signup user is linked in Customer > Portal Users child table
      const linkUser = (customerData.portal_user_name || customerData.email || '').trim();
      if (linkUser) {
        payload.portal_users = [{ user: linkUser }];
      }

      const response = await this.client.post(`${API_VERSION}/Customer`, payload);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateCustomer(customerId: string, customerData: any): Promise<any> {
    try {
      const response = await this.client.put(
        `${API_VERSION}/Customer/${customerId}`,
        customerData
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ITEMS/PRODUCTS — list uses Item doctype (images from Item.image; Website Item not required)
  async getWebsiteItems(filters?: any, limit: number = 20, offset: number = 0, orderBy?: string, sortByPrice?: 'asc' | 'desc'): Promise<any[]> {
    if (sortByPrice) {
      return this.getWebsiteItemsSortedByPrice(filters, limit, offset, sortByPrice);
    }
    try {
      const fields = [
        'name',
        'item_code',
        'item_name',
        'item_group',
        'stock_uom',
        'brand',
        'description',
        'image',
        'standard_rate',
        'disabled',
        'creation',
        'modified',
      ];

      const defaultFilters = [['Website Item', 'published', '=', 1]];
      const mergedWebsiteFilters = filters ? [...defaultFilters, ...filters] : defaultFilters;
      const mergedFilters = mapWebsiteItemFiltersToItem(mergedWebsiteFilters);

      let url = `${API_VERSION}/Item?fields=${encodeURIComponent(JSON.stringify(fields))}&limit_page_length=${limit}&limit_start=${offset}`;
      url += `&filters=${encodeURIComponent(JSON.stringify(mergedFilters))}`;
      const orderByClause = orderBy || 'modified desc';
      url += `&order_by=${encodeURIComponent(orderByClause)}`;

      console.log('[getWebsiteItems→Item] URL:', url);
      const response = await this.client.get(url);
      const websiteItems = response.data.data || [];

      console.log('[getWebsiteItems→Item] Returned items count:', websiteItems?.length || 0);

      const itemsWithPricesAndStock = await Promise.allSettled(
        websiteItems.map(async (item: any) => {
          const code = item.item_code || item.name;
          if (code) {
            try {
              const price = await this.getItemPrice(code);
              if (price > 0) {
                item.price_list_rate = price;
              }
            } catch (error) {
              console.warn(`Failed to fetch price for ${code}:`, error);
            }
          }
          item.available_stock = 0;
          return item;
        })
      );

      return itemsWithPricesAndStock
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map((result) => result.value);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getWebsiteItem(websiteItemName: string): Promise<any> {
    try {
      // Use wildcard to get all fields, or specify fields for better performance
      // For reference, see: src/services/websiteItemFields.ts
      const fields = [
        "name",
        "web_item_name",
        "route",
        "published",
        "item_code",
        "item_name",
        "item_group",
        "stock_uom",
        "custom_company",
        "brand",
        "description",
        "website_image",
        "website_image_alt",
        "thumbnail",
        "slideshow",
        "website_warehouse",
        "on_backorder",
        "short_description",
        "web_long_description",
        "ranking",
        "website_specifications",
        "show_tabbed_section",
        "tabs",
        "recommended_items",
        "offers",
        "website_item_groups",
        "custom_size",
        "creation",
        "modified"
      ];

      // Request slideshow child table if it exists as a child table in Website Item
      // In some ERPNext setups, slideshow might be a child table directly in Website Item
      const fieldsWithSlideshow = [
        ...fields,
        // Try to get slideshow child table if it exists
        // Child tables are typically included when fetching with "*" or specific table names
      ];
      
      const response = await this.client.get(
        `${API_VERSION}/Website Item/${websiteItemName}?fields=${encodeURIComponent(JSON.stringify(fieldsWithSlideshow))}`
      );
      const websiteItem = response.data.data;
      
      // Fetch price from Item Price doctype if item_code is available
      if (websiteItem.item_code) {
        try {
          const price = await this.getItemPrice(websiteItem.item_code);
          if (price > 0) {
            websiteItem.price_list_rate = price;
            console.log(`Fetched price for ${websiteItem.item_code}: ${price}`);
          }
        } catch (error) {
          console.warn(`Failed to fetch price for item ${websiteItem.item_code}:`, error);
        }
      }
      
      // Fetch stock from Bin using the website_warehouse field from Website Item
      // The website_warehouse field specifies which warehouse to check for stock
      if (websiteItem.website_warehouse && websiteItem.item_code) {
        try {
          const stockData = await this.getWarehouseStock(
            websiteItem.website_warehouse, // Use the warehouse specified in website_warehouse field
            websiteItem.item_code
          );
          
          if (stockData && Array.isArray(stockData) && stockData.length > 0) {
            // Calculate total available stock (actual_qty - reserved_qty)
            const totalStock = stockData.reduce((sum: number, bin: any) => {
              const available = (bin.actual_qty || 0) - (bin.reserved_qty || 0);
              return sum + available;
            }, 0);
            websiteItem.available_stock = Math.max(0, totalStock);
            console.log(`[getWebsiteItem] Fetched stock for ${websiteItem.item_code} from warehouse ${websiteItem.website_warehouse}: ${websiteItem.available_stock}`);
          } else {
            websiteItem.available_stock = 0;
            console.log(`[getWebsiteItem] No stock data returned for ${websiteItem.item_code}, setting to 0`);
          }
        } catch (error) {
          console.warn(`[getWebsiteItem] Failed to fetch stock for item ${websiteItem.item_code} from warehouse ${websiteItem.website_warehouse}:`, error);
          websiteItem.available_stock = 0;
        }
      } else {
        // No website_warehouse specified - cannot fetch stock
        if (!websiteItem.website_warehouse) {
          console.warn(`[getWebsiteItem] Website Item ${websiteItem.name || websiteItem.item_code} has no website_warehouse field set`);
        }
        websiteItem.available_stock = 0;
        console.log(`[getWebsiteItem] No warehouse/item_code, setting available_stock to 0`);
      }
      
      // Check if slideshow is a Link field pointing to a Website Slideshow document
      // The slideshow field contains the name of the linked Website Slideshow document
      if (websiteItem.slideshow) {
        if (typeof websiteItem.slideshow === 'string' && websiteItem.slideshow.trim() !== '') {
          // slideshow is a Link field - fetch the linked Website Slideshow document
          console.log(`Website Item "${websiteItemName}" is linked to slideshow: "${websiteItem.slideshow}"`);
          try {
            const slideshowDoc = await this.getSlideshow(websiteItem.slideshow);
            if (slideshowDoc) {
              websiteItem.slideshow_data = slideshowDoc;
              console.log(`Successfully fetched Website Slideshow: "${websiteItem.slideshow}"`);
            }
          } catch (error: any) {
            // Website Slideshow document might not exist or might not be accessible
            console.warn(`Failed to fetch linked Website Slideshow "${websiteItem.slideshow}":`, error?.message || error);
            // Continue without slideshow data - will check for child table in mapper as fallback
          }
        } else {
          console.log(`Website Item "${websiteItemName}" has slideshow field but it's not a valid link:`, websiteItem.slideshow);
        }
      } else {
        console.log(`Website Item "${websiteItemName}" has no slideshow link field`);
      }
      
      return websiteItem;
    } catch (error) {
      throw this.handleError(error);
    }
  }
  
  /**
   * Fetch Website Slideshow document with its child table
   * The child table contains Image, Heading, and Description fields
   */
  async getSlideshow(slideshowName: string): Promise<any> {
    try {
      // Fetch Website Slideshow document with all fields (child tables are included automatically)
      // Using wildcard to ensure all fields and child tables are fetched
      const response = await this.client.get(
        `${API_VERSION}/Website Slideshow/${slideshowName}?fields=["*"]`
      );
      const slideshowData = response.data.data;
      
      // Debug: log what we received
      console.log('Website Slideshow fetched:', slideshowName);
      console.log('Slideshow keys:', Object.keys(slideshowData || {}));
      
      // Check for child tables
      for (const key in slideshowData) {
        if (Array.isArray(slideshowData[key])) {
          console.log(`Found array key in slideshow: ${key} with ${slideshowData[key].length} items`);
          if (slideshowData[key].length > 0) {
            console.log(`First item in ${key}:`, slideshowData[key][0]);
          }
        }
      }
      
      return slideshowData;
    } catch (error) {
      console.error('Error fetching Website Slideshow:', error);
      throw this.handleError(error);
    }
  }
  
  /**
   * Get all fields from a Website Item (for reference/debugging)
   * Use this to discover available fields
   */
  async getWebsiteItemAllFields(websiteItemName: string): Promise<any> {
    try {
      // Fetch with wildcard to get all fields
      const response = await this.client.get(
        `${API_VERSION}/Website Item/${websiteItemName}?fields=["*"]`
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async searchWebsiteItems(query: string, company?: string): Promise<any[]> {
    try {
      if (!query || !query.trim()) {
        return [];
      }

      const searchTerm = query.trim();
      const allResults = new Map<string, any>(); // Use Map to avoid duplicates by name

      // Search in web_item_name
      try {
        const nameFilters: any = [
          ['Website Item', 'published', '=', 1],
          ['Website Item', 'web_item_name', 'like', `%${searchTerm}%`]
        ];
        if (company) {
          nameFilters.push(['Website Item', 'custom_company', '=', company]);
        }
        const nameResults = await this.getWebsiteItems(nameFilters, 50, 0);
        nameResults.forEach((item: any) => {
          if (item.name) {
            allResults.set(item.name, item);
          }
        });
      } catch (error) {
        console.warn('Error searching by web_item_name:', error);
      }

      // Search in item_code
      try {
        const codeFilters: any = [
          ['Website Item', 'published', '=', 1],
          ['Website Item', 'item_code', 'like', `%${searchTerm}%`]
        ];
      if (company) {
          codeFilters.push(['Website Item', 'custom_company', '=', company]);
      }
        const codeResults = await this.getWebsiteItems(codeFilters, 50, 0);
        codeResults.forEach((item: any) => {
          if (item.name) {
            allResults.set(item.name, item);
          }
        });
      } catch (error) {
        console.warn('Error searching by item_code:', error);
      }

      // Search in item_group
      try {
        const groupFilters: any = [
          ['Website Item', 'published', '=', 1],
          ['Website Item', 'item_group', 'like', `%${searchTerm}%`]
        ];
        if (company) {
          groupFilters.push(['Website Item', 'custom_company', '=', company]);
        }
        const groupResults = await this.getWebsiteItems(groupFilters, 50, 0);
        groupResults.forEach((item: any) => {
          if (item.name) {
            allResults.set(item.name, item);
          }
        });
      } catch (error) {
        console.warn('Error searching by item_group:', error);
      }

      // Convert Map to Array
      const websiteItems = Array.from(allResults.values());
      
      // Fetch prices and stock for search results
      const itemsWithPricesAndStock = await Promise.allSettled(
        websiteItems.map(async (item: any) => {
          // Fetch price if item_code is available
          if (item.item_code) {
            try {
              const price = await this.getItemPrice(item.item_code);
              if (price > 0) {
                item.price_list_rate = price;
              }
    } catch (error) {
              // Price fetch failed
            }
          }
          
          // Fetch stock if warehouse is available
          if (item.website_warehouse && item.item_code) {
            try {
              const stockData = await this.getWarehouseStock(
                item.website_warehouse,
                item.item_code
              );
              
              if (stockData && Array.isArray(stockData) && stockData.length > 0) {
                const totalStock = stockData.reduce((sum: number, bin: any) => {
                  const available = (bin.actual_qty || 0) - (bin.reserved_qty || 0);
                  return sum + available;
                }, 0);
                item.available_stock = Math.max(0, totalStock);
              } else {
                item.available_stock = 0;
              }
            } catch (error) {
              item.available_stock = 0;
            }
          } else {
            item.available_stock = 0;
          }
          
          return item;
        })
      );
      
      // Extract successful results
      return itemsWithPricesAndStock
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);
    } catch (error) {
      throw this.handleError(error);
    }
  }


  async getWebsiteItemsByCompany(company: string, limit: number = 50): Promise<any[]> {
    // Use getWebsiteItems with company filter - it already handles prices and stock
    const filters = [
      ['Website Item', 'custom_company', '=', company]
    ];
    return this.getWebsiteItems(filters, limit, 0);
  }

  // ITEMS/PRODUCTS - Legacy Item doctype (now delegates to Website Item)
  async getItems(filters?: any, limit: number = 20, offset: number = 0): Promise<any[]> {
    // Use Website Item instead of Item for better eCommerce support
    return this.getWebsiteItems(filters, limit, offset);
  }

  // Retry helper with exponential backoff
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error: any) {
        lastError = error;
        
        // Only retry on network errors or timeouts
        const isNetworkError = 
          error.code === 'ECONNABORTED' ||
          error.message === 'Network Error' ||
          error.code === 'ERR_NETWORK' ||
          error.code === 'ETIMEDOUT';
        
        if (!isNetworkError || attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Network error on attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  // Get latest Website Items (new arrivals) sorted by creation date
  async getNewArrivals(limit: number = 20, sortByPrice?: 'asc' | 'desc'): Promise<any[]> {
    return this.retryRequest(async () => {
      const filters = [['Website Item', 'published', '=', 1]];
      if (sortByPrice) {
        return this.getWebsiteItemsSortedByPrice(filters, limit, 0, sortByPrice);
      }

      // Same list request as getWebsiteItems (includes order_by, merged filters) — avoids 404s from a divergent URL.
      const fetchLimit = limit * 3;
      const items = await this.getWebsiteItems(filters, fetchLimit, 0, 'creation desc');

      const validItems = Array.isArray(items) ? [...items] : [];

      validItems.sort((a: any, b: any) => {
        if (a.ranking != null && b.ranking != null) {
          return (b.ranking as number) - (a.ranking as number);
        }
        const dateA = a.creation ? new Date(a.creation).getTime() : 0;
        const dateB = b.creation ? new Date(b.creation).getTime() : 0;
        return dateB - dateA;
      });

      return validItems.slice(0, limit);
    }).catch((error: any) => {
      console.error('Error fetching new arrivals:', error);
      throw this.handleError(error);
    });
  }

  // Get Website Items by group/category with optional price sorting
  async getWebsiteItemsByGroup(groupName: string, limit: number = 50, offset: number = 0, sortByPrice?: 'asc' | 'desc'): Promise<any[]> {
    // If price sorting is requested, use server-side sorting from ERPNext
    if (sortByPrice) {
      return this.getWebsiteItemsSortedByPrice(
        [['Website Item', 'item_group', '=', groupName]],
        limit,
        offset,
        sortByPrice
      );
    }
    // Use getWebsiteItems with item_group filter - it already handles prices and stock
    const filters = [['Website Item', 'item_group', '=', groupName]];
    return this.getWebsiteItems(filters, limit, offset);
  }
  
  /**
   * Get Website Items sorted by price from ERPNext (server-side sorting)
   * First queries Item Price to get sorted item codes, then fetches Website Items
   */
  async getWebsiteItemsSortedByPrice(
    filters?: any,
    limit: number = 20,
    offset: number = 0,
    sortDirection: 'asc' | 'desc' = 'asc'
  ): Promise<any[]> {
    try {
      // Step 1: Get all Website Items first to get their item_codes
      // Call getWebsiteItems with sortByPrice=undefined to avoid recursion
      const allWebsiteItems = await this.getWebsiteItems(filters, 1000, 0, undefined, undefined); // Get more items to sort properly
      const itemCodes = allWebsiteItems
        .map((item: any) => item.item_code)
        .filter((code: string) => code); // Filter out null/undefined
      
      if (itemCodes.length === 0) {
        return [];
      }
      
      // Step 2: Query Item Price sorted by price_list_rate
      const priceList = this.config.defaultPriceList || 'Standard Selling';
      const orderBy = sortDirection === 'asc' ? 'price_list_rate asc' : 'price_list_rate desc';
      
      // Build filters for Item Price: item_code in list AND price_list matches
      const priceFilters = [
        ['Item Price', 'item_code', 'in', itemCodes],
        ['Item Price', 'price_list', '=', priceList]
      ];
      
      const priceFields = ['item_code', 'price_list_rate', 'price_list'];
      let priceUrl = `${API_VERSION}/Item Price?fields=${encodeURIComponent(JSON.stringify(priceFields))}`;
      priceUrl += `&filters=${encodeURIComponent(JSON.stringify(priceFilters))}`;
      priceUrl += `&order_by=${encodeURIComponent(orderBy)}`;
      priceUrl += `&limit_page_length=${limit + offset}`; // Get enough to handle offset
      
      const priceResponse = await this.client.get(priceUrl);
      const sortedPrices = priceResponse.data.data || [];
      
      // Step 3: Create a map of item_code -> price for quick lookup
      const priceMap = new Map<string, number>();
      sortedPrices.forEach((priceItem: any) => {
        if (priceItem.item_code && priceItem.price_list_rate) {
          // Keep the first (best) price for each item_code
          if (!priceMap.has(priceItem.item_code)) {
            priceMap.set(priceItem.item_code, priceItem.price_list_rate);
          }
        }
      });
      
      // Step 4: Get sorted item codes (in price order)
      const sortedItemCodes = sortedPrices
        .map((priceItem: any) => priceItem.item_code)
        .filter((code: string) => code)
        .slice(offset, offset + limit); // Apply offset and limit
      
      // Step 5: Fetch Website Items for the sorted item codes
      // We need to fetch them in the sorted order
      const websiteItemMap = new Map<string, any>();
      allWebsiteItems.forEach((item: any) => {
        if (item.item_code) {
          websiteItemMap.set(item.item_code, item);
        }
      });
      
      // Step 6: Build result array in price-sorted order
      const sortedWebsiteItems = sortedItemCodes
        .map((itemCode: string) => websiteItemMap.get(itemCode))
        .filter((item: any) => item); // Remove any missing items
      
      // Step 7: Add prices and stock (prices already in map, just attach them)
      const itemsWithPricesAndStock = await Promise.allSettled(
        sortedWebsiteItems.map(async (item: any) => {
          // Use price from priceMap if available
          const price = priceMap.get(item.item_code);
          if (price && price > 0) {
            item.price_list_rate = price;
          } else {
            // Fallback to fetching price individually
            try {
              const fetchedPrice = await this.getItemPrice(item.item_code);
              if (fetchedPrice > 0) {
                item.price_list_rate = fetchedPrice;
              }
            } catch (error) {
              console.warn(`Failed to fetch price for ${item.item_code}:`, error);
            }
          }
          
          // Fetch stock
          if (item.website_warehouse && item.item_code) {
            try {
              const stockData = await this.getWarehouseStock(
                item.website_warehouse,
                item.item_code
              );
              
              if (stockData && Array.isArray(stockData) && stockData.length > 0) {
                const totalStock = stockData.reduce((sum: number, bin: any) => {
                  const available = (bin.actual_qty || 0) - (bin.reserved_qty || 0);
                  return sum + available;
                }, 0);
                item.available_stock = Math.max(0, totalStock);
              } else {
                item.available_stock = 0;
              }
            } catch (error) {
              console.warn(`Failed to fetch stock for ${item.item_code}:`, error);
              item.available_stock = 0;
            }
          } else {
            item.available_stock = 0;
          }
          
          return item;
        })
      );
      
      // Extract successful results
      return itemsWithPricesAndStock
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Legacy method - kept for backward compatibility
  async _getWebsiteItemsByGroupLegacy(groupName: string, limit: number = 50): Promise<any[]> {
    return this.retryRequest(async () => {
      const filters = [
        ['Website Item', 'item_group', '=', groupName],
        ['Website Item', 'published', '=', 1]
      ];
      
      const fields = [
        'name',
        'web_item_name',
        'route',
        'published',
        'item_code',
        'item_name',
        'item_group',
        'stock_uom',
        'custom_company',
        'brand',
        'description',
        'short_description',
        'web_long_description',
        'website_image',
        'website_image_alt',
        'thumbnail',
        'website_warehouse',
        'on_backorder',
        'ranking',
        'creation',
        'modified'
      ];
      
      let url = `${API_VERSION}/Website Item?fields=${encodeURIComponent(JSON.stringify(fields))}&limit_page_length=${limit}`;
      url += `&filters=${encodeURIComponent(JSON.stringify(filters))}`;

      const response = await this.client.get(url);
      let items = response.data.data || [];
      
      // Filter out unpublished items
      items = items.filter((item: any) => item.published === 1);
      
      // Sort by ranking or creation date
      items.sort((a: any, b: any) => {
        if (a.ranking && b.ranking) {
          return b.ranking - a.ranking;
        }
        const dateA = a.creation ? new Date(a.creation).getTime() : 0;
        const dateB = b.creation ? new Date(b.creation).getTime() : 0;
        return dateB - dateA;
      });
      
      return items.slice(0, limit);
    }).catch((error: any) => {
      throw this.handleError(error);
    });
  }

  /** Single Item document (item code = `name`) — images from Item.image */
  async getItem(itemCode: string): Promise<any> {
    try {
      const fields = [
        'name',
        'item_code',
        'item_name',
        'item_group',
        'stock_uom',
        'brand',
        'description',
        'image',
        'standard_rate',
        'disabled',
        'creation',
        'modified',
      ];
      const url = `${API_VERSION}/Item/${encodeURIComponent(itemCode)}?fields=${encodeURIComponent(JSON.stringify(fields))}`;
      const response = await this.client.get(url);
      const item = response.data.data;
      if (!item) {
        throw new Error(`Item not found: ${itemCode}`);
      }
      const code = item.item_code || item.name;
      try {
        const price = await this.getItemPrice(code);
        if (price > 0) {
          item.price_list_rate = price;
        }
      } catch {
        /* use standard_rate in mapper */
      }
      item.available_stock = 0;
      return item;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async searchItems(query: string, company?: string): Promise<any[]> {
    // Use Website Item for better eCommerce search
    return this.searchWebsiteItems(query, company);
  }

  // SALES ORDERS
  async createSalesOrder(orderData: {
    customer: string;
    company: string;
    transaction_date?: string;
    items: Array<{
      item_code: string;
      qty: number;
      rate?: number;
      amount?: number;
      description?: string;
    }>;
    delivery_date?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post(`${API_VERSION}/Sales Order`, orderData);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a Sales Invoice from a Sales Order
   * 
   * @param salesOrderName - Sales Order name (e.g., "SAL-ORD-2025-00031")
   * @param userEmail - User email to set in custom_user field (optional)
   * @returns Created Sales Invoice
   */
  async createSalesInvoiceFromSalesOrder(salesOrderName: string, userEmail?: string): Promise<any> {
    try {
      // First, get the Sales Order to extract its data
      const salesOrder = await this.getSalesOrder(salesOrderName);
      console.log('Sales Order fetched for invoice creation:', salesOrder.name);
      
      // Create Sales Invoice manually from Sales Order data
      const invoiceData: any = {
        customer: salesOrder.customer,
        company: salesOrder.company,
        posting_date: salesOrder.transaction_date || new Date().toISOString().split('T')[0],
        due_date: salesOrder.delivery_date || new Date().toISOString().split('T')[0],
        items: [],
      };
      
      // Set custom_user field with user email (required for filtering invoices by user)
      if (userEmail) {
        invoiceData.custom_user = userEmail;
        console.log('✅ Setting custom_user field to:', userEmail);
      } else {
        console.warn('⚠️ No userEmail provided - custom_user field will not be set');
      }
      
      // Copy items from Sales Order to Sales Invoice
      if (salesOrder.items && Array.isArray(salesOrder.items)) {
        invoiceData.items = salesOrder.items.map((item: any) => ({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: item.qty,
          rate: item.rate,
          amount: item.amount,
          sales_order: salesOrder.name,
          so_detail: item.name, // Reference to Sales Order Item
        }));
      }
      
      console.log('Creating Sales Invoice with data:', JSON.stringify(invoiceData, null, 2));
      console.log('Invoice custom_user field:', invoiceData.custom_user);
      
      // Create the Sales Invoice
      const response = await this.client.post(`${API_VERSION}/Sales Invoice`, invoiceData);
      const createdInvoice = response.data.data;
      
      console.log('Sales Invoice created successfully:', createdInvoice.name);
      console.log('Created Invoice custom_user field:', createdInvoice.custom_user);
      
      // Verify custom_user was set correctly
      if (userEmail && createdInvoice.custom_user !== userEmail) {
        console.warn('⚠️ Warning: custom_user field may not have been set correctly');
        console.warn('Expected:', userEmail, 'Got:', createdInvoice.custom_user);
      }
      
      return createdInvoice;
    } catch (error: any) {
      console.error('Error in createSalesInvoiceFromSalesOrder:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      
      // If manual creation fails, try the make_sales_invoice method as fallback
      try {
        console.log('Trying make_sales_invoice method as fallback');
        const fallbackResponse = await this.client.post('/api/method/erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice', {
          source_name: salesOrderName,
        });
        
        console.log('Fallback response:', JSON.stringify(fallbackResponse.data, null, 2));
        
        // Try to extract invoice name from fallback response
        let invoiceName: string | null = null;
        
        if (fallbackResponse.data?.message) {
          const msg = fallbackResponse.data.message;
          if (typeof msg === 'string') {
            invoiceName = msg;
          } else if (msg?.name) {
            invoiceName = msg.name;
          } else if (Array.isArray(msg) && msg.length > 0) {
            invoiceName = typeof msg[0] === 'string' ? msg[0] : msg[0]?.name;
          }
        }
        
        if (invoiceName) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const invoiceResponse = await this.client.get(`${API_VERSION}/Sales Invoice/${invoiceName}`);
          return invoiceResponse.data.data;
        }
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError);
      }
      
      throw this.handleError(error);
    }
  }

  /**
   * Submit a Sales Invoice using Frappe **`frappe.client.submit`** (same path as Supplier Quotation submit).
   * Falls back to a direct `docstatus` PUT only if submit fails (some older deployments).
   */
  async submitSalesInvoice(invoiceName: string): Promise<any> {
    const n = String(invoiceName || '').trim();
    if (!n) throw new Error('Sales Invoice name required');

    const fresh = await this.getSalesInvoiceRaw(n);
    if (!fresh) throw new Error('Sales Invoice not found.');
    if (Number(fresh.docstatus) === 1) return fresh;

    const { hasFrappeRavenSession, ravenCallFrappeMethod } = await import('./frappeRavenSession');
    const doc: Record<string, unknown> =
      typeof fresh === 'object' && String((fresh as { name?: unknown }).name || '').trim() === n
        ? ({ ...fresh } as Record<string, unknown>)
        : { doctype: 'Sales Invoice', name: n };

    const unwrapSubmit = (raw: any): any => {
      if (raw == null) return null;
      if (typeof raw === 'object' && 'message' in raw && raw.message != null) return raw.message;
      return raw;
    };

    try {
      const raw = hasFrappeRavenSession()
        ? await ravenCallFrappeMethod('frappe.client.submit', { doc })
        : await this.callFrappeMethod('frappe.client.submit', { doc });
      const submitted = unwrapSubmit(raw);
      await new Promise((r) => setTimeout(r, 300));
      const verified = await this.getSalesInvoiceRaw(n);
      if (verified && Number(verified.docstatus) === 1) return verified;
      if (submitted && typeof submitted === 'object' && Number((submitted as any).docstatus) === 1) {
        return submitted;
      }
      throw new Error('Sales Invoice submit did not return a submitted document.');
    } catch (error) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        await this.client.put(`${API_VERSION}/Sales Invoice/${encodeURIComponent(n)}?ignore_version=1`, {
          docstatus: 1,
        });
        await new Promise((r) => setTimeout(r, 400));
        const verifyInvoice = await this.getSalesInvoiceRaw(n);
        if (verifyInvoice && Number(verifyInvoice.docstatus) === 1) return verifyInvoice;
      } catch {
        /* use primary error */
      }
      throw this.handleError(error);
    }
  }

  async getCustomerByEmail(
    email: string,
    options?: { includePortalUsersChildScan?: boolean }
  ): Promise<any | null> {
    try {
      const emailNorm = (email || '').trim().toLowerCase();
      if (!emailNorm) return null;

      const doPortalChildScan = options?.includePortalUsersChildScan !== false;

      /** Fast paths: **email_id** exact match, then case-insensitive pass on one list (no per-doc GET). */
      for (const tryEmail of [...new Set([email.trim(), emailNorm].filter((e) => e.length > 0))]) {
        try {
          const filters = [['email_id', '=', tryEmail]];
          const response = await this.client.get(`${API_VERSION}/Customer`, {
            params: {
              fields: JSON.stringify(['name', 'customer_name', 'email_id']),
              filters: JSON.stringify(filters),
              limit_page_length: 1,
            },
          });

          if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
          }
        } catch (emailError: any) {
          console.warn('Email ID filter failed:', emailError?.response?.status || emailError.message);
        }
      }

      let listedCustomers: any[] = [];
      try {
        const response = await this.client.get(`${API_VERSION}/Customer`, {
          params: {
            fields: JSON.stringify(['name', 'customer_name', 'email_id']),
            limit_page_length: 500,
          },
        });
        listedCustomers = response.data?.data || [];
        for (const row of listedCustomers) {
          if (String(row?.email_id || '').trim().toLowerCase() === emailNorm) {
            return row;
          }
        }
      } catch (scanError: any) {
        console.warn('Email ID scan failed:', scanError?.response?.status || scanError.message);
      }

      if (!doPortalChildScan) {
        console.warn('No customer found for email:', emailNorm);
        return null;
      }

      /** Slow path: **portal_users** child — only when email_id did not match (e.g. login email only on portal row). */
      for (const cust of listedCustomers) {
        const id = String(cust?.name || '').trim();
        if (!id) continue;
        try {
          const fullCustomer = await this.client.get(`${API_VERSION}/Customer/${encodeURIComponent(id)}`, {
            params: {
              fields: JSON.stringify(['name', 'customer_name', 'email_id', 'portal_users']),
            },
          });

          if (fullCustomer.data && fullCustomer.data.data) {
            const customerData = fullCustomer.data.data;
            if (customerData.portal_users && Array.isArray(customerData.portal_users)) {
              const hasMatch = customerData.portal_users.some(
                (pu: any) => String(pu?.user || '').trim().toLowerCase() === emailNorm
              );
              if (hasMatch) {
                return {
                  name: customerData.name,
                  customer_name: customerData.customer_name,
                  email_id: customerData.email_id,
                };
              }
            }
          }
        } catch {
          continue;
        }
      }

      console.warn('No customer found for email:', emailNorm);
      return null;
    } catch (error: any) {
      console.error('Error fetching customer by email:', error?.response?.data || error?.message || error);
      return null;
    }
  }

  /**
   * Resolve ERPNext **Customer** `name` for a Frappe **User** (`User.name`, email, or Raven owner string).
   * Prefer **Portal User** rows on **Customer** (`parenttype = Customer`, **`user`** = portal login) — the standard
   * “customer portal” link between User and Customer — then Customer by id, email, User emails, child filters, Raven User, Contact, full portal scan.
   */
  async getCustomerIdForFrappeUserName(frappeUserName: string): Promise<string | null> {
    const u = String(frappeUserName || '').trim();
    if (!u) return null;

    const listRows = async (
      doctype: string,
      options?: {
        filters?: any[][];
        fields?: string[];
        order_by?: string;
        limit_page_length?: number;
        limit_start?: number;
      }
    ) => {
      const { hasFrappeRavenSession, ravenListResourceRows } = await import('./frappeRavenSession');
      if (hasFrappeRavenSession()) {
        return ravenListResourceRows(doctype, options);
      }
      return this.listResourceRows(doctype, options);
    };

    /** `tabPortal User`: each row ties a **Customer** (`parent`) to a portal **User** (`user`). */
    const tryCustomerFromPortalUserTable = async (candidates: string[]): Promise<string | null> => {
      if (this.skipPortalUserListQueries) return null;
      const uniq = [...new Set(candidates.map((c) => String(c || '').trim()).filter(Boolean))];
      for (const cand of uniq) {
        try {
          const rows = await listRows('Portal User', {
            filters: [
              ['parenttype', '=', 'Customer'],
              ['user', '=', cand],
            ],
            fields: ['parent', 'parenttype', 'user'],
            limit_page_length: 15,
          });
          for (const r of rows || []) {
            const pt = String((r as { parenttype?: string }).parenttype || '').trim();
            const parent = String((r as { parent?: string }).parent || '').trim();
            if (parent && pt === 'Customer') return parent;
          }
        } catch (e) {
          const st = (e as AxiosError)?.response?.status;
          const raw = JSON.stringify((e as AxiosError)?.response?.data ?? {}).toLowerCase();
          if (
            st === 403 ||
            raw.includes('insufficient permission') ||
            raw.includes('permissionerror')
          ) {
            this.skipPortalUserListQueries = true;
          }
        }
      }
      return null;
    };

    /** Optional site DocType **Customer User** linking `user` → `customer` (Customer name). */
    const tryCustomerUserDoc = async (candidates: string[]): Promise<string | null> => {
      const uniq = [...new Set(candidates.map((c) => String(c || '').trim()).filter(Boolean))];
      for (const cand of uniq) {
        try {
          const rows = await listRows('Customer User', {
            filters: [['user', '=', cand]],
            fields: ['name'],
            limit_page_length: 10,
          });
          for (const r of rows || []) {
            const rowName = String((r as { name?: string }).name || '').trim();
            if (!rowName) continue;
            let cid = '';
            try {
              const cur = await this.client.get(
                `${API_VERSION}/Customer User/${encodeURIComponent(rowName)}`,
                { params: { fields: JSON.stringify(['name', 'customer']) } }
              );
              cid = String(cur.data?.data?.customer || '').trim();
            } catch {
              continue;
            }
            if (!cid) continue;
            try {
              const ok = await listRows('Customer', {
                filters: [['name', '=', cid]],
                fields: ['name'],
                limit_page_length: 1,
              });
              if (ok?.[0]?.name) return String(ok[0].name).trim();
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* DocType missing or no permission */
        }
      }
      return null;
    };

    const fromPortalEarly = await tryCustomerFromPortalUserTable([u]);
    if (fromPortalEarly) return fromPortalEarly;

    const fromCustomerUserEarly = await tryCustomerUserDoc([u]);
    if (fromCustomerUserEarly) return fromCustomerUserEarly;

    try {
      const rows = await listRows('Customer', {
        filters: [['name', '=', u]],
        fields: ['name'],
        limit_page_length: 1,
      });
      const hit = rows?.[0]?.name;
      if (hit != null && String(hit).trim()) return String(hit).trim();
    } catch {
      /* ignore */
    }

    if (u.includes('@')) {
      const byMail = await this.getCustomerByEmail(u);
      if (byMail?.name) return String(byMail.name).trim();
    }

    let userDoc: any = null;
    try {
      const { hasFrappeRavenSession, ravenGetResourceDoc } = await import('./frappeRavenSession');
      if (hasFrappeRavenSession()) {
        userDoc = await ravenGetResourceDoc('User', u);
      } else {
        const res = await this.client.get(`${API_VERSION}/User/${encodeURIComponent(u)}`);
        userDoc = res.data?.data ?? null;
      }
    } catch {
      userDoc = null;
    }

    if (userDoc && typeof userDoc === 'object') {
      for (const mailField of ['email', 'user_email']) {
        const mail = String((userDoc as any)[mailField] || '')
          .trim()
          .toLowerCase();
        if (mail.includes('@')) {
          const c = await this.getCustomerByEmail(mail);
          if (c?.name) return String(c.name).trim();
        }
      }
      const username = String((userDoc as any).username || '').trim();
      if (username.includes('@')) {
        const c2 = await this.getCustomerByEmail(username);
        if (c2?.name) return String(c2.name).trim();
      }
      const uname = String((userDoc as any).name || '').trim();
      if (uname && uname !== u && uname.includes('@')) {
        const c3 = await this.getCustomerByEmail(uname);
        if (c3?.name) return String(c3.name).trim();
      }
    }

    /** Portal rows usually store **User.name**; Raven may pass email — re-query Portal User / Customer User with every id on the User doc. */
    const portalUserCandidates: string[] = [u];
    if (userDoc && typeof userDoc === 'object') {
      for (const k of ['name', 'email', 'user_email', 'username'] as const) {
        const v = String((userDoc as any)[k] || '').trim();
        if (v) portalUserCandidates.push(v);
      }
    }
    if (u.includes('@') && (!userDoc || !String((userDoc as any)?.name || '').trim())) {
      try {
        const urows = await listRows('User', {
          filters: [
            ['enabled', '=', 1],
            ['email', '=', u.trim()],
          ],
          fields: ['name', 'email', 'user_email', 'username'],
          limit_page_length: 3,
        });
        const first = urows?.[0] as Record<string, unknown> | undefined;
        if (first) {
          for (const k of ['name', 'email', 'user_email', 'username'] as const) {
            const v = String(first[k] || '').trim();
            if (v) portalUserCandidates.push(v);
          }
        }
      } catch {
        /* ignore */
      }
    }
    const fromPortalUserDoc = await tryCustomerFromPortalUserTable(portalUserCandidates);
    if (fromPortalUserDoc) return fromPortalUserDoc;
    const fromCustomerUserDoc = await tryCustomerUserDoc(portalUserCandidates);
    if (fromCustomerUserDoc) return fromCustomerUserDoc;

    const uniqPortalCands = [...new Set(portalUserCandidates.map((c) => c.trim()).filter(Boolean))];

    for (const child of ['Portal User', 'Customer Portal User']) {
      for (const cand of uniqPortalCands) {
        try {
          const rows = await listRows('Customer', {
            filters: [[child, 'user', '=', cand]],
            fields: ['name'],
            limit_page_length: 5,
          });
          const hit = rows?.[0]?.name;
          if (hit != null && String(hit).trim()) return String(hit).trim();
        } catch {
          /* child table name differs by ERPNext version */
        }
      }
    }

    try {
      const seenRu = new Set<string>();
      for (const cand of uniqPortalCands) {
        let ruRows: any[] = [];
        try {
          ruRows = await listRows('Raven User', {
            filters: [['user', '=', cand]],
            fields: ['name', 'custom_customer', 'customer', 'default_customer', 'party'],
            limit_page_length: 8,
          });
        } catch {
          ruRows = [];
        }
        for (const ru of ruRows || []) {
          const ruDocName = String((ru as { name?: string }).name || '').trim();
          if (!ruDocName || seenRu.has(ruDocName)) continue;
          seenRu.add(ruDocName);
          const ruRec = ru as Record<string, unknown>;
          /** Site field **custom_customer** on Raven User (preferred). */
          for (const key of ['custom_customer', 'customer', 'default_customer', 'party'] as const) {
            const pid = String(ruRec[key] || '').trim();
            if (!pid) continue;
            try {
              const cr = await listRows('Customer', {
                filters: [['name', '=', pid]],
                fields: ['name'],
                limit_page_length: 1,
              });
              if (cr?.[0]?.name) return String(cr[0].name).trim();
            } catch {
              /* ignore */
            }
          }
          try {
            const custHit = await listRows('Customer', {
              filters: [['name', '=', ruDocName]],
              fields: ['name'],
              limit_page_length: 1,
            });
            if (custHit?.[0]?.name) return String(custHit[0].name).trim();
          } catch {
            /* ignore */
          }
          try {
            const { hasFrappeRavenSession, ravenGetResourceDoc } = await import('./frappeRavenSession');
            let ruFull: any = null;
            if (hasFrappeRavenSession()) {
              ruFull = await ravenGetResourceDoc('Raven User', ruDocName);
            } else {
              const rres = await this.client.get(`${API_VERSION}/Raven User/${encodeURIComponent(ruDocName)}`);
              ruFull = rres.data?.data ?? null;
            }
            if (ruFull && typeof ruFull === 'object') {
              for (const key of ['custom_customer', 'customer', 'default_customer', 'party']) {
                const pid = String((ruFull as Record<string, unknown>)[key] || '').trim();
                if (!pid) continue;
                const cr = await listRows('Customer', {
                  filters: [['name', '=', pid]],
                  fields: ['name'],
                  limit_page_length: 1,
                });
                if (cr?.[0]?.name) return String(cr[0].name).trim();
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* Raven User doctype missing or no access */
    }

    for (const cand of uniqPortalCands) {
      for (const uf of ['user', 'user_id'] as const) {
        try {
          const contacts = await listRows('Contact', {
            filters: [[uf, '=', cand]],
            fields: ['name'],
            limit_page_length: 12,
          });
          for (const ct of contacts || []) {
            const cn = String((ct as { name?: string }).name || '').trim();
            if (!cn) continue;
            try {
              const full = await this.client.get(`${API_VERSION}/Contact/${encodeURIComponent(cn)}`, {
                params: { fields: JSON.stringify(['name', 'links']) },
              });
              const links = full.data?.data?.links;
              if (Array.isArray(links)) {
                for (const L of links) {
                  if (String(L?.link_doctype || '').trim() === 'Customer' && L?.link_name) {
                    const cname = String(L.link_name).trim();
                    if (cname) return cname;
                  }
                }
              }
            } catch {
              continue;
            }
          }
        } catch {
          /* Contact field name differs */
        }
      }
    }

    try {
      const response = await this.client.get(`${API_VERSION}/Customer`, {
        params: {
          fields: JSON.stringify(['name']),
          limit_page_length: 400,
        },
      });
      for (const cust of response.data?.data || []) {
        try {
          const fullCustomer = await this.client.get(`${API_VERSION}/Customer/${encodeURIComponent(cust.name)}`, {
            params: {
              fields: JSON.stringify(['name', 'portal_users']),
            },
          });
          const customerData = fullCustomer.data?.data;
          if (customerData?.portal_users && Array.isArray(customerData.portal_users)) {
            const hit = customerData.portal_users.some((pu: { user?: string }) => {
              const v = String(pu?.user || '').trim();
              if (!v) return false;
              return uniqPortalCands.some(
                (c) => v === c || (c.length > 0 && v.toLowerCase() === c.toLowerCase())
              );
            });
            if (hit) return String(customerData.name).trim();
          }
        } catch {
          continue;
        }
      }
    } catch {
      /* ignore */
    }

    return null;
  }

  async getSalesOrder(orderName: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Sales Order/${orderName}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Submit a Sales Order
   * Submits the Sales Order so it can be referenced in Payment Entries
   * Sets docstatus to 1 (Submitted)
   * 
   * @param orderName - Sales Order name (e.g., "SAL-ORD-2025-00031")
   * @returns Submitted Sales Order
   */
  async submitSalesOrder(orderName: string): Promise<any> {
    try {
      // Use direct docstatus update via PUT request with ignore_version query parameter
      // This avoids TimestampMismatchError by bypassing the submit API entirely
      // Wait a moment for the document to be fully created
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch latest version first to get current state
      const latestOrder = await this.client.get(`${API_VERSION}/Sales Order/${orderName}`);
      console.log('Fetched latest Sales Order before submission, modified:', latestOrder.data.data.modified);
      
      // Wait a bit more to ensure we have the absolute latest
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update docstatus directly using PUT with ignore_version query parameter
      const updateResponse = await this.client.put(
        `${API_VERSION}/Sales Order/${orderName}?ignore_version=1`,
        {
          docstatus: 1,
        }
      );
      
      // Verify submission by checking docstatus
      await new Promise(resolve => setTimeout(resolve, 500));
      const verifyOrder = await this.client.get(`${API_VERSION}/Sales Order/${orderName}`);
      const order = verifyOrder.data.data;
      
      if (order.docstatus === 1) {
        console.log('Sales Order submitted successfully (docstatus = 1) via direct update');
        return order;
      } else {
        throw new Error('Sales Order docstatus is not 1 after update');
      }
    } catch (error) {
      // If direct update fails, try one more time with a longer wait
      try {
        console.warn('Direct docstatus update failed, retrying with longer wait');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryResponse = await this.client.put(
          `${API_VERSION}/Sales Order/${orderName}?ignore_version=1`,
          {
            docstatus: 1,
          }
        );
        
        // Verify
        await new Promise(resolve => setTimeout(resolve, 500));
        const verifyOrder = await this.client.get(`${API_VERSION}/Sales Order/${orderName}`);
        return verifyOrder.data.data;
      } catch (retryError) {
        throw this.handleError(error);
      }
    }
  }

  /**
   * Submit a Payment Entry
   * Submits the Payment Entry (sets docstatus to 1)
   * 
   * @param paymentEntryName - Payment Entry name (e.g., "ACC-PAY-2025-00007")
   * @returns Submitted Payment Entry
   */
  async submitPaymentEntry(paymentEntryName: string): Promise<any> {
    try {
      // Use direct docstatus update via PUT request with ignore_version query parameter
      // This avoids TimestampMismatchError by bypassing the submit API entirely
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch latest version first to get current state
      const latestEntry = await this.getPaymentEntry(paymentEntryName);
      console.log('Fetched latest Payment Entry before submission, modified:', latestEntry.modified);
      
      // Wait a bit more to ensure we have the absolute latest
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update docstatus directly using PUT with ignore_version query parameter
      const updateResponse = await this.client.put(
        `${API_VERSION}/Payment Entry/${paymentEntryName}?ignore_version=1`,
        {
          docstatus: 1,
        }
      );
      
      // Verify submission by checking docstatus
      await new Promise(resolve => setTimeout(resolve, 500));
      const verifyEntry = await this.getPaymentEntry(paymentEntryName);
      
      if (verifyEntry.docstatus === 1) {
        console.log('Payment Entry submitted successfully (docstatus = 1) via direct update');
        return verifyEntry;
      } else {
        // If direct update didn't work, try one more time with longer wait
        console.warn('Direct update did not set docstatus to 1, retrying');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryUpdate = await this.client.put(
          `${API_VERSION}/Payment Entry/${paymentEntryName}?ignore_version=1`,
          {
            docstatus: 1,
          }
        );
        
        // Verify again
        await new Promise(resolve => setTimeout(resolve, 500));
        const retryVerify = await this.getPaymentEntry(paymentEntryName);
        return retryVerify;
      }
    } catch (error: any) {
      // If direct update fails, try one more time with a longer wait
      try {
        console.warn('Direct docstatus update failed, retrying with longer wait');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryResponse = await this.client.put(
          `${API_VERSION}/Payment Entry/${paymentEntryName}?ignore_version=1`,
          {
            docstatus: 1,
          }
        );
        
        // Verify
        await new Promise(resolve => setTimeout(resolve, 500));
        const verifyEntry = await this.getPaymentEntry(paymentEntryName);
        return verifyEntry;
      } catch (retryError) {
        throw this.handleError(error);
      }
    }
  }

  /**
   * Get a Payment Entry by name
   * 
   * @param paymentEntryName - Payment Entry name
   * @returns Payment Entry
   */
  async getPaymentEntry(paymentEntryName: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Payment Entry/${paymentEntryName}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a Payment Entry against a Sales Invoice
   * 
   * @param paymentEntryData - Payment Entry data
   * @param submit - Whether to submit the Payment Entry immediately (docstatus = 1)
   * @returns Created Payment Entry
   */
  async createPaymentEntry(
    paymentEntryData: {
      party_type: string; // 'Customer'
      party: string; // Customer name
      payment_type: string; // 'Receive' for customer payments
      company: string;
      paid_amount: number; // Amount paid
      received_amount: number; // Amount received (same as paid_amount for customer)
      references?: Array<{
        reference_doctype: string; // 'Sales Invoice'
        reference_name: string; // Sales Invoice name
        total_amount: number;
        outstanding_amount: number;
        allocated_amount: number;
      }>;
      mode_of_payment?: string;
      custom_paystack_reference?: string;
      custom_paystack_status?: string;
      custom_display_text?: string;
    },
    submit: boolean = false
  ): Promise<any> {
    try {
      // Create the Payment Entry as draft first
      const response = await this.client.post(`${API_VERSION}/Payment Entry`, paymentEntryData);
      const paymentEntry = response.data.data;
      
      // If submit is true, update docstatus directly to 1 (bypass submit API)
      if (submit && paymentEntry.name) {
        try {
          // Wait a moment for the document to be fully created and processed by ERPNext
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Fetch the latest version to get current state
          const latestEntry = await this.getPaymentEntry(paymentEntry.name);
          console.log('Fetched latest Payment Entry before submission, modified:', latestEntry.modified);
          
          // Wait a bit more to ensure we have the absolute latest
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Update docstatus directly using PUT with ignore_version query parameter
          // This bypasses the submit API entirely to avoid timestamp mismatch
          const updateResponse = await this.client.put(
            `${API_VERSION}/Payment Entry/${paymentEntry.name}?ignore_version=1`,
            {
              docstatus: 1,
            }
          );
          
          // Verify submission
          await new Promise(resolve => setTimeout(resolve, 500));
          const verifyEntry = await this.getPaymentEntry(paymentEntry.name);
          
          if (verifyEntry.docstatus === 1) {
            console.log('Payment Entry created and submitted successfully (docstatus = 1) via direct update');
            return verifyEntry;
          } else {
            // If direct update didn't work, try one more time with longer wait
            console.warn('Direct update did not set docstatus to 1, retrying');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const retryUpdate = await this.client.put(
              `${API_VERSION}/Payment Entry/${paymentEntry.name}?ignore_version=1`,
              {
                docstatus: 1,
              }
            );
            
            // Verify again
            await new Promise(resolve => setTimeout(resolve, 500));
            const retryVerify = await this.getPaymentEntry(paymentEntry.name);
            return retryVerify;
          }
        } catch (submitError: any) {
          console.warn('Error updating Payment Entry docstatus:', submitError);
          // Return the created entry even if submission fails
          return paymentEntry;
        }
      }
      
      return paymentEntry;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getSalesOrders(
    customerId: string,
    company?: string,
    limit: number = 20,
    start: number = 0
  ): Promise<any[]> {
    try {
      // Return empty array if customerId is empty or invalid
      if (!customerId || customerId.trim() === '') {
        return [];
      }

      const filters = [['Sales Order', 'customer', '=', customerId]];
      if (company) {
        filters.push(['Sales Order', 'company', '=', company]);
      }

      const response = await this.client.get(`${API_VERSION}/Sales Order`, {
        params: {
          fields: JSON.stringify(['name', 'customer', 'company', 'status', 'docstatus', 'total', 'transaction_date', 'grand_total', 'creation']),
          filters: JSON.stringify(filters),
          limit_page_length: limit,
          limit_start: start,
          order_by: 'creation desc',
        },
      });
      
      return response.data.data || [];
    } catch (error) {
      // If it's a JSON decode error or filter error, return empty array
      const errorMessage = (error as any)?.response?.data?.exc || (error as any)?.message || '';
      if (errorMessage.includes('JSONDecodeError') || errorMessage.includes('Expecting value')) {
        console.warn('Invalid filters for Sales Order query, returning empty array');
        return [];
      }
      throw this.handleError(error);
    }
  }

  // SALES INVOICES
  async getSalesInvoices(
    userEmail: string,
    limit: number = 20
  ): Promise<any[]> {
    try {
      // Return empty array if userEmail is empty or invalid
      if (!userEmail || userEmail.trim() === '') {
        return [];
      }

      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();

      // Filter by custom_user field to get invoices for the logged-in user
      const filters = [['Sales Invoice', 'custom_user', '=', userEmail]];

      const response = await sessionClient.get(`${API_VERSION}/Sales Invoice`, {
        params: {
          fields: JSON.stringify(['name', 'customer', 'posting_date', 'grand_total', 'status', 'custom_user']),
          filters: JSON.stringify(filters),
          limit_page_length: limit,
          order_by: 'posting_date desc',
        },
      });
      
      const invoices = response.data.data || [];
      console.log(`📄 Fetched ${invoices.length} Sales Invoices for user ${userEmail}`);
      if (invoices.length > 0) {
        console.log('Sample invoice:', {
          name: invoices[0].name,
          customer: invoices[0].customer,
          custom_user: invoices[0].custom_user,
          posting_date: invoices[0].posting_date,
          grand_total: invoices[0].grand_total,
          status: invoices[0].status,
        });
      }
      
      return invoices;
    } catch (error) {
      console.error('Error fetching Sales Invoices:', error);
      // If it's a JSON decode error or filter error, return empty array
      const errorMessage = (error as any)?.response?.data?.exc || (error as any)?.message || '';
      if (errorMessage.includes('JSONDecodeError') || errorMessage.includes('Expecting value')) {
        console.warn('Invalid filters for Sales Invoice query, returning empty array');
        return [];
      }
      throw this.handleError(error);
    }
  }

  async getSalesInvoice(invoiceName: string): Promise<any> {
    try {
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      // Fetch the full invoice document by name to get child table data (items)
      const response = await sessionClient.get(`${API_VERSION}/Sales Invoice/${invoiceName}`);
      
      if (response.data.data) {
        const invoice = response.data.data;
        
        console.log('Sales Invoice fetched:', {
          name: invoice.name,
          customer: invoice.customer,
          date: invoice.date,
          posting_time: invoice.posting_time,
          itemsCount: invoice.items?.length || 0,
          items: invoice.items,
        });
        
        return invoice;
      }
      
      return null;
    } catch (error) {
      // If invoice not found, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        return null;
      }
      throw this.handleError(error);
    }
  }

  // INVOICES (Legacy - keeping for backward compatibility)
  async createInvoice(invoiceData: {
    customer: string;
    company: string;
    items: Array<{
      item_code: string;
      qty: number;
      rate: number;
    }>;
    due_date?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post(
        `${API_VERSION}/Sales Invoice`,
        invoiceData
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getInvoice(invoiceName: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Sales Invoice/${invoiceName}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // STOCK
  async getItemStock(itemCode: string, warehouse?: string): Promise<any> {
    try {
      let url = `${API_VERSION}/Item/${itemCode}`;
      const response = await this.client.get(url);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getWarehouseStock(warehouse: string, itemCode?: string): Promise<any> {
    try {
      // Build filters array - escape special characters in values
      const filters: any[] = [['Bin', 'warehouse', '=', warehouse]];
      if (itemCode) {
        filters.push(['Bin', 'item_code', '=', itemCode]);
      }

      // Use the same URL building approach as getWebsiteItems (which works)
      const fields = ['item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'ordered_qty'];
      const fieldsStr = JSON.stringify(fields);
      const filtersStr = JSON.stringify(filters);
      
      // Build URL exactly like getWebsiteItems does
      let url = `${API_VERSION}/Bin?fields=${encodeURIComponent(fieldsStr)}`;
      url += `&filters=${encodeURIComponent(filtersStr)}`;

      const response = await this.client.get(url);
      if (response.data && response.data.data) {
      return response.data.data;
      }
      return [];
    } catch (error: any) {
      const errorData = error?.response?.data as ERPNextError | undefined;
      // Log the actual error for debugging
      if (errorData?.exc_type === 'JSONDecodeError') {
        console.warn(`ERPNext JSON decode error for Bin query. Warehouse: ${warehouse}, Item: ${itemCode}`);
        console.warn(`This might indicate an ERPNext server configuration issue or API version mismatch.`);
        return [];
      }
      console.error(`Error fetching warehouse stock for warehouse: ${warehouse}, item: ${itemCode}`, error);
      // Don't throw - return empty array so app can continue
      return [];
    }
  }

  // PRICE LISTS
  async getPriceLists(): Promise<any[]> {
    try {
      const response = await this.client.get(
        `${API_VERSION}/Price List?fields=["name","price_list_name","currency"]`
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get item price from Item Price doctype
   * Tries multiple price lists: configured default, then "Standard Selling", then any available
   */
  async getFlyers(limit: number = 10): Promise<any[]> {
    try {
      // Use only permitted fields (description not queryable in list view)
      const fields = ['name', 'flyer_name', 'image'];
      const response = await this.client.get(`${API_VERSION}/Flyer`, {
        params: {
          fields: JSON.stringify(fields),
          limit_page_length: limit,
          order_by: 'creation desc', // Most recent first
        },
      });
      const flyers = response.data.data || [];
      
      // Log to debug
      console.log(`🖼️ Fetched ${flyers.length} flyers from Flyer doctype`);
      flyers.forEach((flyer: any, index: number) => {
        console.log(`Flyer ${index + 1}:`, {
          name: flyer.name,
          flyer_name: flyer.flyer_name,
          image: flyer.image,
        });
      });
      
      return flyers.map((flyer: any) => ({
        name: flyer.name,
        flyer_name: flyer.flyer_name,
        image: flyer.image || null,
        description: '',
      }));
    } catch (error) {
      console.warn('Error fetching flyers from Flyer doctype:', error);
      return [];
    }
  }

  async getItemPrice(
    itemCode: string,
    priceListName?: string,
    quantity: number = 1
  ): Promise<number> {
    try {
      // Try configured price list first, then default to "Standard Selling"
      const priceListsToTry = priceListName 
        ? [priceListName]
        : this.config.defaultPriceList
        ? [this.config.defaultPriceList, 'Standard Selling']
        : ['Standard Selling'];
      
      for (const priceList of priceListsToTry) {
        try {
          // Use only price_list field (not price_list_name)
          const filters = [['Item Price', 'item_code', '=', itemCode], ['Item Price', 'price_list', '=', priceList]];
          const fields = ['name', 'price_list_rate', 'price_list', 'item_code'];
          const fieldsStr = JSON.stringify(fields);
          const filtersStr = JSON.stringify(filters);
          
          // Build URL exactly like getWebsiteItems does
          let url = `${API_VERSION}/Item Price?fields=${encodeURIComponent(fieldsStr)}`;
          url += `&filters=${encodeURIComponent(filtersStr)}`;
          url += `&limit_page_length=1`;

          const response = await this.client.get(url);
          if (response.data && response.data.data && response.data.data.length > 0) {
            // Get the first matching price
            const itemPrice = response.data.data[0];
            const price = itemPrice.price_list_rate;
            if (price !== null && price !== undefined && price > 0) {
              console.log(`Found price for ${itemCode} in price list ${priceList}: ${price}`);
              return price;
            }
          }
        } catch (error: any) {
          const errorData = error?.response?.data as ERPNextError | undefined;
          // If it's a JSON decode error, skip this price list
          if (errorData?.exc_type === 'JSONDecodeError') {
            continue;
          }
          // Log error but try next price list
          console.warn(`Failed to fetch price from price list ${priceList} for ${itemCode}:`, error?.message || error);
          continue;
        }
      }
      
      // If no price found in any price list, try to get any price for this item
      try {
        // Use only price_list field (not price_list_name)
        const fields = ['name', 'price_list_rate', 'price_list', 'item_code'];
        const filters = [['Item Price', 'item_code', '=', itemCode]];
        const fieldsStr = JSON.stringify(fields);
        const filtersStr = JSON.stringify(filters);
        
        // Build URL exactly like getWebsiteItems does
        let url = `${API_VERSION}/Item Price?fields=${encodeURIComponent(fieldsStr)}`;
        url += `&filters=${encodeURIComponent(filtersStr)}`;
        url += `&limit_page_length=1`;
        url += `&order_by=modified%20desc`;

        const response = await this.client.get(url);
        if (response.data && response.data.data && response.data.data.length > 0) {
          // Get the most recent price
          const itemPrice = response.data.data[0];
          const price = itemPrice.price_list_rate;
          if (price !== null && price !== undefined && price > 0) {
            console.log(`Found price for ${itemCode} in any price list: ${price} (from ${itemPrice.price_list || 'unknown'})`);
            return price;
          }
        }
      } catch (error: any) {
        const errorData = error?.response?.data as ERPNextError | undefined;
        // If it's a JSON decode error, it's likely an ERPNext server configuration issue
        if (errorData?.exc_type !== 'JSONDecodeError') {
          console.warn(`No price found for item ${itemCode}:`, error?.message || error);
        }
      }
      
      return 0;
    } catch (error) {
      console.warn(`Error fetching price for item ${itemCode}:`, error);
      return 0;
    }
  }

  // ADDRESSES
  async createAddress(addressData: {
    address_title: string;
    address_type: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    county?: string;
    state?: string;
    pincode: string;
    country: string;
    phone?: string;
    email_id?: string;
    fax?: string;
    tax_category?: string;
    is_primary_address?: number;
    is_shipping_address?: number;
    disabled?: number;
    is_your_company_address?: number;
    links?: Array<{
      link_doctype: string;
      link_name: string;
    }>;
  }): Promise<any> {
    try {
      const response = await this.client.post(`${API_VERSION}/Address`, addressData);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getOrCreateCustomer(userEmail: string, fullName?: string): Promise<any> {
    try {
      // First, resolve by portal user/email mapping (Customer.portal_users.user)
      const existingByPortal = await this.getCustomerByEmail(userEmail);
      if (existingByPortal) {
        return existingByPortal;
      }

      // Customer doesn't exist, create one
      const createResponse = await this.createCustomer({
        customer_name: fullName || userEmail,
        email: userEmail,
        customer_type: 'Individual',
      });
      if (createResponse) {
        return createResponse;
      }
      
      throw new Error('Failed to create customer');
    } catch (error) {
      // If customer creation fails but customer might already exist by name, try to fetch it
      try {
        const fallbackResponse = await this.client.get(`${API_VERSION}/Customer`, {
          params: {
            fields: JSON.stringify(['name', 'customer_name', 'email_id']),
            limit_page_length: 1,
          },
        });
        if (fallbackResponse.data.data && fallbackResponse.data.data.length > 0) {
          return fallbackResponse.data.data[0];
        }
      } catch (fallbackError) {
        // Ignore fallback error
      }
      throw this.handleError(error);
    }
  }

  async getAddresses(customerName: string): Promise<any[]> {
    try {
      // Fetch all addresses, then filter client-side for those linked to this customer
      const response = await this.client.get(`${API_VERSION}/Address`, {
        params: {
          fields: JSON.stringify(['name', 'address_title', 'address_type', 'address_line1', 'address_line2', 'city', 'county', 'state', 'country', 'pincode', 'email_id', 'phone', 'fax', 'tax_category', 'is_primary_address', 'is_shipping_address', 'disabled', 'is_your_company_address', 'links']),
          limit_page_length: 500,
        },
      });
      
      const allAddresses = response.data.data || [];
      
      // Filter addresses that are linked to this customer
      const linkedAddresses = allAddresses.filter((address: any) => {
        if (!address.links || !Array.isArray(address.links)) {
          return false;
        }
        return address.links.some((link: any) => 
          link.link_doctype === 'Customer' && link.link_name === customerName
        );
      });
      
      return linkedAddresses;
    } catch (error) {
      console.warn('Error fetching addresses:', error);
      return [];
    }
  }

  async getAddressesByEmail(userEmail: string): Promise<any[]> {
    try {
      // Preferred lookup: resolve customer's actual name via portal_users and match Address links.
      const customer = await this.getCustomerByEmail(userEmail);

      // Fetch all addresses, then filter by email_id field
      const response = await this.client.get(`${API_VERSION}/Address`, {
        params: {
          fields: JSON.stringify(['name', 'address_title', 'address_type', 'address_line1', 'address_line2', 'city', 'county', 'state', 'country', 'pincode', 'email_id', 'phone', 'fax', 'tax_category', 'is_primary_address', 'is_shipping_address', 'disabled', 'is_your_company_address', 'links']),
          limit_page_length: 500,
        },
      });
      
      const allAddresses = response.data.data || [];
      
      console.log('All addresses from API:', allAddresses);
      console.log('Looking for email:', userEmail);
      
      // Filter addresses linked to resolved customer first; fallback to email-based matching.
      const addressesByEmail = allAddresses.filter((address: any) => {
        if (customer?.name && address.links && Array.isArray(address.links)) {
          const hasCustomerLink = address.links.some((link: any) =>
            link.link_doctype === 'Customer' && link.link_name === customer.name
          );
          if (hasCustomerLink) return true;
        }

        // Check email_id field directly
        if (address.email_id === userEmail) {
          return true;
        }
        
        // Also check if email matches in links (customer links might use email)
        if (address.links && Array.isArray(address.links)) {
          const hasEmailLink = address.links.some((link: any) => 
            link.link_name === userEmail
          );
          if (hasEmailLink) {
            return true;
          }
        }
        
        return false;
      });
      
      console.log('Filtered addresses by email:', addressesByEmail);
      return addressesByEmail;
    } catch (error) {
      console.warn('Error fetching addresses by email:', error);
      return [];
    }
  }

  async updateAddress(addressName: string, addressData: any): Promise<any> {
    try {
      const response = await this.client.put(`${API_VERSION}/Address/${addressName}`, addressData);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteAddress(addressName: string): Promise<any> {
    try {
      const response = await this.client.delete(`${API_VERSION}/Address/${addressName}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // CATEGORIES / ITEM GROUPS
  async getItemGroups(): Promise<any[]> {
    try {
      const response = await this.client.get(
        `${API_VERSION}/Item Group?fields=["name","item_group_name","image","is_group","parent_item_group"]`
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // PRICING RULES
  /**
   * Fetch all available fields from Pricing Rule doctype
   * Use this to see what fields are available in your ERPNext instance
   */
  async getPricingRuleAllFields(): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Pricing Rule`);
      console.log('📋 Pricing Rule Fields Available:', JSON.stringify(response.data.data[0], null, 2));
      return response.data.data[0];
    } catch (error) {
      console.error('Error fetching Pricing Rule fields:', error);
      return null;
    }
  }

  async getPricingRules(): Promise<any[]> {
    try {
      // First, get list of pricing rules
      const listResponse = await this.client.get(`${API_VERSION}/Pricing Rule?limit_page_length=500`);
      const ruleNames = (listResponse.data.data || [])
        .filter((rule: any) => !rule.disable)
        .map((rule: any) => rule.name);
      
      // Fetch each rule individually to get full details (includes all fields including custom fields)
      const fullRules: any[] = [];
      for (const ruleName of ruleNames) {
        try {
          const ruleResponse = await this.client.get(`${API_VERSION}/Pricing Rule/${ruleName}`);
          if (ruleResponse.data.data) {
            const ruleData = ruleResponse.data.data;
            // Log to debug custom_flyer field - check if it exists
            if (ruleData.custom_flyer !== undefined && ruleData.custom_flyer !== null) {
              console.log(`🖼️ Found custom_flyer in ${ruleName}:`, ruleData.custom_flyer, typeof ruleData.custom_flyer);
            } else {
              // Log all field names to help debug
              const allFields = Object.keys(ruleData);
              const customFields = allFields.filter(f => f.startsWith('custom_'));
              if (customFields.length > 0) {
                console.log(`📋 Custom fields in ${ruleName}:`, customFields);
              }
            }
            fullRules.push(ruleData);
          }
        } catch (error) {
          console.warn(`Could not fetch pricing rule details for ${ruleName}`);
        }
      }
      
      // Filter out expired rules
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const activeRules = fullRules.filter((rule: any) => {
        // Check if disabled
        if (rule.disable === 1) {
          return false;
        }
        
        // Check valid_from date
        if (rule.valid_from) {
          const validFrom = new Date(rule.valid_from);
          validFrom.setHours(0, 0, 0, 0);
          if (today < validFrom) {
            return false; // Rule hasn't started yet
          }
        }
        
        // Check valid_upto date
        if (rule.valid_upto) {
          const validUpto = new Date(rule.valid_upto);
          validUpto.setHours(23, 59, 59, 999);
          if (today > validUpto) {
            return false; // Rule has expired
          }
        }
        
        return true; // Rule is active
      });
      
      if (activeRules.length > 0) {
        console.log('💰 PRICING RULES AVAILABLE:', activeRules.length);
        activeRules.forEach((rule: any) => {
          console.log(`\n📌 ${rule.name}: ${rule.discount_percentage}% discount`);
          console.log(`   Apply On: ${rule.apply_on}, Valid: ${rule.valid_from} to ${rule.valid_upto || 'No Expiry'}`);
          
          // Show matching criteria
          if (rule.apply_on === 'Item Group' && rule.item_groups && rule.item_groups.length > 0) {
            console.log(`   📋 Item Groups (${rule.item_groups.length}):`);
            rule.item_groups.forEach((ig: any) => {
              console.log(`      - ${ig.item_group}`);
            });
          }
          
          if (rule.apply_on === 'Item Code' && rule.items && rule.items.length > 0) {
            console.log(`   📋 Item Codes (${rule.items.length}):`);
            rule.items.forEach((item: any) => {
              console.log(`      - ${item.item_code}`);
            });
          }
        });
      }
      
      // Log if any rules were filtered out
      const expiredCount = fullRules.length - activeRules.length;
      if (expiredCount > 0) {
        console.log(`⚠️  Filtered out ${expiredCount} expired or inactive pricing rule(s)`);
      }
      
      return activeRules;
    } catch (error) {
      console.warn('Error fetching pricing rules:', error);
      return [];
    }
  }

  async getItemsByGroup(groupName: string, limit: number = 50): Promise<any[]> {
    // Use Website Item instead of Item for better eCommerce support
    return this.getWebsiteItemsByGroup(groupName, limit);
  }

  // Raw Item doctype list (non-Website Item) for sourcing flows
  async getRawItemsByGroup(groupName: string, limit: number = 200): Promise<any[]> {
    try {
      const fields = ['name', 'item_name', 'item_group', 'disabled', 'image'];
      const filters = [['Item', 'item_group', '=', groupName]];
      let url = `${API_VERSION}/Item?fields=${encodeURIComponent(JSON.stringify(fields))}`;
      url += `&filters=${encodeURIComponent(JSON.stringify(filters))}`;
      url += `&limit_page_length=${limit}`;
      const response = await this.client.get(url);
      return response.data.data || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Items from Item doctype where `item_group` is one of the given groups (e.g. parent + descendants).
   * Excludes disabled items. Used for category thumbnails from Item.image, not Website Item.
   */
  async getRawItemsByGroups(groupNames: string[], limit: number = 200): Promise<any[]> {
    const fields = ['name', 'item_name', 'item_group', 'disabled', 'image'];
    const unique = [...new Set(groupNames)].filter(Boolean);
    if (unique.length === 0) return [];

    const chunkSize = 40;
    const all: any[] = [];
    try {
      for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        const filters = [
          ['Item', 'disabled', '=', 0],
          ['Item', 'item_group', 'in', chunk],
        ];
        let url = `${API_VERSION}/Item?fields=${encodeURIComponent(JSON.stringify(fields))}`;
        url += `&filters=${encodeURIComponent(JSON.stringify(filters))}`;
        url += `&limit_page_length=${limit}`;
        const response = await this.client.get(url);
        const rows = response.data.data || [];
        all.push(...rows);
      }
      return all;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getCompanies(limit: number = 20): Promise<any[]> {
    try {
      const fields = ['name'];
      let url = `${API_VERSION}/Company?fields=${encodeURIComponent(JSON.stringify(fields))}`;
      url += `&limit_page_length=${limit}`;
      const response = await this.client.get(url);
      return response.data.data || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Upload image/file and attach it to a document (e.g. Sales Order)
   */
  async uploadFileToDoc(
    fileUri: string,
    fileName: string,
    doctype: string,
    docname: string,
    isPrivate: boolean = true,
    mimeType: string = 'image/jpeg'
  ): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('doctype', doctype);
      formData.append('docname', docname);
      formData.append('is_private', isPrivate ? '1' : '0');
      formData.append('folder', 'Home/Attachments');
      formData.append('file', {
        // React Native file payload
        uri: fileUri,
        name: fileName,
        type: mimeType,
      } as any);

      const response = await this.client.post('/api/method/upload_file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateSalesOrder(orderName: string, data: Record<string, any>): Promise<any> {
    try {
      const response = await this.client.put(
        `${API_VERSION}/Sales Order/${orderName}?ignore_version=1`,
        data
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get a session-based axios client for user-specific operations
   * Uses cookies/session instead of API key for user permissions
   */
  private getSessionClient(): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseUrl,
      timeout: getCurrentTimeout(),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      withCredentials: true, // Use session cookies for user-specific operations
    });
  }

  // WISHLIST
  /**
   * Get wishlist for a specific user
   * Fetches the Wishlist document with items child table
   * Uses session-based authentication (user's login session)
   * Parent DocType: Wishlist
   *   - user (Link field)
   *   - items (Table/Child Table)
   * Child Table: Wishlist Item
   *   - item (Link field)
   *   - qty (Int field)
   *   - notes (Data field, optional)
   */
  async getWishlist(userEmail: string): Promise<any> {
    try {
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      console.log('Fetching wishlist for user:', userEmail);
      
      // First, get the wishlist name by querying with filters
      const listResponse = await sessionClient.get(`${API_VERSION}/Wishlist`, {
        params: {
          fields: JSON.stringify(['name', 'user']),
          filters: JSON.stringify([
            ['Wishlist', 'user', '=', userEmail]
          ]),
          limit_page_length: 1,
        },
      });
      
      if (!listResponse.data.data || listResponse.data.data.length === 0) {
        console.log('No wishlist found for user:', userEmail);
        return null;
      }
      
      const wishlistName = listResponse.data.data[0].name;
      console.log('Found wishlist name:', wishlistName);
      
      // Fetch the full wishlist document by name to get child table data
      // ERPNext child tables are typically only available when fetching a single document by name
      const response = await sessionClient.get(`${API_VERSION}/Wishlist/${wishlistName}`);
      
      if (response.data.data) {
        const wishlist = response.data.data;
        
        console.log('Wishlist fetched:', {
          name: wishlist.name,
          user: wishlist.user,
          itemsCount: wishlist.items?.length || 0,
          items: wishlist.items,
          allKeys: Object.keys(wishlist),
        });
        
        // Check for child table in different possible formats
        // ERPNext might return child tables with different names
        let items = wishlist.items;
        
        // Try alternative child table names
        if (!items || !Array.isArray(items) || items.length === 0) {
          const possibleTableNames = ['items', 'wishlist_items', 'wishlist_item', 'item'];
          for (const tableName of possibleTableNames) {
            if (wishlist[tableName] && Array.isArray(wishlist[tableName]) && wishlist[tableName].length > 0) {
              console.log(`Found items in alternative table name: ${tableName}`);
              items = wishlist[tableName];
              break;
            }
          }
        }
        
        // Ensure items is an array
        if (!items || !Array.isArray(items)) {
          console.log('Items is not an array, initializing empty array');
          items = [];
        }
        
        // Attach items to wishlist object
        wishlist.items = items;
        
        console.log('Final wishlist:', {
          name: wishlist.name,
          user: wishlist.user,
          itemsCount: wishlist.items.length,
          items: wishlist.items,
        });
        
        return wishlist;
      }
      
      console.log('No wishlist data in response');
      return null;
    } catch (error) {
      console.error('Error fetching wishlist:', error);
      // If wishlist doesn't exist, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        console.log('Wishlist not found (404/417), returning null');
        return null;
      }
      throw this.handleError(error);
    }
  }

  /**
   * Create a new wishlist for a user
   * Creates a Wishlist document with:
   *   - user: userEmail (Link field)
   *   - items: [] (Child table - empty initially)
   * 
   * Child table structure (Wishlist Item):
   *   - item: Link to Item doctype
   *   - qty: Integer (quantity)
   *   - notes: Data/Text (optional notes)
   */
  async createWishlist(userEmail: string): Promise<any> {
    try {
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      const wishlistData = {
        user: userEmail, // Link field to User doctype
        items: [], // Child table - empty array initially
      };
      
      console.log('Creating wishlist for user:', userEmail);
      const response = await sessionClient.post(`${API_VERSION}/Wishlist`, wishlistData);
      console.log('Wishlist created successfully:', response.data.data?.name);
      
      // Ensure items array is initialized
      if (!response.data.data.items) {
        response.data.data.items = [];
      }
      
      return response.data.data;
    } catch (error) {
      console.error('Error creating wishlist:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Add item to wishlist
   * If wishlist doesn't exist, creates it first
   * 
   * Structure:
   *   Parent DocType: Wishlist
   *     - user: userEmail (Link field)
   *     - items: Child table array
   *   
   *   Child Table Row (Wishlist Item):
   *     - item: itemCode (Link to Item doctype)
   *     - qty: qty (Integer)
   *     - notes: notes (Data/Text, optional)
   */
  async addToWishlist(userEmail: string, itemCode: string, qty: number = 1, notes?: string): Promise<any> {
    try {
      // Get existing wishlist or create new one
      let wishlist = await this.getWishlist(userEmail);
      
      if (!wishlist) {
        console.log('Wishlist not found, creating new wishlist for user:', userEmail);
        wishlist = await this.createWishlist(userEmail);
      }
      
      // Ensure items array exists
      if (!wishlist.items || !Array.isArray(wishlist.items)) {
        wishlist.items = [];
      }
      
      // Check if item already exists in wishlist
      // Note: ERPNext child table uses 'item_code' field name, not 'item'
      const existingItem = wishlist.items.find((item: any) => 
        (item.item_code || item.item) === itemCode
      );
      
      if (existingItem) {
        // Update existing item in child table
        const updatedItems = wishlist.items.map((item: any) => 
          (item.item_code || item.item) === itemCode 
            ? { 
                ...item, 
                item_code: itemCode, // Link field (ERPNext uses item_code)
                qty: qty, // Int field
                notes: notes || item.notes || '' // Data field (optional)
              }
            : item
        );
        
        // Use session client for user-specific operations
        const sessionClient = this.getSessionClient();
        
        console.log('Updating existing wishlist item:', itemCode);
        const response = await sessionClient.put(`${API_VERSION}/Wishlist/${wishlist.name}`, {
          items: updatedItems, // Child table array
        });
        
        // Ensure response has items array
        if (response.data.data && !response.data.data.items) {
          response.data.data.items = updatedItems;
        }
        
        return response.data.data;
      } else {
        // Add new item to child table
        // Note: ERPNext child table uses 'item_code' field name
        const newItem = {
          item_code: itemCode, // Link field to Item doctype (ERPNext uses item_code)
          qty: qty, // Int field
          notes: notes || '', // Data field (optional)
        };
        
        const updatedItems = [...wishlist.items, newItem];
        
        // Use session client for user-specific operations
        const sessionClient = this.getSessionClient();
        
        console.log('Adding new item to wishlist:', itemCode, 'Total items:', updatedItems.length);
        const response = await sessionClient.put(`${API_VERSION}/Wishlist/${wishlist.name}`, {
          items: updatedItems, // Child table array
        });
        
        // Ensure response has items array
        if (response.data.data && !response.data.data.items) {
          response.data.data.items = updatedItems;
        }
        
        return response.data.data;
      }
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Remove item from wishlist
   * Removes an item from the items child table
   */
  async removeFromWishlist(userEmail: string, itemCode: string): Promise<any> {
    try {
      const wishlist = await this.getWishlist(userEmail);
      
      if (!wishlist) {
        throw new Error('Wishlist not found');
      }
      
      // Ensure items array exists
      if (!wishlist.items || !Array.isArray(wishlist.items)) {
        wishlist.items = [];
      }
      
      // Filter out the item from child table
      // Note: ERPNext child table uses 'item_code' field name, not 'item'
      const updatedItems = wishlist.items.filter((item: any) => 
        (item.item_code || item.item) !== itemCode
      );
      
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      console.log('Removing item from wishlist:', itemCode, 'Remaining items:', updatedItems.length);
      const response = await sessionClient.put(`${API_VERSION}/Wishlist/${wishlist.name}`, {
        items: updatedItems, // Child table array
      });
      
      // Ensure response has items array
      if (response.data.data && !response.data.data.items) {
        response.data.data.items = updatedItems;
      }
      
      return response.data.data;
    } catch (error) {
      console.error('Error removing from wishlist:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Clear entire wishlist
   */
  async clearWishlist(userEmail: string): Promise<any> {
    try {
      const wishlist = await this.getWishlist(userEmail);
      
      if (!wishlist) {
        return null;
      }
      
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      const response = await sessionClient.put(`${API_VERSION}/Wishlist/${wishlist.name}`, {
        items: [],
      });
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get all reviews for a specific Website Item
   * @param websiteItemName - The name (ID) of the Website Item
   * @returns Array of review documents
   */
  async getItemReviews(websiteItemName: string): Promise<any[]> {
    try {
      const response = await this.client.get(
        `${API_VERSION}/Item Review?filters=[["website_item","=","${websiteItemName}"]]&fields=["name","website_item","user","customer","review_title","rating","custom_rating_float","comment","published_on","creation"]&order_by=creation desc&limit_page_length=100`
      );
      
      if (response.data && response.data.data) {
        // Debug: Log raw rating values from ERPNext
        console.log('Raw reviews from ERPNext:', response.data.data.map((r: any) => ({
          name: r.name,
          rating: r.rating,
          custom_rating_float: r.custom_rating_float,
          ratingType: typeof r.rating,
          customRatingFloatType: typeof r.custom_rating_float,
        })));
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error('Error fetching item reviews:', error);
      return [];
    }
  }

  /**
   * Create a new review for a Website Item
   * Requires session authentication (user must be logged in)
   * @param websiteItemName - The name (ID) of the Website Item
   * @param userEmail - The email of the logged-in user
   * @param reviewData - Review data including rating, title, comment
   * @returns Created review document
   */
  async createItemReview(
    websiteItemName: string,
    userEmail: string,
    reviewData: {
      rating: number;
      review_title: string;
      comment: string;
    }
  ): Promise<any> {
    if (!userEmail) {
      throw new Error('User email is required to create a review');
    }

    const sessionClient = this.getSessionClient();

    // Ensure rating is sent as a float number to custom_rating_float field
    // Convert to float explicitly
    let ratingValue = 0;
    if (typeof reviewData.rating === 'number') {
      ratingValue = reviewData.rating;
    } else if (typeof reviewData.rating === 'string') {
      ratingValue = parseFloat(reviewData.rating) || 0;
    }
    
    // Ensure rating is between 1 and 5
    const normalizedRating = Math.max(1.0, Math.min(5.0, ratingValue));
    
    // Convert to float explicitly
    const floatRating = parseFloat(normalizedRating.toFixed(1));

    // Debug: Log what we're sending
    console.log('Creating review with rating:', {
      original: reviewData.rating,
      originalType: typeof reviewData.rating,
      normalized: floatRating,
      normalizedType: typeof floatRating,
      value: floatRating,
    });

    // Create the review document
    // Use custom_rating_float field (Float field type) to store rating
    const reviewPayload = {
      website_item: websiteItemName,
      user: userEmail,
      custom_rating_float: floatRating, // Send as float to custom_rating_float field
      review_title: reviewData.review_title,
      comment: reviewData.comment,
      published_on: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
    };

    console.log('Review payload being sent to ERPNext:', JSON.stringify(reviewPayload, null, 2));

    const response = await sessionClient.post(`${API_VERSION}/Item Review`, reviewPayload);
    return response.data.data;
  }

  /**
   * Get shopping cart for a user
   * Fetches the Shopping Cart document for the given user email
   * Structure:
   *   - user: userEmail (Link field)
   *   - items: Child table array with:
   *     - item_code: Link to Item doctype
   *     - quantity: Integer
   */
  async getShoppingCart(userEmail: string): Promise<any> {
    try {
      const sessionClient = this.getSessionClient();
      
      // First, query for the cart by user email
      const queryResponse = await sessionClient.get(
        `${API_VERSION}/Shopping Cart?filters=[["user","=","${userEmail}"]]&fields=["name","user"]&limit_page_length=1`
      );
      
      if (!queryResponse.data || !queryResponse.data.data || queryResponse.data.data.length === 0) {
        console.log('No shopping cart found for user:', userEmail);
        return null;
      }
      
      const cartName = queryResponse.data.data[0].name;
      console.log('Found shopping cart:', cartName);
      
      // Fetch the full cart document by name to get child table data
      const response = await sessionClient.get(`${API_VERSION}/Shopping Cart/${cartName}`);
      
      if (response.data && response.data.data) {
        const cart = response.data.data;
        
        // Ensure items array exists
        let items = cart.items || [];
        
        // Handle different possible field names for child table
        if (!items || !Array.isArray(items)) {
          // Try alternative field names
          items = cart.items_table || cart.cart_items || [];
        }
        
        // Ensure items is an array
        if (!items || !Array.isArray(items)) {
          console.log('Items is not an array, initializing empty array');
          items = [];
        }
        
        // Attach items to cart object
        cart.items = items;
        
        console.log('Final shopping cart:', {
          name: cart.name,
          user: cart.user,
          itemsCount: cart.items.length,
          items: cart.items,
        });
        
        return cart;
      }
      
      console.log('No cart data in response');
      return null;
    } catch (error) {
      console.error('Error fetching shopping cart:', error);
      // If cart doesn't exist, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        console.log('Shopping cart not found (404/417), returning null');
        return null;
      }
      throw this.handleError(error);
    }
  }

  /**
   * Create a new shopping cart for a user
   * Creates a Shopping Cart document with:
   *   - user: userEmail (Link field)
   *   - items: [] (Child table - empty initially)
   */
  async createShoppingCart(userEmail: string): Promise<any> {
    try {
      const sessionClient = this.getSessionClient();
      
      const cartData = {
        user: userEmail, // Link field to User doctype
        items: [], // Child table - empty array initially
      };
      
      console.log('Creating shopping cart for user:', userEmail);
      const response = await sessionClient.post(`${API_VERSION}/Shopping Cart`, cartData);
      console.log('Shopping cart created successfully:', response.data.data?.name);
      
      // Ensure items array is initialized
      if (!response.data.data.items) {
        response.data.data.items = [];
      }
      
      return response.data.data;
    } catch (error) {
      console.error('Error creating shopping cart:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Add item to shopping cart
   * If cart doesn't exist, creates it first
   * 
   * Structure:
   *   Parent DocType: Shopping Cart
   *     - user: userEmail (Link field)
   *     - items: Child table array
   *   
   *   Child Table Row:
   *     - item_code: itemCode (Link to Item doctype)
   *     - quantity: quantity (Integer)
   *     - description: description (Text/Data field - e.g., selected size)
   */
  async addToCart(userEmail: string, itemCode: string, quantity: number = 1, description?: string): Promise<any> {
    try {
      // Get existing cart or create new one
      let cart = await this.getShoppingCart(userEmail);
      
      if (!cart) {
        console.log('Shopping cart not found, creating new cart for user:', userEmail);
        cart = await this.createShoppingCart(userEmail);
      }
      
      // Ensure items array exists
      if (!cart.items || !Array.isArray(cart.items)) {
        cart.items = [];
      }
      
      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(
        (item: any) => item.item_code === itemCode || item.item === itemCode
      );
      
      const sessionClient = this.getSessionClient();
      
      if (existingItemIndex >= 0) {
        // Update existing item - preserve all existing fields including 'name' (row identifier)
        const existingItem = cart.items[existingItemIndex];
        cart.items[existingItemIndex] = {
          ...existingItem, // Preserve all existing fields (name, doctype, parent, etc.)
          item_code: itemCode,
          quantity: (existingItem.quantity || 0) + quantity,
          description: description || existingItem.description || '', // Update description if provided
        };
        console.log('Updating existing item in cart:', itemCode, 'new quantity:', cart.items[existingItemIndex].quantity, 'description:', description);
      } else {
        // Add new item to cart - don't include 'name' field (ERPNext will generate it)
        cart.items.push({
          item_code: itemCode,
          quantity: quantity,
          description: description || '', // Include description field (e.g., selected size)
        });
        console.log('Adding new item to cart:', itemCode, 'quantity:', quantity, 'description:', description);
      }
      
      // Update cart in ERPNext
      const updatePayload = {
        items: cart.items,
      };
      
      const response = await sessionClient.put(`${API_VERSION}/Shopping Cart/${cart.name}`, updatePayload);
      console.log('Cart updated successfully');
      
      return response.data.data;
    } catch (error) {
      console.error('Error adding to cart:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Remove item from shopping cart
   * Removes an item from the cart's items child table
   */
  async removeFromCart(userEmail: string, itemCode: string): Promise<any> {
    try {
      const cart = await this.getShoppingCart(userEmail);
      
      if (!cart) {
        throw new Error('Shopping cart not found');
      }
      
      // Ensure items array exists
      if (!cart.items || !Array.isArray(cart.items)) {
        cart.items = [];
      }
      
      // Remove item from cart
      cart.items = cart.items.filter(
        (item: any) => item.item_code !== itemCode && item.item !== itemCode
      );
      
      const sessionClient = this.getSessionClient();
      
      // Update cart in ERPNext
      const updatePayload = {
        items: cart.items,
      };
      
      const response = await sessionClient.put(`${API_VERSION}/Shopping Cart/${cart.name}`, updatePayload);
      console.log('Item removed from cart successfully');
      
      return response.data.data;
    } catch (error) {
      console.error('Error removing from cart:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Update item quantity in shopping cart
   */
  async updateCartItemQuantity(userEmail: string, itemCode: string, quantity: number): Promise<any> {
    try {
      const cart = await this.getShoppingCart(userEmail);
      
      if (!cart) {
        throw new Error('Shopping cart not found');
      }
      
      // Ensure items array exists
      if (!cart.items || !Array.isArray(cart.items)) {
        cart.items = [];
      }
      
      // Find and update item
      const itemIndex = cart.items.findIndex(
        (item: any) => item.item_code === itemCode || item.item === itemCode
      );
      
      if (itemIndex < 0) {
        throw new Error('Item not found in cart');
      }
      
      if (quantity <= 0) {
        // Remove item if quantity is 0 or less
        return await this.removeFromCart(userEmail, itemCode);
      }
      
      cart.items[itemIndex].quantity = quantity;
      
      const sessionClient = this.getSessionClient();
      
      // Update cart in ERPNext
      const updatePayload = {
        items: cart.items,
      };
      
      const response = await sessionClient.put(`${API_VERSION}/Shopping Cart/${cart.name}`, updatePayload);
      console.log('Cart item quantity updated successfully');
      
      return response.data.data;
    } catch (error) {
      console.error('Error updating cart item quantity:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Clear all items from shopping cart
   */
  async clearCart(userEmail: string): Promise<any> {
    try {
      const cart = await this.getShoppingCart(userEmail);
      
      if (!cart) {
        return null; // Cart doesn't exist, nothing to clear
      }
      
      const sessionClient = this.getSessionClient();
      
      // Clear items array
      const updatePayload = {
        items: [],
      };
      
      const response = await sessionClient.put(`${API_VERSION}/Shopping Cart/${cart.name}`, updatePayload);
      console.log('Cart cleared successfully');
      
      return response.data.data;
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw this.handleError(error);
    }
  }

  // UTILITIES
  private handleError(error: any): Error {
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return new Error('Request timeout. The server took too long to respond. Please try again.');
    }
    if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
      return new Error('Network error. Please check your internet connection and try again.');
    }
    if (error.code === 'ERR_CANCELED') {
      return new Error(
        'Upload stopped: connection may have stalled with no progress for several minutes, or the transfer exceeded the maximum time. Try again on a stable network.'
      );
    }
    
    // Handle API response errors
    if (error.response?.data) {
      const raw = error.response.data as unknown;
      const h = error.response.headers || {};
      const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
      if (typeof raw === 'string' && responseBodyLooksLikeHtml(raw, ct)) {
        return htmlInsteadOfJsonError(error.config?.url);
      }
      if (raw && typeof raw === 'object' && responseBodyLooksLikeHtml(raw, ct)) {
        return htmlInsteadOfJsonError(error.config?.url);
      }

      const erpError = raw as ERPNextError;
      
      // Try to extract message from _server_messages
      if (erpError._server_messages) {
        try {
          const serverMessages = JSON.parse(erpError._server_messages);
          if (Array.isArray(serverMessages) && serverMessages.length > 0) {
            const firstMessage = JSON.parse(serverMessages[0]);
            if (firstMessage?.message) {
              return new Error(firstMessage.message);
            }
          }
        } catch (parseError) {
          // If parsing fails, try to extract message from string
          const serverMessages = erpError._server_messages;
          if (typeof serverMessages === 'string') {
            const match = serverMessages.match(/"message":\s*"([^"]+)"/);
            if (match && match[1]) {
              return new Error(match[1]);
            }
          }
        }
      }
      
      const st = error.response?.status;
      const base = erpError.message || erpError.exc || 'Request failed';
      return new Error(st && st !== 200 ? `${base} (HTTP ${st})` : base);
    }
    
    // Handle other errors
    if (error.message) {
      return error instanceof Error ? error : new Error(error.message);
    }
    
    return new Error('Unknown error occurred. Please try again.');
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test connection using Website Item (primary doctype for eCommerce)
      const response = await this.client.get(`${API_VERSION}/Website Item?limit_page_length=1`);
      return response.status === 200;
    } catch (error) {
      console.error('ERPNext connection test failed:', error);
      return false;
    }
  }

  /**
   * List **Supplier** (Buying) documents for the SourceWave directory.
   * Requires API credentials with read on Supplier.
   */
  async listSuppliers(limit: number = 300): Promise<Record<string, unknown>[]> {
    const fullFields = [
      'name',
      'supplier_name',
      'supplier_type',
      'supplier_group',
      'country',
      'is_transporter',
      'disabled',
      'default_currency',
      'default_bank_account',
      'default_price_list',
      'supplier_details',
      'website',
      'language',
    ];
    const minimalFields = ['name', 'supplier_name', 'supplier_type', 'supplier_group', 'country', 'disabled'];

    const fetchList = async (fields: string[]) => {
      const response = await this.client.get(`${API_VERSION}/Supplier`, {
        params: {
          fields: JSON.stringify(fields),
          filters: JSON.stringify([]),
          limit_page_length: limit,
          order_by: 'modified desc',
        },
      });
      return (response.data?.data as Record<string, unknown>[]) || [];
    };

    try {
      return await fetchList(fullFields);
    } catch (e) {
      console.warn('[ERPNext] listSuppliers: retrying with minimal fields', e);
      return await fetchList(minimalFields);
    }
  }

  /** Full **Supplier** document by `name` (includes child tables when returned by REST). */
  async getSupplier(supplierName: string): Promise<Record<string, unknown> | null> {
    const key = (supplierName || '').trim();
    if (!key) return null;
    try {
      const response = await this.client.get(`${API_VERSION}/Supplier/${encodeURIComponent(key)}`);
      const data = response.data?.data;
      return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    } catch (error) {
      console.warn('[ERPNext] getSupplier:', supplierName, error);
      return null;
    }
  }

  /**
   * List ERPNext **Subscription** rows for a Customer (Accounts module).
   * Requires API user with read on Subscription.
   */
  async listSubscriptionsForCustomer(customerName: string): Promise<any[]> {
    const filters = [
      ['Subscription', 'party_type', '=', 'Customer'],
      ['Subscription', 'party', '=', customerName],
    ];
    const baseFields = ['name', 'status', 'start_date', 'end_date', 'company', 'party'];
    const params = {
      filters: JSON.stringify(filters),
      limit_page_length: 50,
      order_by: 'modified desc',
    };
    // Some Frappe versions error when listing child table `plans` on GET list; retry without it.
    try {
      const response = await this.client.get(`${API_VERSION}/Subscription`, {
        params: {
          ...params,
          fields: JSON.stringify([...baseFields, 'plans']),
        },
      });
      return response.data?.data || [];
    } catch (withPlansError) {
      console.warn('listSubscriptionsForCustomer (with plans) failed, retrying:', withPlansError);
    }
    try {
      const response = await this.client.get(`${API_VERSION}/Subscription`, {
        params: {
          ...params,
          fields: JSON.stringify(baseFields),
        },
      });
      return response.data?.data || [];
    } catch (error) {
      console.warn('listSubscriptionsForCustomer:', error);
      return [];
    }
  }

  /**
   * Resolve a subscription promo code against ERPNext Pricing Rules.
   * Matches `custom_promo_code` (and common alternates) on active, non-expired rules.
   */
  async resolveSubscriptionPromoCode(
    rawCode: string,
    originalPriceGhs: number
  ): Promise<AppliedSubscriptionPromo | null> {
    const code = normalizePromoCode(rawCode);
    if (!code) return null;

    const tryRule = (rule: Record<string, unknown> | null | undefined) => {
      if (!rule || !isPricingRuleValidForPromo(rule)) return null;
      const discount = getSubscriptionDiscountFromRule(rule);
      return buildAppliedSubscriptionPromo(
        code,
        String(rule.name || ''),
        originalPriceGhs,
        discount
      );
    };

    for (const field of ['custom_promo_code', 'coupon_code', 'promo_code'] as const) {
      try {
        const filters = [
          ['Pricing Rule', 'disable', '=', 0],
          ['Pricing Rule', field, '=', code],
        ];
        const listResponse = await this.client.get(`${API_VERSION}/Pricing Rule`, {
          params: {
            filters: JSON.stringify(filters),
            limit_page_length: 5,
            fields: JSON.stringify(['name']),
          },
        });
        const names = (listResponse.data?.data || [])
          .map((row: { name?: string }) => row.name)
          .filter(Boolean) as string[];

        for (const ruleName of names) {
          const ruleResponse = await this.client.get(
            `${API_VERSION}/Pricing Rule/${encodeURIComponent(ruleName)}`
          );
          const applied = tryRule(ruleResponse.data?.data);
          if (applied) return applied;
        }
      } catch {
        // Custom field may not exist on this site — fall through to scan.
      }
    }

    const rules = await this.getPricingRules();
    for (const rule of rules) {
      if (!pricingRuleMatchesPromoCode(rule, code)) continue;
      const applied = tryRule(rule);
      if (applied) return applied;
    }

    return null;
  }

  /** Create **Subscription** (draft); status is set by ERPNext workflow. */
  async createSubscriptionDoc(payload: Record<string, any>): Promise<any> {
    try {
      const response = await this.client.post(`${API_VERSION}/Subscription`, payload);
      return response.data?.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get random Product Bundles with their child table items
   * Returns bundles with their component items
   */
  async getProductBundles(limit: number = 10): Promise<Array<{
    bundleName: string;
    newItemCode: string;
    customCustomer?: string;
    items: Array<{
      itemCode: string;
      itemName?: string;
      image?: string | null;
    }>;
  }>> {
    try {
      // Fetch all Product Bundles
      const listResponse = await this.client.get(`${API_VERSION}/Product Bundle?limit_page_length=500`);
      const bundleNames = (listResponse.data.data || [])
        .map((bundle: any) => bundle.name)
        .filter((name: string) => name);

      // Shuffle and get random bundles
      const shuffled = bundleNames.sort(() => 0.5 - Math.random());
      const selectedBundles = shuffled.slice(0, limit);

      const bundlesWithItems: Array<{
        bundleName: string;
        newItemCode: string;
        customCustomer?: string;
        items: Array<{
          itemCode: string;
          itemName?: string;
          image?: string | null;
        }>;
      }> = [];

      // Fetch each bundle with its child table
      for (const bundleName of selectedBundles) {
        try {
          const bundleResponse = await this.client.get(
            `${API_VERSION}/Product Bundle/${bundleName}?fields=["*"]`
          );
          
          if (bundleResponse.data.data) {
            const bundle = bundleResponse.data.data;
            const newItemCode = bundle.new_item_code;
            
            // Find child table - try common names
            const childTableNames = [
              'items',
              'product_bundle_item',
              'product_bundle_items',
              'bundle_items',
              'bundle_item'
            ];
            
            let childTable: any[] = [];
            for (const tableName of childTableNames) {
              if (bundle[tableName] && Array.isArray(bundle[tableName])) {
                childTable = bundle[tableName];
                break;
              }
            }
            
            // If no standard name found, look for any array property
            if (childTable.length === 0) {
              for (const key in bundle) {
                if (Array.isArray(bundle[key]) && bundle[key].length > 0) {
                  const firstItem = bundle[key][0];
                  if (firstItem && typeof firstItem === 'object' && firstItem.item_code) {
                    childTable = bundle[key];
                    break;
                  }
                }
              }
            }
            
            // Extract items from child table
            const items = childTable
              .map((row: any) => ({
                itemCode: row.item_code || row.item,
                itemName: row.item_name,
              }))
              .filter((item: any) => item.itemCode);
            
            if (items.length > 0) {
              bundlesWithItems.push({
                bundleName: bundle.name || bundleName,
                newItemCode: newItemCode || '',
                customCustomer: bundle.custom_customer || bundle.customCustomer || undefined,
                items: items,
              });
            }
          }
        } catch (error) {
          console.warn(`Could not fetch Product Bundle ${bundleName}:`, error);
        }
      }

      // Fetch images for items
      for (const bundle of bundlesWithItems) {
        for (const item of bundle.items) {
          try {
            // Try to get Website Item to get the image
            const filters = [['Website Item', 'item_code', '=', item.itemCode]];
            const websiteItems = await this.getWebsiteItems(filters, 1);
            if (websiteItems.length > 0) {
              item.image = websiteItems[0].website_image || websiteItems[0].thumbnail || null;
              item.itemName = websiteItems[0].item_name || websiteItems[0].web_item_name || item.itemName;
            }
          } catch (error) {
            // If Website Item not found, try Item doctype
            try {
              const itemResponse = await this.client.get(`${API_VERSION}/Item/${item.itemCode}`);
              if (itemResponse.data.data) {
                item.image = itemResponse.data.data.image || null;
                item.itemName = itemResponse.data.data.item_name || item.itemName;
              }
            } catch (itemError) {
              // Item not found, keep image as null
            }
          }
        }
      }

      return bundlesWithItems;
    } catch (error) {
      console.error('Error fetching Product Bundles:', error);
      return [];
    }
  }

  /** Frappe `User.roles` role names (e.g. Supplier, Purchase User). */
  async getRolesForUser(frappeUserName: string): Promise<string[]> {
    const extractRoles = (data: unknown): string[] => {
      const d = data as { roles?: unknown };
      if (!d?.roles || !Array.isArray(d.roles)) return [];
      return d.roles
        .map((r: { role?: string }) => String((r as { role?: string })?.role || '').trim())
        .filter(Boolean);
    };
    const fetchByName = async (userName: string): Promise<string[]> => {
      for (const withFields of [true, false]) {
        try {
          const res = await this.client.get(
            `${API_VERSION}/User/${encodeURIComponent(userName)}`,
            withFields ? { params: { fields: JSON.stringify(['name', 'roles']) } } : undefined
          );
          const roles = extractRoles(res.data?.data);
          if (roles.length) return roles;
        } catch {
          // try full document next
        }
      }
      return [];
    };

    let roles = await fetchByName(frappeUserName.trim());
    if (roles.length) return roles;

    const trimmed = frappeUserName.trim();
    if (trimmed.toLowerCase() !== trimmed) {
      roles = await fetchByName(trimmed.toLowerCase());
      if (roles.length) return roles;
    }

    // User.name may differ from login id (e.g. list User by email then load roles).
    if (trimmed.includes('@')) {
      try {
        const listRes = await this.client.get(`${API_VERSION}/User`, {
          params: {
            fields: JSON.stringify(['name']),
            filters: JSON.stringify([['email', '=', trimmed]]),
            limit_page_length: 1,
          },
        });
        const row = listRes.data?.data?.[0] as { name?: string } | undefined;
        const resolved = row?.name ? String(row.name).trim() : '';
        if (resolved && resolved !== trimmed) {
          roles = await fetchByName(resolved);
          if (roles.length) return roles;
        }
      } catch {
        // ignore
      }
    }

    return [];
  }

  /**
   * Find Supplier linked to this login (portal / email).
   * Tries Supplier `name` / `email_id`, child-table filters on Supplier, then **Portal User** rows
   * (`parenttype = Supplier`, `user` = Frappe User name) which mirror the Supplier form’s portal users table.
   */
  async findSupplierForPortalUser(
    userEmail: string,
    frappeUserName: string
  ): Promise<{ name: string; supplier_name: string } | null> {
    const tryList = async (filters: unknown[]): Promise<{ name: string; supplier_name?: string } | null> => {
      try {
        const res = await this.client.get(`${API_VERSION}/Supplier`, {
          params: {
            fields: JSON.stringify(['name', 'supplier_name']),
            filters: JSON.stringify(filters),
            limit_page_length: 1,
          },
        });
        const row = res.data?.data?.[0];
        return row?.name ? row : null;
      } catch {
        return null;
      }
    };

    /** Resolve Supplier `name` from standalone Portal User child rows (tabPortal User). */
    const trySupplierFromPortalUserTable = async (candidates: string[]): Promise<{ name: string; supplier_name: string } | null> => {
      const uniq = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))];
      for (const cand of uniq) {
        try {
          const res = await this.client.get(`${API_VERSION}/${encodeURIComponent('Portal User')}`, {
            params: {
              fields: JSON.stringify(['parent', 'parenttype', 'user']),
              filters: JSON.stringify([
                ['parenttype', '=', 'Supplier'],
                ['user', '=', cand],
              ]),
              limit_page_length: 5,
            },
          });
          const h = res.headers;
          const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
          if (responseBodyLooksLikeHtml(res.data, ct)) continue;
          const rows: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
          const hit = rows.find((r) => r?.parenttype === 'Supplier' && String(r?.parent || '').trim());
          const parent = hit?.parent != null ? String(hit.parent).trim() : '';
          if (!parent) continue;
          const sup = await tryList([['name', '=', parent]]);
          if (sup) return { name: sup.name, supplier_name: String(sup.supplier_name || sup.name) };
          return { name: parent, supplier_name: parent };
        } catch {
          /* next candidate */
        }
      }
      return null;
    };

    /** Frappe User.name for this email (portal user link often stores User.name, not email). */
    const tryFrappeUserNameForEmail = async (email: string): Promise<string | null> => {
      const em = email.trim();
      if (!em) return null;
      try {
        const res = await this.client.get(`${API_VERSION}/User`, {
          params: {
            fields: JSON.stringify(['name']),
            filters: JSON.stringify([['email', '=', em]]),
            limit_page_length: 1,
          },
        });
        const n = res.data?.data?.[0]?.name;
        return n != null && String(n).trim() ? String(n).trim() : null;
      } catch {
        return null;
      }
    };

    const email = userEmail.trim();
    const u = frappeUserName.trim();
    let row = await tryList([['name', '=', u]]);
    if (row) return { name: row.name, supplier_name: String(row.supplier_name || row.name) };
    if (email && email !== u) {
      row = await tryList([['name', '=', email]]);
      if (row) return { name: row.name, supplier_name: String(row.supplier_name || row.name) };
    }
    row = await tryList([['email_id', '=', email]]);
    if (row) return { name: row.name, supplier_name: String(row.supplier_name || row.name) };
    row = await tryList([['Supplier Portal User', 'user', '=', u]]);
    if (row) return { name: row.name, supplier_name: String(row.supplier_name || row.name) };
    row = await tryList([['Supplier Portal User', 'user', '=', email]]);
    if (row) return { name: row.name, supplier_name: String(row.supplier_name || row.name) };
    row = await tryList([['Portal User', 'user', '=', u]]);
    if (row) return { name: row.name, supplier_name: String(row.supplier_name || row.name) };
    row = await tryList([['Portal User', 'user', '=', email]]);
    if (row) return { name: row.name, supplier_name: String(row.supplier_name || row.name) };

    const userNameFromEmail = await tryFrappeUserNameForEmail(email);
    const portalCandidates = [u, email, userNameFromEmail || ''].filter(Boolean);
    const fromPortal = await trySupplierFromPortalUserTable(portalCandidates);
    if (fromPortal) return fromPortal;

    return null;
  }

  async listPurchaseOrdersForSupplier(
    supplierDocName: string,
    opts?: { limit?: number; start?: number }
  ): Promise<any[]> {
    const limit = opts?.limit ?? 40;
    const start = opts?.start ?? 0;
    const res = await this.client.get(`${API_VERSION}/Purchase Order`, {
      params: {
        fields: JSON.stringify([
          'name',
          'transaction_date',
          'status',
          'grand_total',
          'company',
          'supplier',
          'currency',
        ]),
        filters: JSON.stringify([['supplier', '=', supplierDocName], ['docstatus', '!=', 2]]),
        order_by: 'modified desc',
        limit_page_length: limit,
        limit_start: start,
      },
    });
    return res.data?.data && Array.isArray(res.data.data) ? res.data.data : [];
  }

  async getPurchaseOrderByName(name: string): Promise<any | null> {
    try {
      const res = await this.client.get(`${API_VERSION}/Purchase Order/${encodeURIComponent(name)}`);
      return res.data?.data ?? null;
    } catch {
      return null;
    }
  }

  async listPurchaseInvoicesForSupplier(
    supplierDocName: string,
    opts?: { limit?: number; start?: number }
  ): Promise<any[]> {
    const limit = opts?.limit ?? 40;
    const start = opts?.start ?? 0;
    const res = await this.client.get(`${API_VERSION}/Purchase Invoice`, {
      params: {
        fields: JSON.stringify([
          'name',
          'posting_date',
          'status',
          'grand_total',
          'supplier',
          'currency',
        ]),
        filters: JSON.stringify([['supplier', '=', supplierDocName], ['docstatus', '!=', 2]]),
        order_by: 'modified desc',
        limit_page_length: limit,
        limit_start: start,
      },
    });
    return res.data?.data && Array.isArray(res.data.data) ? res.data.data : [];
  }

  async getPurchaseInvoiceByName(name: string): Promise<any | null> {
    try {
      const res = await this.client.get(`${API_VERSION}/Purchase Invoice/${encodeURIComponent(name)}`);
      return res.data?.data ?? null;
    } catch {
      return null;
    }
  }

  async listSupplierQuotationsForSupplier(
    supplierDocName: string,
    opts?: { limit?: number; start?: number }
  ): Promise<any[]> {
    const limit = opts?.limit ?? 40;
    const start = opts?.start ?? 0;
    const res = await this.client.get(`${API_VERSION}/Supplier Quotation`, {
      params: {
        fields: JSON.stringify([
          'name',
          'transaction_date',
          'valid_till',
          'status',
          'workflow_state',
          'docstatus',
          'grand_total',
          'supplier',
          'currency',
        ]),
        filters: JSON.stringify([['supplier', '=', supplierDocName], ['docstatus', '!=', 2]]),
        order_by: 'modified desc',
        limit_page_length: limit,
        limit_start: start,
      },
    });
    return res.data?.data && Array.isArray(res.data.data) ? res.data.data : [];
  }

  async getSupplierQuotationByName(name: string): Promise<any | null> {
    const n = String(name || '').trim();
    if (!n) return null;
    try {
      const { hasFrappeRavenSession, ravenGetResourceDoc } = await import('./frappeRavenSession');
      if (hasFrappeRavenSession()) {
        const row = await ravenGetResourceDoc('Supplier Quotation', n);
        return row ?? null;
      }
      const res = await this.client.get(`${API_VERSION}/Supplier Quotation/${encodeURIComponent(n)}`);
      return res.data?.data ?? null;
    } catch {
      return null;
    }
  }

  async listPurchaseReceiptsForSupplier(
    supplierDocName: string,
    opts?: { limit?: number; start?: number }
  ): Promise<any[]> {
    const limit = opts?.limit ?? 40;
    const start = opts?.start ?? 0;
    const res = await this.client.get(`${API_VERSION}/Purchase Receipt`, {
      params: {
        fields: JSON.stringify(['name', 'posting_date', 'status', 'supplier']),
        filters: JSON.stringify([['supplier', '=', supplierDocName], ['docstatus', '!=', 2]]),
        order_by: 'modified desc',
        limit_page_length: limit,
        limit_start: start,
      },
    });
    return res.data?.data && Array.isArray(res.data.data) ? res.data.data : [];
  }

  async getPurchaseReceiptByName(name: string): Promise<any | null> {
    try {
      const res = await this.client.get(`${API_VERSION}/Purchase Receipt/${encodeURIComponent(name)}`);
      return res.data?.data ?? null;
    } catch {
      return null;
    }
  }

  async getGlobalDefaultCompany(): Promise<string | null> {
    try {
      const res = await this.client.get(`${API_VERSION}/Global Defaults/Global Defaults`);
      const c = res.data?.data?.default_company;
      return c != null && String(c).trim() ? String(c).trim() : null;
    } catch {
      return null;
    }
  }

  async getFirstCompanyName(): Promise<string | null> {
    try {
      const rows = await this.listResourceRows('Company', {
        fields: ['name'],
        limit_page_length: 1,
      });
      const n = rows?.[0]?.name;
      return n != null && String(n).trim() ? String(n).trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * Search purchasable Items for supplier quotation lines (Item master, not Website Item).
   * Matches item code or item name; excludes disabled items.
   * Only Items whose **Supplier** link `custom_supplier` equals the given supplier document name are returned.
   * Optional **`image`** in each row is the Item master **image** field only (not `website_image`).
   */
  async searchItemsForQuotation(opts: {
    /** ERPNext **Supplier** document name linked on Item `custom_supplier`. */
    supplier: string;
    q: string;
    limit?: number;
  }): Promise<
    Array<{ name: string; item_code: string; item_name: string; stock_uom?: string; image?: string }>
  > {
    const supplier = String(opts.supplier || '').trim();
    if (!supplier) return [];

    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);
    const q = String(opts.q || '').trim();
    /** Item master Attach field only (not Website Item / `website_image`). */
    const fields = ['name', 'item_code', 'item_name', 'stock_uom', 'image'];
    const baseDisabled: any[] = [['disabled', '=', 0], ['custom_supplier', '=', supplier]];

    const pickItemImage = (r: any): string | undefined => {
      const v = r?.image;
      if (v != null && String(v).trim() !== '') return String(v).trim();
      return undefined;
    };

    const mergeDedupe = (
      rows: any[]
    ): Array<{ name: string; item_code: string; item_name: string; stock_uom?: string; image?: string }> => {
      const seen = new Set<string>();
      const out: Array<{
        name: string;
        item_code: string;
        item_name: string;
        stock_uom?: string;
        image?: string;
      }> = [];
      for (const r of rows || []) {
        const code = String(r.item_code ?? r.name ?? '').trim();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        const img = pickItemImage(r);
        const row: {
          name: string;
          item_code: string;
          item_name: string;
          stock_uom?: string;
          image?: string;
        } = {
          name: String(r.name ?? code).trim(),
          item_code: code,
          item_name: String(r.item_name ?? '').trim() || code,
          stock_uom: r.stock_uom != null ? String(r.stock_uom).trim() : undefined,
        };
        if (img) row.image = img;
        out.push(row);
        if (out.length >= limit) break;
      }
      return out;
    };

    if (!q) {
      const rows = await this.listResourceRows('Item', {
        filters: baseDisabled,
        fields,
        order_by: 'modified desc',
        limit_page_length: limit,
      });
      return mergeDedupe(rows);
    }

    const esc = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const like = `%${esc}%`;
    const [byCode, byName] = await Promise.all([
      this.listResourceRows('Item', {
        filters: [...baseDisabled, ['item_code', 'like', like]],
        fields,
        limit_page_length: limit,
      }),
      this.listResourceRows('Item', {
        filters: [...baseDisabled, ['item_name', 'like', like]],
        fields,
        limit_page_length: limit,
      }),
    ]);
    return mergeDedupe([...(byCode || []), ...(byName || [])]);
  }

  /**
   * Create a draft Supplier Quotation from in-app chat (supplier portal).
   * One or more lines with valid Item `item_code` (matches ERPNext Supplier Quotation items table).
   * Uses **REST create first** (minimal child rows — no `amount`, no client `docstatus`), then **`frappe.client.insert`** if that fails.
   * Throws if the saved document is not `docstatus === 0` (site auto-submit / workflow must be fixed server-side).
   * When a Frappe **session** exists (supplier or buyer after password login), the quotation is created **as that user**.
   * Ensure ERPNext grants that role **Create** on Supplier Quotation. Session requests include CSRF when the login cookies provide `csrf_token`.
   */
  async createSupplierQuotationFromChat(args: {
    supplier: string;
    currency?: string;
    /** Shown on the in-chat quotation card */
    referenceTitle?: string;
    lines: Array<{ item_code: string; qty: number; rate: number; uom?: string | null }>;
  }): Promise<{ name: string; grand_total: number; currency: string }> {
    const supplier = String(args.supplier || '').trim();
    if (!supplier) throw new Error('Supplier is required');

    const linesIn = Array.isArray(args.lines) ? args.lines : [];
    const lines = linesIn
      .map((l) => ({
        item_code: String(l.item_code || '').trim(),
        qty: Number(l.qty),
        rate: Number(l.rate),
        uom: l.uom != null ? String(l.uom).trim() : '',
      }))
      .filter((l) => l.item_code.length > 0 && Number.isFinite(l.qty) && l.qty > 0 && Number.isFinite(l.rate) && l.rate >= 0);

    if (lines.length === 0) {
      throw new Error('Add at least one line with an item, quantity greater than zero, and a rate.');
    }

    const company = (await this.getGlobalDefaultCompany()) || (await this.getFirstCompanyName());
    if (!company) throw new Error('No default company found in ERPNext. Set Global Defaults → default company.');

    const currency = String(args.currency || 'USD').trim() || 'USD';

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const transaction_date = `${y}-${m}-${d}`;
    const vt = new Date(today.getTime() + 30 * 86400000);
    const valid_till = `${vt.getFullYear()}-${String(vt.getMonth() + 1).padStart(2, '0')}-${String(vt.getDate()).padStart(2, '0')}`;

    const itemRows: Record<string, unknown>[] = lines.map((l) => {
      const row: Record<string, unknown> = {
        item_code: l.item_code,
        qty: l.qty,
        rate: l.rate,
      };
      if (l.uom) row.uom = l.uom;
      return row;
    });

    const referenceTitle = String(args.referenceTitle || '').trim();
    /** Omit `docstatus` and line `amount` — many sites return **417** if the client sets read-only / server-calculated values. */
    const payload: Record<string, unknown> = {
      doctype: 'Supplier Quotation',
      supplier,
      company,
      currency,
      transaction_date,
      valid_till,
      items: itemRows,
    };
    if (referenceTitle) payload.title = referenceTitle;

    /** Child rows for `frappe.client.insert` fallback (no `amount` — ERPNext recalculates). */
    const insertItems = itemRows.map((row, idx) => ({
      ...row,
      doctype: 'Supplier Quotation Item',
      parentfield: 'items',
      parenttype: 'Supplier Quotation',
      idx: idx + 1,
    }));
    const insertDoc: Record<string, unknown> = {
      doctype: 'Supplier Quotation',
      supplier,
      company,
      currency,
      transaction_date,
      valid_till,
      items: insertItems,
    };
    if (referenceTitle) insertDoc.title = referenceTitle;

    const { hasFrappeRavenSession, ravenCreateResourceDoc, ravenCallFrappeMethod } = await import('./frappeRavenSession');

    const unwrapMethod = (data: any): any => {
      if (data == null) return null;
      if (typeof data.message !== 'undefined') return data.message;
      return data;
    };

    let doc: any = null;
    try {
      if (hasFrappeRavenSession()) {
        doc = await ravenCreateResourceDoc('Supplier Quotation', payload);
      } else {
        const res = await this.client.post(`${API_VERSION}/Supplier Quotation`, payload);
        const h = res.headers;
        const ct = (h['content-type'] || h['Content-Type']) as string | undefined;
        if (responseBodyLooksLikeHtml(res.data, ct)) {
          throw htmlInsteadOfJsonError('POST Supplier Quotation');
        }
        doc = res.data?.data;
      }
    } catch (restErr) {
      try {
        const raw = hasFrappeRavenSession()
          ? await ravenCallFrappeMethod('frappe.client.insert', { doc: insertDoc })
          : await this.callFrappeMethod('frappe.client.insert', { doc: insertDoc });
        doc = unwrapMethod(raw);
      } catch {
        throw this.handleError(restErr);
      }
    }

    const name = doc?.name != null ? String(doc.name).trim() : '';
    if (!name) throw new Error('ERPNext did not return a quotation name.');

    const refreshed = await this.getSupplierQuotationByName(name);
    const dsRaw = refreshed?.docstatus ?? doc?.docstatus;
    const docstatus = dsRaw != null ? Number(dsRaw) : 0;
    if (docstatus !== 0) {
      throw new Error(
        `ERPNext created supplier quotation ${name} as submitted (docstatus ${docstatus}) instead of draft. ` +
          'Disable auto-submit on Supplier Quotation (workflow transition on save, or a server script) so new quotations stay draft until the buyer accepts in chat.'
      );
    }
    const sumLines = lines.reduce((s, l) => s + l.qty * l.rate, 0);
    const grand_total = doc?.grand_total != null ? Number(doc.grand_total) : sumLines;
    return {
      name,
      grand_total: Number.isFinite(grand_total) ? grand_total : sumLines,
      currency,
    };
  }

  /**
   * Submit a Supplier Quotation (e.g. buyer accepts draft in chat).
   * Uses the Frappe **session** user when logged in with password so submit / workflow runs as that user.
   */
  async submitSupplierQuotation(name: string): Promise<any> {
    const n = String(name || '').trim();
    if (!n) throw new Error('Quotation name required');
    const { hasFrappeRavenSession, ravenCallFrappeMethod } = await import('./frappeRavenSession');
    const submitDoc = async (doc: Record<string, unknown>) =>
      hasFrappeRavenSession()
        ? ravenCallFrappeMethod('frappe.client.submit', { doc })
        : this.callFrappeMethod('frappe.client.submit', { doc });

    const maxAttempts = 6;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 400 + attempt * 150));
        }
        const fresh = await this.getSupplierQuotationByName(n);
        const doc: Record<string, unknown> =
          fresh && typeof fresh === 'object' && String((fresh as { name?: unknown }).name || '').trim() === n
            ? (fresh as Record<string, unknown>)
            : { doctype: 'Supplier Quotation', name: n };
        return await submitDoc(doc);
      } catch (error) {
        lastError = error;
        const err = this.handleError(error);
        const msg = err.message;
        const retryable = attempt < maxAttempts && isFrappeTimestampMismatchMessage(msg);
        if (!retryable) {
          throw err;
        }
      }
    }
    throw this.handleError(lastError);
  }

  /**
   * Sales Invoice custom Link field → Supplier Quotation (default **`custom_quotation`**).
   * Override with **`EXPO_PUBLIC_ERPNEXT_SI_QUOTATION_LINK_FIELD`** if your site uses another field name.
   */
  private salesInvoiceSupplierQuotationLinkField(): string {
    const f = String(process.env.EXPO_PUBLIC_ERPNEXT_SI_QUOTATION_LINK_FIELD || 'custom_quotation').trim();
    return f || 'custom_quotation';
  }

  /**
   * Sales Invoices linked to a Supplier Quotation via custom field **`custom_quotation`** (Link → Supplier Quotation).
   * Requires that field on Sales Invoice in ERPNext.
   */
  async listSalesInvoicesByCustomQuotation(supplierQuotationName: string): Promise<any[]> {
    const n = String(supplierQuotationName || '').trim();
    if (!n) return [];
    const linkField = this.salesInvoiceSupplierQuotationLinkField();
    return await this.listResourceRows('Sales Invoice', {
      filters: [[linkField, '=', n]],
      fields: [
        'name',
        'customer',
        'company',
        'grand_total',
        'outstanding_amount',
        'docstatus',
        'currency',
        'status',
        'posting_date',
      ],
      limit_page_length: 15,
      order_by: 'modified desc',
    });
  }

  /**
   * **Sales Invoices** raised against this supplier’s **Supplier Quotations** (via link field, default **`custom_quotation`**).
   * Supplier Quotation list uses only **`name`** (some sites forbid **`customer`** on that doctype in API queries).
   * Customer filters apply to **Sales Invoice** rows (`customerId` exact, or `customerSubstring` on id/name).
   */
  async listSalesInvoicesForSupplier(
    supplierDocId: string,
    opts?: {
      /** Exact **Customer.name** on the Sales Invoice. */
      customerId?: string;
      /** Case-insensitive contains match on **Sales Invoice** `customer` / `customer_name`. */
      customerSubstring?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    }
  ): Promise<any[]> {
    const sid = String(supplierDocId || '').trim();
    if (!sid) return [];
    const linkField = this.salesInvoiceSupplierQuotationLinkField();
    const maxOut = Math.min(Math.max(1, opts?.limit ?? 120), 300);

    let sqRows: any[] = [];
    try {
      sqRows = await this.listResourceRows('Supplier Quotation', {
        filters: [['supplier', '=', sid]],
        fields: ['name'],
        limit_page_length: 500,
        order_by: 'modified desc',
      });
    } catch {
      return [];
    }
    if (!Array.isArray(sqRows) || sqRows.length === 0) return [];

    const sqNames = [...new Set(sqRows.map((r) => String(r?.name || '').trim()).filter(Boolean))];
    if (sqNames.length === 0) return [];

    const fromD = (opts?.fromDate || '').trim();
    const toD = (opts?.toDate || '').trim();
    const custId = (opts?.customerId || '').trim();
    const custSub = (opts?.customerSubstring || '').trim().toLowerCase();
    const chunkSize = 12;
    const seen = new Set<string>();
    const merged: any[] = [];

    const siFieldSets = [
      [
        'name',
        'customer',
        'customer_name',
        'posting_date',
        'grand_total',
        'status',
        'currency',
        'outstanding_amount',
        'docstatus',
        linkField,
      ],
      ['name', 'customer', 'posting_date', 'grand_total', 'status', 'currency', 'outstanding_amount', 'docstatus', linkField],
    ];

    for (let i = 0; i < sqNames.length; i += chunkSize) {
      const chunk = sqNames.slice(i, i + chunkSize);
      let rows: any[] = [];
      for (const fields of siFieldSets) {
        try {
          rows = await this.listResourceRows('Sales Invoice', {
            filters: [[linkField, 'in', chunk]],
            fields,
            limit_page_length: maxOut,
            order_by: 'posting_date desc',
          });
          if (Array.isArray(rows)) break;
        } catch {
          rows = [];
        }
      }
      for (const r of rows || []) {
        const n = String(r?.name || '').trim();
        if (!n || seen.has(n)) continue;
        const pd = String(r?.posting_date || '').trim().slice(0, 10);
        if (fromD && pd && pd < fromD) continue;
        if (toD && pd && pd > toD) continue;
        const cId = String(r?.customer || '').trim();
        const cNm = String(r?.customer_name || '').trim().toLowerCase();
        if (custId && cId !== custId) continue;
        if (!custId && custSub) {
          const hit =
            cId.toLowerCase().includes(custSub) ||
            cNm.includes(custSub) ||
            String(r?.customer_name || '')
              .trim()
              .toLowerCase()
              .includes(custSub);
          if (!hit) continue;
        }
        seen.add(n);
        merged.push(r);
      }
    }

    merged.sort((a, b) => String(b.posting_date || '').localeCompare(String(a.posting_date || '')));
    return merged.slice(0, maxOut);
  }

  /**
   * **Customers** for pickers (`name`, `customer_name`). Paginates until no more rows or **`limit`** total (default 5000, max 10000).
   * Falls back to **`name`** only if `customer_name` is not permitted on the list API.
   */
  async listCustomerRowsForPicker(opts?: { limit?: number }): Promise<Array<{ name: string; customer_name?: string }>> {
    const pageSize = 500;
    const maxTotal = Math.min(Math.max(1, opts?.limit ?? 5000), 10000);
    const map = new Map<string, { name: string; customer_name?: string }>();
    const addRows = (rows: any[]) => {
      for (const r of rows || []) {
        if (map.size >= maxTotal) return;
        const n = String(r?.name || '').trim();
        if (!n) continue;
        map.set(n, {
          name: n,
          customer_name: r?.customer_name != null ? String(r.customer_name) : undefined,
        });
      }
    };
    const fetchAllPages = async (fields: string[]) => {
      let start = 0;
      while (map.size < maxTotal) {
        const rows = await this.listResourceRows('Customer', {
          filters: [],
          fields,
          limit_page_length: pageSize,
          limit_start: start,
          order_by: 'name asc',
        });
        if (!rows?.length) break;
        const before = map.size;
        addRows(rows);
        if (rows.length < pageSize) break;
        if (map.size === before) break;
        start += pageSize;
      }
    };
    try {
      await fetchAllPages(['name', 'customer_name']);
      return [...map.values()];
    } catch {
      map.clear();
      try {
        await fetchAllPages(['name']);
        return [...map.values()];
      } catch {
        return [];
      }
    }
  }

  /**
   * **Payment Entries** that reference a **Sales Invoice** linked to this supplier’s quotations (Receive / pay flows).
   */
  async listPaymentEntriesForSupplier(
    supplierDocId: string,
    opts?: {
      customerId?: string;
      customerSubstring?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
      /** Only payment entries referencing this **Sales Invoice** (avoids scanning other invoices). */
      salesInvoiceName?: string;
      salesInvoiceCustomer?: string;
      salesInvoiceCustomerName?: string;
    }
  ): Promise<any[]> {
    const maxOut = Math.min(Math.max(1, opts?.limit ?? 80), 150);
    const fromD = (opts?.fromDate || '').trim();
    const toD = (opts?.toDate || '').trim();
    const seenPe = new Set<string>();
    const out: any[] = [];

    const tryListPeForSi = async (siName: string, siRow: any, pePageLimit: number): Promise<void> => {
      const filterSets: any[][][] = [
        [
          ['Payment Entry Reference', 'reference_doctype', '=', 'Sales Invoice'],
          ['Payment Entry Reference', 'reference_name', '=', siName],
        ],
        [
          ['references', 'reference_doctype', '=', 'Sales Invoice'],
          ['references', 'reference_name', '=', siName],
        ],
      ];
      for (const filters of filterSets) {
        try {
          const rows = await this.listResourceRows('Payment Entry', {
            filters,
            fields: [
              'name',
              'posting_date',
              'party',
              'party_type',
              'paid_amount',
              'received_amount',
              'payment_type',
              'docstatus',
            ],
            limit_page_length: pePageLimit,
            order_by: 'posting_date desc',
          });
          for (const pe of rows || []) {
            const pn = String(pe?.name || '').trim();
            if (!pn || seenPe.has(pn)) continue;
            const pd = String(pe?.posting_date || '').trim().slice(0, 10);
            if (fromD && pd && pd < fromD) continue;
            if (toD && pd && pd > toD) continue;
            seenPe.add(pn);
            out.push({
              ...pe,
              _linked_sales_invoice: siName,
              _customer: siRow?.customer,
              _customer_name: siRow?.customer_name,
            });
          }
          return;
        } catch {
          /* try next filter shape */
        }
      }
    };

    const siFocus = String(opts?.salesInvoiceName || '').trim();
    if (siFocus) {
      const siRow = {
        customer: opts?.salesInvoiceCustomer,
        customer_name: opts?.salesInvoiceCustomerName,
      };
      await tryListPeForSi(siFocus, siRow, 80);
      out.sort((a, b) => String(b.posting_date || '').localeCompare(String(a.posting_date || '')));
      return out.slice(0, maxOut);
    }

    const sis = await this.listSalesInvoicesForSupplier(supplierDocId, {
      customerId: opts?.customerId,
      customerSubstring: opts?.customerSubstring,
      fromDate: opts?.fromDate,
      toDate: opts?.toDate,
      limit: 120,
    });

    for (const si of sis.slice(0, 40)) {
      const siName = String(si?.name || '').trim();
      if (!siName) continue;
      await tryListPeForSi(siName, si, 20);
      if (out.length >= maxOut) break;
    }

    out.sort((a, b) => String(b.posting_date || '').localeCompare(String(a.posting_date || '')));
    return out.slice(0, maxOut);
  }

  /** **Sales Invoices** for a **Customer** (`Customer.name`). */
  async listSalesInvoicesForCustomer(
    customerDocName: string,
    opts?: { fromDate?: string; toDate?: string; limit?: number }
  ): Promise<any[]> {
    const c = String(customerDocName || '').trim();
    if (!c) return [];
    const filters: any[][] = [
      ['customer', '=', c],
      ['docstatus', '!=', 2],
    ];
    const fromD = (opts?.fromDate || '').trim();
    const toD = (opts?.toDate || '').trim();
    if (fromD) filters.push(['posting_date', '>=', fromD]);
    if (toD) filters.push(['posting_date', '<=', toD]);
    const lim = Math.min(Math.max(1, opts?.limit ?? 80), 150);
    try {
      return await this.listResourceRows('Sales Invoice', {
        filters,
        fields: [
          'name',
          'customer',
          'customer_name',
          'posting_date',
          'grand_total',
          'status',
          'currency',
          'outstanding_amount',
          'docstatus',
        ],
        limit_page_length: lim,
        order_by: 'posting_date desc',
      });
    } catch {
      return [];
    }
  }

  /** **Payment Entries** where **party** is this **Customer** (typical Receive payments). */
  async listPaymentEntriesForCustomer(
    customerDocName: string,
    opts?: { fromDate?: string; toDate?: string; limit?: number }
  ): Promise<any[]> {
    const c = String(customerDocName || '').trim();
    if (!c) return [];
    const filters: any[][] = [
      ['party_type', '=', 'Customer'],
      ['party', '=', c],
      ['docstatus', '!=', 2],
    ];
    const fromD = (opts?.fromDate || '').trim();
    const toD = (opts?.toDate || '').trim();
    if (fromD) filters.push(['posting_date', '>=', fromD]);
    if (toD) filters.push(['posting_date', '<=', toD]);
    const lim = Math.min(Math.max(1, opts?.limit ?? 80), 150);
    try {
      return await this.listResourceRows('Payment Entry', {
        filters,
        fields: [
          'name',
          'posting_date',
          'party',
          'party_type',
          'paid_amount',
          'received_amount',
          'payment_type',
          'docstatus',
        ],
        limit_page_length: lim,
        order_by: 'posting_date desc',
      });
    } catch {
      return [];
    }
  }

  /**
   * Outstanding for UI / payment caps. Some sites return `outstanding_amount` as 0 or omit it while
   * `grand_total` and `status` still indicate an unpaid submitted invoice.
   */
  effectiveSalesInvoiceOutstanding(doc: Record<string, unknown> | null | undefined): number {
    if (!doc) return 0;
    const parseMoney = (v: unknown): number | undefined => {
      if (v == null) return undefined;
      if (typeof v === 'string' && !String(v).trim()) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const gt = parseMoney(doc.grand_total) ?? 0;
    const out = parseMoney(doc.outstanding_amount);
    const baseOut = parseMoney(doc.base_outstanding_amount);
    const primary = out ?? baseOut;

    if (primary != null && primary > 1e-9) return primary;

    const st = String(doc.status ?? '')
      .trim()
      .toLowerCase();
    const clearlyPaid =
      st === 'paid' ||
      st === 'credit note issued' ||
      (st.includes('return') && !st.includes('unpaid') && !st.includes('debit'));

    if (clearlyPaid) return Math.max(0, primary ?? 0);

    const ds = Number(doc.docstatus);
    if (Number.isFinite(ds) && ds === 1 && gt > 1e-9 && (primary == null || primary <= 1e-9)) {
      return gt;
    }

    return Math.max(0, primary ?? 0);
  }

  /** Full Sales Invoice by name (API key client — use for supplier portal / shared reads). */
  async getSalesInvoiceRaw(invoiceName: string): Promise<any | null> {
    const n = String(invoiceName || '').trim();
    if (!n) return null;
    try {
      const res = await this.client.get(`${API_VERSION}/Sales Invoice/${encodeURIComponent(n)}`);
      return res.data?.data ?? null;
    } catch {
      return null;
    }
  }

  /**
   * **Raven User.custom_customer** (Link → Customer) for rows where **`user`** matches the bill-to Frappe user
   * (`User.name`, email on `User.email`, or `username`). Used first when creating Sales Invoices for that party.
   */
  async getCustomerIdFromRavenUserCustomCustomer(frappeUserName: string): Promise<string | null> {
    const primary = String(frappeUserName || '').trim();
    if (!primary) return null;

    const listRows = async (
      doctype: string,
      options?: {
        filters?: any[][];
        fields?: string[];
        order_by?: string;
        limit_page_length?: number;
        limit_start?: number;
      }
    ) => {
      const { hasFrappeRavenSession, ravenListResourceRows } = await import('./frappeRavenSession');
      if (hasFrappeRavenSession()) {
        return ravenListResourceRows(doctype, options);
      }
      return this.listResourceRows(doctype, options);
    };

    const candidates = new Set<string>([primary]);
    if (primary.includes('@')) {
      try {
        const urows = await listRows('User', {
          filters: [['email', '=', primary.toLowerCase()]],
          fields: ['name', 'username'],
          limit_page_length: 5,
        });
        for (const row of urows || []) {
          const n = String((row as { name?: string }).name || '').trim();
          if (n) candidates.add(n);
          const un = String((row as { username?: string }).username || '').trim();
          if (un) candidates.add(un);
        }
      } catch {
        /* ignore */
      }
    }

    console.warn('[SupplierQuotation SI][customer][ravenUser]', {
      billToInput: primary,
      userLookupCandidates: [...candidates],
    });

    const validateCustomer = async (customerName: string): Promise<string | null> => {
      const cid = String(customerName || '').trim();
      if (!cid) return null;
      try {
        const ok = await listRows('Customer', {
          filters: [['name', '=', cid]],
          fields: ['name'],
          limit_page_length: 1,
        });
        if (ok?.[0]?.name) return String(ok[0].name).trim();
      } catch {
        /* ignore */
      }
      return null;
    };

    const seenCustomer = new Set<string>();
    for (const cand of candidates) {
      const c = cand.trim();
      if (!c) continue;
      try {
        const rows = await listRows('Raven User', {
          filters: [['user', '=', c]],
          fields: ['name', 'custom_customer'],
          limit_page_length: 20,
        });
        for (const r of rows || []) {
          const raw = String((r as { custom_customer?: string }).custom_customer || '').trim();
          if (!raw || seenCustomer.has(raw)) continue;
          seenCustomer.add(raw);
          const resolved = await validateCustomer(raw);
          if (resolved) {
            console.warn('[SupplierQuotation SI][customer][ravenUser]', {
              billToInput: primary,
              matchedRavenUser: (r as { name?: string }).name ?? null,
              custom_customer: raw,
              resolvedCustomer: resolved,
            });
            return resolved;
          }
        }
      } catch {
        /* Raven User list may be forbidden */
      }
    }
    console.warn('[SupplierQuotation SI][customer][ravenUser]', {
      billToInput: primary,
      userLookupCandidates: [...candidates],
      outcome: 'no custom_customer linked to a valid Customer',
    });
    return null;
  }

  /**
   * Resolve **Customer** for a Sales Invoice created from a Supplier Quotation.
   * Order: env → **Raven User.custom_customer** (bill-to user) → other **bill-to** resolution (portal, etc.) → SQ **`custom_bill_to_customer`** / **`customer`** → Customer whose **`name`** equals Supplier Quotation **`supplier`**.
   */
  async resolveCustomerForSupplierQuotationBilling(
    sq: Record<string, unknown>,
    opts?: { billToFrappeUserId?: string | null }
  ): Promise<string | null> {
    const LOG = '[SupplierQuotation SI][customer]';
    const sqName = String((sq as { name?: unknown }).name || '').trim() || '(unknown SQ)';

    const envCust = String(process.env.EXPO_PUBLIC_ERPNEXT_SUPPLIER_QUOTATION_INVOICE_CUSTOMER || '').trim();
    if (envCust) {
      console.warn(LOG, 'using env EXPO_PUBLIC_ERPNEXT_SUPPLIER_QUOTATION_INVOICE_CUSTOMER', { sqName, customer: envCust });
      return envCust;
    }

    const billTo = String(opts?.billToFrappeUserId || '').trim();
    const sqSupplier = String((sq as any).supplier || '').trim();
    const fromSqRaw =
      String((sq as any).custom_bill_to_customer || (sq as any).customer || '').trim() ||
      String((sq as any).bill_to || '').trim();

    console.warn(LOG, 'resolve start', {
      sqName,
      billToFrappeUserId: billTo || null,
      billToLength: billTo.length,
      sqSupplier: sqSupplier || null,
      sqCustomerLikeFields: {
        custom_bill_to_customer: (sq as any).custom_bill_to_customer ?? null,
        customer: (sq as any).customer ?? null,
        bill_to: (sq as any).bill_to ?? null,
      },
    });

    if (billTo) {
      let fromRaven: string | null = null;
      let byUser: string | null = null;
      try {
        fromRaven = await this.getCustomerIdFromRavenUserCustomCustomer(billTo);
      } catch (e) {
        console.warn(LOG, 'getCustomerIdFromRavenUserCustomCustomer threw', {
          billTo,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      if (fromRaven) {
        console.warn(LOG, 'resolved via Raven User.custom_customer', { billTo, customer: fromRaven });
        return fromRaven;
      }
      console.warn(LOG, 'Raven User.custom_customer path: no customer', { billTo });

      try {
        byUser = await this.getCustomerIdForFrappeUserName(billTo);
      } catch (e) {
        console.warn(LOG, 'getCustomerIdForFrappeUserName threw', {
          billTo,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      if (byUser) {
        console.warn(LOG, 'resolved via getCustomerIdForFrappeUserName', { billTo, customer: byUser });
        return byUser;
      }
      console.warn(LOG, 'getCustomerIdForFrappeUserName: no customer', { billTo });
    } else {
      console.warn(LOG, 'no billToFrappeUserId in opts — skipping bill-to user resolution', { sqName });
    }

    const fromSq =
      String((sq as any).custom_bill_to_customer || (sq as any).customer || '').trim() ||
      String((sq as any).bill_to || '').trim();
    if (fromSq) {
      console.warn(LOG, 'resolved from Supplier Quotation fields', { sqName, customer: fromSq });
      return fromSq;
    }

    const supplierName = String((sq as any).supplier || '').trim();
    if (!supplierName) {
      console.warn(LOG, 'FAILED: no supplier on SQ and no other customer source', { sqName, billTo: billTo || null });
      return null;
    }

    try {
      const rows = await this.listResourceRows('Customer', {
        filters: [['name', '=', supplierName]],
        fields: ['name'],
        limit_page_length: 1,
      });
      const hit = rows?.[0]?.name;
      if (hit != null && String(hit).trim()) {
        const c = String(hit).trim();
        console.warn(LOG, 'resolved via Customer.name = SQ.supplier', { sqName, supplierName, customer: c });
        return c;
      }
      console.warn(LOG, 'Customer.name = supplier: no row', { sqName, supplierName });
    } catch (e) {
      console.warn(LOG, 'Customer.name = supplier list failed', {
        sqName,
        supplierName,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    console.warn(LOG, 'FAILED: exhausted resolution', {
      sqName,
      billToFrappeUserId: billTo || null,
      sqSupplier: supplierName,
      fromSqFieldsEmpty: !fromSqRaw,
    });
    return null;
  }

  /**
   * Create and **submit** a Sales Invoice from a submitted Supplier Quotation, setting **`custom_quotation`**.
   * Throws if quotation is not submitted (`docstatus !== 1`) or lines are empty.
   */
  async createSalesInvoiceFromSupplierQuotation(
    supplierQuotationName: string,
    opts?: { billToFrappeUserId?: string | null }
  ): Promise<any> {
    const n = String(supplierQuotationName || '').trim();
    if (!n) throw new Error('Supplier Quotation name required');

    const sq = await this.getSupplierQuotationByName(n);
    if (!sq) throw new Error('Supplier Quotation not found.');

    const ds = Number(sq.docstatus);
    if (!Number.isFinite(ds) || ds !== 1) {
      throw new Error('Supplier Quotation must be submitted before an invoice can be created.');
    }

    const company =
      String(sq.company || '')
        .trim()
        .slice(0, 140) ||
      (await this.getGlobalDefaultCompany()) ||
      (await this.getFirstCompanyName());
    if (!company) throw new Error('No company on the quotation — set company on Supplier Quotation or Global Defaults.');

    const customer = await this.resolveCustomerForSupplierQuotationBilling(sq as Record<string, unknown>, opts);
    if (!customer) {
      const billTo = String(opts?.billToFrappeUserId || '').trim();
      const detail =
        `billToFrappeUserId=${JSON.stringify(billTo || null)} (${billTo.length} chars), ` +
        `SQ=${JSON.stringify(n)}, supplier=${JSON.stringify(String((sq as any).supplier || '').trim() || null)}, ` +
        `sq.customer=${JSON.stringify((sq as any).customer ?? null)}, ` +
        `sq.custom_bill_to_customer=${JSON.stringify((sq as any).custom_bill_to_customer ?? null)}`;
      console.warn('[SupplierQuotation SI][customer] createSalesInvoiceFromSupplierQuotation: no customer', detail);
      throw new Error(
        'Could not resolve Customer for the sales invoice. The invoice must bill the **customer receiving the quotation**, not the supplier. ' +
          'Set **Raven User.custom_customer** for that user, or link a Customer via portal / **custom_bill_to_customer** (or **customer**) on the Supplier Quotation, ' +
          'or set **EXPO_PUBLIC_ERPNEXT_SUPPLIER_QUOTATION_INVOICE_CUSTOMER**. ' +
          `Debug: ${detail}`
      );
    }

    const rawItems = Array.isArray(sq.items) ? sq.items : [];
    const items = rawItems
      .map((row: any) => ({
        item_code: String(row?.item_code || row?.item || '').trim(),
        qty: Number(row?.qty ?? row?.qty_consumed ?? row?.stock_qty),
        rate: Number(row?.rate ?? row?.net_rate ?? row?.price_list_rate),
      }))
      .filter(
        (it: { item_code: string; qty: number; rate: number }) =>
          it.item_code.length > 0 && Number.isFinite(it.qty) && it.qty > 0 && Number.isFinite(it.rate) && it.rate >= 0
      );

    if (items.length === 0) {
      throw new Error('Supplier Quotation has no billable item lines (need item_code + qty + rate on each row).');
    }

    const posting_date = new Date().toISOString().split('T')[0];
    const vt = sq.valid_till != null ? String(sq.valid_till).trim().slice(0, 10) : '';
    const due_date = vt.length >= 8 ? vt : posting_date;
    const currency = String(sq.currency || 'GHS').trim() || 'GHS';

    const linkField = this.salesInvoiceSupplierQuotationLinkField();
    const payload: Record<string, unknown> = {
      doctype: 'Sales Invoice',
      company,
      customer,
      posting_date,
      due_date,
      currency,
      items: items.map((it: { item_code: string; qty: number; rate: number }) => ({
        item_code: it.item_code,
        qty: it.qty,
        rate: it.rate,
      })),
      [linkField]: n,
    };

    const { hasFrappeRavenSession, ravenCreateResourceDoc } = await import('./frappeRavenSession');
    let inv: any;
    if (hasFrappeRavenSession()) {
      inv = await ravenCreateResourceDoc('Sales Invoice', payload);
    } else {
      const res = await this.client.post(`${API_VERSION}/Sales Invoice`, payload);
      inv = res.data?.data;
    }
    const invName = inv?.name != null ? String(inv.name).trim() : '';
    if (!invName) throw new Error('ERPNext did not return a Sales Invoice name.');

    await this.submitSalesInvoice(invName);
    const fresh = await this.getSalesInvoiceRaw(invName);
    return fresh ?? inv;
  }

  /**
   * If the quotation is submitted and no active Sales Invoice exists yet for the configured link field
   * (default **`custom_quotation`** → Supplier Quotation), create one.
   * Safe to call repeatedly (idempotent).
   */
  async ensureSalesInvoiceForSupplierQuotation(
    supplierQuotationName: string,
    opts?: { billToFrappeUserId?: string | null }
  ): Promise<{ invoice: any | null; created: boolean; error?: string }> {
    const n = String(supplierQuotationName || '').trim();
    if (!n) return { invoice: null, created: false, error: 'Quotation name is missing.' };

    let existing: any[] = [];
    try {
      existing = await this.listSalesInvoicesByCustomQuotation(n);
    } catch (e) {
      const linkField = this.salesInvoiceSupplierQuotationLinkField();
      const msg = this.handleError(e).message;
      return {
        invoice: null,
        created: false,
        error:
          `Could not list Sales Invoices (${msg}). Ensure Sales Invoice has a Link field **${linkField}** to Supplier Quotation, ` +
          `or set **EXPO_PUBLIC_ERPNEXT_SI_QUOTATION_LINK_FIELD** to your field name.`,
      };
    }

    const active = existing.find((d) => Number(d?.docstatus) !== 2);
    if (active?.name) {
      const full = await this.getSalesInvoiceRaw(String(active.name));
      return { invoice: full ?? active, created: false };
    }

    const sq = await this.getSupplierQuotationByName(n);
    if (!sq) {
      return {
        invoice: null,
        created: false,
        error: 'Supplier Quotation was not found (wrong name or no read permission on Supplier Quotation).',
      };
    }
    if (Number(sq.docstatus) !== 1) {
      return {
        invoice: null,
        created: false,
        error: 'This quotation is not submitted in ERPNext (docstatus must be 1) before a sales invoice can be created.',
      };
    }

    try {
      const inv = await this.createSalesInvoiceFromSupplierQuotation(n, opts);
      return { invoice: inv, created: true };
    } catch (e) {
      const errMsg = this.handleError(e).message;
      const billTo = String(opts?.billToFrappeUserId || '').trim();
      console.warn('[SupplierQuotation SI][customer] ensureSalesInvoiceForSupplierQuotation failed', {
        supplierQuotationName: n,
        billToFrappeUserId: billTo || null,
        billToLength: billTo.length,
        errorMessage: errMsg,
        raw: e instanceof Error ? { name: e.name, message: e.message } : String(e),
      });
      return { invoice: null, created: false, error: errMsg };
    }
  }

  private async callFrappeMethodRavenOrApi(method: string, kwargs: Record<string, unknown>): Promise<any> {
    const { hasFrappeRavenSession, ravenCallFrappeMethod } = await import('./frappeRavenSession');
    if (hasFrappeRavenSession()) {
      return ravenCallFrappeMethod(method, kwargs);
    }
    return this.callFrappeMethod(method, kwargs);
  }

  /**
   * Record a **Receive** payment against a submitted Sales Invoice (partial or full).
   * Uses ERPNext **`get_payment_entry`** to fill bank / GL accounts, then creates and submits the Payment Entry.
   */
  async recordReceivePaymentAgainstSalesInvoice(args: {
    salesInvoiceName: string;
    amount: number;
  }): Promise<any> {
    const invName = String(args.salesInvoiceName || '').trim();
    const amt = Number(args.amount);
    if (!invName) throw new Error('Invoice name required');
    if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter an amount greater than zero.');

    const inv = await this.getSalesInvoiceRaw(invName);
    if (!inv) throw new Error('Sales Invoice not found.');
    if (Number(inv.docstatus) !== 1) throw new Error('Sales Invoice must be submitted to record payment.');

    const outstanding = this.effectiveSalesInvoiceOutstanding(inv as Record<string, unknown>);
    if (!Number.isFinite(outstanding) || outstanding <= 0) {
      throw new Error('This invoice has no outstanding balance.');
    }

    const pay = Math.min(amt, outstanding);
    if (pay <= 0) throw new Error('Nothing to allocate.');

    const methodPath = 'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry';
    const raw = await this.callFrappeMethodRavenOrApi(methodPath, {
      dt: 'Sales Invoice',
      dn: invName,
      party_amount: pay,
    });

    const msg = raw != null && typeof raw === 'object' && 'message' in raw ? (raw as any).message : raw;
    let peDoc: any = Array.isArray(msg) ? msg[0] : msg;
    if (peDoc != null && typeof peDoc === 'object' && peDoc.docs && Array.isArray(peDoc.docs)) {
      peDoc = peDoc.docs[0];
    }
    if (!peDoc || typeof peDoc !== 'object') {
      throw new Error(
        'Could not build payment entry. Check ERPNext accounts permissions and Payment Entry defaults for this company.'
      );
    }

    peDoc.paid_amount = pay;
    peDoc.received_amount = pay;
    if (Array.isArray(peDoc.references)) {
      for (const row of peDoc.references) {
        if (String(row?.reference_doctype || '') === 'Sales Invoice' && String(row?.reference_name || '') === invName) {
          row.allocated_amount = pay;
        }
      }
    }

    const stripMeta = (d: Record<string, unknown>) => {
      const o = { ...d };
      for (const k of Object.keys(o)) {
        if (k.startsWith('__')) delete o[k];
      }
      delete o.name;
      delete o.owner;
      delete o.creation;
      delete o.modified;
      delete o.modified_by;
      return o;
    };
    const toSave = stripMeta(peDoc as Record<string, unknown>);

    const { hasFrappeRavenSession, ravenCreateResourceDoc } = await import('./frappeRavenSession');
    let saved: any;
    if (hasFrappeRavenSession()) {
      saved = await ravenCreateResourceDoc('Payment Entry', toSave);
    } else {
      const res = await this.client.post(`${API_VERSION}/Payment Entry`, toSave);
      saved = res.data?.data;
    }
    const peName = saved?.name != null ? String(saved.name).trim() : '';
    if (!peName) throw new Error('ERPNext did not return a Payment Entry name.');
    await this.submitPaymentEntry(peName);
    return await this.getPaymentEntry(peName);
  }

  /**
   * Buyer rejects a draft Supplier Quotation: set **`workflow_state`** to **Rejected** (workflow on site).
   * Uses Frappe session when logged in with password; otherwise API key.
   */
  async rejectSupplierQuotationDraft(name: string): Promise<void> {
    const n = String(name || '').trim();
    if (!n) return;
    try {
      const { hasFrappeRavenSession, ravenCallFrappeMethod } = await import('./frappeRavenSession');
      const kwargs = {
        doctype: 'Supplier Quotation',
        name: n,
        fieldname: 'workflow_state',
        value: 'Rejected',
      };
      if (hasFrappeRavenSession()) {
        await ravenCallFrappeMethod('frappe.client.set_value', kwargs);
      } else {
        await this.callFrappeMethod('frappe.client.set_value', kwargs);
      }
    } catch (e) {
      throw this.handleError(e);
    }
  }

  /**
   * Create an ERPNext **Issue** (Support module) from the in-app contact form.
   * Uses `/api/resource/Issue` with the API key client or the logged-in Frappe session when present.
   */
  async createSupportIssue(input: {
    subject: string;
    message: string;
    raisedByEmail: string;
    customer?: string | null;
  }): Promise<{ name: string }> {
    const subject = String(input.subject || '').trim();
    const message = String(input.message || '').trim();
    const raisedByEmail = String(input.raisedByEmail || '').trim();
    if (!subject) throw new Error('Subject is required');
    if (!message) throw new Error('Message is required');
    if (!raisedByEmail) throw new Error('Email is required');

    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const descriptionHtml = `<p>${escapeHtml(message).replace(/\r\n/g, '\n').replace(/\n/g, '<br>')}</p>`;

    const doc: Record<string, unknown> = {
      naming_series: 'ISS-.YYYY.-',
      subject,
      description: descriptionHtml,
      raised_by: raisedByEmail,
      via_customer_portal: 1,
    };
    const cust = String(input.customer || '').trim();
    if (cust) doc.customer = cust;

    const { hasFrappeRavenSession, ravenCreateResourceDoc } = await import('./frappeRavenSession');
    let created: any;
    if (hasFrappeRavenSession()) {
      created = await ravenCreateResourceDoc('Issue', doc);
    } else {
      created = await this.createResourceDoc('Issue', doc);
    }
    const name = created?.name != null ? String(created.name).trim() : '';
    if (!name) throw new Error('ERPNext did not return an Issue id.');
    return { name };
  }
}

let erpNextClient: ERPNextClient | null = null;
let erpNextBaseUrl: string = ERPNEXT_BASE_URL; // Default to env variable

export const initializeERPNext = (config: ERPNextConfig): ERPNextClient => {
  const raw = (config.baseUrl || ERPNEXT_BASE_URL || '').trim();
  const baseUrl = normalizeFrappeApiBaseUrl(raw);
  if (baseUrl.replace(/\/$/, '') !== raw.replace(/\/+$/, '')) {
    console.warn('[ERPNext] Normalized EXPO_PUBLIC_ERPNEXT_URL for JSON API:', raw, '→', baseUrl);
  }
  const resolved: ERPNextConfig = { ...config, baseUrl };
  erpNextClient = new ERPNextClient(resolved);
  erpNextBaseUrl = baseUrl;
  return erpNextClient;
};

export const getERPNextClient = (): ERPNextClient => {
  if (!erpNextClient) {
    throw new Error('ERPNext client not initialized. Call initializeERPNext first.');
  }
  return erpNextClient;
};

/** `Authorization` header for Basic auth (private file images, etc.). */
export function getERPNextAuthorizationHeader(): string | undefined {
  try {
    return getERPNextClient().getAuthorizationHeader();
  } catch {
    return undefined;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const G = globalThis as { Buffer?: { from(data: ArrayBuffer): { toString(enc: string): string } } };
  if (G.Buffer) {
    return G.Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Download a site file and return a `data:` URI for `<Image />`.
 * Uses the **Raven session cookie** when present (after password login); otherwise API-key Basic auth
 * (same as other `/api` calls). React Native image requests do not send browser cookies automatically.
 */
export async function fetchErpSiteFileAsDataUri(absoluteUrl: string): Promise<string | null> {
  try {
    const { ravenFetchBinary } = await import('./frappeRavenSession');
    const { data, contentType } = await ravenFetchBinary(absoluteUrl);
    const mime = (contentType || '').split(';')[0].trim().toLowerCase();
    if (mime.includes('text/html') || mime.includes('json')) {
      console.warn(
        '[ERPNext] fetchErpSiteFileAsDataUri: non-image response (login/forbidden/JSON). Check API user File permissions.',
        absoluteUrl
      );
      return null;
    }
    const imageMime = mime.startsWith('image/') ? mime : 'image/jpeg';
    return `data:${imageMime};base64,${arrayBufferToBase64(data)}`;
  } catch (e) {
    console.warn('[ERPNext] fetchErpSiteFileAsDataUri failed', absoluteUrl, e);
    return null;
  }
}

/**
 * Get the ERPNext base URL for constructing file paths
 */
export const getERPNextBaseUrl = (): string => {
  return erpNextBaseUrl;
};

export default ERPNextClient;
