import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { LegalDocumentBody } from '../components/LegalDocumentBody';
import { privacyPolicy } from '../legal/privacyPolicy';
import { termsAndConditions } from '../legal/termsAndConditions';
import { setLegalTermsAccepted } from '../legal/legalAcceptance';
import type { AuthStackParamList } from '../types';
import type { LegalDocument } from '../legal/types';

const SCROLL_THRESHOLD = 48;

function getDocument(doc: 'privacy' | 'terms'): LegalDocument {
  return doc === 'privacy' ? privacyPolicy : termsAndConditions;
}

export const LegalDocumentScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const route = useRoute<RouteProp<AuthStackParamList, 'PrivacyPolicy' | 'TermsAndConditions'>>();
  const document = getDocument(route.name === 'PrivacyPolicy' ? 'privacy' : 'terms');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('legal.back')}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {document.id === 'privacy' ? t('legal.privacyTitle') : t('legal.termsTitle')}
        </Text>
        <View style={styles.backBtnPlaceholder} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <LegalDocumentBody document={document} />
      </ScrollView>
    </SafeAreaView>
  );
};

export const RegisterConsentScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [reachedBottom, setReachedBottom] = useState(false);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);

  const checkScrollPosition = useCallback((offsetY: number) => {
    const remaining = contentHeightRef.current - layoutHeightRef.current - offsetY;
    if (remaining <= SCROLL_THRESHOLD) {
      setReachedBottom(true);
    }
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      checkScrollPosition(e.nativeEvent.contentOffset.y);
    },
    [checkScrollPosition]
  );

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    contentHeightRef.current = h;
    if (layoutHeightRef.current > 0 && h <= layoutHeightRef.current) {
      setReachedBottom(true);
    }
  }, []);

  const onLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    layoutHeightRef.current = e.nativeEvent.layout.height;
    if (contentHeightRef.current > 0 && contentHeightRef.current <= layoutHeightRef.current) {
      setReachedBottom(true);
    }
  }, []);

  const handleAccept = useCallback(async () => {
    await setLegalTermsAccepted();
    navigation.replace('Register' as never);
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('legal.back')}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.BLACK} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {t('legal.consentTitle')}
        </Text>
        <View style={styles.backBtnPlaceholder} />
      </View>

      {!reachedBottom ? (
        <View style={styles.scrollHint}>
          <Ionicons name="arrow-down-outline" size={16} color={Colors.ELECTRIC_BLUE} />
          <Text style={styles.scrollHintText}>{t('legal.scrollToAccept')}</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
      >
        <Text style={styles.consentIntro}>{t('legal.consentIntro')}</Text>
        <LegalDocumentBody document={privacyPolicy} />
        <View style={styles.docDivider} />
        <Text style={styles.secondDocTitle}>{termsAndConditions.title}</Text>
        <Text style={styles.secondDocMeta}>{termsAndConditions.metaLine}</Text>
        <LegalDocumentBody document={termsAndConditions} hideHeader />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.acceptBtn, !reachedBottom && styles.acceptBtnDisabled]}
          disabled={!reachedBottom}
          onPress={handleAccept}
          accessibilityRole="button"
          accessibilityState={{ disabled: !reachedBottom }}
        >
          <Text style={[styles.acceptBtnText, !reachedBottom && styles.acceptBtnTextDisabled]}>
            {t('legal.acceptAndContinue')}
          </Text>
        </TouchableOpacity>
        {!reachedBottom ? (
          <Text style={styles.footerHint}>{t('legal.acceptDisabledHint')}</Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.LIGHT_GRAY,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPlaceholder: {
    width: 40,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BLACK,
  },
  scrollHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: Spacing.MD,
    backgroundColor: '#EEF4FF',
  },
  scrollHintText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ELECTRIC_BLUE,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.LG,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.XL,
  },
  consentIntro: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.DARK_GRAY,
    marginBottom: Spacing.LG,
  },
  docDivider: {
    height: Spacing.XL,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.LIGHT_GRAY,
    marginTop: Spacing.XL,
    marginBottom: Spacing.SM,
  },
  secondDocTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.BLACK,
    letterSpacing: -0.4,
  },
  secondDocMeta: {
    marginTop: 6,
    marginBottom: Spacing.MD,
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: Spacing.LG,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.MD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.LIGHT_GRAY,
    backgroundColor: Colors.BACKGROUND,
  },
  acceptBtn: {
    backgroundColor: Colors.ELECTRIC_BLUE,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptBtnDisabled: {
    backgroundColor: Colors.LIGHT_GRAY,
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.WHITE,
    letterSpacing: 0.5,
  },
  acceptBtnTextDisabled: {
    color: Colors.TEXT_SECONDARY,
  },
  footerHint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
  },
});
