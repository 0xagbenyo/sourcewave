type SuppliersTabResetListener = () => void;

const listeners = new Set<SuppliersTabResetListener>();

/** Ask the buyer Suppliers tab to return to the supplier-groups list (not last chat). */
export function requestSuppliersTabReset(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeSuppliersTabReset(listener: SuppliersTabResetListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
