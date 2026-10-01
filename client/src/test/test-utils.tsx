import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { MOCK_USERS } from '../data/mockUsers';

// Renders a component wrapped in the app's theme, router + auth providers.
// Pass `initialEntries` to control the starting route, or `loggedInAs` to
// pre-seed localStorage with a mock user so AuthProvider picks it up on mount.
export function renderWithProviders(
  ui: ReactElement,
  options: { initialEntries?: string[]; loggedInAs?: (typeof MOCK_USERS)[number] } = {}
) {
  const { initialEntries = ['/'], loggedInAs } = options;

  if (loggedInAs) {
    localStorage.setItem('wissen-user', JSON.stringify(loggedInAs));
  }

  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

export const adminUser = MOCK_USERS.find((u) => u.role === 'admin')!;
export const candidateUser = MOCK_USERS.find((u) => u.role === 'candidate')!;
