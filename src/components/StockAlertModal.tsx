import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';

interface StockAlertModalProps {
  visible: boolean;
  items: Array<{ name: string; reason: string; itemCode: string }>;
  onClose: () => void;
}

export const StockAlertModal: React.FC<StockAlertModalProps> = ({
  visible,
  items,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Ionicons name="warning" size={32} color={Colors.WHITE} />
            <Text style={styles.title}>Stock Alert</Text>
          </View>

          <ScrollView 
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.message}>
              The following items are out of stock or unavailable in the requested quantity:
            </Text>
            
            <View style={styles.itemsContainer}>
              {items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <Ionicons 
                    name="close-circle" 
                    size={18} 
                    color={Colors.WHITE}
                  />
                  <View style={styles.itemContent}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemReason}>{item.reason}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity 
            style={styles.closeButton}
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>Got It</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: Colors.SHEIN_RED,
    width: '85%',
    maxHeight: '75%',
    borderRadius: Spacing.BORDER_RADIUS_MD,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    paddingBottom: Spacing.PADDING_MD,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.PADDING_LG,
    paddingBottom: Spacing.PADDING_MD,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
  },
  title: {
    fontSize: Typography.FONT_SIZE_MD,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WHITE,
    marginTop: Spacing.MARGIN_XS,
  },
  content: {
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_MD,
    maxHeight: 350,
  },
  message: {
    fontSize: Typography.FONT_SIZE_XS,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: Spacing.MARGIN_MD,
    lineHeight: 16,
  },
  itemsContainer: {
    marginTop: Spacing.MARGIN_SM,
    gap: Spacing.MARGIN_XS,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: Spacing.PADDING_SM,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    borderLeftWidth: 3,
    borderLeftColor: Colors.WHITE,
    gap: Spacing.MARGIN_XS,
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.WHITE,
    marginBottom: 2,
  },
  itemReason: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  closeButton: {
    marginHorizontal: Spacing.PADDING_MD,
    backgroundColor: Colors.WHITE,
    paddingVertical: Spacing.PADDING_SM,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.SHEIN_RED,
  },
});
