import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { RavenLight } from '../constants/ravenLightTheme';

type Props = {
  label?: string;
  hint?: string;
};

export const RavenChatOpeningPlaceholder: React.FC<Props> = ({
  label = 'Opening chat…',
  hint = 'This may take a moment',
}) => (
  <View style={styles.shell} accessibilityRole="progressbar" accessibilityLabel={label}>
    <View style={styles.bubbles}>
      <View style={[styles.row, styles.rowLeft]}>
        <View style={[styles.bubble, styles.bubbleLeft, styles.wide]} />
      </View>
      <View style={[styles.row, styles.rowRight]}>
        <View style={[styles.bubble, styles.bubbleRight, styles.narrow]} />
      </View>
      <View style={[styles.row, styles.rowLeft]}>
        <View style={[styles.bubble, styles.bubbleLeft, styles.medium]} />
      </View>
      <View style={[styles.row, styles.rowRight]}>
        <View style={[styles.bubble, styles.bubbleRight, styles.wide]} />
      </View>
      <View style={[styles.row, styles.rowLeft]}>
        <View style={[styles.bubble, styles.bubbleLeft, styles.narrow]} />
      </View>
    </View>
    <View style={styles.statusCard}>
      <ActivityIndicator size="small" color={RavenLight.accent} />
      <View style={styles.statusTextWrap}>
        <Text style={styles.statusTitle}>{label}</Text>
        {hint ? <Text style={styles.statusHint}>{hint}</Text> : null}
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: RavenLight.canvas,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  bubbles: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 10,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    borderRadius: RavenLight.radiusLg,
    opacity: 0.55,
  },
  bubbleLeft: {
    backgroundColor: RavenLight.bubbleOther,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  bubbleRight: {
    backgroundColor: RavenLight.accentSoft,
  },
  wide: {
    width: '72%',
    height: 44,
  },
  medium: {
    width: '56%',
    height: 36,
  },
  narrow: {
    width: '38%',
    height: 32,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RavenLight.radiusLg,
    backgroundColor: RavenLight.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    maxWidth: '100%',
  },
  statusTextWrap: {
    flexShrink: 1,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: RavenLight.text,
    letterSpacing: -0.2,
  },
  statusHint: {
    marginTop: 2,
    fontSize: 13,
    color: RavenLight.textMuted,
  },
});
