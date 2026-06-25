import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useTranslation } from 'react-i18next';
import { getSupplierById, resolveSupplier, type Supplier } from '../data/suppliers';
import { useSubscription } from '../context/SubscriptionContext';
import { useUserSession } from '../context/UserContext';
import { SourceWaveStackHeader } from '../components/SourceWaveStackHeader';
import { useAutoNavigateToSubscriptionWhenInactive } from '../hooks/useAutoNavigateToSubscriptionWhenInactive';
import { resetToAuthScreen } from '../navigation/rootNavigation';
import type { RootStackParamList } from '../types';

function dash(v: string | null | undefined): string {
  const t = (v ?? '').trim();
  return t.length ? t : '—';
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export const SupplierDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'SupplierDetail'>>();
  const { user } = useUserSession();
  const { refresh, isLoading: subscriptionLoading, isActive } = useSubscription();
  const supplierId = route.params.supplierId;
  const [supplier, setSupplier] = useState<Supplier | null>(() => getSupplierById(supplierId) ?? null);
  const [loadingDoc, setLoadingDoc] = useState(() => !getSupplierById(supplierId));
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = route.params.supplierId;
    const local = getSupplierById(id);
    if (local) {
      setSupplier(local);
      setLoadingDoc(false);
      return;
    }
    setLoadingDoc(true);
    resolveSupplier(id).then((s) => {
      if (!cancelled) {
        setSupplier(s);
        setLoadingDoc(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [route.params.supplierId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useAutoNavigateToSubscriptionWhenInactive(navigation, {
    email: user?.email,
    isLoading: subscriptionLoading,
    isActive,
  });

  if (loadingDoc) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Supplier" subtitle="Loading…" onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.WINE} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!supplier) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Supplier" onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <Text style={styles.missing}>This supplier was not found in the catalog.</Text>
        </SafeAreaView>
      </View>
    );
  }

  if (!user?.email) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Supplier" onBack={() => navigation.goBack()} />
        <SafeAreaView style={[styles.safe, styles.gatePad]} edges={['bottom']}>
          <Text style={styles.gateTitle}>{t('suppliersPremium.signInTitle')}</Text>
          <Text style={styles.gateBody}>{t('suppliersPremium.signInBody')}</Text>
          <TouchableOpacity style={styles.gateCta} onPress={() => resetToAuthScreen()} activeOpacity={0.85}>
            <Text style={styles.gateCtaText}>{t('suppliersPremium.signInCta')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  if (subscriptionLoading) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Supplier" subtitle={t('subscriptionPage.loading')} onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.WINE} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!isActive) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Supplier" subtitle={t('subscriptionPage.loading')} onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.WINE} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const openChat = async () => {
    setOpeningChat(true);
    try {
      if (!supplier.enabled) {
        Alert.alert('Supplier disabled', 'This supplier is marked disabled and cannot be messaged.');
        return;
      }
      const { isActive } = await refresh();
      if (!isActive) {
        navigation.navigate('Subscription');
        return;
      }
      navigation.navigate('AgentSupplierChat', { supplierId: supplier.id });
    } finally {
      setOpeningChat(false);
    }
  };

  const openWebsite = () => {
    const w = (supplier.website || '').trim();
    if (!w) return;
    const url = /^https?:\/\//i.test(w) ? w : `https://${w}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <SourceWaveStackHeader
        title="Supplier"
        subtitle={`${supplier.supplier_name} · ${supplier.country}`}
        onBack={() => navigation.goBack()}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{supplier.supplier_name.charAt(0)}</Text>
            </View>
            <Text style={styles.name}>{supplier.supplier_name}</Text>
            <Text style={styles.subLine}>
              {supplier.supplier_group} · {supplier.country}
            </Text>
            <View style={styles.heroBadges}>
              <View style={[styles.pill, supplier.enabled ? styles.pillOn : styles.pillOff]}>
                <Text style={[styles.pillText, !supplier.enabled && styles.pillTextOff]}>
                  {supplier.enabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
              {supplier.is_transporter ? (
                <View style={styles.pillNeutral}>
                  <Ionicons name="bus-outline" size={14} color={Colors.DARK_GRAY} />
                  <Text style={styles.pillNeutralText}> Transporter</Text>
                </View>
              ) : null}
            </View>
            {supplier.rating != null ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={16} color={Colors.GOLD} />
                <Text style={styles.ratingText}>{supplier.rating.toFixed(1)}</Text>
                {supplier.responseTime ? (
                  <>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.ratingText}>{supplier.responseTime}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Supplier type</Text>
            <FieldRow label="supplier_type" value={supplier.supplier_type} />
            <FieldRow label="supplier_name" value={supplier.supplier_name} />
            <FieldRow label="supplier_group" value={supplier.supplier_group} />
            <FieldRow label="country" value={supplier.country} />
            <FieldRow label="is_transporter" value={supplier.is_transporter ? 'Yes' : 'No'} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Defaults</Text>
            <FieldRow label="default_currency" value={dash(supplier.default_currency)} />
            <FieldRow label="default_bank_account" value={dash(supplier.default_bank_account)} />
            <FieldRow label="default_price_list" value={dash(supplier.default_price_list)} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>More information</Text>
            <Text style={styles.sectionHint}>supplier_details</Text>
            <Text style={styles.body}>{supplier.supplier_details}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact & print</Text>
            <FieldRow label="website" value={dash(supplier.website)} />
            {supplier.website?.trim() ? (
              <TouchableOpacity onPress={openWebsite} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>Open website</Text>
              </TouchableOpacity>
            ) : null}
            <FieldRow label="language" value={supplier.language} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer numbers</Text>
            <Text style={styles.sectionHint}>customer_numbers</Text>
            {supplier.customer_numbers.length === 0 ? (
              <Text style={styles.emptyTable}>No rows</Text>
            ) : (
              supplier.customer_numbers.map((row, i) => (
                <View key={`${row.company}-${row.customer_number}-${i}`} style={styles.cnRow}>
                  <Text style={styles.cnHead}>Company</Text>
                  <Text style={styles.cnVal}>{row.company}</Text>
                  <Text style={[styles.cnHead, styles.cnHeadSecond]}>Customer number</Text>
                  <Text style={styles.cnVal}>{row.customer_number}</Text>
                </View>
              ))
            )}
          </View>

          {supplier.markupNote ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SourceWave pricing note</Text>
              <Text style={styles.body}>{supplier.markupNote}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>In-app chat</Text>
            <Text style={styles.body}>
              Supplier messaging opens in your browser on the supplier site. Sign in when prompted. Print language on
              file: {supplier.language} ({supplier.chatLanguageLabel}).
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.cta, (openingChat || subscriptionLoading) && styles.ctaDisabled]}
            activeOpacity={0.9}
            onPress={openChat}
            disabled={openingChat || subscriptionLoading}
          >
            {openingChat || subscriptionLoading ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <>
                <Ionicons name="chatbubbles-outline" size={22} color={Colors.WHITE} />
                <Text style={styles.ctaText}>Message as sourcing agent</Text>
              </>
            )}
          </TouchableOpacity>
          {subscriptionLoading ? <Text style={styles.footerHint}>Checking subscription status…</Text> : null}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.BACKGROUND },
  safe: { flex: 1, backgroundColor: Colors.BACKGROUND },
  missing: { padding: Spacing.MD, color: Colors.TEXT_SECONDARY },
  gatePad: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.LG },
  gateTitle: { fontSize: 20, fontWeight: '800', color: Colors.BLACK, textAlign: 'center' },
  gateBody: {
    marginTop: Spacing.SM,
    fontSize: 15,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
  },
  gateCta: {
    marginTop: Spacing.XL,
    backgroundColor: Colors.WINE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  gateCtaText: { color: Colors.WHITE, fontWeight: '700', fontSize: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  scroll: { paddingHorizontal: Spacing.MD, paddingBottom: 120 },
  hero: { alignItems: 'center', paddingVertical: Spacing.LG },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.WINE + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: Colors.WINE },
  name: { marginTop: Spacing.MD, fontSize: 22, fontWeight: '800', color: Colors.BLACK },
  subLine: { marginTop: 6, fontSize: 14, color: Colors.TEXT_SECONDARY },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: Spacing.SM },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pillOn: { backgroundColor: '#DCFCE7' },
  pillOff: { backgroundColor: '#FEE2E2' },
  pillText: { fontSize: 12, fontWeight: '700', color: '#166534' },
  pillTextOff: { color: Colors.WINE },
  pillNeutral: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  pillNeutralText: { fontSize: 12, fontWeight: '600', color: Colors.DARK_GRAY },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.SM },
  ratingText: { fontSize: 14, color: Colors.TEXT_SECONDARY, marginLeft: 4 },
  dot: { marginHorizontal: 6, color: Colors.TEXT_SECONDARY },
  section: { marginBottom: Spacing.LG },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.BLACK, marginBottom: 6 },
  sectionHint: { fontSize: 11, color: Colors.TEXT_SECONDARY, marginBottom: 8 },
  body: { fontSize: 14, color: Colors.DARK_GRAY, lineHeight: 21 },
  fieldRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
  },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: Colors.TEXT_SECONDARY, textTransform: 'lowercase' },
  fieldValue: { fontSize: 15, color: Colors.BLACK, marginTop: 4 },
  linkBtn: { marginTop: Spacing.SM },
  linkBtnText: { fontSize: 15, fontWeight: '700', color: Colors.WINE },
  emptyTable: { fontSize: 14, color: Colors.TEXT_SECONDARY, fontStyle: 'italic' },
  cnRow: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    padding: Spacing.MD,
    marginBottom: Spacing.SM,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  cnHead: { fontSize: 11, fontWeight: '700', color: Colors.TEXT_SECONDARY, textTransform: 'uppercase' },
  cnHeadSecond: { marginTop: Spacing.SM },
  cnVal: { fontSize: 15, color: Colors.BLACK, marginTop: 2 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.MD,
    paddingBottom: Spacing.LG,
    backgroundColor: Colors.WHITE,
    borderTopWidth: 1,
    borderTopColor: Colors.BORDER,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.WINE,
    paddingVertical: 14,
    borderRadius: 14,
  },
  ctaDisabled: { opacity: 0.75 },
  ctaText: { color: Colors.WHITE, fontSize: 16, fontWeight: '700' },
  footerHint: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
  },
});
