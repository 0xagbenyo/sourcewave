import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
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
  onNewQuotation: () => void;
  onSourcingRequest: () => void;
};

function useStableAttachHandlers(handlers: {
  onPickMedia: () => void;
  onPickDocument: () => void;
  onNewQuotation: () => void;
  onSourcingRequest: () => void;
}) {
  const refs = useRef(handlers);
  refs.current = handlers;
  return useMemo(
    () => ({
      onPickMedia: () => refs.current.onPickMedia(),
      onPickDocument: () => refs.current.onPickDocument(),
      onNewQuotation: () => refs.current.onNewQuotation(),
      onSourcingRequest: () => refs.current.onSourcingRequest(),
    }),
    []
  );
}

/** Plus button + attach sheet — local state so message list re-renders do not block the tap. */
export const RavenChatAttachTrigger = React.memo(function RavenChatAttachTrigger({
  disabled = false,
  buttonStyle,
  disabledStyle,
  isSupplierPortalChat = false,
  isBuyerMessaging = false,
  onPickMedia,
  onPickDocument,
  onNewQuotation,
  onSourcingRequest,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const stableHandlers = useStableAttachHandlers({
    onPickMedia,
    onPickDocument,
    onNewQuotation,
    onSourcingRequest,
  });

  const options = useMemo((): RavenChatAttachOption[] => {
    const opts: RavenChatAttachOption[] = [
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
      <Pressable
        style={({ pressed }) => [
          styles.plusCircleBtn,
          buttonStyle,
          disabled && (disabledStyle ?? styles.attachBtnOff),
          pressed && !disabled && styles.plusCircleBtnPressed,
        ]}
        onPress={openMenu}
        disabled={disabled}
        delayPressIn={0}
        hitSlop={6}
        accessibilityLabel="Add attachment"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={26} color={RavenLight.textMuted} />
      </Pressable>
      <RavenChatAttachSheet visible={open} onClose={closeMenu} options={options} />
    </>
  );
});

const styles = StyleSheet.create({
  plusCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: RavenLight.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  plusCircleBtnPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.94 }],
  },
  attachBtnOff: { opacity: 0.35 },
});
