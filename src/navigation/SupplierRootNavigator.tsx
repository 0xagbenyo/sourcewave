import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SupplierTabNavigator } from './SupplierTabNavigator';
import { SupplierOrdersInvoicesScreen } from '../screens/supplier/SupplierOrdersInvoicesScreen';
import { SupplierSalesInvoiceDetailScreen } from '../screens/supplier/SupplierSalesInvoiceDetailScreen';
import { SupplierPaymentEntryDetailScreen } from '../screens/supplier/SupplierPaymentEntryDetailScreen';
import { SupplierQuotationListScreen } from '../screens/supplier/SupplierQuotationListScreen';
import { SupplierQuotationDetailScreen } from '../screens/supplier/SupplierQuotationDetailScreen';
import type { SupplierStackParamList } from '../types';

const Stack = createStackNavigator<SupplierStackParamList>();

/** Supplier: Home + Chat + Profile tabs; buying flows as stack screens from Home. */
export const SupplierRootNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SupplierTabs" component={SupplierTabNavigator} />
      <Stack.Screen
        name="SupplierOrdersInvoices"
        component={SupplierOrdersInvoicesScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
      <Stack.Screen
        name="SupplierSalesInvoiceDetail"
        component={SupplierSalesInvoiceDetailScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
      <Stack.Screen
        name="SupplierPaymentEntryDetail"
        component={SupplierPaymentEntryDetailScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
      <Stack.Screen
        name="SupplierQuotationList"
        component={SupplierQuotationListScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
      <Stack.Screen
        name="SupplierQuotationDetail"
        component={SupplierQuotationDetailScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
    </Stack.Navigator>
  );
};
