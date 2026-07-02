import React, { useEffect } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useUserSession } from '../context/UserContext';
import { MainTabNavigator } from './MainTabNavigator';
import { SupplierRootNavigator } from './SupplierRootNavigator';
import { resetToAuthScreen } from './rootNavigation';
import type { MainTabParamList, RootStackParamList } from '../types';

/**
 * After login: buyers see the retail tab app; users with Supplier role / linked Supplier see supplier portal.
 */
export const RootMainNavigator: React.FC = () => {
  const { user } = useUserSession();
  const route = useRoute<RouteProp<RootStackParamList, 'Main'>>();

  useEffect(() => {
    if (!user) {
      resetToAuthScreen();
    }
  }, [user]);

  if (!user) {
    return null;
  }

  if (user.appMode === 'supplier') {
    return <SupplierRootNavigator />;
  }
  return <MainTabNavigator mainDeepLink={route.params as { screen?: keyof MainTabParamList; params?: object } | undefined} />;
};
