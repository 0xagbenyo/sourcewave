import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
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
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(
    () => options.filter((option) => matchesQuery(option, searchQuery)),
    [options, searchQuery]
  );

  const displayLabel =
    selectedLabel ||
    options.find((option) => option.id === selectedId)?.name ||
    '';

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
    setOpen(false);
    setSearchQuery('');
  };

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

      {open && (
        <View style={styles.panel}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={Colors.TEXT_SECONDARY} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={Colors.TEXT_SECONDARY}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator style={styles.loader} color={Colors.ROYAL_BLUE} />
          ) : filteredOptions.length === 0 ? (
            <Text style={styles.emptyText}>
              {options.length === 0 ? emptyText : 'No matches for your search'}
            </Text>
          ) : (
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: listMaxHeight }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.option,
                    item.id === selectedId && styles.optionSelected,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      item.id === selectedId && styles.optionTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}
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
  panel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    backgroundColor: Colors.WHITE,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.BLACK,
    paddingVertical: 4,
  },
  loader: {
    marginVertical: 16,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    padding: 12,
  },
  option: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.LIGHT_GRAY,
  },
  optionSelected: {
    backgroundColor: Colors.LIGHT_GRAY,
  },
  optionText: {
    fontSize: 13,
    color: Colors.BLACK,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: Colors.ROYAL_BLUE,
  },
});
