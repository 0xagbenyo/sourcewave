import React, { useCallback, useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { HomeScreen } from '../screens/HomeScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { SourcingRequestScreen } from '../screens/SourcingRequestScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RavenUIMessagesScreen } from '../screens/RavenUIMessagesScreen';
import { getMainTabBarStyle } from './mainTabBarStyle';
import { Colors } from '../constants/colors';
import { requestSuppliersTabReset } from '../utils/suppliersTabReset';
import type { MainTabParamList } from '../types';

const MainTab = createBottomTabNavigator<MainTabParamList>();

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user } = useUserSession();
  const { isActive: subscriptionActive, isLoading: subscriptionLoading } = useSubscription();

  const suppliersTabListeners = useCallback(
    ({ navigation: tabNav }: { navigation: { navigate: (name: string, params?: object) => void } }) => ({
      tabPress: (e: { preventDefault?: () => void }) => {
        if (!user?.email) return;
        if (!subscriptionLoading && !subscriptionActive) {
          e.preventDefault?.();
          (navigation as { navigate: (name: string) => void }).navigate('Subscription');
          return;
        }
        requestSuppliersTabReset();
      },
    }),
    [user?.email, subscriptionLoading, subscriptionActive, navigation]
  );

  const screenOptions = useCallback(
    ({ route }: { route: { name: string } }) => ({
      tabBarHideOnKeyboard: true,
      tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => {
        let iconName: keyof typeof Ionicons.glyphMap;

        if (route.name === 'Home') {
          iconName = focused ? 'home' : 'home-outline';
        } else if (route.name === 'Categories') {
          iconName = focused ? 'grid' : 'grid-outline';
        } else if (route.name === 'Sourcing') {
          iconName = focused ? 'briefcase' : 'briefcase-outline';
        } else if (route.name === 'Suppliers') {
          iconName = focused ? 'people' : 'people-outline';
        } else if (route.name === 'Profile') {
          iconName = focused ? 'person' : 'person-outline';
        } else {
          iconName = 'home-outline';
        }

        return <Ionicons name={iconName} size={22} color={color} />;
      },
      tabBarActiveTintColor: Colors.WINE,
      tabBarInactiveTintColor: '#9CA3AF',
      tabBarLabelStyle: {
        fontSize: 10,
        marginTop: 2,
        fontWeight: '600',
      },
      tabBarStyle: getMainTabBarStyle(insets),
      headerShown: false,
    }),
    [insets]
  );

  return (
    <MainTab.Navigator screenOptions={screenOptions}>
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
        options={{ tabBarLabel: t('tabs.suppliers'), unmountOnBlur: true }}
        listeners={suppliersTabListeners}
      />
      <MainTab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('tabs.account') }} />
    </MainTab.Navigator>
  );
};
