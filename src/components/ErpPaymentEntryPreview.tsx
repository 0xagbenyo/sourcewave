import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
import { resolvePaymentEntryLinkedDocs } from '../utils/deliveryNoteAmounts';
import {
  navigateToDeliveryNoteDetail,
  navigateToSalesInvoiceDetail,
  navigateToSalesOrderDetail,
} from '../utils/erpDocumentNavigation';

type Props = {
  doc: Record<string, unknown>;
  currency?: string;
  variant?: 'buyer' | 'supplier';
};

export const ErpPaymentEntryPreview: React.FC<Props> = ({
  doc,
  currency = 'GHS',
  variant = 'buyer',
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const status = erpDocPaymentStatusLabel(doc);
  const statusColor = erpDocStatusAccent(status, doc.docstatus != null ? Number(doc.docstatus) : undefined);
  const amount = erpDocPrimaryPaymentAmount(doc, currency);
  const party = String(doc.party || '—').trim();
  const paymentType = String(doc.payment_type || '').trim();
  const paymentName = String(doc.name || '').trim();
  const isSupplier = variant === 'supplier';

  const linkedDocs = useMemo(() => resolvePaymentEntryLinkedDocs(doc), [doc]);

  const facts = [
    party !== '—' ? { label: 'Party', value: party } : null,
    paymentType ? { label: 'Type', value: paymentType } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const openLinkedDoc = (doctype: string, name: string) => {
    const id = name.trim();
    if (!id) return;
    const nav = navigation as { navigate: (n: string, p?: object) => void };
    if (doctype === 'Delivery Note') {
      navigateToDeliveryNoteDetail(nav, id, isSupplier);
      return;
    }
    if (doctype === 'Sales Invoice') {
      navigateToSalesInvoiceDetail(nav, id, isSupplier);
      return;
    }
    if (doctype === 'Sales Order') {
      navigateToSalesOrderDetail(nav, id);
    }
  };

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

      <ErpDocSection title={t('paymentEntry.appliedTo')}>
        {linkedDocs.length === 0 ? (
          <ErpDocEmptyState icon="link-outline" title={t('paymentEntry.noLinkedDocs')} />
        ) : (
          <ErpDocItemsList>
            {linkedDocs.map((link, idx) => {
              const alloc =
                link.amount != null ? formatErpDocMoney(link.amount, currency) : undefined;
              return (
                <ErpDocReferenceRow
                  key={`${link.doctype}-${link.name}-${idx}`}
                  doctype={link.doctype}
                  name={link.name}
                  amount={alloc}
                  onPress={() => openLinkedDoc(link.doctype, link.name)}
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
