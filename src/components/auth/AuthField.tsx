import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';

const hairline = StyleSheet.hairlineWidth;

type AuthFieldProps = TextInputProps & {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  containerStyle?: object;
};

export const AuthField: React.FC<AuthFieldProps> = ({
  label,
  icon,
  error,
  secureTextEntry,
  containerStyle,
  style,
  ...inputProps
}) => {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const isSecure = secureTextEntry && hidden;

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          !!error && styles.inputRowError,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={Colors.TEXT_SECONDARY}
            style={styles.leadingIcon}
          />
        ) : null}
        <TextInput
          {...inputProps}
          style={[styles.input, style]}
          secureTextEntry={isSecure}
          placeholderTextColor={Colors.TEXT_DISABLED}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
        />
        {secureTextEntry ? (
          <TouchableOpacity
            onPress={() => setHidden((v) => !v)}
            style={styles.trailingButton}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={Colors.TEXT_SECONDARY}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing.MD,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    paddingHorizontal: 0,
  },
  inputRowFocused: {
    borderBottomColor: Colors.WINE,
  },
  inputRowError: {
    borderBottomColor: Colors.ERROR,
  },
  leadingIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.BRAND_NAVY,
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  trailingButton: {
    padding: 4,
    marginLeft: 4,
  },
  error: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.ERROR,
    lineHeight: 16,
  },
});
