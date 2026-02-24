import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI } from '../services/api';

interface User {
  id: number;
  login_id: string;
  role: 'admin' | 'customer';
}

interface CustomerInfo {
  id: number;
  name: string;
  phone: string;
}

interface AuthContextType {
  user: User | null;
  customerInfo: CustomerInfo | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await authAPI.getCurrentUser();
          setUser(response.data.user);
          setCustomerInfo(response.data.customerInfo);
        } catch {
          localStorage.removeItem('token');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (identifier: string, password: string) => {
    const response = await authAPI.login(identifier, password);
    const { token, user, customerInfo } = response.data;
    
    localStorage.setItem('token', token);
    setUser(user);
    setCustomerInfo(customerInfo);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setCustomerInfo(null);
  };

  return (
    <AuthContext.Provider value={{ user, customerInfo, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
