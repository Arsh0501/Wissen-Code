import { it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within, waitFor } from '@testing-library/react';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import TeamPage from './TeamPage';

it('offers Admin and Interviewer invitations and no Recruiter role in account permissions', async () => {
  vi.mocked(api.request).mockResolvedValue({
    data: [
      {
        id: 22,
        name: 'Team interviewer',
        email: 'interviewer@example.test',
        role: 'interviewer',
        isGuest: false,
      },
    ],
  });
  renderWithProviders(<TeamPage />, { loggedInAs: adminUser });
  const inviteRole = screen.getByLabelText('Role');
  expect(
    within(inviteRole)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['interviewer', 'admin']);
  const accountRole = await screen.findByLabelText('Role for Team interviewer');
  expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /active sessions for/ })).not.toBeInTheDocument();
  await userEvent.click(accountRole);
  const menu = screen.getByRole('listbox', { name: 'Role for Team interviewer' });
  expect(within(menu).getAllByRole('option')).toHaveLength(3);
  expect(within(menu).getByRole('option', { name: /Candidate/ })).toBeInTheDocument();
  expect(within(menu).getByRole('option', { name: /Interviewer/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(within(menu).getByRole('option', { name: /Admin/ })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /recruiter/i })).not.toBeInTheDocument();
  expect(
    screen.getByText(/Administrators manage team access, assessments, and candidate operations/),
  ).toBeInTheDocument();
});

it('confirms session revocation, supports guests, and reports the result', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({
    data: config.url.endsWith('/revoke-sessions')
      ? { revokedSessions: 2 }
      : [
          {
            id: 23,
            name: 'Guest candidate',
            email: 'guest@example.test',
            role: 'candidate',
            isGuest: true,
            _count: { sessions: 2 },
          },
        ],
  }));
  renderWithProviders(<TeamPage />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  const logout = await screen.findByRole('button', {
    name: '2 active sessions for guest@example.test. Log out all devices',
  });
  await user.click(logout);
  expect(screen.getByRole('alertdialog')).toHaveTextContent('cannot recover the same assessment');
  expect(api.request).not.toHaveBeenCalledWith(
    expect.objectContaining({ url: '/users/23/revoke-sessions' }),
  );
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await user.click(logout);
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Log out all devices' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('2 login session(s) revoked'),
  );
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/users/23/revoke-sessions', method: 'post' }),
  );
});
