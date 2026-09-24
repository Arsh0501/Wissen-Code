import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import LoginPage from './LoginPage';
import { renderWithProviders, adminUser } from '../test/test-utils';

function renderLoginPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<div>Dashboard Home</div>} />
    </Routes>,
    { initialEntries: ['/login'] }
  );
}

describe('LoginPage', () => {
  it('renders the sign-in form and demo accounts', () => {
    renderLoginPage();
    expect(screen.getByRole('heading', { name: /wissen code/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    expect(screen.getByText(adminUser.name)).toBeInTheDocument();
  });

  it('logs in and redirects on valid credentials', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), adminUser.email);
    await user.type(screen.getByLabelText(/password/i), adminUser.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText('Dashboard Home')).toBeInTheDocument());
  });

  it('shows an error message on invalid credentials', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), adminUser.email);
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
  });

  it('fills the form when a demo account is clicked', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByText(adminUser.name));

    expect(screen.getByLabelText(/email/i)).toHaveValue(adminUser.email);
    expect(screen.getByLabelText(/password/i)).toHaveValue(adminUser.password);
  });
});
