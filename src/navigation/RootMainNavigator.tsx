import React from 'react';
import { useUserSession } from '../context/UserContext';
import { MainTabNavigator } from './MainTabNavigator';
import { SupplierRootNavigator } from './SupplierRootNavigator';

/**
 * After login: buyers see the retail tab app; users with Supplier role / linked Supplier see supplier portal.
 */
export const RootMainNavigator: React.FC = () => {
  const { user } = useUserSession();
  if (user?.appMode === 'supplier') {
    return <SupplierRootNavigator />;
  }
  return <MainTabNavigator />;
};
