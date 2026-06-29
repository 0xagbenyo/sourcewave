import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors } from '../constants/colors';

type Props = {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Align message content to the trailing edge (outgoing bubbles). */
  alignEnd?: boolean;
};

/** Brief blue left bar when scrolling to a quoted/replied message. */
export function ChatMessageJumpHighlightBar({ active, children, style, alignEnd }: Props) {
  return (
    <View style={[styles.row, active && styles.rowActive, style]}>
      {active ? <View style={styles.bar} /> : null}
      <View style={[styles.body, alignEnd && styles.bodyAlignEnd]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  rowActive: {
    backgroundColor: Colors.BRAND_SOFT,
    borderRadius: 10,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: Colors.WINE,
    marginLeft: 2,
    marginRight: 6,
    alignSelf: 'stretch',
    minHeight: 28,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  bodyAlignEnd: {
    alignItems: 'flex-end',
  },
});
