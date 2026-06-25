import React, { createContext, useContext, useState, ReactNode } from 'react';
import { clearFrappeWebCredentials } from '../services/sessionCredentials';
import { clearFrappeRavenSession } from '../services/frappeRavenSession';
import { clearRavenMessagingLocalCache } from '../utils/ravenMessagingLocalCache';
import { resetToAuthScreen } from '../navigation/rootNavigation';

/** Buyer = retail customer flow; Supplier = linked Supplier portal (buying docs + chat). */
export type AppMode = 'buyer' | 'supplier';

export interface UserSession {
  email: string;
  fullName?: string;
  /** Frappe `User.name` (login id), not Supplier doc name — use `supplierId` for ERPNext Supplier links. */
  user?: string;
  appMode?: AppMode;
  /** ERPNext `Supplier.name` (document id for Purchase Order, Supplier Quotation, etc.). */
  supplierId?: string;
  supplierName?: string;
}

interface UserContextType {
  user: UserSession | null;
  setUser: (user: UserSession | null) => void;
  clearUser: () => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<UserSession | null>(null);
  const [isLoading] = useState(false); // Set to false since we're not loading from storage

  const setUser = (userData: UserSession | null) => {
    setUserState(userData);
  };

  const clearUser = () => {
    const email = user?.email;
    setUserState(null);
    clearFrappeRavenSession();
    void clearFrappeWebCredentials();
    void clearRavenMessagingLocalCache(email);
    resetToAuthScreen();
  };

  return (
    <UserContext.Provider value={{ user, setUser, clearUser, isLoading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUserSession = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserSession must be used within a UserProvider');
  }
  return context;
};

