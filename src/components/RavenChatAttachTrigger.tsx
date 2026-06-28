import React, { useCallback, useMemo, useRef, useState } from 'react';
import { TouchableOpacity, StyleSheet, View, ViewStyle, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { RavenLight } from '../constants/ravenLightTheme';
import { RavenChatAttachOption, RavenChatAttachSheet } from './RavenChatAttachSheet';

type Props = {
  disabled?: boolean;
  buttonStyle?: ViewStyle;
  disabledStyle?: ViewStyle;
  isSupplierPortalChat?: boolean;
  isBuyerMessaging?: boolean;
  onPickMedia: () => void;
  onPickDocument: () => void;
  onPickEmoji: () => void;
  onNewQuotation: () => void;
  onSourcingRequest: () => void;
};

function useStableAttachHandlers(handlers: {
  onPickMedia: () => void;
  onPickDocument: () => void;
  onPickEmoji: () => void;
  onNewQuotation: () => void;
  onSourcingRequest: () => void;
}) {
  const refs = useRef(handlers);
  refs.current = handlers;
  return useMemo(
    () => ({
      onPickMedia: () => refs.current.onPickMedia(),
      onPickDocument: () => refs.current.onPickDocument(),
      onPickEmoji: () => refs.current.onPickEmoji(),
      onNewQuotation: () => refs.current.onNewQuotation(),
      onSourcingRequest: () => refs.current.onSourcingRequest(),
    }),
    []
  );
}

/** Composer + attach button — TouchableOpacity for reliable taps beside TextInput. */
export function RavenChatAttachTrigger({
  disabled = false,
  buttonStyle,
  disabledStyle,
  isSupplierPortalChat = false,
  isBuyerMessaging = false,
  onPickMedia,
  onPickDocument,
  onPickEmoji,
  onNewQuotation,
  onSourcingRequest,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const stableHandlers = useStableAttachHandlers({
    onPickMedia,
    onPickDocument,
    onPickEmoji,
    onNewQuotation,
    onSourcingRequest,
  });

  const options = useMemo((): RavenChatAttachOption[] => {
    const opts: RavenChatAttachOption[] = [
      {
        id: 'emoji',
        label: t('ravenAttach.emoji'),
        icon: 'happy-outline',
        onPress: stableHandlers.onPickEmoji,
      },
      {
        id: 'media',
        label: t('ravenAttach.photosVideos'),
        icon: 'images-outline',
        onPress: stableHandlers.onPickMedia,
      },
      {
        id: 'file',
        label: t('ravenAttach.file'),
        icon: 'document-attach-outline',
        onPress: stableHandlers.onPickDocument,
      },
    ];

    if (isSupplierPortalChat) {
      opts.push({
        id: 'quotation',
        label: t('ravenAttach.newQuotation'),
        icon: 'pricetag-outline',
        onPress: stableHandlers.onNewQuotation,
      });
    } else if (isBuyerMessaging) {
      opts.push({
        id: 'sourcing',
        label: t('ravenAttach.sendSourcingRequest'),
        icon: 'cart-outline',
        onPress: stableHandlers.onSourcingRequest,
      });
    }

    return opts;
  }, [t, isSupplierPortalChat, isBuyerMessaging, stableHandlers]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setOpen(true);
  }, [disabled]);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <View style={styles.btnWrap} collapsable={false}>
        <TouchableOpacity
          style={[
            styles.plusBtn,
            buttonStyle,
            disabled ? (disabledStyle ?? styles.plusBtnDisabled) : null,
          ]}
          onPress={openMenu}
          disabled={disabled}
          activeOpacity={0.65}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={t('ravenAttach.title')}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
        >
          <Ionicons name="add" size={26} color={disabled ? RavenLight.textSubtle : RavenLight.textMuted} />
        </TouchableOpacity>
      </View>
      <RavenChatAttachSheet visible={open} onClose={closeMenu} options={options} />
    </>
  );
}

const BTN_SIZE = 44;

const styles = StyleSheet.create({
  btnWrap: {
    flexShrink: 0,
    zIndex: 4,
    ...Platform.select({
      android: { elevation: 4 },
      default: {},
    }),
  },
  plusBtn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: RavenLight.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  plusBtnDisabled: {
    opacity: 0.4,
  },
});
