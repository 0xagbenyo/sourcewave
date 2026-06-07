import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { SourceWaveStackHeader } from '../components/SourceWaveStackHeader';
import { NativeRavenChat } from '../components/NativeRavenChat';
import type { RootStackParamList } from '../types';

export const SupplierChatListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useUserSession();

  if (!user?.email) {
    return (
      <View style={styles.root}>
        <SourceWaveStackHeader title="Messages" subtitle="In-app" onBack={() => navigation.goBack()} />
        <SafeAreaView style={styles.bodySafe} edges={['bottom']}>
          <View style={styles.emptyBlock}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.TEXT_SECONDARY} />
            <Text style={styles.emptyTitle}>Sign in to open chat</Text>
            <Text style={styles.emptySub}>
              Sign in to use in-app chat. Your account needs access to messaging on the supplier site.
            </Text>
            <TouchableOpacity style={styles.primaryCta} onPress={() => navigation.navigate('Auth')}>
              <Text style={styles.primaryCtaText}>Go to sign in</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SourceWaveStackHeader
        title="Messages"
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
  bodySafe: { flex: 1 },
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
