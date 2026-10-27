import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  useEffect,
} from 'react';
import api from '../services/api';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'candidate' | 'interviewer';
  accessRole?: 'admin' | 'interviewer' | 'candidate';
  guest?: boolean; // joined through an invite link
}

export type Role = AuthUser['role'];

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
  role: 'admin' | 'candidate' | 'interviewer';
  candidateName: string;
  isLoggedIn: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  // Use a token issued elsewhere (e.g. joining through an invite link)
  signInWithToken: (user: AuthUser, token: string, refreshToken?: string) => void;
  logout: () => void;
  updateProfile: (updates: Pick<AuthUser, 'name'>) => Promise<void>;
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
      localStorage.setItem('wissen-refresh-token', data.refreshToken);
      return true;
    } catch (err: any) {
      setAuthError(err.response?.data?.error || 'Failed to login');
      return false;
    }
  }, []);

  const signInWithToken = useCallback(
    (nextUser: AuthUser, token: string, refreshToken?: string) => {
      setAuthError(null);
      if (refreshToken) localStorage.setItem('wissen-refresh-token', refreshToken);
      else localStorage.removeItem('wissen-refresh-token');
      setUser(nextUser);
      persistUser(nextUser, token);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Logout API failed', e);
    }
    setUser(null);
    persistUser(null, null);
    localStorage.removeItem('wissen-refresh-token');
  }, []);

  const updateProfile = useCallback(async (updates: Pick<AuthUser, 'name'>) => {
    const { data } = await api.put('/profile', updates);
    setUser(data.user);
    persistUser(data.user, data.token);
  }, []);

  // Validate token on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      api
        .get('/auth/me')
        .then(({ data }) => {
          setUser(data.user);
          persistUser(data.user, localStorage.getItem(TOKEN_KEY));
        })
        .catch((error) => {
          if (error.response?.status === 401) void logout();
        });
    }
  }, [logout]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      role: user?.accessRole ?? user?.role ?? 'candidate',
      candidateName: user?.name ?? '',
      isLoggedIn: !!user,
      authError,
      login,
      signInWithToken,
      logout,
      updateProfile,
    }),
    [user, authError, login, signInWithToken, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
