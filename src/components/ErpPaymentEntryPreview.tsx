import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DocumentPrintButton } from './DocumentPrintButton';
import {
  ErpDocHero,
  ErpDocSection,
  ErpDocItemsList,
  ErpDocReferenceRow,
  ErpDocEmptyState,
  erpDocStatusAccent,
  erpDocPaymentStatusLabel,
  formatErpDocDate,
  erpDocPrimaryPaymentAmount,
  formatErpDocMoney,
} from './ErpDocumentPreviewLayout';
import { Spacing } from '../constants/spacing';

type Props = {
  doc: Record<string, unknown>;
  currency?: string;
};

export const ErpPaymentEntryPreview: React.FC<Props> = ({ doc, currency = 'GHS' }) => {
  const { t } = useTranslation();
  const status = erpDocPaymentStatusLabel(doc);
  const statusColor = erpDocStatusAccent(status, doc.docstatus != null ? Number(doc.docstatus) : undefined);
  const amount = erpDocPrimaryPaymentAmount(doc, currency);
  const party = String(doc.party || '—').trim();
  const paymentType = String(doc.payment_type || '').trim();
  const refs = Array.isArray(doc.references) ? (doc.references as Record<string, unknown>[]) : [];
  const paymentName = String(doc.name || '').trim();

  const facts = [
    party !== '—' ? { label: 'Party', value: party } : null,
    paymentType ? { label: 'Type', value: paymentType } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <>
      <ErpDocHero
        docId={paymentName || 'Payment'}
        statusLabel={status}
        statusColor={statusColor}
        amount={amount}
        amountLabel="Amount"
        subtitle={doc.posting_date ? formatErpDocDate(doc.posting_date) : undefined}
        facts={facts.length ? facts : undefined}
      />

      <ErpDocSection title="Applied to">
        {refs.length === 0 ? (
          <ErpDocEmptyState icon="link-outline" title="No linked documents" />
        ) : (
          <ErpDocItemsList>
            {refs.map((r, idx) => {
              const dt = String(r.reference_doctype || 'Document');
              const dn = String(r.reference_name || '—');
              const alloc = r.allocated_amount != null ? formatErpDocMoney(r.allocated_amount, currency) : undefined;
              return (
                <ErpDocReferenceRow
                  key={String(r.name || `${dt}-${dn}-${idx}`)}
                  doctype={dt}
                  name={dn}
                  amount={alloc}
                />
              );
            })}
          </ErpDocItemsList>
        )}
      </ErpDocSection>

      {paymentName ? (
        <View style={styles.receiptBtnWrap}>
          <DocumentPrintButton
            doctype="Payment Entry"
            docName={paymentName}
            variant="bar"
            label={t('paymentEntry.downloadReceipt')}
          />
        </View>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  receiptBtnWrap: {
    marginTop: Spacing.MD,
  },
});
