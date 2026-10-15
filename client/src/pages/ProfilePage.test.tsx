import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage from './ProfilePage';
import api from '../services/api';
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
    expect(api.put).toHaveBeenCalledWith('/profile', { name: 'Updated Name' });
    expect(JSON.parse(localStorage.getItem('wissen-user') ?? '{}').name).toBe('Updated Name');
  });

  it('keeps email read-only', () => {
    renderWithProviders(<ProfilePage />, { loggedInAs: candidateUser });
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('readonly');
  });

  it('shows backend errors without persisting changes', async () => {
    vi.mocked(api.put).mockRejectedValueOnce({ response: { data: { error: 'This name is already in use' } } });
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />, { loggedInAs: candidateUser });
    await user.clear(screen.getByLabelText(/full name/i));
    await user.type(screen.getByLabelText(/full name/i), 'Duplicate Name');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This name is already in use');
    expect(JSON.parse(localStorage.getItem('wissen-user') || '{}').name).toBe(candidateUser.name);
  });
});
