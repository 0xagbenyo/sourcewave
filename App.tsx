import './src/i18n';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AppAlertHost } from './src/components/AppAlertHost';
import { initializeERPNext, initializeNetworkAwareTimeout } from './src/services/erpnext';
import { UserProvider } from './src/context/UserContext';
import { RavenUnreadProvider } from './src/context/RavenUnreadContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';

// Backend API client — credentials from .env (see .env.example).
const erpApiKey =
  process.env.EXPO_PUBLIC_API_KEY?.trim() ||
  process.env.EXPO_PUBLIC_ERPNEXT_API_KEY?.trim() ||
  '';
const erpApiSecret =
  process.env.EXPO_PUBLIC_API_SECRET?.trim() ||
  process.env.EXPO_PUBLIC_ERPNEXT_API_SECRET?.trim() ||
  '';

initializeERPNext({
  baseUrl: process.env.EXPO_PUBLIC_ERPNEXT_URL || 'https://sourcewave.frappe.cloud',
  apiKey: erpApiKey,
  apiSecret: erpApiSecret,
});

if (__DEV__ && (!erpApiKey || !erpApiSecret)) {
  console.warn(
    '[ERPNext] API key/secret missing — add EXPO_PUBLIC_API_KEY and EXPO_PUBLIC_API_SECRET to .env, then restart Expo.'
  );
}

// Initialize network listener + periodic reachability refresh (used for retry decisions).
initializeNetworkAwareTimeout();

export default function App() {

  return (
    <UserProvider>
      <RavenUnreadProvider>
        <SubscriptionProvider>
          <SafeAreaProvider>
            <StatusBar style="dark" />
            <AppNavigator />
            <AppAlertHost />
          </SafeAreaProvider>
        </SubscriptionProvider>
      </RavenUnreadProvider>
    </UserProvider>
  );
}
