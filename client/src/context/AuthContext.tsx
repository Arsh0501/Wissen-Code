import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode, useEffect } from 'react';
import api from '../services/api';
import type { AuthUser, AuthContextType } from '../types';
import { STORAGE_KEYS, AUTH_CONTEXT_MESSAGES as MSG } from '../constants';

function loadStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (!raw || !token) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUser | null, token: string | null) {
  if (user && token) {
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEYS.token, token);
  } else {
    localStorage.removeItem(STORAGE_KEYS.user);
    localStorage.removeItem(STORAGE_KEYS.token);
  }
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
      const token = localStorage.getItem(STORAGE_KEYS.token);
      persistUser(next, token);
      return next;
    });
  }, []);

  // Validate token on mount
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.token);
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
  if (!ctx) throw new Error(MSG.useAuthOutsideProvider);
  return ctx;
}

