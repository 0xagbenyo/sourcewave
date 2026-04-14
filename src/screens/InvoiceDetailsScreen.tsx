import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { useSalesInvoice } from '../hooks/erpnext';
import { SalesInvoiceItem } from '../types';

export const InvoiceDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { invoiceId } = (route.params as any) || {};
  
  const { data: invoice, loading, error } = useSalesInvoice(invoiceId || '');

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return '';
    try {
      // ERPNext time format is usually HH:MM:SS
      const [hours, minutes] = timeString.split(':');
      return `${hours}:${minutes}`;
    } catch {
      return timeString;
    }
  };

  const formatCurrency = (amount: number) => {
    return `GH₵${amount.toFixed(2)}`;
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => (navigation as any).goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Invoice Details</Text>
      <View style={styles.placeholder} />
    </View>
  );

  const renderInvoiceItem = (item: SalesInvoiceItem, index: number) => (
    <View key={index} style={styles.invoiceItemRow}>
      <View style={styles.tableCellItem}>
        <Text style={styles.itemCode}>{item.itemCode}</Text>
        {item.itemName && (
          <Text style={styles.itemName}>{item.itemName}</Text>
        )}
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableCellText}>{item.quantity}</Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableCellText}>{formatCurrency(item.rate)}</Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={[styles.tableCellText, styles.amountValue]}>
          {formatCurrency(item.amount)}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.SHEIN_PINK} />
          <Text style={styles.loadingText}>Loading invoice...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !invoice) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.ERROR} />
          <Text style={styles.errorText}>Error loading invoice</Text>
          {error && <Text style={styles.errorSubtext}>{error.message}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.invoiceCard}>
          <View style={styles.invoiceHeader}>
            <View>
              <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
              <Text style={styles.invoiceDate}>
                {formatDate(invoice.date)}
                {invoice.postingTime && ` at ${formatTime(invoice.postingTime)}`}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{invoice.status}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Items</Text>
            <View style={styles.itemsTable}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableHeaderText}>Item Code</Text>
                <Text style={styles.tableHeaderText}>Quantity</Text>
                <Text style={styles.tableHeaderText}>Rate</Text>
                <Text style={styles.tableHeaderText}>Amount</Text>
              </View>
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((item, index) => renderInvoiceItem(item, index))
              ) : (
                <View style={styles.emptyItems}>
                  <Text style={styles.emptyItemsText}>No items found</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.totalSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Grand Total:</Text>
              <Text style={styles.totalAmount}>{formatCurrency(invoice.grandTotal)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  invoiceCard: {
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  invoiceNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginBottom: 4,
  },
  invoiceDate: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  statusBadge: {
    backgroundColor: Colors.SHEIN_PINK,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.WHITE,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
    marginBottom: 16,
  },
  itemsTable: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.LIGHT_GRAY,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.BLACK,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  invoiceItemRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    alignItems: 'center',
  },
  tableCellItem: {
    flex: 1,
    paddingRight: 8,
  },
  tableCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCellText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.BLACK,
    textAlign: 'center',
  },
  itemCode: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.BLACK,
    marginBottom: 2,
  },
  itemName: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
  },
  amountValue: {
    fontWeight: 'bold',
    color: Colors.SHEIN_PINK,
  },
  emptyItems: {
    padding: 24,
    alignItems: 'center',
  },
  emptyItemsText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  totalSection: {
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: Colors.BORDER,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.SHEIN_PINK,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  errorSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
});

