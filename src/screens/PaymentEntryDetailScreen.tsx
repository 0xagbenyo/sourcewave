import React, { useEffect, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getERPNextClient } from '../services/erpnext';
import { ErpDocumentPreviewLayout, ErpDocSheet } from '../components/ErpDocumentPreviewLayout';
import { ErpPaymentEntryPreview } from '../components/ErpPaymentEntryPreview';

/** Payment Entry detail (buyer main app stack). */
export const PaymentEntryDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const name = String((route.params as { name?: string })?.name || '').trim();
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!name) {
        setLoading(false);
        return;
      }
      try {
        const d = await getERPNextClient().getPaymentEntry(name);
        if (!cancelled) setDoc(d as Record<string, unknown>);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const currency = String(doc?.paid_to_account_currency || doc?.paid_from_account_currency || 'GHS');

  return (
    <ErpDocumentPreviewLayout
      screenTitle="Payment"
      loading={loading}
      errorMessage={!loading && !doc ? 'Could not load this payment.' : null}
      onBack={() => navigation.goBack()}
    >
      {doc ? (
        <ErpDocSheet>
          <ErpPaymentEntryPreview doc={doc} currency={currency} />
        </ErpDocSheet>
      ) : null}
    </ErpDocumentPreviewLayout>
  );
};
