import { it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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
  expect(
    within(accountRole)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['candidate', 'interviewer', 'admin']);
  expect(screen.queryByRole('option', { name: /recruiter/i })).not.toBeInTheDocument();
  expect(
    screen.getByText(/Administrators manage team access, assessments, and candidate operations/),
  ).toBeInTheDocument();
});
