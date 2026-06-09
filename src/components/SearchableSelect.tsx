import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

export type SearchableSelectOption = {
  id: string;
  name: string;
};

type SearchableSelectProps = {
  options: SearchableSelectOption[];
  selectedId?: string;
  selectedLabel?: string;
  onSelect: (option: SearchableSelectOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean;
  emptyText?: string;
  listMaxHeight?: number;
};

const matchesQuery = (option: SearchableSelectOption, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    option.name.toLowerCase().includes(q) ||
    option.id.toLowerCase().includes(q)
  );
};

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  selectedId,
  selectedLabel,
  onSelect,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  disabled = false,
  loading = false,
  emptyText = 'No options available',
  listMaxHeight = 280,
}) => {
  const insets = useSafeAreaInsets();
  const searchRef = useRef<TextInput>(null);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const uniqueOptions = useMemo(() => {
    const seen = new Set<string>();
    return options.filter((o) => {
      const id = String(o?.id ?? '').trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [options]);

  const filteredOptions = useMemo(
    () => uniqueOptions.filter((option) => matchesQuery(option, searchQuery)),
    [uniqueOptions, searchQuery]
  );

  const displayLabel =
    selectedLabel ||
    uniqueOptions.find((option) => option.id === selectedId)?.name ||
    '';

  const closeModal = () => {
    setOpen(false);
    setSearchQuery('');
  };

  const handleToggle = () => {
    if (disabled) return;
    setOpen((prev) => {
      const next = !prev;
      if (!next) setSearchQuery('');
      return next;
    });
  };

  const handleSelect = (option: SearchableSelectOption) => {
    onSelect(option);
    closeModal();
  };

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => searchRef.current?.focus(), 150);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <View>
      <TouchableOpacity
        style={[styles.selector, disabled && styles.selectorDisabled]}
        onPress={handleToggle}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={[styles.selectorText, !displayLabel && styles.selectorPlaceholder]}>
          {displayLabel || placeholder}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.TEXT_SECONDARY}
        />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.modalKav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal} accessibilityRole="button" />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={Colors.TEXT_SECONDARY} />
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={Colors.TEXT_SECONDARY}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                underlineColorAndroid="transparent"
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={Colors.TEXT_SECONDARY} />
                </TouchableOpacity>
              ) : null}
            </View>

            {loading ? (
              <ActivityIndicator style={styles.loader} color={Colors.WINE} />
            ) : filteredOptions.length === 0 ? (
              <Text style={styles.emptyText}>
                {uniqueOptions.length === 0 ? emptyText : 'No matches for your search'}
              </Text>
            ) : (
              <FlatList
                data={filteredOptions}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: listMaxHeight }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                nestedScrollEnabled
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.option, item.id === selectedId && styles.optionSelected]}
                    onPress={() => handleSelect(item)}
                  >
                    <Text
                      style={[styles.optionText, item.id === selectedId && styles.optionTextSelected]}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  selector: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    backgroundColor: Colors.WHITE,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorDisabled: {
    opacity: 0.6,
  },
  selectorText: {
    fontSize: 13,
    color: Colors.BLACK,
    flex: 1,
    marginRight: 8,
  },
  selectorPlaceholder: {
    color: Colors.TEXT_SECONDARY,
  },
  modalKav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modalSheet: {
    backgroundColor: Colors.WHITE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '88%',
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.BORDER,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.MEDIUM_GRAY,
    marginTop: 10,
    marginBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.BORDER,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.BLACK,
    paddingVertical: Platform.OS === 'android' ? 4 : 8,
  },
  loader: {
    marginVertical: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    padding: 16,
    textAlign: 'center',
  },
  option: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.LIGHT_GRAY,
  },
  optionSelected: {
    backgroundColor: Colors.LIGHT_GRAY,
  },
  optionText: {
    fontSize: 15,
    color: Colors.BLACK,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: Colors.WINE,
  },
});
