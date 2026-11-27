import { beforeEach, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import * as api from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import InvitePage from './InvitePage';

beforeEach(() => {
  vi.spyOn(api, 'getPublicInvite').mockResolvedValue({
    canJoin: true,
    assessment: {
      name: 'Invited assessment',
      timeLimitMinutes: 30,
      passingScore: 60,
      questionCount: 2,
    },
  } as any);
});

const renderInvite = () =>
  renderWithProviders(
    <Routes>
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/exam/:id" element={<p>Assessment entry</p>} />
    </Routes>,
    { initialEntries: ['/invite/personal-invite'] },
  );

it('creates credentials and preserves the issued refresh token for future access', async () => {
  const join = vi
    .spyOn(api, 'joinInvite')
    .mockResolvedValue({
      token: 'issued-token',
      refreshToken: 'issued-refresh',
      assessmentId: 20,
      user: {
        id: 72,
        name: 'New candidate',
        email: 'new@example.test',
        role: 'candidate',
        guest: false,
      },
    });
  renderInvite();
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Full name'), 'New candidate');
  await user.type(screen.getByLabelText('Email'), 'new@example.test');
  await user.type(screen.getByLabelText('Password'), 'Candidate@123');
  await user.type(screen.getByLabelText('Confirm password'), 'Candidate@123');
  await user.click(screen.getByRole('button', { name: 'Continue to test' }));
  await screen.findByText('Assessment entry');
  expect(join).toHaveBeenCalledWith('personal-invite', {
    name: 'New candidate',
    email: 'new@example.test',
    password: 'Candidate@123',
  });
  expect(localStorage.getItem('wissen-refresh-token')).toBe('issued-refresh');
});

it('blocks mismatched passwords without requesting an account or session', async () => {
  const join = vi.spyOn(api, 'joinInvite');
  renderInvite();
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Full name'), 'New candidate');
  await user.type(screen.getByLabelText('Email'), 'new@example.test');
  await user.type(screen.getByLabelText('Password'), 'Candidate@123');
  await user.type(screen.getByLabelText('Confirm password'), 'Different@123');
  await user.click(screen.getByRole('button', { name: 'Continue to test' }));
  await waitFor(() => expect(screen.getByText('Passwords do not match.')).toBeVisible());
  expect(join).not.toHaveBeenCalled();
});
