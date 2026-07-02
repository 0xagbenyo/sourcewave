import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { RavenLight } from '../constants/ravenLightTheme';

type Props = {
  mine?: boolean;
  /** When true, label sits on a colored outgoing bubble (use light icon/text). */
  onColoredBubble?: boolean;
  variant?: 'raven' | 'wine';
};

/** Raven web: small forward icon + lowercase “forwarded” above message content. */
export const RavenForwardedLabel: React.FC<Props> = ({
  mine = false,
  onColoredBubble = false,
  variant = 'raven',
}) => {
  const color =
    mine && onColoredBubble
      ? 'rgba(255,255,255,0.78)'
      : variant === 'wine'
        ? Colors.WINE
        : RavenLight.textSubtle;

  return (
    <View style={styles.row}>
      <Ionicons name="arrow-redo" size={12} color={color} />
      <Text style={[styles.label, { color }]}>forwarded</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
