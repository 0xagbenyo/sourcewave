import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { SUPPLIERS, fetchSuppliersFromErp, type Supplier } from '../data/suppliers';
import { SourceWaveStackHeader } from '../components/SourceWaveStackHeader';
import type { RootStackParamList } from '../types';

export const SuppliersScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');
  const [erpRows, setErpRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { suppliers, error: loadErr } = await fetchSuppliersFromErp();
    setErpRows(suppliers);
    if (loadErr) setError(loadErr);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(null);
        await load();
        if (!cancelled) setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const combined = useMemo(() => {
    const byId = new Map<string, Supplier>();
    for (const s of SUPPLIERS) byId.set(s.id, s);
    for (const s of erpRows) byId.set(s.id, s);
    return Array.from(byId.values());
  }, [erpRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return combined;
    return combined.filter((s) => {
      const hay = [
        s.supplier_name,
        s.supplier_group,
        s.country,
        s.supplier_details,
        s.website || '',
        s.language,
        s.id,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [combined, query]);

  return (
    <View style={styles.root}>
      <SourceWaveStackHeader
        title="Suppliers"
        subtitle="Directory from your connected catalog"
        onBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            (navigation as { navigate: (name: string) => void }).navigate('Home');
          }
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Text style={styles.subtitle}>
          Directory syncs when you open this screen. Disabled suppliers show a badge but stay listed.
        </Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={18} color="#B45309" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={Colors.TEXT_SECONDARY} />
          <TextInput
            placeholder="Search name, group, country, details…"
            placeholderTextColor={Colors.TEXT_SECONDARY}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.TEXT_SECONDARY} />
            </TouchableOpacity>
          ) : null}
        </View>

        {loading && combined.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.WINE} />
            <Text style={styles.loadingLabel}>Loading suppliers…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.WINE} />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {query.trim()
                    ? 'No suppliers match your search.'
                    : error
                      ? 'Fix the connection issue above, then pull to refresh.'
                      : 'No supplier records were returned. Check your account permissions and try again.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('SupplierDetail', { supplierId: item.id })}
              >
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.supplier_name.charAt(0)}</Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{item.supplier_name}</Text>
                    <Text style={styles.cardRegion}>{item.country}</Text>
                    <View style={styles.tagRow}>
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>{item.supplier_group}</Text>
                      </View>
                      <View style={[styles.tag, styles.tagMuted]}>
                        <Text style={styles.tagText}>{item.supplier_type}</Text>
                      </View>
                      {!item.enabled ? (
                        <View style={styles.tagDisabled}>
                          <Text style={styles.tagDisabledText}>Disabled</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.TEXT_SECONDARY} />
                </View>
                {item.markupNote ? (
                  <Text style={styles.markup} numberOfLines={2}>
                    {item.markupNote}
                  </Text>
                ) : null}
                <View style={[styles.cardFooter, !(item.rating != null || item.responseTime) && styles.cardFooterSingle]}>
                  {item.rating != null ? (
                    <>
                      <Ionicons name="star" size={14} color={Colors.GOLD} />
                      <Text style={styles.meta}>{item.rating.toFixed(1)}</Text>
                    </>
                  ) : null}
                  {item.rating != null && item.responseTime ? <Text style={styles.metaDot}>·</Text> : null}
                  {item.responseTime ? <Text style={styles.meta}>{item.responseTime}</Text> : null}
                  {!item.rating && !item.responseTime ? (
                    <Text style={styles.metaPlain}>Print: {item.language}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.BACKGROUND },
  safe: { flex: 1, backgroundColor: Colors.BACKGROUND },
  subtitle: {
    paddingHorizontal: Spacing.MD,
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 18,
    marginBottom: Spacing.SM,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: Spacing.MD,
    marginBottom: Spacing.SM,
    padding: Spacing.SM,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  errorText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.MD,
    marginBottom: Spacing.SM,
    paddingHorizontal: Spacing.SM,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.LIGHT_GRAY,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.BLACK, paddingVertical: 0 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  loadingLabel: { marginTop: Spacing.MD, fontSize: 14, color: Colors.TEXT_SECONDARY },
  listContent: { paddingHorizontal: Spacing.MD, paddingBottom: 32 },
  card: {
    backgroundColor: Colors.WHITE,
    borderRadius: 16,
    padding: Spacing.MD,
    marginBottom: Spacing.MD,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.WINE + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: Colors.WINE },
  cardBody: { flex: 1, marginLeft: Spacing.SM },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.BLACK },
  cardRegion: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: {
    backgroundColor: Colors.LIGHT_GRAY,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: { fontSize: 11, fontWeight: '600', color: Colors.DARK_GRAY },
  tagMuted: { opacity: 0.85 },
  tagDisabled: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagDisabledText: { fontSize: 11, fontWeight: '700', color: '#B91C1C' },
  markup: {
    marginTop: Spacing.SM,
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 16,
  },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.SM, gap: 4 },
  cardFooterSingle: { gap: 0 },
  meta: { fontSize: 12, color: Colors.TEXT_SECONDARY },
  metaPlain: { fontSize: 12, color: Colors.TEXT_SECONDARY },
  metaDot: { marginLeft: 6, color: Colors.TEXT_SECONDARY },
  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { color: Colors.TEXT_SECONDARY, fontSize: 14, textAlign: 'center', paddingHorizontal: Spacing.MD },
});
