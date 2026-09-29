import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode, useEffect } from 'react';
import api from '../services/api';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'examinee';
  guest?: boolean; // joined through an invite link
}

const STORAGE_KEY = 'wissen-user';
const TOKEN_KEY = 'wissen-token';

function loadStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  const token = localStorage.getItem(TOKEN_KEY);
  if (!raw || !token) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUser | null, token: string | null) {
  if (user && token) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}

interface AuthContextType {
  user: AuthUser | null;
  role: 'admin' | 'examinee';
  candidateName: string;
  isLoggedIn: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  // Use a token issued elsewhere (e.g. joining through an invite link)
  signInWithToken: (user: AuthUser, token: string) => void;
  logout: () => void;
  updateProfile: (updates: Partial<Pick<AuthUser, 'name' | 'email'>>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser);
  const [authError, setAuthError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setAuthError(null);
      const { data } = await api.post('/auth/login', { email, password });
      setUser(data.user);
      persistUser(data.user, data.token);
      return true;
    } catch (err: any) {
      setAuthError(err.response?.data?.error || 'Failed to login');
      return false;
    }
  }, []);

  const signInWithToken = useCallback((nextUser: AuthUser, token: string) => {
    setAuthError(null);
    setUser(nextUser);
    persistUser(nextUser, token);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    persistUser(null, null);
  }, []);

  const updateProfile = useCallback((updates: Partial<Pick<AuthUser, 'name' | 'email'>>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      const token = localStorage.getItem(TOKEN_KEY);
      persistUser(next, token);
      return next;
    });
  }, []);

  // Validate token on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      api.get('/auth/me').then(({ data }) => {
        setUser(data.user);
        persistUser(data.user, token);
      }).catch(() => {
        logout();
      });
    }
  }, [logout]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      role: user?.role ?? 'examinee',
      candidateName: user?.name ?? '',
      isLoggedIn: !!user,
      authError,
      login,
      signInWithToken,
      logout,
      updateProfile,
    }),
    [user, authError, login, signInWithToken, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

