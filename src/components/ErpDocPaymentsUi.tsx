import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { ERP_DOC_FLAT } from '../constants/erpDocFlatUi';
import { Spacing } from '../constants/spacing';
import {
  ErpDocItemsList,
  erpDocPaymentStatusLabel,
  erpDocStatusAccent,
  formatErpDocDate,
  formatErpDocMoney,
} from './ErpDocumentPreviewLayout';

export function erpDocNumericPaymentAmount(row: Record<string, unknown>): number {
  const alloc = Number(row._allocated_amount);
  if (Number.isFinite(alloc) && alloc > 0) return alloc;
  const received = Number(row.received_amount);
  const paid = Number(row.paid_amount);
  if (Number.isFinite(received) && received !== 0) return Math.abs(received);
  if (Number.isFinite(paid) && paid !== 0) return Math.abs(paid);
  return 0;
}

export function erpDocFormattedPaymentAmount(row: Record<string, unknown>, currency: string): string {
  return formatErpDocMoney(erpDocNumericPaymentAmount(row), currency);
}

type SummaryProps = {
  totalDue: number;
  outstanding: number;
  currency: string;
  totalLabel: string;
};

export const ErpDocPaymentProgressSummary: React.FC<SummaryProps> = ({
  totalDue,
  outstanding,
  currency,
  totalLabel,
}) => {
  const { t } = useTranslation();
  const due = Number.isFinite(totalDue) && totalDue > 0 ? totalDue : 0;
  const out = Number.isFinite(outstanding) && outstanding > 0 ? outstanding : 0;
  const paid = due > 0 ? Math.max(0, Math.min(due, due - out)) : 0;
  const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : out <= 0.009 ? 100 : 0;
  const fullyPaid = due <= 0.009 || out <= 0.009;

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryTop}>
        <Text style={styles.summaryTotalLabel}>{totalLabel}</Text>
        <Text style={styles.summaryTotalValue}>{formatErpDocMoney(due, currency)}</Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${pct}%` },
            fullyPaid && styles.progressFillComplete,
          ]}
        />
      </View>
      <Text style={styles.progressCaption}>
        {fullyPaid
          ? t('erpPayments.fullyPaid')
          : t('erpPayments.percentPaid', { percent: pct })}
      </Text>

      <View style={styles.summaryAmounts}>
        <View style={styles.summaryAmountCol}>
          <Text style={styles.summaryAmountLabel}>{t('erpPayments.paid')}</Text>
          <Text style={[styles.summaryAmountValue, styles.paidValue]}>
            {formatErpDocMoney(paid, currency)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryAmountCol}>
          <Text style={styles.summaryAmountLabel}>{t('erpPayments.outstanding')}</Text>
          <Text
            style={[
              styles.summaryAmountValue,
              fullyPaid ? styles.paidValue : styles.outstandingValue,
            ]}
          >
            {formatErpDocMoney(out, currency)}
          </Text>
        </View>
      </View>
    </View>
  );
};

type ListProps = {
  rows: Record<string, unknown>[];
  currency: string;
  onOpen: (name: string) => void;
};

export const ErpDocPaymentEntryList: React.FC<ListProps> = ({ rows, currency, onOpen }) => {
  if (rows.length === 0) return null;

  return (
    <ErpDocItemsList>
      {rows.map((row, idx) => {
        const name = String(row.name || '').trim();
        const status = erpDocPaymentStatusLabel(row);
        const statusColor = erpDocStatusAccent(status, row.docstatus != null ? Number(row.docstatus) : undefined);
        const date = formatErpDocDate(row.posting_date);
        const mode = String(row.mode_of_payment || '').trim();

        return (
          <TouchableOpacity
            key={name || idx}
            style={[styles.row, idx < rows.length - 1 && styles.rowBorder]}
            onPress={() => onOpen(name)}
            activeOpacity={0.7}
            disabled={!name}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="card-outline" size={18} color={ERP_DOC_FLAT.accent} />
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={styles.rowAmount}>{erpDocFormattedPaymentAmount(row, currency)}</Text>
                <View style={styles.rowStatusWrap}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
                </View>
              </View>
              <View style={styles.rowMeta}>
                {date ? <Text style={styles.rowMetaText}>{date}</Text> : null}
                {date && mode ? <Text style={styles.rowMetaDot}> · </Text> : null}
                {mode ? <Text style={styles.rowMetaText}>{mode}</Text> : null}
              </View>
              {name ? (
                <Text style={styles.rowId} numberOfLines={1}>
                  {name}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
          </TouchableOpacity>
        );
      })}
    </ErpDocItemsList>
  );
};

const styles = StyleSheet.create({
  summaryCard: {
    backgroundColor: ERP_DOC_FLAT.surface,
    borderWidth: ERP_DOC_FLAT.hairline,
    borderColor: ERP_DOC_FLAT.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: Spacing.MD,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  summaryTotalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: ERP_DOC_FLAT.muted,
    flex: 1,
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: ERP_DOC_FLAT.ink,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: ERP_DOC_FLAT.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: ERP_DOC_FLAT.accent,
  },
  progressFillComplete: {
    backgroundColor: Colors.SUCCESS,
  },
  progressCaption: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: ERP_DOC_FLAT.muted,
  },
  summaryAmounts: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: ERP_DOC_FLAT.hairline,
    borderTopColor: ERP_DOC_FLAT.border,
  },
  summaryAmountCol: { flex: 1, minWidth: 0 },
  summaryDivider: {
    width: ERP_DOC_FLAT.hairline,
    backgroundColor: ERP_DOC_FLAT.border,
    marginHorizontal: 12,
  },
  summaryAmountLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: ERP_DOC_FLAT.muted,
    marginBottom: 4,
  },
  summaryAmountValue: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  paidValue: { color: Colors.SUCCESS },
  outstandingValue: { color: Colors.ERROR },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  rowBorder: {
    borderBottomWidth: ERP_DOC_FLAT.hairline,
    borderBottomColor: ERP_DOC_FLAT.border,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ERP_DOC_FLAT.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: ERP_DOC_FLAT.ink,
    fontVariant: ['tabular-nums'],
  },
  rowStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  rowMetaText: { fontSize: 12, color: ERP_DOC_FLAT.muted },
  rowMetaDot: { fontSize: 12, color: ERP_DOC_FLAT.muted },
  rowId: { fontSize: 11, color: ERP_DOC_FLAT.muted, marginTop: 3 },
});
