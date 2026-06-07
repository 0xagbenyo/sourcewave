import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { Colors } from '../constants/colors';
import type { SourcewaveQuotationDraftPayload } from '../utils/chatQuotationDraftMessage';
import {
  supplierQuotationWorkflowStateAllowsBuyerReview,
  supplierQuotationWorkflowStateIsApprovedLike,
  supplierQuotationWorkflowStateIsRejectedLike,
} from '../utils/chatQuotationDraftMessage';
import { SupplierQuotationPdfModal } from './SupplierQuotationPdfModal';

type Props = {
  payload: SourcewaveQuotationDraftPayload;
  /** Buyer can accept / reject. */
  showBuyerActions: boolean;
  /** Buyer outcome in chat, or `submitted` when the doc is already submitted in ERPNext without using Accept here. */
  handled?: 'accepted' | 'rejected' | 'submitted' | null;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  /** Long-press on the card body (e.g. supplier Reply/Pay menu). */
  onCardLongPress?: () => void;
};

/** Chip colors: approved & pending green, rejected red. */
type StatusKind = 'rejected' | 'pending' | 'approved' | 'neutral';

function formatQuotationDate(iso?: string): string {
  const s = (iso || '').trim();
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function deriveQuotationUiStatus(
  payload: SourcewaveQuotationDraftPayload,
  handled: Props['handled']
): { label: string; kind: StatusKind } {
  const wf = (payload.workflowState || '').trim();
  const erp = (payload.erpnextStatus || '').trim();
  const erpl = erp.toLowerCase();

  if (handled === 'accepted') {
    return { label: wf || 'Accepted', kind: 'approved' };
  }
  if (handled === 'rejected') {
    return { label: wf || 'Rejected', kind: 'rejected' };
  }
  if (handled === 'submitted' || payload.status === 'submitted') {
    return { label: wf || 'Submitted', kind: 'approved' };
  }

  /** Real status in ERPNext is workflow_state when set; chip shows that text. */
  if (wf) {
    if (supplierQuotationWorkflowStateIsRejectedLike(wf)) return { label: wf, kind: 'rejected' };
    if (supplierQuotationWorkflowStateAllowsBuyerReview(wf)) return { label: wf, kind: 'pending' };
    if (supplierQuotationWorkflowStateIsApprovedLike(wf)) return { label: wf, kind: 'approved' };
    return { label: wf, kind: 'neutral' };
  }

  if (supplierQuotationWorkflowStateIsRejectedLike(erp)) return { label: erp, kind: 'rejected' };
  if (erp && (erpl === 'pending' || erpl.includes('pending') || erpl.includes('awaiting'))) {
    return { label: erp, kind: 'pending' };
  }
  if (supplierQuotationWorkflowStateIsApprovedLike(erp)) return { label: erp, kind: 'approved' };
  if (erp) return { label: erp, kind: 'neutral' };
  return { label: 'Draft', kind: 'neutral' };
}

function chipColors(kind: StatusKind): { bg: string; fg: string; border: string } {
  switch (kind) {
    case 'rejected':
      return { bg: '#FFEBEE', fg: '#B71C1C', border: '#E57373' };
    case 'pending':
      return { bg: '#E8F5E9', fg: '#2E7D32', border: '#81C784' };
    case 'approved':
      return { bg: '#E8F5E9', fg: '#1B5E20', border: '#66BB6A' };
    default:
      return { bg: '#F5F5F5', fg: RavenLight.textMuted, border: '#E0E0E0' };
  }
}

export const RavenQuotationDraftCard: React.FC<Props> = ({
  payload,
  showBuyerActions,
  handled,
  busy,
  onAccept,
  onReject,
  onCardLongPress,
}) => {
  const [pdfOpen, setPdfOpen] = useState(false);
  const uiStatus = useMemo(() => deriveQuotationUiStatus(payload, handled), [payload, handled]);
  const chip = chipColors(uiStatus.kind);
  const dateLine = formatQuotationDate(payload.transactionDate);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setPdfOpen(true)}
        {...(onCardLongPress
          ? { onLongPress: onCardLongPress, delayLongPress: 380 as const }
          : {})}
        style={({ pressed }) => [styles.tapArea, pressed && styles.tapAreaPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open quotation PDF preview"
      >
        <View style={styles.cardHead}>
          <Ionicons name="document-text-outline" size={20} color={RavenLight.accent} />
          <Text style={styles.cardTitle} numberOfLines={1}>
            Supplier quotation
          </Text>
          <Ionicons name="chevron-forward" size={18} color={RavenLight.textMuted} />
        </View>
        <Text style={styles.docId} numberOfLines={1}>
          {payload.name}
        </Text>
        <Text style={styles.metaLine} numberOfLines={1}>
          {dateLine}
        </Text>
        <View style={[styles.chip, { backgroundColor: chip.bg, borderColor: chip.border }]}>
          <Text style={[styles.chipText, { color: chip.fg }]} numberOfLines={2}>
            {uiStatus.label}
          </Text>
        </View>
      </Pressable>
      {showBuyerActions ? (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.rejectBtn]}
            onPress={onReject}
            disabled={busy}
            accessibilityLabel="Reject quotation"
          >
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.acceptBtn]}
            onPress={onAccept}
            disabled={busy}
            accessibilityLabel="Accept and submit quotation"
          >
            {busy ? (
              <ActivityIndicator color={Colors.WINE} size="small" />
            ) : (
              <Text style={styles.acceptText}>Accept</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      <SupplierQuotationPdfModal visible={pdfOpen} docName={payload.name} onClose={() => setPdfOpen(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: RavenLight.radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
    padding: 10,
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  tapArea: {
    borderRadius: 8,
  },
  tapAreaPressed: {
    opacity: 0.88,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: RavenLight.text },
  docId: { fontSize: 15, fontWeight: '700', color: RavenLight.accent, marginBottom: 4 },
  metaLine: { fontSize: 13, fontWeight: '600', color: RavenLight.textMuted, marginBottom: 8 },
  chip: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  chipText: { fontSize: 12, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    direction: 'ltr',
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  rejectBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
  },
  rejectText: { fontSize: 14, fontWeight: '700', color: RavenLight.text },
  acceptBtn: { backgroundColor: RavenLight.accent },
  acceptText: { fontSize: 14, fontWeight: '800', color: RavenLight.bubbleMineText },
});
