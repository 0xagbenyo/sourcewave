import React, { createContext, useContext, useState, ReactNode } from 'react';

interface UserSession {
  email: string;
  fullName?: string;
  user?: string;
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
    setUserState(null);
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

