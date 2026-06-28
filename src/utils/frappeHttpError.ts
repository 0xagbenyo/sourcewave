type AxiosLike = {
  response?: { status?: number; data?: unknown; headers?: Record<string, unknown> };
  config?: { url?: string; method?: string; data?: unknown };
  message?: string;
};

/** Parse Frappe `_server_messages`, `exception`, `exc`, or `message` from an API error body. */
export function parseFrappeResponseData(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === 'string') {
    const s = data.trim();
    if (!s || s.startsWith('<!')) return null;
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  }
  if (typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;

  if (d._server_messages) {
    try {
      const raw = d._server_messages;
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(arr)) {
        const parts: string[] = [];
        for (const item of arr) {
          try {
            const msg = typeof item === 'string' ? JSON.parse(item) : item;
            if (msg && typeof msg === 'object' && (msg as { message?: unknown }).message) {
              parts.push(String((msg as { message: unknown }).message));
            } else if (typeof item === 'string') {
              parts.push(item);
            }
          } catch {
            if (typeof item === 'string') parts.push(item);
          }
        }
        const joined = parts.map((p) => p.trim()).filter(Boolean).join(' ');
        if (joined) return joined;
      }
    } catch {
      /* fall through */
    }
  }

  if (typeof d.exception === 'string' && d.exception.trim()) {
    const ex = d.exception.trim();
    const colon = ex.lastIndexOf(':');
    if (colon >= 0 && colon < ex.length - 1) {
      return ex.slice(colon + 1).trim();
    }
    return ex;
  }

  if (typeof d.exc === 'string' && d.exc.trim()) {
    try {
      const arr = JSON.parse(d.exc) as unknown;
      if (Array.isArray(arr) && arr.length > 0) {
        const first = String(arr[0]);
        const lines = first.split('\n').map((l) => l.trim()).filter(Boolean);
        return lines[lines.length - 1] || first;
      }
    } catch {
      return d.exc.trim().slice(0, 400);
    }
  }

  if (typeof d.message === 'string') {
    const m = d.message.trim();
    if (m && m !== 'Logged In' && m !== 'No permission for Supplier Quotation') {
      return m;
    }
    if (m) return m;
  }

  return null;
}

export function parseFrappeAxiosError(error: unknown): string | null {
  const ax = error as AxiosLike;
  const fromBody = parseFrappeResponseData(ax.response?.data);
  if (fromBody) return fromBody;
  const msg = ax.message?.trim();
  return msg || null;
}

/** Log full Frappe HTTP error details to Metro / device console. */
export function logFrappeHttpError(tag: string, error: unknown, extra?: Record<string, unknown>): void {
  const ax = error as AxiosLike;
  const data = ax.response?.data;
  let serialized: string | undefined;
  try {
    serialized =
      typeof data === 'string'
        ? data.slice(0, 2500)
        : JSON.stringify(data, null, 0)?.slice(0, 2500);
  } catch {
    serialized = String(data);
  }

  console.error(`[${tag}] HTTP ${ax.response?.status ?? '?'}`, {
    url: ax.config?.url,
    method: ax.config?.method,
    frappeMessage: parseFrappeResponseData(data),
    axiosMessage: ax.message,
    responseBody: serialized,
    ...extra,
  });
}

export function userFacingFrappeError(error: unknown, fallback: string): string {
  const detail = parseFrappeAxiosError(error);
  if (detail && detail.length <= 280) return detail;
  if (error instanceof Error && error.message.trim() && error.message.length <= 280) {
    return error.message.trim();
  }
  return fallback;
}
