import { useEffect, useState } from 'react';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';

/** Resolve ERPNext **Customer.name** for the signed-in buyer session. */
export function useSessionCustomerId(): { customerId: string; loading: boolean } {
  const { user } = useUserSession();
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessionUser = String(user?.user || '').trim();
      if (sessionUser && !sessionUser.includes('@')) {
        if (!cancelled) {
          setCustomerId(sessionUser);
          setLoading(false);
        }
        return;
      }
      const email = String(user?.email || '').trim();
      if (!email) {
        if (!cancelled) {
          setCustomerId('');
          setLoading(false);
        }
        return;
      }
      try {
        const row = await getERPNextClient().getCustomerByEmail(email);
        if (!cancelled) setCustomerId(String(row?.name || '').trim());
      } catch {
        if (!cancelled) setCustomerId('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.user, user?.email]);

  return { customerId, loading };
}
