import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';

export type SortOption = 'default' | 'lowToHigh' | 'highToLow';

interface PriceFilterProps {
  onSortChange: (sort: SortOption) => void;
  currentSort?: SortOption;
}

export const PriceFilter: React.FC<PriceFilterProps> = ({
  onSortChange,
  currentSort = 'default',
}) => {
  const [showModal, setShowModal] = useState(false);

  const handleSortSelect = (sort: SortOption) => {
    onSortChange(sort);
    setShowModal(false);
  };

  const getSortLabel = () => {
    switch (currentSort) {
      case 'lowToHigh':
        return 'Price: Low to High';
      case 'highToLow':
        return 'Price: High to Low';
      default:
        return 'Sort by Price';
    }
  };

  const getSortIcon = () => {
    switch (currentSort) {
      case 'lowToHigh':
        return 'arrow-up';
      case 'highToLow':
        return 'arrow-down';
      default:
        return 'swap-vertical';
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.filterButton}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <Ionicons name={getSortIcon() as any} size={16} color={Colors.BLACK} />
        <Text style={styles.filterText}>{getSortLabel()}</Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sort by Price</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={20} color={Colors.BLACK} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.sortOption,
                currentSort === 'default' && styles.sortOptionActive,
              ]}
              onPress={() => handleSortSelect('default')}
            >
              <Ionicons name="swap-vertical" size={18} color={currentSort === 'default' ? Colors.SHEIN_PINK : Colors.TEXT_SECONDARY} />
              <Text
                style={[
                  styles.sortOptionText,
                  currentSort === 'default' && styles.sortOptionTextActive,
                ]}
              >
                Default
              </Text>
              {currentSort === 'default' && (
                <Ionicons name="checkmark" size={18} color={Colors.SHEIN_PINK} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sortOption,
                currentSort === 'lowToHigh' && styles.sortOptionActive,
              ]}
              onPress={() => handleSortSelect('lowToHigh')}
            >
              <Ionicons name="arrow-up" size={18} color={currentSort === 'lowToHigh' ? Colors.SHEIN_PINK : Colors.TEXT_SECONDARY} />
              <Text
                style={[
                  styles.sortOptionText,
                  currentSort === 'lowToHigh' && styles.sortOptionTextActive,
                ]}
              >
                Price: Low to High
              </Text>
              {currentSort === 'lowToHigh' && (
                <Ionicons name="checkmark" size={18} color={Colors.SHEIN_PINK} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sortOption,
                currentSort === 'highToLow' && styles.sortOptionActive,
              ]}
              onPress={() => handleSortSelect('highToLow')}
            >
              <Ionicons name="arrow-down" size={18} color={currentSort === 'highToLow' ? Colors.SHEIN_PINK : Colors.TEXT_SECONDARY} />
              <Text
                style={[
                  styles.sortOptionText,
                  currentSort === 'highToLow' && styles.sortOptionTextActive,
                ]}
              >
                Price: High to Low
              </Text>
              {currentSort === 'highToLow' && (
                <Ionicons name="checkmark" size={18} color={Colors.SHEIN_PINK} />
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.WHITE,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.BORDER,
  },
  filterText: {
    fontSize: 12,
    color: Colors.BLACK,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    width: '80%',
    maxWidth: 300,
    padding: Spacing.PADDING_MD,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.MARGIN_MD,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.PADDING_SM,
    paddingHorizontal: Spacing.PADDING_SM,
    borderRadius: 6,
    marginBottom: Spacing.MARGIN_XS,
    gap: 10,
  },
  sortOptionActive: {
    backgroundColor: Colors.LIGHT_GRAY,
  },
  sortOptionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.TEXT_PRIMARY,
  },
  sortOptionTextActive: {
    color: Colors.SHEIN_PINK,
    fontWeight: '600',
  },
});

