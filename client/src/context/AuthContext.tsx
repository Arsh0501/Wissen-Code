import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { findUserByCredentials, type MockUser } from '../data/mockUsers';

const STORAGE_KEY = 'wissen-user';

function loadStoredUser(): MockUser | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockUser;
  } catch {
    return null;
  }
}

function persistUser(user: MockUser | null) {
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEY);
}

interface AuthContextType {
  user: MockUser | null;
  role: 'admin' | 'examinee';
  candidateName: string;
  isLoggedIn: boolean;
  authError: string | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  updateProfile: (updates: Partial<Pick<MockUser, 'name' | 'email'>>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(loadStoredUser);
  const [authError, setAuthError] = useState<string | null>(null);

  const login = useCallback((email: string, password: string) => {
    const match = findUserByCredentials(email, password);
    if (!match) {
      setAuthError('Invalid email or password.');
      return false;
    }
    setAuthError(null);
    setUser(match);
    persistUser(match);
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    persistUser(null);
  }, []);

  const updateProfile = useCallback((updates: Partial<Pick<MockUser, 'name' | 'email'>>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      persistUser(next);
      return next;
    });
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      role: user?.role ?? 'examinee',
      candidateName: user?.name ?? '',
      isLoggedIn: !!user,
      authError,
      login,
      logout,
      updateProfile,
    }),
    [user, authError, login, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

