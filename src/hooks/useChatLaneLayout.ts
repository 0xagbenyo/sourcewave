import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import {
  CHAT_LIST_PAD_LEFT,
  CHAT_LIST_PAD_RIGHT,
  computeChatLaneMetrics,
  type ChatLaneMetrics,
} from '../utils/ravenChatDocCard';

const FALLBACK_WIDTH = 360;

type Options = {
  paddingLeft?: number;
  paddingRight?: number;
};

/**
 * Measures the chat list shell and returns pixel lane widths/gutters.
 * Android does not reliably apply `%` maxWidth/margin on flex children.
 */
export function useChatLaneLayout(opts?: Options) {
  const paddingLeft = opts?.paddingLeft ?? CHAT_LIST_PAD_LEFT;
  const paddingRight = opts?.paddingRight ?? CHAT_LIST_PAD_RIGHT;
  const { width: windowWidth } = useWindowDimensions();
  const [measuredShellWidth, setMeasuredShellWidth] = useState(0);

  const onListLayout = useCallback((event: LayoutChangeEvent) => {
    const w = Math.round(event.nativeEvent.layout.width);
    if (w > 0) {
      setMeasuredShellWidth((prev) => (prev === w ? prev : w));
    }
  }, []);

  const metrics: ChatLaneMetrics = useMemo(() => {
    const shellWidth = measuredShellWidth > 0 ? measuredShellWidth : windowWidth;
    const contentWidth = Math.max(0, shellWidth - paddingLeft - paddingRight);
    if (contentWidth <= 0) {
      return computeChatLaneMetrics(FALLBACK_WIDTH - paddingLeft - paddingRight);
    }
    return computeChatLaneMetrics(contentWidth);
  }, [measuredShellWidth, windowWidth, paddingLeft, paddingRight]);

  return { metrics, onListLayout };
}
