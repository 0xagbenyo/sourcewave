import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { SourceWaveStackHeader } from '../components/SourceWaveStackHeader';
import { NativeRavenChat } from '../components/NativeRavenChat';
import { SuppliersPremiumGateContent } from '../components/SuppliersPremiumGateContent';
import type { RootStackParamList } from '../types';

export const SupplierChatListScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useUserSession();
  const { isActive, isLoading, refresh } = useSubscription();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  if (!user?.email) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Messages" subtitle="In-app" onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
          <View style={styles.emptyBlock}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.TEXT_SECONDARY} />
            <Text style={styles.emptyTitle}>{t('suppliersPremium.signInTitle')}</Text>
            <Text style={styles.emptySub}>{t('suppliersPremium.signInBody')}</Text>
            <TouchableOpacity style={styles.primaryCta} onPress={() => navigation.navigate('Auth')}>
              <Text style={styles.primaryCtaText}>{t('suppliersPremium.signInCta')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader
          title="Messages"
          subtitle={t('subscriptionPage.loading')}
          onBack={() => navigation.goBack()}
        />
        <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.WINE} />
            <Text style={styles.loadingLabel}>{t('subscriptionPage.loading')}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!isActive) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader
          title="Messages"
          subtitle={t('suppliersPremium.subtitle')}
          onBack={() => navigation.goBack()}
        />
        <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
          <SuppliersPremiumGateContent onSubscribe={() => navigation.navigate('Subscription')} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SourceWaveStackHeader title="Messages" subtitle="In-app" onBack={() => navigation.goBack()} />
      <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
        <NativeRavenChat />
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.BACKGROUND },
  bodySafe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingLabel: { marginTop: Spacing.SM, fontSize: 14, color: Colors.TEXT_SECONDARY },
  emptyBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.XL,
  },
  emptyTitle: {
    marginTop: Spacing.MD,
    fontSize: 18,
    fontWeight: '800',
    color: Colors.BLACK,
    textAlign: 'center',
  },
  emptySub: {
    marginTop: Spacing.SM,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryCta: {
    marginTop: Spacing.LG,
    backgroundColor: Colors.WINE,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  primaryCtaText: { color: Colors.WHITE, fontWeight: '700', fontSize: 16 },
});
