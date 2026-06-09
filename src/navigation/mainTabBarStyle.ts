import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

/** Default bottom tab bar look for `MainTabNavigator` (also used to restore after hiding on chat). */
export function getMainTabBarStyle(insets: EdgeInsets): ViewStyle {
  return {
    backgroundColor: '#FAFAFA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    paddingBottom: Platform.OS === 'ios' ? 28 : (insets.bottom === 0 ? 22 : insets.bottom + 14),
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    height: Platform.OS === 'ios' ? 86 : (insets.bottom === 0 ? 78 : 78 + insets.bottom),
  };
}
