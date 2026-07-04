import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

export type KeyboardInsets = {
  /** True while the soft keyboard is visible. */
  open: boolean;
  /**
   * Keyboard height in px (Android `keyboardDidShow` / iOS `keyboardWillShow`).
   * 0 when closed — use on Android to pad the layout when `adjustResize` does not reach the tab scene.
   */
  height: number;
};

function resolveKeyboardHeight(e: KeyboardEvent): number {
  const reported = Math.round(e.endCoordinates?.height ?? 0);
  const screenY = e.endCoordinates?.screenY;
  if (typeof screenY !== 'number' || !Number.isFinite(screenY)) {
    return reported;
  }
  const windowHeight = Dimensions.get('window').height;
  const screenHeight = Dimensions.get('screen').height;
  const fromWindow = Math.round(windowHeight - screenY);
  const fromScreen = Math.round(screenHeight - screenY);
  return Math.max(reported, fromWindow, fromScreen, 0);
}

/**
 * Keyboard visibility + height. Used to avoid stacking tab-bar padding under iOS KAV when open,
 * and to pad the chat root on Android when the window does not resize above the keyboard.
 */
export function useKeyboardInsets(): KeyboardInsets {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      setOpen(true);
      setHeight(resolveKeyboardHeight(e));
    };
    const onHide = () => {
      setOpen(false);
      setHeight(0);
    };
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return { open, height };
}
