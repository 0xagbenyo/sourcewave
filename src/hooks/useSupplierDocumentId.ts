import { useEffect, useState } from 'react';
import { useUserSession } from '../context/UserContext';
import { getSupplierDocumentIdForApi } from '../services/supplierPortal';
import { userFacingError } from '../utils/userFacingError';

/**
 * ERPNext `Supplier.name` for the logged-in supplier portal user.
 * Never falls back to email — resolves via Portal User / email_id when `supplierId` is missing from session.
 */
export function useSupplierDocumentId(): {
  supplierDocId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { user } = useUserSession();
  const [supplierDocId, setSupplierDocId] = useState<string | null>(() => user?.supplierId?.trim() || null);
  const [loading, setLoading] = useState(() => !user?.supplierId?.trim() && user?.appMode === 'supplier');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (user?.appMode !== 'supplier') {
      setSupplierDocId(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      if (user?.supplierId?.trim()) {
        setSupplierDocId(user.supplierId.trim());
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const id = await getSupplierDocumentIdForApi(user);
        if (cancelled) return;
        setSupplierDocId(id);
        setError(
          id
            ? null
            : 'Your account is not linked to a supplier profile. Contact your administrator.'
        );
      } catch (e: unknown) {
        if (!cancelled) {
          setSupplierDocId(null);
          setError(userFacingError(e, 'Could not load your supplier profile.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.user, user?.supplierId, user?.appMode, tick]);

  const refresh = () => setTick((t) => t + 1);

  return { supplierDocId, loading, error, refresh };
}
