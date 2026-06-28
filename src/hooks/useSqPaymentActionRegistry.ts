import { useCallback, useState } from 'react';

/** Registers supplier quotation payment handlers so long-press menus can resolve them after async load. */
export function useSqPaymentActionRegistry() {
  const [sqPaymentActions, setSqPaymentActions] = useState<Record<string, () => void>>({});

  const registerSqPaymentAction = useCallback((sqName: string, handler: (() => void) | null) => {
    const n = sqName.trim();
    if (!n) return;
    setSqPaymentActions((prev) => {
      if (handler) {
        if (prev[n] === handler) return prev;
        return { ...prev, [n]: handler };
      }
      if (!(n in prev)) return prev;
      const next = { ...prev };
      delete next[n];
      return next;
    });
  }, []);

  const resolveSqPayment = useCallback(
    (sqName: string) => {
      const n = sqName.trim();
      return n ? sqPaymentActions[n] : undefined;
    },
    [sqPaymentActions]
  );

  return { registerSqPaymentAction, resolveSqPayment };
}
