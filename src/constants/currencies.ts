/** Currencies commonly used when sourcing from China and settling in Ghana. */
export const CONVERTER_CURRENCIES = ['USD', 'CNY', 'GHS'] as const;

export type ConverterCurrency = (typeof CONVERTER_CURRENCIES)[number];

/** ERPNext uses ISO code CNY; suppliers often say RMB — same currency. */
export const CURRENCY_LABELS: Record<ConverterCurrency, string> = {
  USD: 'US Dollar (USD)',
  CNY: 'Chinese Yuan (CNY / RMB)',
  GHS: 'Ghana Cedi (GHS)',
};

export const CURRENCY_SYMBOLS: Partial<Record<ConverterCurrency, string>> = {
  USD: '$',
  CNY: '¥',
  GHS: 'GH₵',
};

export function normalizeCurrencyCode(raw: string): ConverterCurrency | null {
  const code = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/^RMB$/, 'CNY');
  if ((CONVERTER_CURRENCIES as readonly string[]).includes(code)) {
    return code as ConverterCurrency;
  }
  return null;
}
