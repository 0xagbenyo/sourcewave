import { getERPNextBaseUrl } from '../services/erpnext';

/** ERPNext print PDF download URL (authenticated GET, same as desk Print). */
export function buildErpDocPdfApiUrl(
  doctype: string,
  docName: string,
  printFormat = 'Standard'
): string {
  const dt = String(doctype || '').trim();
  const n = String(docName || '').trim();
  const base = getERPNextBaseUrl().replace(/\/+$/, '');
  const fmt = String(printFormat || 'Standard').trim() || 'Standard';
  const qs = new URLSearchParams({
    doctype: dt,
    name: n,
    format: fmt,
  });
  return `${base}/api/method/frappe.utils.print_format.download_pdf?${qs.toString()}`;
}

export function buildSalesOrderPdfApiUrl(orderName: string, printFormat = 'Standard'): string {
  return buildErpDocPdfApiUrl('Sales Order', orderName, printFormat);
}

export function buildSupplierQuotationPdfApiUrl(docName: string, printFormat = 'Standard'): string {
  return buildErpDocPdfApiUrl('Supplier Quotation', docName, printFormat);
}

export function buildSalesInvoicePdfApiUrl(invoiceName: string, printFormat = 'Standard'): string {
  return buildErpDocPdfApiUrl('Sales Invoice', invoiceName, printFormat);
}

export function buildPaymentEntryPdfApiUrl(paymentName: string, printFormat = 'Standard'): string {
  return buildErpDocPdfApiUrl('Payment Entry', paymentName, printFormat);
}
