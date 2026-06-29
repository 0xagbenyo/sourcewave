import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { RavenLight } from '../constants/ravenLightTheme';
import { getERPNextClient } from '../services/erpnext';
import { useUserSession } from '../context/UserContext';
import { userFacingError } from '../utils/userFacingError';
import type { RootStackParamList } from '../types';
import { appAlert as Alert } from '../services/appAlert';

type Props = {
  orderName: string;
  /** When opened from chat, pre-select this channel on send. */
  ravenChannelId?: string;
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

/**
 * In-chat card for a linked **Sales Order** (buyer sourcing request shared with a supplier).
 */
export const RavenLinkedSalesOrderMessage: React.FC<Props> = ({ orderName, ravenChannelId }) => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const name = orderName.trim();
  const channelId = (ravenChannelId || '').trim();
  const isSupplier = user?.appMode === 'supplier' || !!user?.supplierId?.trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [orderSubmitted, setOrderSubmitted] = useState(false);
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
        const raw = await getERPNextClient().getSalesOrder(name);
        if (cancelled) return;
        const items = Array.isArray(raw?.items) ? raw.items : [];
        const gt = Number(raw?.grand_total ?? raw?.total) || 0;
        const currency = String(raw?.currency || 'GHS');
        const ds = Number(raw?.docstatus ?? 0);
        setOrderSubmitted(ds === 1);
        setTitle(String(raw?.name || name));
        setItemCount(items.length);
        setMeta(
          `${statusLabel(raw?.docstatus, raw?.status)} · ${items.length} item${items.length === 1 ? '' : 's'} · ${formatMoney(gt, currency)}`
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
      (navigation as { navigate: (screen: string, params: object) => void }).navigate('OrderDetails', {
        orderId: name,
        ...(channelId ? { ravenChannelId: channelId } : {}),
      });
    } catch (e: unknown) {
      Alert.alert('Sales order', userFacingError(e, 'Could not open this order.'));
    }
  }, [navigation, name]);

  const openQuotationCompose = useCallback(() => {
    if (!name) return;
    try {
      (navigation as { navigate: (screen: keyof RootStackParamList, params?: object) => void }).navigate(
        'SupplierQuotationCompose',
        {
          ...(channelId ? { ravenChannelId: channelId } : {}),
          salesOrderName: name,
        }
      );
    } catch (e: unknown) {
      Alert.alert('Quotation', userFacingError(e, 'Could not open quotation editor.'));
    }
  }, [navigation, name, channelId]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="cart-outline" size={22} color={RavenLight.accent} style={{ marginRight: 8 }} />
        <Text style={styles.headTitle} numberOfLines={1}>
          Sourcing request
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={RavenLight.accent} style={{ marginTop: 10 }} />
      ) : error ? (
        <Text style={styles.docId}>{name}</Text>
      ) : (
        <>
          <Text style={styles.docId} numberOfLines={2}>
            {title}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          {itemCount > 0 ? (
            <Text style={styles.metaSub}>
              {itemCount} line{itemCount === 1 ? '' : 's'} in this request
            </Text>
          ) : null}
        </>
      )}

      {isSupplier ? (
        <View style={styles.actions}>
          {!orderSubmitted ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={openQuotationCompose}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create quotation from this order"
            >
              <Ionicons name="pricetag-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.primaryBtnText}>Create quotation</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={openDetails}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View order details"
          >
            <Text style={styles.secondaryBtnText}>View order</Text>
            <Ionicons name="chevron-forward" size={16} color={RavenLight.accent} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.row} onPress={openDetails} activeOpacity={0.85}>
          <Text style={styles.hint}>View order</Text>
          <Ionicons name="chevron-forward" size={18} color={RavenLight.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
    padding: 10,
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  head: { flexDirection: 'row', alignItems: 'center' },
  headTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: RavenLight.text },
  docId: { marginTop: 6, fontSize: 15, fontWeight: '600', color: RavenLight.accent },
  meta: { marginTop: 6, fontSize: 13, color: RavenLight.textMuted },
  metaSub: { marginTop: 4, fontSize: 12, color: RavenLight.textSubtle },
  row: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: { fontSize: 12, color: RavenLight.textSubtle },
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
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: RavenLight.accent },
});
