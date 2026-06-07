import { getERPNextBaseUrl } from '../services/erpnext';

/**
 * ERPNext print PDF for a Supplier Quotation (GET, same-site Basic auth as other API calls).
 * @param printFormat Print Format name on the site (default `Standard`).
 */
export function buildSupplierQuotationPdfApiUrl(docName: string, printFormat = 'Standard'): string {
  const n = String(docName || '').trim();
  const base = getERPNextBaseUrl().replace(/\/+$/, '');
  const fmt = String(printFormat || 'Standard').trim() || 'Standard';
  const qs = new URLSearchParams({
    doctype: 'Supplier Quotation',
    name: n,
    format: fmt,
  });
  return `${base}/api/method/frappe.utils.print_format.download_pdf?${qs.toString()}`;
}
