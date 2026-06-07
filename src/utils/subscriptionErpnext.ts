/**
 * Helpers for ERPNext Accounts → Subscription
 * @see https://docs.frappe.io/erpnext/subscription
 */

/** Normalized (lowercase) statuses that should still allow app access. */
const ACCESS_STATUSES_NORMALIZED = new Set([
  'active',
  'trialing',
  'trialling',
  'grace period',
  'unpaid',
  'past due',
  'past due date',
]);

export function subscriptionStatusAllowsAppAccess(status: unknown): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase();
  return s.length > 0 && ACCESS_STATUSES_NORMALIZED.has(s);
}

/** End of local calendar day for a YYYY-MM-DD from ERPNext Date field */
export function endOfDayIsoFromYmd(ymd: string): string {
  const parts = ymd.split('-').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date(ymd).toISOString();
  }
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  return dt.toISOString();
}

/** Timestamp (ms) at end of calendar day for ERP date string; NaN-safe. */
export function subscriptionEndDateMs(ymd: string): number {
  const iso = endOfDayIsoFromYmd(ymd);
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pick the subscription row that should grant app access (status + end_date).
 */
export function pickAppRelevantERPSubscription(rows: any[]): any | null {
  const now = Date.now();
  const candidates = (rows || []).filter((r: any) => {
    if (!r || !subscriptionStatusAllowsAppAccess(r.status)) return false;
    if (!r.end_date) return true;
    return subscriptionEndDateMs(String(r.end_date)) >= now;
  });
  candidates.sort((a: any, b: any) => {
    const ta = a.end_date ? subscriptionEndDateMs(String(a.end_date)) : Number.MAX_SAFE_INTEGER;
    const tb = b.end_date ? subscriptionEndDateMs(String(b.end_date)) : Number.MAX_SAFE_INTEGER;
    return tb - ta;
  });
  return candidates[0] || null;
}

/**
 * True if an ERP Subscription row with a **defined end_date** already runs through `periodEnd` (inclusive).
 * Rows with no `end_date` are ignored here so a new paid period still creates a Subscription in ERPNext
 * (open-ended / incomplete rows were incorrectly blocking all creates).
 */
export function erpSubscriptionCoversThrough(rows: any[], periodEnd: Date): boolean {
  const endTs = periodEnd.getTime();
  for (const r of rows || []) {
    if (!r || !subscriptionStatusAllowsAppAccess(r.status)) continue;
    if (!r.end_date) continue;
    const rowEndTs = subscriptionEndDateMs(String(r.end_date));
    if (rowEndTs >= endTs) return true;
  }
  return false;
}
