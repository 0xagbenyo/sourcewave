import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useUserSession } from '../context/UserContext';
import { MainTabNavigator } from './MainTabNavigator';
import { SupplierRootNavigator } from './SupplierRootNavigator';
import { resetToAuthScreen } from './rootNavigation';
import { Colors } from '../constants/colors';
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
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={Colors.WINE} />
      </View>
    );
  }

  if (user.appMode === 'supplier') {
    return <SupplierRootNavigator />;
  }
  return <MainTabNavigator mainDeepLink={route.params as { screen?: keyof MainTabParamList; params?: object } | undefined} />;
};

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.BACKGROUND,
  },
});
