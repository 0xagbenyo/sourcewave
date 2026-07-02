import React, { useEffect, useState } from 'react';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getERPNextClient } from '../../services/erpnext';
import type { SupplierStackParamList } from '../../types';
import { ErpDocumentPreviewLayout, ErpDocSheet } from '../../components/ErpDocumentPreviewLayout';
import { ErpPaymentEntryPreview } from '../../components/ErpPaymentEntryPreview';

type R = RouteProp<SupplierStackParamList, 'SupplierPaymentEntryDetail'>;

export const SupplierPaymentEntryDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const route = useRoute<R>();
  const { name } = route.params;
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      screenTitle={t('paymentEntry.screenTitle')}
      printDoctype="Payment Entry"
      printDocName={name}
      printLabel={t('paymentEntry.downloadReceipt')}
      loading={loading}
      errorMessage={!loading && !doc ? t('paymentEntry.loadFailed') : null}
      onBack={() => navigation.goBack()}
    >
      {doc ? (
        <ErpDocSheet>
          <ErpPaymentEntryPreview doc={doc} currency={currency} variant="supplier" />
        </ErpDocSheet>
      ) : null}
    </ErpDocumentPreviewLayout>
  );
};
