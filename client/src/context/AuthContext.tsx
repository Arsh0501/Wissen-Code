import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthContextType {
  role: 'admin' | 'examinee';
  candidateName: string;
  setRole: (role: 'admin' | 'examinee') => void;
  setCandidateName: (name: string) => void;
  isLoggedIn: boolean;
  login: (role: 'admin' | 'examinee', name: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<'admin' | 'examinee'>(
    (localStorage.getItem('wissen-role') as 'admin' | 'examinee') || 'examinee'
  );
  const [candidateName, setCandidateNameState] = useState(
    localStorage.getItem('wissen-name') || ''
  );
  const [isLoggedIn, setIsLoggedIn] = useState(
    localStorage.getItem('wissen-logged-in') === 'true'
  );

  const setRole = useCallback((r: 'admin' | 'examinee') => {
    setRoleState(r);
    localStorage.setItem('wissen-role', r);
  }, []);

  const setCandidateName = useCallback((name: string) => {
    setCandidateNameState(name);
    localStorage.setItem('wissen-name', name);
  }, []);

  const login = useCallback((r: 'admin' | 'examinee', name: string) => {
    setRole(r);
    setCandidateName(name);
    setIsLoggedIn(true);
    localStorage.setItem('wissen-logged-in', 'true');
  }, [setRole, setCandidateName]);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    localStorage.removeItem('wissen-logged-in');
    localStorage.removeItem('wissen-role');
    localStorage.removeItem('wissen-name');
  }, []);

  return (
    <AuthContext.Provider
      value={{ role, candidateName, setRole, setCandidateName, isLoggedIn, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
