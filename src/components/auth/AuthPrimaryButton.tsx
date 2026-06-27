import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import { Colors } from '../../constants/colors';

type AuthPrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export const AuthPrimaryButton: React.FC<AuthPrimaryButtonProps> = ({
  title,
  onPress,
  disabled,
  loading,
}) => {
  const inactive = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      style={[styles.button, inactive && styles.buttonDisabled]}
    >
      {loading ? (
        <ActivityIndicator color={Colors.WHITE} />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

export const AuthTextLink: React.FC<{
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  centered?: boolean;
}> = ({ children, onPress, disabled, centered }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={[linkStyles.wrap, centered && linkStyles.centered, disabled && linkStyles.disabled]}
  >
    <Text style={linkStyles.text}>{children}</Text>
  </TouchableOpacity>
);

export const AuthInlineSwitch: React.FC<{
  prefix: string;
  action: string;
  onPress: () => void;
}> = ({ prefix, action, onPress }) => (
  <View style={linkStyles.inlineRow}>
    <Text style={linkStyles.inlinePrefix}>{prefix}</Text>
    <TouchableOpacity onPress={onPress}>
      <Text style={linkStyles.inlineAction}>{action}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: Colors.WINE,
    borderRadius: 4,
    paddingHorizontal: 20,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  text: {
    color: Colors.WHITE,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

const linkStyles = StyleSheet.create({
  wrap: {
    paddingVertical: 12,
  },
  centered: {
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.WINE,
  },
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.BORDER,
    flexWrap: 'wrap',
  },
  inlinePrefix: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  inlineAction: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.WINE,
  },
});
