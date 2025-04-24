
import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  isAdmin?: boolean;
  joinedAt: Date;
}

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider = ({ children }: UserProviderProps) => {
  const [user, setUser] = useState<User | null>(() => {
    // Try to get the user from sessionStorage
    const savedUser = sessionStorage.getItem('chat-user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  useEffect(() => {
    // Save user to sessionStorage
    if (user) {
      sessionStorage.setItem('chat-user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('chat-user');
    }
  }, [user]);

  return (
    <UserContext.Provider value={{ user, setUser }}>
      {children}
    </UserContext.Provider>
  );
};
