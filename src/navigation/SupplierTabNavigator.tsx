import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SupplierHomeScreen } from '../screens/supplier/SupplierHomeScreen';
import { RavenUIMessagesScreen } from '../screens/RavenUIMessagesScreen';
import { SupplierProfileScreen } from '../screens/supplier/SupplierProfileScreen';
import { Colors } from '../constants/colors';
import { getMainTabBarStyle } from './mainTabBarStyle';
import type { SupplierTabParamList } from '../types';

const Tab = createBottomTabNavigator<SupplierTabParamList>();

export const SupplierTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'ellipse-outline';
          if (route.name === 'SupplierHome') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'SupplierMessages') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'SupplierProfile') {
            iconName = focused ? 'person' : 'person-outline';
          }
          const iconColor = focused ? Colors.WINE : Colors.NEUTRAL_GRAY;
          return <Ionicons name={iconName} size={22} color={iconColor} />;
        },
        tabBarActiveTintColor: '#1C1C1E',
        tabBarInactiveTintColor: Colors.NEUTRAL_GRAY,
        tabBarLabelStyle: { fontSize: 11, marginTop: 2, fontWeight: '600', letterSpacing: -0.1 },
        tabBarStyle: getMainTabBarStyle(insets),
        headerShown: false,
      })}
    >
      <Tab.Screen name="SupplierHome" component={SupplierHomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="SupplierMessages" component={RavenUIMessagesScreen} options={{ tabBarLabel: 'Chat' }} />
      <Tab.Screen name="SupplierProfile" component={SupplierProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
};
