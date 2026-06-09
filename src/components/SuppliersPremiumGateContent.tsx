import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';

type Props = {
  onSubscribe: () => void;
};

export const SuppliersPremiumGateContent: React.FC<Props> = ({ onSubscribe }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Ionicons name="diamond-outline" size={44} color={Colors.WINE} style={styles.icon} />
      <Text style={styles.title}>{t('suppliersPremium.title')}</Text>
      <Text style={styles.subtitle}>{t('suppliersPremium.subtitle')}</Text>
      <Text style={styles.body}>{t('suppliersPremium.body')}</Text>
      <TouchableOpacity style={styles.cta} onPress={onSubscribe} activeOpacity={0.85} accessibilityRole="button">
        <Text style={styles.ctaText}>{t('suppliersPremium.subscribeCta')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.XL,
  },
  icon: { alignSelf: 'center', marginBottom: Spacing.MD },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.BLACK,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  body: {
    marginTop: Spacing.MD,
    fontSize: 15,
    color: Colors.DARK_GRAY,
    textAlign: 'center',
    lineHeight: 22,
  },
  cta: {
    marginTop: Spacing.XL,
    backgroundColor: Colors.SUCCESS,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: {
    color: Colors.WHITE,
    fontWeight: '700',
    fontSize: 16,
  },
});
