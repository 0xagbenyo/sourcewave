import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Screens
import { SplashScreen } from '../screens/SplashScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { CategoryProductsScreen } from '../screens/CategoryProductsScreen';
import { AllDealsScreen } from '../screens/AllDealsScreen';
import { PricingRulesScreen } from '../screens/PricingRulesScreen';
import { ProductBundlesScreen } from '../screens/ProductBundlesScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { CartScreen } from '../screens/CartScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ProductDetailsScreen } from '../screens/ProductDetailsScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { OrderSuccessScreen } from '../screens/OrderSuccessScreen';
import { OrderHistoryScreen } from '../screens/OrderHistoryScreen';
import { OrderDetailsScreen } from '../screens/OrderDetailsScreen';
import { InvoiceDetailsScreen } from '../screens/InvoiceDetailsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WishlistScreen } from '../screens/WishlistScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { AddressBookScreen } from '../screens/AddressBookScreen';
import { EditAddressScreen } from '../screens/EditAddressScreen';
import { CreateBundleScreen } from '../screens/CreateBundleScreen';
import { ViewBundleScreen } from '../screens/ViewBundleScreen';
import { SourcingRequestMultiScreen } from '../screens/SourcingRequestMultiScreen';
import { SourcingRequestScreen } from '../screens/SourcingRequestScreen';

// Types
import { RootStackParamList, AuthStackParamList, MainTabParamList } from '../types';
import { Colors } from '../constants/colors';

const Stack = createStackNavigator<RootStackParamList>();
const AuthStack = createStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

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

// Main Tab Navigator
const MainTabNavigator = () => {
  const insets = useSafeAreaInsets();

  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;
          let iconColor = color;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
            iconColor = focused ? Colors.WINE : '#FF6B9D';
          } else if (route.name === 'Categories') {
            iconName = focused ? 'search' : 'search-outline';
            iconColor = focused ? Colors.WINE : '#00BCD4';
          } else if (route.name === 'Sourcing') {
            iconName = focused ? 'briefcase' : 'briefcase-outline';
            iconColor = focused ? Colors.WINE : '#FF9800';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
            iconColor = focused ? Colors.WINE : '#9C27B0';
          } else {
            iconName = 'home-outline';
          }

          return <Ionicons name={iconName} size={20} color={iconColor} />;
        },
        tabBarActiveTintColor: Colors.BLACK,
        tabBarInactiveTintColor: Colors.TEXT_SECONDARY,
        tabBarLabelStyle: {
          fontSize: 9,
          marginTop: 2,
          fontWeight: '700',
        },
        tabBarStyle: {
          backgroundColor: Colors.WHITE,
          borderTopColor: Colors.BORDER,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? 32 : (insets.bottom === 0 ? 26 : insets.bottom + 18),
          paddingTop: Platform.OS === 'ios' ? 8 : 6,
          height: Platform.OS === 'ios' ? 84 : (insets.bottom === 0 ? 80 : 80 + insets.bottom),
        },
        sceneContainerStyle: {
          paddingBottom: Platform.OS === 'android' && insets.bottom > 0 ? 80 + insets.bottom : Platform.OS === 'android' ? 80 : 0,
        },
        headerShown: false,
      })}
    >
      <MainTab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ tabBarLabel: 'Activity' }}
      />
      <MainTab.Screen 
        name="Sourcing" 
        component={SourcingRequestScreen}
        options={{ tabBarLabel: 'Sourcing' }}
      />
      <MainTab.Screen 
        name="Categories" 
        component={CategoriesScreen}
        options={{ tabBarLabel: 'Category' }}
      />
      <MainTab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ tabBarLabel: 'Account' }}
      />
    </MainTab.Navigator>
  );
};

// Root Navigator
export const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Auth" component={AuthNavigator} />
        <Stack.Screen name="Main" component={MainTabNavigator} />
        <Stack.Screen 
          name="SourcingRequest" 
          component={SourcingRequestMultiScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="ProductDetails" 
          component={ProductDetailsScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="CategoryProducts" 
          component={CategoryProductsScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="AllDeals" 
          component={AllDealsScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="PricingRules" 
          component={PricingRulesScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="ProductBundles" 
          component={ProductBundlesScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="Search" 
          component={SearchScreen}
          options={{ 
            presentation: 'card',
            headerShown: false,
            gestureEnabled: true,
          }}
        />
        <Stack.Screen 
          name="Wishlist" 
          component={WishlistScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="Cart" 
          component={CartScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="Checkout" 
          component={CheckoutScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="OrderHistory" 
          component={OrderHistoryScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="OrderDetails" 
          component={OrderDetailsScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="InvoiceDetails" 
          component={InvoiceDetailsScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="EditProfile" 
          component={EditProfileScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="CreateBundle" 
          component={CreateBundleScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="ViewBundle" 
          component={ViewBundleScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="AddressBook" 
          component={AddressBookScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen 
          name="EditAddress" 
          component={EditAddressScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen name="Splash" component={SplashScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
