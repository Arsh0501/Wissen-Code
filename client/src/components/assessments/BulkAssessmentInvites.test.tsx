import { expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import BulkAssessmentInvites from './BulkAssessmentInvites';
vi.mock('../../services/candidateImport', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  readCandidateFile: async () => [
    {
      name: 'Candidates',
      rows: [
        ['Email', 'Extra', 'Name'],
        ['maya@example.com', 'ignored', 'Maya'],
        ['invalid', 'ignored', 'Bad row'],
      ],
    },
  ],
}));

it('shows assessment-wide pending and sent statuses on reopen and blocks selecting previously invited recipients', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({
    data: config.url.startsWith('/invites/candidates')
      ? { candidates: [{ id: 7, name: 'Sam', email: 'sam@example.com' }], hasMore: false }
      : {
          messages: [
            { recipient: 'maya@example.com', status: 'pending' },
            { recipient: 'sam@example.com', status: 'sent' },
          ],
        },
  }));
  renderWithProviders(
    <BulkAssessmentInvites assessment={{ id: 20, name: 'API assessment' }} onClose={vi.fn()} />,
    { loggedInAs: adminUser },
  );
  const user = userEvent.setup();
  expect(await screen.findByText('1 done sending | 1 still pending | 0 failed')).toBeVisible();
  await user.upload(
    screen.getByLabelText('Import CSV or Excel (.xlsx)'),
    new File(['test'], 'candidates.csv', { type: 'text/csv' }),
  );
  expect(await screen.findByLabelText('Select imported row 2')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Add candidates from database' }));
  expect(await screen.findByRole('checkbox', { name: /Sam.*sam@example.com/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Send assessment invitations/ })).toBeDisabled();
  expect(vi.mocked(api.request).mock.calls.some(([config]) => config.method === 'post')).toBe(
    false,
  );
});

it('previews imported rows and allows database candidates before sending only the selected recipients', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({
    data: config.url.startsWith('/invites/candidates')
      ? { candidates: [{ id: 7, name: 'Sam', email: 'sam@example.com' }], hasMore: false }
      : config.url.includes('/status?')
        ? { messages: [] }
        : { count: 2, reused: false },
  }));
  renderWithProviders(
    <BulkAssessmentInvites assessment={{ id: 20, name: 'API assessment' }} onClose={vi.fn()} />,
    { loggedInAs: adminUser },
  );
  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText('Import CSV or Excel (.xlsx)'),
    new File(['test'], 'candidates.csv', { type: 'text/csv' }),
  );
  expect(await screen.findByText(/Invalid email/)).toBeVisible();
  expect(screen.getByLabelText('Candidate name column')).toHaveValue('2');
  expect(screen.getByLabelText('Candidate email column')).toHaveValue('0');
  expect(screen.getByRole('button', { name: /Send assessment invitations/ })).toBeDisabled();
  await user.click(screen.getByLabelText('Select imported row 2'));
  await user.click(screen.getByRole('button', { name: 'Add candidates from database' }));
  await user.click(await screen.findByLabelText('Sam · sam@example.com'));
  expect(vi.mocked(api.request).mock.calls.some(([config]) => config.method === 'post')).toBe(
    false,
  );
  await user.click(
    screen.getByRole('button', { name: 'Send assessment invitations to 2 candidates' }),
  );
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/invites/bulk-assessment',
        method: 'post',
        data: {
          assessmentId: 20,
          requestId: expect.any(String),
          recipients: [{ name: 'Maya', email: 'maya@example.com' }],
          candidateIds: [7],
        },
      }),
    ),
  );
  expect(await screen.findByText(/2 invitations queued/)).toBeVisible();
});
