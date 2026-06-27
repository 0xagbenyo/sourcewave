import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';

const hairline = StyleSheet.hairlineWidth;

type AuthScreenShellProps = {
  heroTitle: string;
  heroSubtitle?: string;
  heroLogo?: ImageSourcePropType;
  /** Show SOURCEWAVE GH wordmark above the hero logo (sign-in). */
  showBrandAboveHeroLogo?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  /** Vertically center the form; horizontally center headings. */
  centered?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

export const AuthScreenShell: React.FC<AuthScreenShellProps> = ({
  heroTitle,
  heroSubtitle,
  heroLogo,
  showBrandAboveHeroLogo,
  showBack,
  onBack,
  centered,
  children,
  footer,
  contentStyle,
}) => {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            centered && styles.scrollContentCentered,
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!heroLogo || showBack ? (
            <View style={styles.topBar}>
              {showBack ? (
                <TouchableOpacity
                  onPress={onBack}
                  style={styles.backButton}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                >
                  <Ionicons name="arrow-back" size={22} color={Colors.BRAND_NAVY} />
                </TouchableOpacity>
              ) : (
                <View style={styles.backPlaceholder} />
              )}
              <Text style={styles.brandText}>
                SOURCEWAVE<Text style={styles.brandSuffix}> GH</Text>
              </Text>
              <View style={styles.backPlaceholder} />
            </View>
          ) : null}

          <View style={[styles.main, centered && styles.mainCentered]}>
            <View style={[styles.body, centered && styles.bodyCentered]}>
              {heroLogo ? (
                <>
                  {showBrandAboveHeroLogo ? (
                    <Text style={[styles.heroBrand, centered && styles.heroBrandCentered]}>
                      SOURCEWAVE<Text style={styles.brandSuffix}> GH</Text>
                    </Text>
                  ) : null}
                  <Image
                    source={heroLogo}
                    style={[styles.heroLogo, centered && styles.heroLogoCentered]}
                    resizeMode="contain"
                    accessibilityLabel="SourceWave"
                  />
                </>
              ) : null}
              <Text style={[styles.title, centered && styles.titleCentered]}>{heroTitle}</Text>
              {heroSubtitle ? (
                <Text style={[styles.subtitle, centered && styles.subtitleCentered]}>{heroSubtitle}</Text>
              ) : null}
              <View style={centered ? styles.formBlock : undefined}>{children}</View>
            </View>

            {footer ? <View style={[styles.footer, centered && styles.footerCentered]}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export const AuthStepIndicator: React.FC<{
  steps: Array<{ key: string; label: string }>;
  currentKey: string;
  progressCaption?: string;
}> = ({ steps, currentKey, progressCaption }) => {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.key === currentKey));
  const progress = steps.length <= 1 ? 1 : (currentIndex + 1) / steps.length;

  return (
    <View style={stepStyles.wrap} accessibilityRole="progressbar">
      <View style={stepStyles.labelsRow}>
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          const isFirst = index === 0;
          const isLast = index === steps.length - 1;
          return (
            <Text
              key={step.key}
              style={[
                stepStyles.label,
                isFirst && stepStyles.labelFirst,
                isLast && stepStyles.labelLast,
                done && stepStyles.labelDone,
                current && stepStyles.labelCurrent,
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          );
        })}
      </View>
      <View style={stepStyles.track}>
        <View style={[stepStyles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={stepStyles.stepCount}>
        {progressCaption ?? `Step ${currentIndex + 1} of ${steps.length}`}
      </Text>
    </View>
  );
};

const stepStyles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing.LG,
    marginTop: Spacing.SM,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.TEXT_DISABLED,
    maxWidth: '48%',
  },
  labelFirst: {
    textAlign: 'left',
  },
  labelLast: {
    textAlign: 'right',
  },
  labelDone: {
    color: Colors.TEXT_SECONDARY,
  },
  labelCurrent: {
    color: Colors.BRAND_NAVY,
    fontWeight: '700',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.LIGHT_GRAY,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.WINE,
    borderRadius: 2,
  },
  stepCount: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'right',
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.WHITE,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.XL,
  },
  scrollContentCentered: {
    minHeight: '100%',
  },
  main: {
    flexGrow: 1,
  },
  mainCentered: {
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: Spacing.SM,
    paddingBottom: Spacing.MD,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backPlaceholder: {
    width: 40,
    height: 40,
  },
  brandText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.BRAND_NAVY,
    letterSpacing: 1,
  },
  brandSuffix: {
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0,
  },
  body: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: Spacing.LG,
  },
  bodyCentered: {
    paddingTop: 0,
    alignItems: 'center',
    width: '100%',
  },
  formBlock: {
    width: '100%',
    maxWidth: 400,
  },
  heroBrand: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.BRAND_NAVY,
    letterSpacing: 1.2,
    marginBottom: Spacing.SM,
  },
  heroBrandCentered: {
    alignSelf: 'center',
    textAlign: 'center',
  },
  heroLogo: {
    width: 200,
    height: 72,
    marginBottom: Spacing.MD,
  },
  heroLogoCentered: {
    alignSelf: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  titleCentered: {
    textAlign: 'center',
    alignSelf: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.TEXT_SECONDARY,
    marginBottom: Spacing.MD,
  },
  subtitleCentered: {
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: Spacing.LG,
  },
  footerCentered: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    paddingTop: Spacing.XL,
  },
});
