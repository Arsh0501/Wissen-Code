import { describe, it, expect } from 'vitest';
import { getNavItemsForRole } from './navItems';

describe('getNavItemsForRole', () => {
  it('includes admin-only items for admins', () => {
    const labels = getNavItemsForRole('admin').map((i) => i.label);
    expect(labels).toContain('Question Bank');
    expect(labels).toContain('Assessments');
    expect(labels).not.toContain('My Assessments');
  });

  it('includes candidate-only items for candidates', () => {
    const labels = getNavItemsForRole('candidate').map((i) => i.label);
    expect(labels).toContain('My Assessments');
    expect(labels).not.toContain('Question Bank');
  });

  it('includes shared items for every role', () => {
    for (const role of ['admin', 'candidate'] as const) {
      const labels = getNavItemsForRole(role).map((i) => i.label);
      expect(labels).toContain('Dashboard');
      expect(labels).toContain('Profile');
    }
  });
});
