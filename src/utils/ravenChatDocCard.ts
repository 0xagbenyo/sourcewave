import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { RavenLight } from '../constants/ravenLightTheme';

/** Lane width = this fraction of the chat content area (after list horizontal padding). */
export const CHAT_LANE_MAX_WIDTH_RATIO = 0.84;
/** Gutter between incoming (left) and outgoing (right) lanes. */
export const CHAT_MESSAGE_CENTER_GUTTER_RATIO = 0.12;

/** RavenUIMessagesScreen `listPad` horizontal insets. */
export const CHAT_LIST_PAD_LEFT = 6;
export const CHAT_LIST_PAD_RIGHT = 10;

/** @deprecated Percent strings — unreliable on Android; use {@link computeChatLaneMetrics}. */
export const CHAT_INCOMING_ROW_MAX_WIDTH = '84%' as const;
/** @deprecated */
export const CHAT_OUTGOING_ROW_MAX_WIDTH = '84%' as const;
/** @deprecated */
export const CHAT_MESSAGE_CENTER_GUTTER = '12%' as const;
/** @deprecated */
export const CHAT_DOC_ROW_MAX_WIDTH = CHAT_INCOMING_ROW_MAX_WIDTH;

export type ChatLaneMetrics = {
  contentWidth: number;
  /** Text / mixed incoming rows — max width + right gutter. */
  incomingLane: ViewStyle;
  /** Incoming doc cards (quotations, etc.) — fixed width; Android ignores maxWidth when children use flex:1. */
  incomingDocRow: ViewStyle;
  outgoingLane: ViewStyle;
  outgoingDocLane: ViewStyle;
};

/** Pixel lane styles — works on iOS and Android (percentage margins often fail on Android). */
export function computeChatLaneMetrics(contentWidth: number): ChatLaneMetrics {
  const w = Math.max(0, Math.round(contentWidth));
  const laneMax = Math.round(w * CHAT_LANE_MAX_WIDTH_RATIO);
  const gutter = Math.round(w * CHAT_MESSAGE_CENTER_GUTTER_RATIO);
  return {
    contentWidth: w,
    incomingLane: {
      maxWidth: laneMax,
      marginRight: gutter,
      alignSelf: 'flex-start',
    },
    incomingDocRow: {
      width: laneMax,
      maxWidth: laneMax,
      marginRight: gutter,
      alignSelf: 'flex-start',
    },
    outgoingLane: {
      maxWidth: laneMax,
      marginLeft: gutter,
      alignSelf: 'flex-end',
    },
    outgoingDocLane: {
      width: laneMax,
      maxWidth: laneMax,
      marginLeft: gutter,
      alignSelf: 'flex-end',
    },
  };
}

export type RavenChatDocCardColors = {
  title: string;
  body: string;
  meta: string;
  accent: string;
  icon: string;
  hint: string;
  sharedLabel: string;
  primaryBtnBg: string;
  primaryBtnText: string;
  secondaryBtnText: string;
};

export function ravenChatDocCardColors(mine?: boolean): RavenChatDocCardColors {
  if (mine) {
    return {
      title: RavenLight.bubbleMineText,
      body: 'rgba(255,255,255,0.95)',
      meta: 'rgba(255,255,255,0.78)',
      accent: RavenLight.bubbleMineText,
      icon: RavenLight.bubbleMineText,
      hint: 'rgba(255,255,255,0.82)',
      sharedLabel: 'rgba(255,255,255,0.72)',
      primaryBtnBg: 'rgba(255,255,255,0.22)',
      primaryBtnText: RavenLight.bubbleMineText,
      secondaryBtnText: RavenLight.bubbleMineText,
    };
  }
  return {
    title: RavenLight.text,
    body: RavenLight.accent,
    meta: RavenLight.textMuted,
    accent: RavenLight.accent,
    icon: RavenLight.accent,
    hint: RavenLight.textSubtle,
    sharedLabel: RavenLight.textSubtle,
    primaryBtnBg: RavenLight.accent,
    primaryBtnText: '#FFFFFF',
    secondaryBtnText: RavenLight.accent,
  };
}

export function ravenChatDocCardStyle(mine?: boolean): ViewStyle {
  if (mine) {
    return {
      borderRadius: RavenLight.radiusLg,
      borderBottomRightRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.28)',
      backgroundColor: RavenLight.bubbleMine,
      padding: 10,
      maxWidth: '100%',
      alignSelf: 'stretch',
    };
  }
  return {
    borderRadius: RavenLight.radiusLg,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
    padding: 10,
    maxWidth: '100%',
    alignSelf: 'stretch',
    ...Platform.select({
      ios: {
        shadowColor: RavenLight.shadowSoft,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 1,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: {},
    }),
  };
}

export function ravenChatDocSharedLabelStyle(mine?: boolean): TextStyle {
  return {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: ravenChatDocCardColors(mine).sharedLabel,
    marginBottom: 6,
  };
}
