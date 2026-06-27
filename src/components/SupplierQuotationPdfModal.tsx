import React from 'react';
import { ErpDocumentPdfModal } from './ErpDocumentPdfModal';

type Props = {
  visible: boolean;
  docName: string;
  printFormat?: string;
  onClose: () => void;
};

/** Supplier Quotation PDF preview (wraps {@link ErpDocumentPdfModal}). */
export const SupplierQuotationPdfModal: React.FC<Props> = ({ visible, docName, printFormat, onClose }) => (
  <ErpDocumentPdfModal
    visible={visible}
    doctype="Supplier Quotation"
    docName={docName}
    printFormat={printFormat}
    onClose={onClose}
  />
);
