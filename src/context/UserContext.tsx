import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { clearFrappeWebCredentials } from '../services/sessionCredentials';
import { clearFrappeRavenSession } from '../services/frappeRavenSession';
import {
  clearStoredUserSession,
  loadStoredUserSession,
  saveStoredUserSession,
} from '../services/userSessionStorage';
import { clearRavenMessagingLocalCache } from '../utils/ravenMessagingLocalCache';
import { resetToAuthScreen } from '../navigation/rootNavigation';
import { setRavenLastChat } from '../utils/ravenLastChatStorage';

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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await loadStoredUserSession();
        if (cancelled) return;

        if (!stored) return;

        const { bootstrapStoredAppSession } = await import('../utils/restoreAppSession');
        const restored = await bootstrapStoredAppSession(stored);
        if (cancelled) return;

        setUserState(restored);
        await saveStoredUserSession(restored);
      } catch (e) {
        console.warn('[UserContext] session restore failed — keeping stored session if present', e);
        const fallback = await loadStoredUserSession();
        if (!cancelled && fallback) {
          setUserState(fallback);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setUser = (userData: UserSession | null) => {
    setUserState(userData);
    void saveStoredUserSession(userData);
  };

  const clearUser = () => {
    const email = user?.email;
    setUserState(null);
    void import('../services/ravenPushNotifications').then(({ disableRavenPushNotifications }) =>
      disableRavenPushNotifications()
    );
    clearFrappeRavenSession();
    void clearFrappeWebCredentials();
    void clearStoredUserSession();
    void clearRavenMessagingLocalCache(email);
    void setRavenLastChat(email, null);
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
