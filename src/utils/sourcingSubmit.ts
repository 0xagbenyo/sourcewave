import type { getERPNextClient } from '../services/erpnext';
import { OTHER_SOURCING_ITEM, type SourcingItemOption } from './sourcingItems';

type ErpClient = ReturnType<typeof getERPNextClient>;

export type SourcingOrderLineInput = {
  product: SourcingItemOption;
  selectedCategoryId: string;
  quantity: number;
  rate: number;
  description: string;
  /** Free-text item field (workspace supplier flow): drives ERP item code, name, and item group. */
  itemFieldText?: string;
};

export type SourcingSalesOrderLine = {
  item_code: string;
  qty: number;
  rate: number;
  amount: number;
  description: string;
};

function toErpItemCodeCandidate(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\s+/g, '-')
    .replace(/[^\w.-]/g, '')
    .slice(0, 140);
}

/** Item group for a new Item — subcategory rows use their own group id when applicable. */
export function resolveErpItemGroupForSourcingLine(
  product: SourcingItemOption,
  selectedCategoryId: string,
  allItemGroups: Array<{ name?: string }>
): string {
  const code = String(product.itemCode || product.id || '').trim();
  const name = String(product.name || '').trim();
  const groupIds = new Set(
    allItemGroups.map((g) => String(g.name || '').trim()).filter(Boolean)
  );

  if (code && groupIds.has(code)) return code;
  if (name && groupIds.has(name)) return name;
  return String(selectedCategoryId || '').trim();
}

/** Match an item group by id or display label from free-text item field. */
export function resolveItemGroupFromFieldText(
  fieldText: string,
  allItemGroups: Array<{ name?: string; item_group_name?: string }>
): string {
  const raw = String(fieldText || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  for (const g of allItemGroups) {
    const name = String(g.name || '').trim();
    const label = String(g.item_group_name || g.name || '').trim();
    if (name && name.toLowerCase() === lower) return name;
    if (label && label.toLowerCase() === lower) return name || label;
  }
  return raw;
}

async function uniqueItemCode(client: ErpClient, base: string): Promise<string> {
  let candidate = base;
  let suffix = 0;
  while (await client.itemExists(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > 20) {
      candidate = `${base}-${Date.now()}`;
      break;
    }
  }
  return candidate;
}

async function resolveExistingItemFromFieldText(
  client: ErpClient,
  fieldText: string,
  itemGroup: string
): Promise<string | null> {
  const raw = String(fieldText || '').trim();
  if (!raw) return null;

  if (await client.itemExists(raw)) return raw;

  const slug = toErpItemCodeCandidate(raw);
  if (slug && slug !== raw && (await client.itemExists(slug))) return slug;

  const itemName = raw.slice(0, 140);
  const byNameGroup = await client.findItemCodeByNameAndGroup(itemName, itemGroup);
  if (byNameGroup) return byNameGroup;

  if (itemGroup && itemGroup !== raw) {
    const byNameInRawGroup = await client.findItemCodeByNameAndGroup(itemName, raw);
    if (byNameInRawGroup) return byNameInRawGroup;
  }

  const byName = await client.findItemCodeByName(itemName);
  if (byName) return byName;

  return null;
}

/**
 * Ensure an ERP Item exists for a sourcing line; create under the resolved item group with UOM Nos.
 */
export async function ensureSourcingItemCode(
  client: ErpClient,
  product: SourcingItemOption,
  selectedCategoryId: string,
  allItemGroups: Array<{ name?: string; item_group_name?: string }>,
  description: string,
  itemFieldText?: string
): Promise<string> {
  const fieldText = String(itemFieldText || '').trim();
  if (fieldText) {
    const itemName = fieldText.slice(0, 140);
    const itemGroup = resolveItemGroupFromFieldText(fieldText, allItemGroups);
    if (!itemGroup) {
      throw new Error('Item name is required before creating a new item.');
    }

    const existing = await resolveExistingItemFromFieldText(client, fieldText, itemGroup);
    if (existing) {
      return existing;
    }

    const baseCode =
      toErpItemCodeCandidate(fieldText) || toErpItemCodeCandidate(itemName) || `SRC-${Date.now()}`;
    const itemCode = await uniqueItemCode(client, baseCode);

    try {
      await client.createSourcingItem({
        item_code: itemCode,
        item_name: itemName,
        item_group: itemGroup,
        stock_uom: 'Nos',
      });
      return itemCode;
    } catch {
      const afterCreateLookup = await resolveExistingItemFromFieldText(client, fieldText, itemGroup);
      if (afterCreateLookup) return afterCreateLookup;
      if (await client.itemExists(itemCode)) return itemCode;
      throw new Error(`Item "${itemName}" may already exist. Please try again or contact support.`);
    }
  }

  const proposedCode = String(product.itemCode || product.id || '').trim();
  const isOther = proposedCode.toLowerCase() === OTHER_SOURCING_ITEM.id.toLowerCase();
  const itemName = isOther
    ? String(description || product.name || 'Sourcing item').trim().slice(0, 140)
    : String(product.name || proposedCode).trim();

  const itemGroup = resolveErpItemGroupForSourcingLine(
    product,
    selectedCategoryId,
    allItemGroups
  );
  if (!itemGroup) {
    throw new Error('Item category is required before creating a new item.');
  }

  if (!isOther && proposedCode) {
    if (await client.itemExists(proposedCode)) {
      return proposedCode;
    }
  }

  const existingByName = await client.findItemCodeByNameAndGroup(itemName, itemGroup);
  if (existingByName) {
    return existingByName;
  }

  const baseCode = isOther
    ? toErpItemCodeCandidate(itemName) || `SRC-${Date.now()}`
    : toErpItemCodeCandidate(proposedCode) || toErpItemCodeCandidate(itemName) || `SRC-${Date.now()}`;

  const itemCode = await uniqueItemCode(client, baseCode);

  try {
    await client.createSourcingItem({
      item_code: itemCode,
      item_name: itemName,
      item_group: itemGroup,
      stock_uom: 'Nos',
    });
    return itemCode;
  } catch {
    if (!isOther && proposedCode && (await client.itemExists(proposedCode))) {
      return proposedCode;
    }
    const existingByName = await client.findItemCodeByNameAndGroup(itemName, itemGroup);
    if (existingByName) return existingByName;
    const existingAnyGroup = await client.findItemCodeByName(itemName);
    if (existingAnyGroup) return existingAnyGroup;
    if (await client.itemExists(itemCode)) return itemCode;
    throw new Error(`Item "${itemName}" may already exist. Please try again or contact support.`);
  }
}

export async function buildSourcingSalesOrderLines(
  client: ErpClient,
  lines: SourcingOrderLineInput[],
  allItemGroups: Array<{ name?: string }>
): Promise<SourcingSalesOrderLine[]> {
  const result: SourcingSalesOrderLine[] = [];

  for (const line of lines) {
    const itemCode = await ensureSourcingItemCode(
      client,
      line.product,
      line.selectedCategoryId,
      allItemGroups,
      line.description,
      line.itemFieldText
    );
    result.push({
      item_code: itemCode,
      qty: line.quantity,
      rate: line.rate,
      amount: line.quantity * line.rate,
      description: line.description,
    });
  }

  return result;
}
