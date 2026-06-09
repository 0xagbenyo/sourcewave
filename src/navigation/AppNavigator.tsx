import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Screens
import { SplashScreen } from '../screens/SplashScreen';
import { LanguageSelectScreen } from '../screens/LanguageSelectScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { OrderHistoryScreen } from '../screens/OrderHistoryScreen';
import { OrderDetailsScreen } from '../screens/OrderDetailsScreen';
import { InvoiceDetailsScreen } from '../screens/InvoiceDetailsScreen';
import { InvoicesPaymentsScreen } from '../screens/InvoicesPaymentsScreen';
import { PaymentEntryDetailScreen } from '../screens/PaymentEntryDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { AddressBookScreen } from '../screens/AddressBookScreen';
import { EditAddressScreen } from '../screens/EditAddressScreen';
import { SourcingRequestMultiScreen } from '../screens/SourcingRequestMultiScreen';
import { SuppliersScreen } from '../screens/SuppliersScreen';
import { SupplierDetailScreen } from '../screens/SupplierDetailScreen';
import { AgentSupplierChatScreen } from '../screens/AgentSupplierChatScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';
import { ContactUsScreen } from '../screens/ContactUsScreen';
import { FaqScreen } from '../screens/FaqScreen';
import { SupplierChatListScreen } from '../screens/SupplierChatListScreen';
import { RavenUIMessagesScreen } from '../screens/RavenUIMessagesScreen';
import { RavenWorkspaceSupplierProfileScreen } from '../screens/RavenWorkspaceSupplierProfileScreen';
import { SupplierQuotationComposeScreen } from '../screens/supplier/SupplierQuotationComposeScreen';

// Types
import { RootStackParamList, AuthStackParamList } from '../types';
import { Colors } from '../constants/colors';
import { appStorage } from '../services/appStorage';
import {
  STORAGE_APP_LANGUAGE,
  STORAGE_ONBOARDING_COMPLETE,
} from '../constants/appPreferencesKeys';
import { ensureChineseMachineLocale, applyEnglishLocale } from '../i18n/machineChineseLocale';
import { RootMainNavigator } from './RootMainNavigator';

const Stack = createStackNavigator<RootStackParamList>();
const AuthStack = createStackNavigator<AuthStackParamList>();

// Auth Navigator
const AuthNavigator = () => {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
};

type InitialRouteName = 'LanguageSelect' | 'Onboarding' | 'Auth';

// Root Navigator
export const AppNavigator = () => {
  const [navReady, setNavReady] = useState(false);
  const [initialRouteName, setInitialRouteName] = useState<InitialRouteName>('LanguageSelect');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lang = await appStorage.getItem(STORAGE_APP_LANGUAGE);
        const onboardingDone = await appStorage.getItem(STORAGE_ONBOARDING_COMPLETE);

        if (cancelled) return;

        if (!lang) {
          setInitialRouteName('LanguageSelect');
        } else if (onboardingDone !== 'true') {
          setInitialRouteName('Onboarding');
        } else {
          setInitialRouteName('Auth');
        }

        if (lang === 'zh') {
          await ensureChineseMachineLocale();
        } else {
          await applyEnglishLocale();
        }
      } catch (e) {
        console.warn('[AppNavigator] bootstrap locale failed:', e);
        await applyEnglishLocale();
      } finally {
        if (!cancelled) setNavReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!navReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.BACKGROUND }}>
        <ActivityIndicator size="large" color={Colors.BLACK} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Auth" component={AuthNavigator} />
        <Stack.Screen name="Main" component={RootMainNavigator} />
        <Stack.Screen name="SourcingRequest" component={SourcingRequestMultiScreen} options={{ presentation: 'card' }} />
        <Stack.Screen
          name="Search"
          component={SearchScreen}
          options={{
            presentation: 'card',
            headerShown: false,
            gestureEnabled: true,
          }}
        />
        <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="InvoicesPayments" component={InvoicesPaymentsScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="InvoiceDetails" component={InvoiceDetailsScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="PaymentEntryDetail" component={PaymentEntryDetailScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="AddressBook" component={AddressBookScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="EditAddress" component={EditAddressScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="Suppliers" component={SuppliersScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="SupplierDetail" component={SupplierDetailScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="AgentSupplierChat" component={AgentSupplierChatScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="SupplierChatList" component={SupplierChatListScreen} options={{ presentation: 'card' }} />
        <Stack.Screen
          name="SupplierQuotationCompose"
          component={SupplierQuotationComposeScreen}
          options={{ presentation: 'card', gestureEnabled: true }}
        />
        <Stack.Screen name="RavenUIMessages" component={RavenUIMessagesScreen} options={{ presentation: 'card' }} />
        <Stack.Screen
          name="RavenChatInbox"
          component={RavenUIMessagesScreen}
          options={{ presentation: 'card', headerShown: false }}
        />
        <Stack.Screen
          name="RavenWorkspaceSupplierProfile"
          component={RavenWorkspaceSupplierProfileScreen}
          options={{ presentation: 'card', headerShown: false }}
        />
        <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="ContactUs" component={ContactUsScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="Faq" component={FaqScreen} options={{ presentation: 'card', gestureEnabled: true }} />
        <Stack.Screen name="Splash" component={SplashScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// Re-export for any imports expecting MainTabNavigator from this module
export { MainTabNavigator } from './MainTabNavigator';
