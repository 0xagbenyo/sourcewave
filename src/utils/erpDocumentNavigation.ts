import { rootNavigationRef } from '../navigation/rootNavigation';

type Nav = { navigate: (name: string, params?: object) => void };

export function navigateToSupplierQuotationDetail(
  navigation: Nav,
  quotationName: string,
  customerId?: string
): void {
  const name = quotationName.trim();
  if (!name) return;
  const params: { name: string; customerId?: string } = { name };
  const cid = String(customerId || '').trim();
  if (cid) params.customerId = cid;
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('SupplierQuotationDetail', params);
    return;
  }
  navigation.navigate('SupplierQuotationDetail', params);
}

export function navigateToSalesInvoiceDetail(
  navigation: Nav,
  invoiceName: string,
  isSupplierPortal: boolean
): void {
  const name = invoiceName.trim();
  if (!name) return;
  if (isSupplierPortal) {
    navigation.navigate('SupplierSalesInvoiceDetail', { name });
    return;
  }
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('InvoiceDetails', { invoiceId: name });
    return;
  }
  navigation.navigate('InvoiceDetails', { invoiceId: name });
}

export function navigateToSalesOrderDetail(navigation: Nav, orderName: string): void {
  const orderId = orderName.trim();
  if (!orderId) return;
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('OrderDetails', { orderId });
    return;
  }
  navigation.navigate('OrderDetails', { orderId });
}
