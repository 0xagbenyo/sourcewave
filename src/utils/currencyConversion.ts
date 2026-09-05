import type { ConverterCurrency } from '../constants/currencies';
import { CURRENCY_SYMBOLS } from '../constants/currencies';

export function erpDateIsoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseAmountInput(raw: string): number | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/,/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatConvertedAmount(amount: number, currency: ConverterCurrency): string {
  const code = currency;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const sym = CURRENCY_SYMBOLS[currency] ?? `${code} `;
    return `${sym}${amount.toFixed(2)}`;
  }
}

export function formatRateLine(
  from: ConverterCurrency,
  to: ConverterCurrency,
  rate: number
): string {
  if (from === to) return `1 ${from} = 1 ${to}`;
  return `1 ${from} = ${rate.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} ${to}`;
}
