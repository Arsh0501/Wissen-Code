import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage from './ProfilePage';
import { renderWithProviders, candidateUser } from '../test/test-utils';

describe('ProfilePage', () => {
  it("renders the current user's details", () => {
    renderWithProviders(<ProfilePage />, { loggedInAs: candidateUser });

    expect(screen.getByLabelText(/full name/i)).toHaveValue(candidateUser.name);
    expect(screen.getByLabelText(/^email/i)).toHaveValue(candidateUser.email);
    expect(screen.getByLabelText(/role/i)).toHaveValue(candidateUser.role);
  });

  it('saves valid changes and shows a confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />, { loggedInAs: candidateUser });

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('button', { name: /saved/i })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('wissen-user') ?? '{}').name).toBe('Updated Name');
  });

  it('rejects an invalid email and does not persist the change', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />, { loggedInAs: candidateUser });

    const emailInput = screen.getByLabelText(/^email/i);
    await user.clear(emailInput);
    await user.type(emailInput, 'not-an-email');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(JSON.parse(localStorage.getItem('wissen-user') ?? '{}').email).toBe(candidateUser.email);
  });
});
