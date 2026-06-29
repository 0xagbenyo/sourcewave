import { getERPNextClient } from '../services/erpnext';

export type PayKind = 'paid' | 'unpaid' | 'partial' | 'neutral';

export function money(cur: string | undefined, n: number | string | undefined): string {
  const v = typeof n === 'number' ? n : parseFloat(String(n || 0)) || 0;
  const c = cur || '';
  return `${c ? `${c} ` : ''}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function toYmd(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function chipColors(kind: PayKind): { bg: string; fg: string; bd: string } {
  switch (kind) {
    case 'paid':
      return { bg: '#E8F5E9', fg: '#1B5E20', bd: '#A5D6A7' };
    case 'unpaid':
      return { bg: '#FFEBEE', fg: '#B71C1C', bd: '#FFCDD2' };
    case 'partial':
      return { bg: '#FFF3E0', fg: '#E65100', bd: '#FFE0B2' };
    default:
      return { bg: '#F2F2F7', fg: '#636366', bd: '#E5E5EA' };
  }
}

export function accentForPayKind(kind: PayKind): string {
  switch (kind) {
    case 'paid':
      return '#2E7D32';
    case 'unpaid':
      return '#C62828';
    case 'partial':
      return '#EF6C00';
    default:
      return '#8E8E93';
  }
}

export function salesInvoicePayKind(row: any): PayKind {
  const docstatus = Number(row?.docstatus);
  const st = String(row?.status ?? '')
    .trim()
    .toLowerCase();
  if (docstatus === 0 || st === 'draft') return 'neutral';
  if (docstatus === 2 || st === 'cancelled') return 'neutral';
  if (st === 'partly paid' || st.includes('partly paid')) return 'partial';

  const out = getERPNextClient().effectiveSalesInvoiceOutstanding(row);
  const gt = Math.max(0, Number(row?.grand_total) || 0);
  const eps = 0.02;

  if (out <= eps) {
    if (gt <= eps) return 'neutral';
    return 'paid';
  }
  if (gt <= eps) return 'neutral';
  if (out >= gt - eps) return 'unpaid';
  return 'partial';
}

export function salesInvoiceStatusLabel(row: any, kind: PayKind): string {
  const raw = String(row?.status ?? '').trim();
  if (raw) return raw;
  switch (kind) {
    case 'paid':
      return 'Paid';
    case 'unpaid':
      return 'Unpaid';
    case 'partial':
      return 'Partly paid';
    default:
      return '—';
  }
}

export function paymentEntryPayKind(row: any): PayKind {
  const ds = Number(row?.docstatus);
  if (ds === 2) return 'unpaid';
  if (ds === 0) return 'partial';
  if (ds === 1) return 'paid';
  return 'neutral';
}

export function paymentEntryStatusLabel(row: any, kind: PayKind): string {
  const ds = Number(row?.docstatus);
  if (ds === 2) return 'Cancelled';
  if (ds === 0) return 'Draft';
  const pt = String(row?.payment_type ?? '').trim();
  if (pt) return pt;
  if (kind === 'paid') return 'Posted';
  return '—';
}

export type InvoiceStatusFilter = 'all' | 'unpaid' | 'paid' | 'partial';

export function matchesInvoiceStatusFilter(row: any, filter: InvoiceStatusFilter): boolean {
  if (filter === 'all') return true;
  const kind = salesInvoicePayKind(row);
  if (filter === 'unpaid') return kind === 'unpaid';
  if (filter === 'paid') return kind === 'paid';
  if (filter === 'partial') return kind === 'partial';
  return true;
}
