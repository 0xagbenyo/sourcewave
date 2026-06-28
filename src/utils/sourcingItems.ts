export type SourcingItemOption = {
  id: string;
  name: string;
  itemCode: string;
};

/** Category selection drives item name/code in sourcing — both use the category label. */
export const categoryAsSourcingItem = (
  categoryId: string,
  categoryName: string
): SourcingItemOption => {
  const id = String(categoryId || '').trim();
  const name = String(categoryName || id).trim();
  return { id, name, itemCode: id };
};

export const OTHER_SOURCING_ITEM: SourcingItemOption = {
  id: 'Other',
  name: 'Other',
  itemCode: 'Other',
};

/** Map an Item Group row (e.g. subcategory) to a sourcing item picker option. */
export const itemGroupToSourcingItemOption = (group: {
  name?: string;
  item_group_name?: string;
}): SourcingItemOption => {
  const id = String(group?.name || '').trim();
  const name = String(group?.item_group_name || group?.name || '').trim();
  return { id, name, itemCode: id };
};

/** Prefer a real ERP item in `items`; otherwise use the item group as the selectable item. */
export const resolveSubcategorySourcingItem = (
  subGroup: { name?: string; item_group_name?: string },
  items: SourcingItemOption[]
): SourcingItemOption => {
  const subId = String(subGroup?.name || '').trim();
  const subName = String(subGroup?.item_group_name || subGroup?.name || '').trim();
  const byId = items.find((item) => item.id === subId || item.itemCode === subId);
  if (byId) return byId;
  const subLower = subName.toLowerCase();
  const byName = items.find((item) => item.name.trim().toLowerCase() === subLower);
  if (byName) return byName;
  return itemGroupToSourcingItemOption(subGroup);
};

export const prependSourcingItemOption = (
  items: SourcingItemOption[],
  option: SourcingItemOption
): SourcingItemOption[] => {
  if (!option.id) return items;
  const rest = items.filter((item) => item.id !== option.id);
  return [option, ...rest];
};

/** Ensures "Other" is always available at the end of the item picker for any category. */
export const withOtherItemOption = (items: SourcingItemOption[]): SourcingItemOption[] => {
  const withoutOther = items.filter((item) => {
    const name = item.name.trim().toLowerCase();
    const id = item.id.trim().toLowerCase();
    const code = (item.itemCode || '').trim().toLowerCase();
    return name !== 'other' && id !== 'other' && code !== 'other';
  });
  return [...withoutOther, OTHER_SOURCING_ITEM];
};
