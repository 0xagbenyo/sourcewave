import React, { useEffect } from 'react';
import { useUserSession } from '../context/UserContext';
import { MainTabNavigator } from './MainTabNavigator';
import { SupplierRootNavigator } from './SupplierRootNavigator';
import { resetToAuthScreen } from './rootNavigation';

/**
 * After login: buyers see the retail tab app; users with Supplier role / linked Supplier see supplier portal.
 */
export const RootMainNavigator: React.FC = () => {
  const { user } = useUserSession();

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
  return <MainTabNavigator />;
};
