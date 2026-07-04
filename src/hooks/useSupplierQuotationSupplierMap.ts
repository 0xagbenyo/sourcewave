import { useEffect, useState } from 'react';
import { getERPNextClient } from '../services/erpnext';
import { ravenRowIsSupplierQuotationDocLink, type RavenMessageRow } from '../services/ravenNativeApi';

/** Cache ERPNext `Supplier Quotation.supplier` for linked chat cards (bubble side + actions). */
export function useSupplierQuotationSupplierMap(
  messages: RavenMessageRow[],
  enabled: boolean
): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!enabled) return;
    const names = [
      ...new Set(
        messages
          .filter((m) =>
            ravenRowIsSupplierQuotationDocLink(m.link_doctype, m.link_document)
          )
          .map((m) => String(m.link_document || '').trim())
          .filter(Boolean)
      ),
    ].filter((n) => !map[n]);

    if (names.length === 0) return;

    let cancelled = false;
    void (async () => {
      const client = getERPNextClient();
      const batch = names.slice(0, 16);
      const next: Record<string, string> = {};
      for (const name of batch) {
        try {
          const doc = await client.getSupplierQuotationByName(name);
          const sup = String(doc?.supplier || '').trim();
          if (sup) next[name] = sup;
        } catch {
          /* optional */
        }
      }
      if (cancelled || Object.keys(next).length === 0) return;
      setMap((prev) => ({ ...prev, ...next }));
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, messages, map]);

  return map;
}
