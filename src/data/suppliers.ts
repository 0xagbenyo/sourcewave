/**
 * Supplier directory — field names align with ERPNext **Supplier** for straightforward API mapping later.
 * Doc: supplier_type, supplier_name, supplier_group, country, is_transporter, supplier_details,
 * website, language (print), default_currency, default_bank_account, default_price_list, customer_numbers, disabled.
 *
 * `SUPPLIERS` is optional static seed; the app loads live rows from ERPNext via `listSuppliers` / `getSupplier`.
 */
import { getERPNextClient } from '../services/erpnext';
export type SupplierType = 'Company' | 'Individual';

/** Child table row (ERPNext Supplier > Customer Numbers). */
export interface SupplierCustomerNumber {
  company: string;
  customer_number: string;
}

export interface Supplier {
  /** ERPNext document name (`name`) when synced; stable app routing id until then. */
  id: string;
  supplier_name: string;
  supplier_type: SupplierType;
  supplier_group: string;
  country: string;
  is_transporter: boolean;
  /** ERP `disabled` inverted — Enabled in desk = enabled true. */
  enabled: boolean;
  default_currency?: string | null;
  default_bank_account?: string | null;
  default_price_list?: string | null;
  /** ERP field `supplier_details` — statutory / general information. */
  supplier_details: string;
  website?: string | null;
  /** Print language (desk label), e.g. English. */
  language: string;
  customer_numbers: SupplierCustomerNumber[];
  /** MyMemory / translation API code derived from `language` when not synced from ERP. */
  chatLanguage: string;
  chatLanguageLabel: string;
  /** SourceWave-only hints (not on Supplier doctype). */
  markupNote?: string;
  rating?: number;
  responseTime?: string;
}

/** Map ERP print language to translation pair (extend when you add ERP languages). */
export function chatConfigFromPrintLanguage(language: string): { chatLanguage: string; chatLanguageLabel: string } {
  const l = language.trim().toLowerCase();
  if (l === 'en' || l.includes('english')) return { chatLanguage: 'en', chatLanguageLabel: 'English' };
  if (l.includes('korean') || l === 'ko') return { chatLanguage: 'ko', chatLanguageLabel: 'Korean' };
  if (l.includes('chinese') || l.includes('mandarin') || l.includes('中文') || l === 'zh')
    return { chatLanguage: 'zh', chatLanguageLabel: 'Chinese (Mandarin)' };
  return { chatLanguage: 'en', chatLanguageLabel: language.trim() || 'English' };
}

export const SUPPLIERS: Supplier[] = [];

export const getSupplierById = (id: string): Supplier | undefined => SUPPLIERS.find((s) => s.id === id);

/** Map one ERPNext **Supplier** REST row to the app `Supplier` model. */
export function mapErpResourceToSupplier(row: Record<string, unknown>): Supplier {
  const disabled = Number(row.disabled) === 1;
  const id = String(row.name ?? '').trim();
  const rawLang = row.language;
  let language = 'English';
  if (typeof rawLang === 'string' && rawLang.trim()) {
    language = rawLang.trim();
  } else if (rawLang && typeof rawLang === 'object' && 'language_name' in (rawLang as object)) {
    language = String((rawLang as { language_name?: string }).language_name || 'English');
  }
  const chat = chatConfigFromPrintLanguage(language);

  const rawType = String(row.supplier_type ?? 'Company');
  const supplier_type: SupplierType = rawType === 'Individual' ? 'Individual' : 'Company';

  const childRows =
    (Array.isArray(row.customer_numbers) && row.customer_numbers) ||
    (Array.isArray((row as { supplier_customer_numbers?: unknown }).supplier_customer_numbers) &&
      (row as { supplier_customer_numbers: unknown[] }).supplier_customer_numbers) ||
    [];

  const customer_numbers: SupplierCustomerNumber[] = (childRows as Record<string, unknown>[]).map((r) => ({
    company: String(r.company ?? r.parent ?? ''),
    customer_number: String(r.customer_number ?? r.customer ?? ''),
  }));

  return {
    id: id || String(row.supplier_name ?? 'unknown'),
    supplier_name: String(row.supplier_name ?? row.name ?? 'Supplier'),
    supplier_type,
    supplier_group: String(row.supplier_group ?? ''),
    country: String(row.country ?? ''),
    is_transporter: Number(row.is_transporter) === 1 || row.is_transporter === true,
    enabled: !disabled,
    default_currency: row.default_currency != null && row.default_currency !== '' ? String(row.default_currency) : null,
    default_bank_account:
      row.default_bank_account != null && row.default_bank_account !== '' ? String(row.default_bank_account) : null,
    default_price_list:
      row.default_price_list != null && row.default_price_list !== '' ? String(row.default_price_list) : null,
    supplier_details: String(row.supplier_details ?? ''),
    website: row.website != null && String(row.website).trim() ? String(row.website) : null,
    language,
    customer_numbers,
    ...chat,
  };
}

/** Local bundle first, then ERPNext **Supplier** by document `name`. */
export async function fetchSuppliersFromErp(): Promise<{ suppliers: Supplier[]; error: string | null }> {
  try {
    const client = getERPNextClient();
    const raw = await client.listSuppliers(300);
    const suppliers = raw
      .map((r) => mapErpResourceToSupplier(r as Record<string, unknown>))
      .filter((s) => s.id.length > 0);
    return { suppliers, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[SourceWave] fetchSuppliersFromErp:', e);
    return { suppliers: [], error: msg };
  }
}

/** Local bundle first, then ERPNext **Supplier** by document `name`. */
export async function resolveSupplier(id: string): Promise<Supplier | null> {
  const local = getSupplierById(id);
  if (local) return local;
  try {
    const client = getERPNextClient();
    const raw = await client.getSupplier(id);
    return raw ? mapErpResourceToSupplier(raw as Record<string, unknown>) : null;
  } catch (e) {
    console.warn('[SourceWave] resolveSupplier:', id, e);
    return null;
  }
}
