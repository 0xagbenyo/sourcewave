import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RavenBottomSheetShell } from './RavenBottomSheetShell';
import { RavenEmojiPickerPanel } from './RavenEmojiPickerPanel';
import { RAVEN_QUICK_EMOJIS } from '../utils/ravenMessageReactions';
import { RavenLight } from '../constants/ravenLightTheme';
import type { RavenMessageRow } from '../services/ravenNativeApi';

export type RavenMessageActionExtras = {
  /** Supplier Quotation name — payment resolved at render time after async ERP load. */
  sqName?: string;
};

type Props = {
  visible: boolean;
  message: RavenMessageRow | null;
  extras?: RavenMessageActionExtras | null;
  resolveSqPayment?: (sqName: string) => (() => void) | undefined;
  onClose: () => void;
  onReply: () => void;
  onForward: () => void;
  onReact: (emoji: string) => void;
};

type ActionItem = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accent?: boolean;
};

/**
 * Long-press message menu — Raven-style quick reactions bar + action list.
 * Emoji grid opens inline (same sheet) instead of a separate list-of-emojis screen.
 */
export const RavenMessageActionSheet: React.FC<Props> = ({
  visible,
  message,
  extras,
  resolveSqPayment,
  onClose,
  onReply,
  onForward,
  onReact,
}) => {
  const { t } = useTranslation();
  const [emojiExpanded, setEmojiExpanded] = useState(false);
  const isPoll = String(message?.message_type || '').toLowerCase() === 'poll';

  const payFn = extras?.sqName ? resolveSqPayment?.(extras.sqName.trim()) : undefined;

  useEffect(() => {
    if (!visible) setEmojiExpanded(false);
  }, [visible]);

  const run = (fn: () => void) => {
    onClose();
    requestAnimationFrame(fn);
  };

  const runReact = (emoji: string) => {
    onClose();
    requestAnimationFrame(() => onReact(emoji));
  };

  const actions = useMemo((): ActionItem[] => {
    const opts: ActionItem[] = [
      {
        id: 'reply',
        label: t('ravenMessage.reply'),
        icon: 'arrow-undo-outline',
        onPress: onReply,
      },
    ];
    if (!isPoll) {
      opts.push({
        id: 'forward',
        label: t('ravenMessage.forward'),
        icon: 'arrow-redo-outline',
        onPress: onForward,
      });
    }
    if (payFn) {
      opts.push({
        id: 'payment',
        label: t('ravenMessage.makePayment'),
        icon: 'card-outline',
        onPress: payFn,
        accent: true,
      });
    }
    return opts;
  }, [t, isPoll, payFn, onReply, onForward]);

  return (
    <RavenBottomSheetShell
      visible={visible && !!message}
      onClose={onClose}
      title={emojiExpanded ? t('ravenMessage.pickReaction') : t('ravenMessage.title')}
      compact
    >
      {!emojiExpanded ? (
        <>
          <View style={styles.quickBar}>
            {RAVEN_QUICK_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => runReact(emoji)}
                style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
              >
                <Text style={styles.quickEmoji}>{emoji}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setEmojiExpanded(true)}
              style={({ pressed }) => [styles.moreBtn, pressed && styles.quickBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={t('ravenMessage.moreReactions')}
            >
              <Ionicons name="happy-outline" size={20} color={RavenLight.textMuted} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          {actions.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => run(opt.onPress)}
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
            >
              <View style={[styles.actionIcon, opt.accent && styles.actionIconAccent]}>
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={opt.accent ? RavenLight.accent : RavenLight.textMuted}
                />
              </View>
              <Text style={[styles.actionLabel, opt.accent && styles.actionLabelAccent]}>{opt.label}</Text>
            </Pressable>
          ))}
        </>
      ) : (
        <RavenEmojiPickerPanel
          showQuickStrip={false}
          onPick={(emoji) => runReact(emoji)}
          onClose={() => setEmojiExpanded(false)}
        />
      )}

      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={t('ravenAttach.cancel')}
      >
        <Text style={styles.cancelText}>{t('ravenAttach.cancel')}</Text>
      </Pressable>
    </RavenBottomSheetShell>
  );
};

const styles = StyleSheet.create({
  quickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: RavenLight.radiusMd,
    backgroundColor: RavenLight.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    marginBottom: 4,
  },
  quickBtn: {
    width: 42,
    height: 42,
    borderRadius: RavenLight.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtn: {
    width: 42,
    height: 42,
    borderRadius: RavenLight.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    backgroundColor: RavenLight.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  quickBtnPressed: {
    backgroundColor: RavenLight.sidebarHover,
  },
  quickEmoji: {
    fontSize: 24,
    lineHeight: 28,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: RavenLight.border,
    marginVertical: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: RavenLight.radiusMd,
    gap: 12,
  },
  actionRowPressed: {
    backgroundColor: RavenLight.sidebarHover,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: RavenLight.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconAccent: {
    backgroundColor: RavenLight.accentSoft,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: RavenLight.text,
  },
  actionLabelAccent: {
    color: RavenLight.accent,
    fontWeight: '700',
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: RavenLight.radiusMd,
    backgroundColor: RavenLight.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  cancelBtnPressed: { opacity: 0.85 },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: RavenLight.text,
  },
});
