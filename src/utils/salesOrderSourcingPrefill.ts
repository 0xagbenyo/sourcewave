import type { getERPNextClient } from '../services/erpnext';
import { encodeErpFileUrl } from './erpImageUrl';
import { readErpDocLineImage } from './erpDocLineImageField';
import { readSalesOrderLineRequestedQty } from './erpSalesOrderLineFields';

type ErpClient = ReturnType<typeof getERPNextClient>;

export type SourcingFormPrefill = {
  selectedCategoryId: string;
  selectedCategoryName: string;
  selectedProductId: string;
  itemDescription: string;
  referenceImageUri: string | null;
  quantity: string;
  expectedRate: string;
};

function resolveCategoryFromItemGroup(
  itemGroupId: string,
  allGroups: Array<{ name?: string; item_group_name?: string; parent_item_group?: string }>
): { id: string; name: string } {
  const groups = allGroups || [];
  let current = String(itemGroupId || '').trim();
  for (let guard = 0; guard < 12 && current; guard += 1) {
    const match = groups.find((g) => String(g.name || '').trim() === current);
    if (!match) break;
    const id = String(match.name || '').trim();
    const name = String(match.item_group_name || match.name || id).trim();
    if (id) return { id, name };
    current = String(match.parent_item_group || '').trim();
  }
  const fallback = String(itemGroupId || '').trim();
  return { id: fallback, name: fallback };
}

function lineImageUri(row: Record<string, unknown>): string | null {
  const raw = readErpDocLineImage(row);
  if (!raw) return null;
  return encodeErpFileUrl(raw) || raw;
}

/** Map a draft Sales Order into sourcing form rows for in-app editing. */
export async function buildSourcingPrefillFromSalesOrder(
  client: ErpClient,
  raw: Record<string, unknown>,
  allGroups: Array<{ name?: string; item_group_name?: string; parent_item_group?: string }>
): Promise<{ forms: SourcingFormPrefill[]; shipToAddressName: string }> {
  const items = Array.isArray(raw?.items) ? (raw.items as Record<string, unknown>[]) : [];
  const shipToAddressName = String(raw?.shipping_address_name || '').trim();
  const forms: SourcingFormPrefill[] = [];

  for (const row of items) {
    const itemCode = String(row.item_code || '').trim();
    let categoryId = '';
    let categoryName = String(row.item_name || itemCode).trim();

    if (itemCode) {
      try {
        const itemDoc = await client.getItem(itemCode);
        const groupId = String(itemDoc?.item_group || '').trim();
        if (groupId) {
          const cat = resolveCategoryFromItemGroup(groupId, allGroups);
          categoryId = cat.id;
          categoryName = cat.name;
        }
      } catch {
        /* keep item_name fallback */
      }
    }

    if (!categoryId) {
      categoryId = itemCode || categoryName;
    }

    const qty = readSalesOrderLineRequestedQty(row);
    const rateN = Number(row.rate);
    const rate = Number.isFinite(rateN) && rateN >= 0 ? rateN : 0;

    forms.push({
      selectedCategoryId: categoryId,
      selectedCategoryName: categoryName,
      selectedProductId: categoryId,
      itemDescription: String(row.description || row.item_name || categoryName).trim(),
      referenceImageUri: lineImageUri(row),
      quantity: String(qty),
      expectedRate: rate > 0 ? String(rate) : '',
    });
  }

  return { forms, shipToAddressName };
}

export function isLocalImageUri(uri: string | null | undefined): boolean {
  const u = String(uri || '').trim();
  if (!u) return false;
  return (
    u.startsWith('file:') ||
    u.startsWith('content:') ||
    u.startsWith('ph://') ||
    u.startsWith('assets-library://')
  );
}
