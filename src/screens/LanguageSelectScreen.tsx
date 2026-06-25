import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { appStorage } from '../services/appStorage';
import { appAlert as Alert } from '../services/appAlert';
import { STORAGE_APP_LANGUAGE } from '../constants/appPreferencesKeys';
import { ensureChineseMachineLocale, applyEnglishLocale } from '../i18n/machineChineseLocale';

export const LanguageSelectScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'LanguageSelect'>>();
  const fromSettings = Boolean(route.params?.fromSettings);
  const [busy, setBusy] = useState(false);
  const [busyHint, setBusyHint] = useState<string | null>(null);

  const goOnboarding = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Onboarding' as never }],
      })
    );
  };

  const afterLanguageChosen = () => {
    if (fromSettings) {
      (navigation as { goBack: () => void }).goBack();
    } else {
      goOnboarding();
    }
  };

  const pickEnglish = async () => {
    setBusy(true);
    setBusyHint(null);
    try {
      await appStorage.setItem(STORAGE_APP_LANGUAGE, 'en');
      await applyEnglishLocale();
      afterLanguageChosen();
    } finally {
      setBusy(false);
      setBusyHint(null);
    }
  };

  const pickChinese = async () => {
    setBusy(true);
    setBusyHint('zh');
    try {
      await appStorage.setItem(STORAGE_APP_LANGUAGE, 'zh');
      const ok = await ensureChineseMachineLocale();
      if (!ok) {
        Alert.alert(
          'Chinese unavailable',
          'Online translation for Chinese could not be reached. The app will use English for now.'
        );
      }
      afterLanguageChosen();
    } finally {
      setBusy(false);
      setBusyHint(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {fromSettings ? (
        <TouchableOpacity
          style={styles.backBar}
          onPress={() => (navigation as { goBack: () => void }).goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.inner}>
        <Text style={styles.title}>Choose your language</Text>
        <Text style={styles.subtitle}>
          You can change this later in settings when available.
        </Text>

        <TouchableOpacity
          style={[styles.card, busy && styles.cardDisabled]}
          onPress={pickEnglish}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="English"
        >
          <Text style={styles.cardTitle}>English</Text>
          <Ionicons name="chevron-forward" size={22} color={Colors.TEXT_SECONDARY} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, busy && styles.cardDisabled]}
          onPress={pickChinese}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Simplified Chinese"
        >
          <Text style={styles.cardTitle}>简体中文</Text>
          <Ionicons name="chevron-forward" size={22} color={Colors.TEXT_SECONDARY} />
        </TouchableOpacity>

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator size="large" color={Colors.BLACK} />
            {busyHint === 'zh' ? (
              <Text style={styles.busyText}>
                Preparing Chinese…{'\n'}
                <Text style={styles.busyHint}>First time only. Uses automatic translation.</Text>
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  backBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 24 : 8,
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.BLACK,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  busy: {
    marginTop: 28,
    alignItems: 'center',
  },
  busyText: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 15,
    color: Colors.BLACK,
    lineHeight: 22,
  },
  busyHint: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '400',
  },
});
