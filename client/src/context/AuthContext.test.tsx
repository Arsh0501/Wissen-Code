import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { adminUser, examineeUser } from '../test/test-utils';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext', () => {
  it('starts logged out when there is no stored session', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBe('examinee');
  });

  it('logs in successfully with valid credentials and exposes the user/role', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      const success = result.current.login(adminUser.email, adminUser.password);
      expect(success).toBe(true);
    });

    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.role).toBe('admin');
    expect(result.current.candidateName).toBe(adminUser.name);
    expect(result.current.authError).toBeNull();
  });

  it('rejects invalid credentials and sets an error message', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      const success = result.current.login(adminUser.email, 'wrong-password');
      expect(success).toBe(false);
    });

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.authError).toMatch(/invalid/i);
  });

  it('persists the session across a fresh provider mount', () => {
    const first = renderHook(() => useAuth(), { wrapper });
    act(() => {
      first.result.current.login(examineeUser.email, examineeUser.password);
    });

    const second = renderHook(() => useAuth(), { wrapper });
    expect(second.result.current.isLoggedIn).toBe(true);
    expect(second.result.current.user?.email).toBe(examineeUser.email);
  });

  it('clears the session on logout', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login(adminUser.email, adminUser.password);
    });
    act(() => {
      result.current.logout();
    });

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('wissen-user')).toBeNull();
  });

  it('updates and persists profile fields', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login(examineeUser.email, examineeUser.password);
    });
    act(() => {
      result.current.updateProfile({ name: 'New Name' });
    });

    expect(result.current.user?.name).toBe('New Name');
    const stored = JSON.parse(localStorage.getItem('wissen-user') ?? '{}');
    expect(stored.name).toBe('New Name');
  });
});
