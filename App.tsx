import './src/i18n';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initializeERPNext, initializeNetworkAwareTimeout } from './src/services/erpnext';
import { UserProvider } from './src/context/UserContext';
import { RavenUnreadProvider } from './src/context/RavenUnreadContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';

// Backend API client — use environment variables in production builds.
initializeERPNext({
  baseUrl: process.env.EXPO_PUBLIC_ERPNEXT_URL || 'https://sourcewave.frappe.cloud',
  apiKey: process.env.EXPO_PUBLIC_API_KEY || '8de58d4ec8cd19c',
  apiSecret: process.env.EXPO_PUBLIC_API_SECRET || 'e7a66aae836bc8f',
});

// Initialize network-aware timeout system
// This will dynamically adjust API timeout based on network conditions
initializeNetworkAwareTimeout();

export default function App() {

  return (
    <UserProvider>
      <RavenUnreadProvider>
        <SubscriptionProvider>
          <SafeAreaProvider>
            <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
            <AppNavigator />
          </SafeAreaProvider>
        </SubscriptionProvider>
      </RavenUnreadProvider>
    </UserProvider>
  );
}
