import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { SupplierTabNavigator } from './SupplierTabNavigator';
import { SupplierOrdersInvoicesScreen } from '../screens/supplier/SupplierOrdersInvoicesScreen';
import { SupplierSalesInvoiceDetailScreen } from '../screens/supplier/SupplierSalesInvoiceDetailScreen';
import { DeliveryNoteDetailScreen } from '../screens/DeliveryNoteDetailScreen';
import { SupplierDeliveryNoteListScreen } from '../screens/supplier/SupplierDeliveryNoteListScreen';
import { SupplierPaymentEntryDetailScreen } from '../screens/supplier/SupplierPaymentEntryDetailScreen';
import { SupplierQuotationListScreen } from '../screens/supplier/SupplierQuotationListScreen';
import { SupplierQuotationDetailScreen } from '../screens/supplier/SupplierQuotationDetailScreen';
import { SupplierQuotationComposeScreen } from '../screens/supplier/SupplierQuotationComposeScreen';
import { SupplierQuotationShareScreen, SupplierInvoiceShareScreen } from '../screens/supplier/SupplierQuotationShareScreen';
import { RavenWorkspaceSupplierProfileScreen } from '../screens/RavenWorkspaceSupplierProfileScreen';
import { SupplierBusinessProfileEditScreen } from '../screens/supplier/SupplierBusinessProfileEditScreen';
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
        name="SupplierDeliveryNoteList"
        component={SupplierDeliveryNoteListScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
      <Stack.Screen
        name="SupplierDeliveryNoteDetail"
        component={DeliveryNoteDetailScreen}
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
      <Stack.Screen
        name="SupplierQuotationCompose"
        component={SupplierQuotationComposeScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
      <Stack.Screen
        name="SupplierQuotationShare"
        component={SupplierQuotationShareScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
      <Stack.Screen
        name="SupplierInvoiceShare"
        component={SupplierInvoiceShareScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
      <Stack.Screen
        name="SupplierBusinessProfile"
        component={RavenWorkspaceSupplierProfileScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
      <Stack.Screen
        name="SupplierBusinessProfileEdit"
        component={SupplierBusinessProfileEditScreen}
        options={{ presentation: 'card', gestureEnabled: true }}
      />
    </Stack.Navigator>
  );
};
