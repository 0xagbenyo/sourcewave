function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function erpDateIsoToday(): string {
  const t = new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

export function erpDateIsoAddDays(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Read ERPNext date field as `YYYY-MM-DD`, or empty string. */
export function readErpDateField(value: unknown): string {
  const s = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** Parse user input; returns normalized ISO date or null. */
export function parseErpDateInput(raw: string): string | null {
  const s = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return s;
}

export function defaultQuotationValidTillIso(): string {
  return erpDateIsoAddDays(new Date(), 30);
}

export function erpDateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function erpDateFromIso(iso: string): Date | null {
  const parsed = parseErpDateInput(iso);
  if (!parsed) return null;
  const [y, m, d] = parsed.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function defaultQuotationValidTillDate(): Date {
  return erpDateFromIso(defaultQuotationValidTillIso()) ?? new Date();
}
