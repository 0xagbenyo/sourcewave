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

interface ModernAlertProps {
  visible: boolean;
  title: string;
  message: string;
  items?: Array<{ name: string; reason: string }>;
  onClose: () => void;
  buttonText?: string;
}

export const ModernAlert: React.FC<ModernAlertProps> = ({
  visible,
  title,
  message,
  items = [],
  onClose,
  buttonText = 'OK',
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="alert-circle" size={16} color={Colors.SHEIN_RED} />
              </View>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={Colors.TEXT_PRIMARY} />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.message}>{message}</Text>
            
            {items.length > 0 && (
              <View style={styles.itemsContainer}>
                {items.map((item, index) => (
                  <View key={index} style={styles.itemRow}>
                    <Ionicons 
                      name="close-circle" 
                      size={16} 
                      color={Colors.SHEIN_RED} 
                      style={styles.itemIcon}
                    />
                    <View style={styles.itemContent}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemReason}>{item.reason}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  container: {
    backgroundColor: Colors.WHITE,
    width: '85%',
    maxHeight: '70%',
    borderRadius: Spacing.BORDER_RADIUS_MD,
    shadowColor: Colors.SHADOW,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginRight: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.PADDING_SM,
    paddingHorizontal: Spacing.PADDING_MD,
    paddingBottom: Spacing.PADDING_SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.MARGIN_XS,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  title: {
    fontSize: Typography.FONT_SIZE_SM,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.PADDING_MD,
    paddingVertical: Spacing.PADDING_SM,
    maxHeight: 300,
  },
  message: {
    fontSize: Typography.FONT_SIZE_XS,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: Spacing.MARGIN_SM,
    lineHeight: 16,
  },
  itemsContainer: {
    marginTop: Spacing.MARGIN_XS,
    gap: Spacing.MARGIN_XS,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF5F5',
    padding: Spacing.PADDING_XS,
    borderRadius: Spacing.BORDER_RADIUS_SM,
    borderLeftWidth: 2,
    borderLeftColor: Colors.SHEIN_RED,
  },
  itemIcon: {
    marginRight: Spacing.MARGIN_XS,
    marginTop: 1,
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: Typography.FONT_SIZE_XS,
    fontWeight: Typography.FONT_WEIGHT_BOLD,
    color: Colors.TEXT_PRIMARY,
    marginBottom: 1,
  },
  itemReason: {
    fontSize: 9,
    color: Colors.TEXT_SECONDARY,
  },
});

