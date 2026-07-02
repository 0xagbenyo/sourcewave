import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { RavenLight } from '../constants/ravenLightTheme';
import { getERPNextClient } from '../services/erpnext';
import { useUserSession } from '../context/UserContext';
import { userFacingError } from '../utils/userFacingError';
import { navigateToSalesInvoiceDetail } from '../utils/erpDocumentNavigation';
import { appAlert as Alert } from '../services/appAlert';
import { ravenChatDocCardColors, ravenChatDocCardStyle, ravenChatDocSharedLabelStyle } from '../utils/ravenChatDocCard';

type Props = {
  invoiceName: string;
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

/** In-chat card for a linked **Sales Invoice**. */
export const RavenLinkedSalesInvoiceMessage: React.FC<Props> = ({ invoiceName, mine }) => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const name = invoiceName.trim();
  const isSupplier = user?.appMode === 'supplier' || !!user?.supplierId?.trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [title, setTitle] = useState(name);
  const [meta, setMeta] = useState('');

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
        const raw = await getERPNextClient().getSalesInvoiceRaw(name);
        if (cancelled) return;
        if (!raw) {
          setError(true);
          return;
        }
        const gt = Number(raw.grand_total) || 0;
        const outstanding = Number(raw.outstanding_amount) || 0;
        const currency = String(raw.currency || 'GHS');
        setTitle(String(raw.name || name));
        setMeta(
          `${statusLabel(raw.docstatus, raw.status)} · ${formatMoney(gt, currency)} · Outstanding ${formatMoney(outstanding, currency)}`
        );
      } catch {
        if (!cancelled) setError(true);
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
      navigateToSalesInvoiceDetail(navigation as { navigate: (n: string, p?: object) => void }, name, isSupplier);
    } catch (e: unknown) {
      Alert.alert('Invoice', userFacingError(e, 'Could not open this invoice.'));
    }
  }, [navigation, name, isSupplier]);

  const colors = ravenChatDocCardColors(mine);

  return (
    <View style={ravenChatDocCardStyle(mine)}>
      {mine ? <Text style={ravenChatDocSharedLabelStyle(mine)}>You shared</Text> : null}
      <View style={styles.head}>
        <Ionicons name="receipt-outline" size={22} color={colors.icon} style={{ marginRight: 8 }} />
        <Text style={[styles.headTitle, { color: colors.title }]} numberOfLines={1}>
          Sales invoice
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
        </>
      )}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primaryBtnBg }]}
          onPress={openDetails}
          activeOpacity={0.85}
        >
          <Ionicons name="eye-outline" size={18} color={colors.primaryBtnText} style={{ marginRight: 6 }} />
          <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>View invoice</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  headTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  docId: { marginTop: 6, fontSize: 15, fontWeight: '600' },
  meta: { marginTop: 6, fontSize: 13 },
  actions: { marginTop: 12, gap: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RavenLight.accent,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700' },
});
