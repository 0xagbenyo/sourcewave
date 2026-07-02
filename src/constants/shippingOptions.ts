export type ShippingOptionId = 'air_cargo' | 'freight_cargo';

export type ShippingOption = {
  id: ShippingOptionId;
  label: string;
  subtitle: string;
  erpValue: string;
};

/** Shipping choices shown before creating a Delivery Note from a paid invoice. */
export const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: 'air_cargo',
    label: 'Air Cargo',
    subtitle: 'Max 21 days delivery',
    /** Must match ERPNext Select options on Delivery Note `custom_shipping_option`. */
    erpValue: 'Air Cargo',
  },
  {
    id: 'freight_cargo',
    label: 'Freight Cargo',
    subtitle: 'Max 7 weeks delivery',
    erpValue: 'Freight Cargo',
  },
];

export function shippingOptionById(id: ShippingOptionId): ShippingOption | undefined {
  return SHIPPING_OPTIONS.find((o) => o.id === id);
}

export function shippingOptionByErpValue(value: string): ShippingOption | undefined {
  const v = String(value || '').trim();
  if (!v) return undefined;
  return SHIPPING_OPTIONS.find((o) => o.erpValue === v);
}
