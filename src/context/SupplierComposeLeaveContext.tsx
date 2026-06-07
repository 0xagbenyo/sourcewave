import React, { createContext, useContext } from 'react';

/** Embedded supplier compose: call this instead of `navigation.goBack()` so the hub stays open. */
export const SupplierComposeLeaveContext = createContext<(() => void) | null>(null);

export function useSupplierComposeLeave(): (() => void) | null {
  return useContext(SupplierComposeLeaveContext);
}
