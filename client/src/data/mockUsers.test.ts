import { describe, it, expect } from 'vitest';
import { findUserByCredentials, MOCK_USERS } from '../data/mockUsers';

describe('mockUsers', () => {
  it('contains at least one admin and one examinee', () => {
    expect(MOCK_USERS.some((u) => u.role === 'admin')).toBe(true);
    expect(MOCK_USERS.some((u) => u.role === 'examinee')).toBe(true);
  });

  it('returns the matching user for correct credentials', () => {
    const admin = MOCK_USERS[0];
    const result = findUserByCredentials(admin.email, admin.password);
    expect(result).toEqual(admin);
  });

  it('matches email case-insensitively and trims whitespace', () => {
    const admin = MOCK_USERS[0];
    const result = findUserByCredentials(`  ${admin.email.toUpperCase()}  `, admin.password);
    expect(result).toEqual(admin);
  });

  it('returns undefined for a wrong password', () => {
    const admin = MOCK_USERS[0];
    expect(findUserByCredentials(admin.email, 'wrong-password')).toBeUndefined();
  });

  it('returns undefined for an unknown email', () => {
    expect(findUserByCredentials('nobody@wissen.dev', 'whatever')).toBeUndefined();
  });
});
