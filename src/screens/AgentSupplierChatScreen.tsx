import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { getSupplierById, resolveSupplier, type Supplier } from '../data/suppliers';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { SourceWaveStackHeader } from '../components/SourceWaveStackHeader';
import { NativeRavenChat } from '../components/NativeRavenChat';
import type { RootStackParamList } from '../types';

export const AgentSupplierChatScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'AgentSupplierChat'>>();
  const { user } = useUserSession();
  const { refresh } = useSubscription();
  const supplierId = route.params.supplierId;
  const [supplier, setSupplier] = useState<Supplier | null>(() => getSupplierById(supplierId) ?? null);
  const [resolvingSupplier, setResolvingSupplier] = useState(() => !getSupplierById(supplierId));

  useEffect(() => {
    let cancelled = false;
    const id = route.params.supplierId;
    const local = getSupplierById(id);
    if (local) {
      setSupplier(local);
      setResolvingSupplier(false);
      return;
    }
    setResolvingSupplier(true);
    resolveSupplier(id).then((s) => {
      if (!cancelled) {
        setSupplier(s);
        setResolvingSupplier(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [route.params.supplierId]);

  const [accessGate, setAccessGate] = useState<'checking' | 'allowed'>('checking');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setAccessGate('checking');
        const { isActive: ok } = await refresh();
        if (cancelled) return;
        if (!ok) {
          navigation.navigate('Subscription');
          return;
        }
        setAccessGate('allowed');
      })();
      return () => {
        cancelled = true;
      };
    }, [refresh, navigation])
  );

  if (resolvingSupplier) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Chat" subtitle="Loading supplier…" onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.WINE} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!supplier) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Chat" onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
          <View style={styles.blocked}>
            <Text style={styles.blockedTitle}>Supplier not found</Text>
            <TouchableOpacity style={styles.secondaryCta} onPress={() => navigation.goBack()}>
              <Text style={styles.secondaryCtaText}>Go back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!user?.email) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Chat" onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
          <View style={styles.blocked}>
            <Text style={styles.blockedTitle}>Sign in required</Text>
            <Text style={styles.blockedText}>Log in to open in-app chat.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (accessGate === 'checking') {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Chat" subtitle="Checking access…" onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.WINE} />
            <Text style={styles.loadingLabel}>Checking subscription…</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SourceWaveStackHeader
        title={supplier.supplier_name}
        subtitle="In-app"
        onBack={() => navigation.goBack()}
      />
      <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
        <NativeRavenChat />
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.BACKGROUND },
  bodySafe: { flex: 1, backgroundColor: Colors.BACKGROUND },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingLabel: { marginTop: Spacing.SM, color: Colors.TEXT_SECONDARY, fontSize: 14 },
  blocked: { flex: 1, padding: Spacing.LG, justifyContent: 'center' },
  blockedTitle: { fontSize: 20, fontWeight: '800', color: Colors.BLACK, marginBottom: 8 },
  blockedText: { fontSize: 15, color: Colors.TEXT_SECONDARY, lineHeight: 22, marginBottom: Spacing.LG },
  primaryCta: {
    backgroundColor: Colors.WINE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryCtaText: { color: Colors.WHITE, fontWeight: '700', fontSize: 16 },
  secondaryCta: { marginTop: Spacing.SM, alignItems: 'center' },
  secondaryCtaText: { color: Colors.WINE, fontWeight: '700', fontSize: 15 },
});
