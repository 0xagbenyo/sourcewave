import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useKeyboardInsets } from './useKeyboardOpen';

const COMPOSER_BOTTOM_PAD = 8;
/** Space between the composer input and the soft keyboard when open. */
const KEYBOARD_GAP = 5;

/**
 * Bottom insets for Raven chat composers.
 *
 * - Tab scenes already end above the bottom tab bar — do not add tab bar height again.
 * - Android uses `softwareKeyboardLayoutMode: resize`; only iOS needs a manual root lift.
 */
export function useChatComposerInsets(composerActive: boolean) {
  const { open: keyboardOpen, height: keyboardHeight } = useKeyboardInsets();

  const composerBottomPad = useMemo(() => {
    if (!composerActive) return 0;
    if (keyboardOpen) return KEYBOARD_GAP;
    return COMPOSER_BOTTOM_PAD;
  }, [composerActive, keyboardOpen]);

  const rootKeyboardPad = useMemo(() => {
    if (!composerActive || !keyboardOpen || keyboardHeight <= 0) return 0;
    if (Platform.OS !== 'ios') return 0;
    return keyboardHeight;
  }, [composerActive, keyboardOpen, keyboardHeight]);

  return { composerBottomPad, rootKeyboardPad, keyboardOpen };
}
