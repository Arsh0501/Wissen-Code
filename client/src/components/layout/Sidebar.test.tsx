import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import Sidebar from './Sidebar';
import { renderWithProviders, adminUser, candidateUser } from '../../test/test-utils';

describe('Sidebar', () => {
  it('shows admin navigation links for an admin user', () => {
    renderWithProviders(<Sidebar />, { loggedInAs: adminUser });
    expect(screen.getByRole('link', { name: /question bank/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /assessments/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my assessments/i })).not.toBeInTheDocument();
  });

  it('shows candidate navigation links for an candidate user', () => {
    renderWithProviders(<Sidebar />, { loggedInAs: candidateUser });
    expect(screen.getByRole('link', { name: /my assessments/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /question bank/i })).not.toBeInTheDocument();
  });

  it('always shows the shared Dashboard and Profile links', () => {
    renderWithProviders(<Sidebar />, { loggedInAs: candidateUser });
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
  });
});
