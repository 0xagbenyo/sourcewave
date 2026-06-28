import { appStorage } from '../services/appStorage';

const STORAGE_SHARED_SALES_ORDERS = '@sourcewave/shared_sales_orders_v1';

async function readSharedSet(): Promise<Set<string>> {
  try {
    const raw = await appStorage.getItem(STORAGE_SHARED_SALES_ORDERS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((v) => String(v || '').trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function isSalesOrderMarkedSharedLocally(orderName: string): Promise<boolean> {
  const n = orderName.trim();
  if (!n) return false;
  const set = await readSharedSet();
  return set.has(n);
}

export async function markSalesOrderSharedLocally(orderName: string): Promise<void> {
  const n = orderName.trim();
  if (!n) return;
  const set = await readSharedSet();
  set.add(n);
  await appStorage.setItem(STORAGE_SHARED_SALES_ORDERS, JSON.stringify([...set]));
}
