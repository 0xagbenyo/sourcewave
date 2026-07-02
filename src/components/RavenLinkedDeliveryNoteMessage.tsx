import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { RavenLight } from '../constants/ravenLightTheme';
import {
  deliveryNoteShippingFeeAmount,
  linkedSalesInvoiceFromDeliveryNote,
} from '../utils/deliveryNoteAmounts';
import { userFacingError } from '../utils/userFacingError';
import { appAlert as Alert } from '../services/appAlert';
import { ravenChatDocCardColors, ravenChatDocCardStyle, ravenChatDocSharedLabelStyle } from '../utils/ravenChatDocCard';
import { navigateToDeliveryNoteDetail } from '../utils/erpDocumentNavigation';

type Props = {
  deliveryNoteName: string;
  /** Outgoing share — blue card styling. */
  mine?: boolean;
};

function formatMoney(amount: number, currency: string): string {
  const c = currency.trim() || 'GHS';
  const n = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: c }).format(n);
  } catch {
    return `${c} ${n.toFixed(2)}`;
  }
}

function statusLabel(docstatus: unknown, status: unknown): string {
  const ds = Number(docstatus);
  const st = String(status ?? '').trim();
  if (ds === 2) return st ? `${st} · Cancelled` : 'Cancelled';
  if (ds === 0) return st ? `${st} · Draft` : 'Draft';
  return st || 'Submitted';
}

/** In-chat card for a linked **Delivery Note** (buyer shares with a logistics company). */
export const RavenLinkedDeliveryNoteMessage: React.FC<Props> = ({ deliveryNoteName, mine }) => {
  const navigation = useNavigation();
  const name = deliveryNoteName.trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [title, setTitle] = useState(name);
  const [meta, setMeta] = useState('');
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!name) {
        setLoading(false);
        setError(true);
        return;
      }
      setLoading(true);
      setError(false);
      try {
        const raw = await getERPNextClient().getDeliveryNoteRaw(name);
        if (cancelled) return;
        const linkedInvoice = linkedSalesInvoiceFromDeliveryNote(raw);
        let invoiceGrand: number | null = null;
        if (linkedInvoice) {
          try {
            const inv = await getERPNextClient().getSalesInvoiceRaw(linkedInvoice);
            const gt = Number(inv?.grand_total);
            invoiceGrand = Number.isFinite(gt) ? gt : null;
          } catch {
            invoiceGrand = null;
          }
        }
        const items = Array.isArray(raw?.items) ? raw.items : [];
        const deliveryFee = deliveryNoteShippingFeeAmount(raw || {}, invoiceGrand);
        const currency = String(raw?.currency || 'GHS');
        setTitle(String(raw?.name || name));
        setItemCount(items.length);
        setMeta(
          `${statusLabel(raw?.docstatus, raw?.status)} · ${items.length} item${items.length === 1 ? '' : 's'} · Delivery ${formatMoney(deliveryFee, currency)}`
        );
      } catch {
        if (!cancelled) {
          setError(true);
          setMeta('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const openDetails = useCallback(() => {
    if (!name) return;
    try {
      navigateToDeliveryNoteDetail(navigation as { navigate: (n: string, p?: object) => void }, name, false);
    } catch (e: unknown) {
      Alert.alert('Delivery note', userFacingError(e, 'Could not open this delivery note.'));
    }
  }, [navigation, name]);

  const colors = ravenChatDocCardColors(mine);

  return (
    <View style={ravenChatDocCardStyle(mine)}>
      {mine ? <Text style={ravenChatDocSharedLabelStyle(mine)}>You shared</Text> : null}
      <View style={styles.head}>
        <Ionicons name="airplane-outline" size={22} color={colors.icon} style={{ marginRight: 8 }} />
        <Text style={[styles.headTitle, { color: colors.title }]} numberOfLines={1}>
          Delivery note
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.icon} style={{ marginTop: 10 }} />
      ) : error ? (
        <Text style={[styles.docId, { color: colors.body }]}>{name}</Text>
      ) : (
        <>
          <Text style={[styles.docId, { color: colors.body }]} numberOfLines={2}>
            {title}
          </Text>
          {meta ? <Text style={[styles.meta, { color: colors.meta }]}>{meta}</Text> : null}
          {itemCount > 0 ? (
            <Text style={[styles.metaSub, { color: colors.meta }]}>
              {itemCount} line{itemCount === 1 ? '' : 's'}
            </Text>
          ) : null}
        </>
      )}
      <TouchableOpacity style={styles.row} onPress={openDetails} activeOpacity={0.85}>
        <Text style={[styles.hint, { color: colors.hint }]}>View delivery note</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.icon} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  headTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  docId: { marginTop: 6, fontSize: 15, fontWeight: '600' },
  meta: { marginTop: 6, fontSize: 13 },
  metaSub: { marginTop: 4, fontSize: 12 },
  row: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: { fontSize: 12 },
});
