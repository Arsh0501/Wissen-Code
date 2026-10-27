import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { adminUser, candidateUser } from '../test/test-utils';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext', () => {
  it('retains the signup refresh token and clears it for sessions without one', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() =>
      result.current.signInWithToken({ ...candidateUser, id: 1 }, 'signup-token', 'signup-refresh'),
    );
    expect(localStorage.getItem('wissen-refresh-token')).toBe('signup-refresh');
    act(() => result.current.signInWithToken({ ...candidateUser, id: 1 }, 'invite-token'));
    expect(localStorage.getItem('wissen-refresh-token')).toBeNull();
  });
  it('uses interviewer access for sessions whose older primary role was admin', () => {
    localStorage.setItem(
      'wissen-user',
      JSON.stringify({ ...adminUser, accessRole: 'interviewer' }),
    );
    localStorage.setItem('wissen-token', 'test-token');
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.role).toBe('interviewer');
  });
  it('starts logged out when there is no stored session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBe('candidate');
  });

  it('logs in successfully with valid credentials and exposes the user/role', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const success = await result.current.login(adminUser.email, adminUser.password);
      expect(success).toBe(true);
    });

    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.role).toBe('admin');
    expect(result.current.candidateName).toBe(adminUser.name);
    expect(result.current.authError).toBeNull();
  });

  it('rejects invalid credentials and sets an error message', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const success = await result.current.login(adminUser.email, 'wrong-password');
      expect(success).toBe(false);
    });

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.authError).toMatch(/invalid/i);
  });

  it('persists the session across a fresh provider mount', async () => {
    const first = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await first.result.current.login(candidateUser.email, candidateUser.password);
    });

    const second = renderHook(() => useAuth(), { wrapper });
    expect(second.result.current.isLoggedIn).toBe(true);
    expect(second.result.current.user?.email).toBe(candidateUser.email);
  });

  it('clears the session on logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login(adminUser.email, adminUser.password);
    });
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('wissen-user')).toBeNull();
  });

  it('updates and persists profile fields', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login(candidateUser.email, candidateUser.password);
    });
    await act(async () => {
      await result.current.updateProfile({ name: 'New Name' });
    });

    expect(result.current.user?.name).toBe('New Name');
    const stored = JSON.parse(localStorage.getItem('wissen-user') ?? '{}');
    expect(stored.name).toBe('New Name');
  });
});
