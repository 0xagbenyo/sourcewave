import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInsets } from './useKeyboardOpen';

const COMPOSER_REST_PAD = Platform.select({
  android: 10,
  ios: 21,
  default: 8,
});
/** Resting pad when the composer already sits above a bottom tab bar. */
const TAB_SCENE_REST_PAD = Platform.select({
  android: 6,
  ios: 10,
  default: 6,
});
/**
 * Android edge-to-edge often reports `insets.bottom === 0`; keep the composer above
 * the system navigation bar / gesture area when the keyboard is closed (stack scenes).
 */
const ANDROID_BOTTOM_INSET_MIN = 28;
/** Space between the composer and the soft keyboard when open. */
const KEYBOARD_GAP = 8;
/**
 * When `tabBarHideOnKeyboard` is true the scene grows downward by roughly one tab bar;
 * edge-to-edge Android does not auto-resize, so add matching lift on keyboard open.
 */
const ANDROID_TAB_BAR_KEYBOARD_LIFT = 76;

export type ChatComposerInsetsOptions = {
  /** Chat is shown inside a bottom-tab navigator — tab bar already clears the nav bar. */
  inBottomTabScene?: boolean;
};

/**
 * Bottom insets for Raven chat composers.
 *
 * - Bottom-tab chat scenes use a small resting pad only (tab bar handles nav insets).
 * - Stack / inbox chat scenes pad for the system nav bar on Android edge-to-edge.
 * - Android edge-to-edge disables reliable `adjustResize`; lift the composer while open.
 * - iOS lifts the chat root (tab scenes + KeyboardAvoidingView-friendly).
 */
export function useChatComposerInsets(
  composerActive: boolean,
  options: ChatComposerInsetsOptions = {}
) {
  const { inBottomTabScene = false } = options;
  const insets = useSafeAreaInsets();
  const { open: keyboardOpen, height: keyboardHeight } = useKeyboardInsets();

  const restingBottomInset = useMemo(() => {
    if (!composerActive || keyboardOpen || inBottomTabScene) return 0;
    if (Platform.OS === 'android') {
      return Math.max(insets.bottom, ANDROID_BOTTOM_INSET_MIN);
    }
    return insets.bottom;
  }, [composerActive, keyboardOpen, inBottomTabScene, insets.bottom]);

  const composerBottomPad = useMemo(() => {
    if (!composerActive) return 0;
    if (keyboardOpen) {
      if (Platform.OS === 'android' && keyboardHeight > 0) {
        const tabBarLift = inBottomTabScene ? ANDROID_TAB_BAR_KEYBOARD_LIFT : 0;
        return keyboardHeight + KEYBOARD_GAP + tabBarLift;
      }
      return KEYBOARD_GAP;
    }
    if (inBottomTabScene) return TAB_SCENE_REST_PAD;
    return COMPOSER_REST_PAD + restingBottomInset;
  }, [
    composerActive,
    keyboardOpen,
    keyboardHeight,
    inBottomTabScene,
    restingBottomInset,
  ]);

  const rootKeyboardPad = useMemo(() => {
    if (!composerActive || !keyboardOpen || keyboardHeight <= 0) return 0;
    if (Platform.OS === 'android') return 0;
    return keyboardHeight;
  }, [composerActive, keyboardOpen, keyboardHeight]);

  return { composerBottomPad, rootKeyboardPad, keyboardOpen, restingBottomInset };
}
