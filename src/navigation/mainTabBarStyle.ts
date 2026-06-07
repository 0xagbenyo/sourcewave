import { Platform, type ViewStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

/** Default bottom tab bar look for `MainTabNavigator` (also used to restore after hiding on chat). */
export function getMainTabBarStyle(insets: EdgeInsets): ViewStyle {
  return {
    backgroundColor: Colors.WHITE,
    borderTopColor: Colors.BORDER,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 32 : (insets.bottom === 0 ? 26 : insets.bottom + 18),
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    height: Platform.OS === 'ios' ? 84 : (insets.bottom === 0 ? 80 : 80 + insets.bottom),
  };
}
