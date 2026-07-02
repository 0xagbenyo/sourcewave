import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { appStorage } from '../services/appStorage';
import {
  STORAGE_REFERRAL_SOURCE,
  STORAGE_REFERRAL_SOURCE_IS_OTHER,
} from '../constants/appPreferencesKeys';
import { getERPNextClient } from '../services/erpnext';

/** Sentinel id for the free-text "Other" choice. */
const OTHER_ID = '__other__';

/** Shown if the Lead Source list can't be fetched, so sign-up is never blocked. */
const FALLBACK_SOURCES = [
  'Facebook',
  'Tiktok',
  'Youtube',
  'Instagram',
  'Twitter',
  'Google Search',
  'From a friend',
];

export const HowDidYouHearScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await getERPNextClient().getLeadSources();
        if (!active) return;
        setSources(rows.length ? rows : FALLBACK_SOURCES);
      } catch {
        if (active) setSources(FALLBACK_SOURCES);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isOther = selected === OTHER_ID;
  const canContinue = isOther ? otherText.trim().length > 0 : !!selected;

  const handleContinue = useCallback(async () => {
    if (!canContinue) return;
    const value = isOther ? otherText.trim() : String(selected || '').trim();
    try {
      await appStorage.setItem(STORAGE_REFERRAL_SOURCE, value);
      await appStorage.setItem(STORAGE_REFERRAL_SOURCE_IS_OTHER, isOther ? '1' : '');
    } catch {
      // Non-blocking: attribution is best-effort and must not stop sign up.
    }
    navigation.navigate('Register' as never);
  }, [canContinue, isOther, otherText, selected, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('legal.back')}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('howDidYouHear.title')}</Text>
        <Text style={styles.subtitle}>{t('howDidYouHear.subtitle')}</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.WINE} />
          </View>
        ) : (
          <View style={styles.optionsWrap}>
            {sources.map((src) => {
              const active = selected === src;
              return (
                <TouchableOpacity
                  key={src}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => setSelected(src)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {src}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.option, isOther && styles.optionActive]}
              onPress={() => setSelected(OTHER_ID)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: isOther }}
            >
              <Text style={[styles.optionText, isOther && styles.optionTextActive]}>
                {t('howDidYouHear.other')}
              </Text>
            </TouchableOpacity>

            {isOther ? (
              <TextInput
                style={styles.otherInput}
                value={otherText}
                onChangeText={setOtherText}
                placeholder={t('howDidYouHear.otherPlaceholder')}
                placeholderTextColor={Colors.TEXT_DISABLED}
                autoFocus
              />
            ) : null}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
          disabled={!canContinue}
          onPress={handleContinue}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
        >
          <Text style={[styles.continueText, !canContinue && styles.continueTextDisabled]}>
            {t('howDidYouHear.continue')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  progressTrack: {
    height: 4,
    marginHorizontal: Spacing.LG,
    marginTop: Spacing.SM,
    borderRadius: 2,
    backgroundColor: Colors.LIGHT_GRAY,
    overflow: 'hidden',
  },
  progressFill: {
    width: '92%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.WINE,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.XS,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.LG,
    paddingTop: Spacing.SM,
    paddingBottom: Spacing.XL,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.BRAND_NAVY,
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  subtitle: {
    marginTop: Spacing.SM,
    marginBottom: Spacing.LG,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.TEXT_SECONDARY,
  },
  loadingWrap: {
    paddingVertical: Spacing.XXL,
    alignItems: 'center',
  },
  optionsWrap: {
    gap: 12,
  },
  option: {
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: Spacing.MD,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.LIGHT_GRAY,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionActive: {
    backgroundColor: Colors.BRAND_SOFT,
    borderColor: Colors.WINE,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.DARK_GRAY,
  },
  optionTextActive: {
    color: Colors.WINE,
    fontWeight: '700',
  },
  otherInput: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: Spacing.MD,
    backgroundColor: Colors.OFF_WHITE,
    borderWidth: 1.5,
    borderColor: Colors.WINE,
    fontSize: 16,
    color: Colors.BRAND_NAVY,
  },
  footer: {
    paddingHorizontal: Spacing.LG,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.MD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.LIGHT_GRAY,
    backgroundColor: Colors.BACKGROUND,
  },
  continueBtn: {
    backgroundColor: Colors.WINE,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: Colors.LIGHT_GRAY,
  },
  continueText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.WHITE,
    letterSpacing: 0.3,
  },
  continueTextDisabled: {
    color: Colors.TEXT_SECONDARY,
  },
});
