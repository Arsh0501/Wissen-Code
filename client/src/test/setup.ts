import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import api from '../services/api';
import { findUserByCredentials } from './fixtures/users';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), request: vi.fn() },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async () => ({
    data: { user: JSON.parse(localStorage.getItem('wissen-user') || 'null') },
  }));
  vi.mocked(api.post).mockImplementation(async (url, body: any) => {
    if (url === '/auth/logout') return { data: { success: true } };
    const user = findUserByCredentials(body.email, body.password);
    if (!user)
      throw {
        response: { status: 401, data: { error: 'Invalid email or password' } },
      };
    return {
      data: { user, token: 'test-token', refreshToken: 'test-refresh-token' },
    };
  });
  vi.mocked(api.put).mockImplementation(async (_url, body: any) => ({
    data: {
      user: {
        ...JSON.parse(localStorage.getItem('wissen-user') || 'null'),
        ...body,
      },
      token: 'updated-token',
    },
  }));
});
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
