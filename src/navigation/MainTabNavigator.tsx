import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { HomeScreen } from '../screens/HomeScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { SourcingRequestScreen } from '../screens/SourcingRequestScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RavenUIMessagesScreen } from '../screens/RavenUIMessagesScreen';
import { Colors } from '../constants/colors';
import { getMainTabBarStyle } from './mainTabBarStyle';
import type { MainTabParamList } from '../types';

const MainTab = createBottomTabNavigator<MainTabParamList>();

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

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
          } else if (route.name === 'Suppliers') {
            iconName = focused ? 'people' : 'people-outline';
            iconColor = focused ? Colors.WINE : '#4CAF50';
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
        tabBarStyle: getMainTabBarStyle(insets),
        headerShown: false,
      })}
    >
      <MainTab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('tabs.activity') }} />
      <MainTab.Screen
        name="Sourcing"
        component={SourcingRequestScreen}
        options={{ tabBarLabel: t('tabs.sourcing') }}
      />
      <MainTab.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{ tabBarLabel: t('tabs.category') }}
      />
      <MainTab.Screen
        name="Suppliers"
        component={RavenUIMessagesScreen}
        options={{ tabBarLabel: t('tabs.suppliers') }}
      />
      <MainTab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('tabs.account') }} />
    </MainTab.Navigator>
  );
};
