import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import Topbar from './Topbar';
import { renderWithProviders, adminUser } from '../../test/test-utils';

function renderTopbar() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<Topbar />} />
      <Route path="/login" element={<div>Login Screen</div>} />
    </Routes>,
    { loggedInAs: adminUser }
  );
}

describe('Topbar', () => {
  it("shows the current user's name", () => {
    renderTopbar();
    expect(screen.getByText(adminUser.name)).toBeInTheDocument();
  });

  it('toggles the account menu and navigates to /login on sign out', async () => {
    const user = userEvent.setup();
    renderTopbar();

    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: new RegExp(adminUser.name, 'i') }));
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
    await waitFor(() => expect(screen.getByText('Login Screen')).toBeInTheDocument());
  });
});
