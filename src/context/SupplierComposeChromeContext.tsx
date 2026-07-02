import React, { createContext, useContext } from 'react';

type SupplierComposeChrome = {
  setShareActive: (active: boolean) => void;
};

/** Embedded supplier compose hub — hide list tabs/header while the share step is open. */
export const SupplierComposeChromeContext = createContext<SupplierComposeChrome | null>(null);

export function useSupplierComposeChrome(): SupplierComposeChrome | null {
  return useContext(SupplierComposeChromeContext);
}
