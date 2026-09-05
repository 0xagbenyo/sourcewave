import { CONVERTER_CURRENCIES, type ConverterCurrency } from '../constants/currencies';

/** Map ERP document currency + amount to converter defaults. */
export function documentConverterDefaults(
  docCurrency: string,
  amount: number
): {
  fromCurrency: ConverterCurrency;
  toCurrency: ConverterCurrency;
  initialAmount: string;
} {
  const code = String(docCurrency || 'USD')
    .trim()
    .toUpperCase()
    .replace(/^RMB$/, 'CNY');
  const supported = (CONVERTER_CURRENCIES as readonly string[]).includes(code);
  const from = (supported ? code : 'USD') as ConverterCurrency;
  const to: ConverterCurrency = from === 'GHS' ? 'USD' : 'GHS';
  const amt = Number.isFinite(amount) && amount > 0 ? amount : 1;
  return {
    fromCurrency: from,
    toCurrency: to,
    initialAmount: String(amt),
  };
}
