export type SourcingItemOption = {
  id: string;
  name: string;
  itemCode: string;
};

export const OTHER_SOURCING_ITEM: SourcingItemOption = {
  id: 'Other',
  name: 'Other',
  itemCode: 'Other',
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
