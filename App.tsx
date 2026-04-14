import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initializeERPNext, initializeNetworkAwareTimeout } from './src/services/erpnext';
import { UserProvider } from './src/context/UserContext';

// Initialize ERPNext client at module load time
// This ensures the client is available before any components mount
// Preferring environment variables for security, but with hardcoded fallback for development
// For production: Use a .env file with:
// EXPO_PUBLIC_ERPNEXT_URL=https://your-instance.com
// EXPO_PUBLIC_API_KEY=your_api_key
// EXPO_PUBLIC_API_SECRET=your_api_secret
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
    <SafeAreaProvider>
      <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
      <AppNavigator />
    </SafeAreaProvider>
    </UserProvider>
  );
}
