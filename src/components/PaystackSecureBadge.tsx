import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';

const PAYSTACK_BLUE = '#00C3F7';

type Props = {
  compact?: boolean;
};

export const PaystackSecureBadge: React.FC<Props> = ({ compact = false }) => {
  const { t } = useTranslation();

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Ionicons name="shield-checkmark" size={compact ? 14 : 16} color={PAYSTACK_BLUE} />
      <Text style={[styles.text, compact && styles.textCompact]}>
        {t('subscriptionPage.securedBy')}{' '}
        <Text style={styles.brand}>Paystack</Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  wrapCompact: {
    paddingVertical: 6,
  },
  text: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '500',
  },
  textCompact: {
    fontSize: 12,
  },
  brand: {
    color: '#011B33',
    fontWeight: '700',
  },
});
