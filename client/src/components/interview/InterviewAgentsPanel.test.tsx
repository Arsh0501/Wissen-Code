import { it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import InterviewAgentsPanel from './InterviewAgentsPanel';

it('shows agent results and timeline after completion and enables the final report only then', async () => {
  vi.mocked(api.request).mockResolvedValue({
    data: {
      configured: true,
      jobs: [],
      results: {
        followUps: [],
        notes: [
          {
            id: 'notes-technicalNotes-0',
            jobId: 'notes',
            content: 'Explained Python parsing',
            status: 'pending',
          },
        ],
        timeline: [{ eventId: 7, description: 'Candidate explained the input parser' }],
        evaluation: {
          skills: [
            {
              skill: 'Python',
              observation: 'Strong (medium confidence)',
              evidence: ['answer: Used int(input())'],
            },
          ],
          codingObservations: [],
          areasToProbe: [],
          summary: 'Explained parsing clearly',
        },
      },
    },
  });
  renderWithProviders(<InterviewAgentsPanel id={20} status="completed" />, {
    loggedInAs: adminUser,
  });
  expect(await screen.findByText(/Event #7: Candidate explained/)).toBeInTheDocument();
  expect(screen.getByText('Strong (medium confidence)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Generate interview report' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Suggest follow-ups' })).toBeDisabled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Accept notes' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/ai/jobs/notes/review',
        data: {
          itemId: 'notes-technicalNotes-0',
          decision: 'accept',
          content: 'Explained Python parsing',
        },
      }),
    ),
  );
});

it('keeps interview agents disabled before the interview starts', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: { configured: true, jobs: [], results: {} } });
  renderWithProviders(<InterviewAgentsPanel id={21} status="scheduled" />, {
    loggedInAs: adminUser,
  });
  await screen.findByText(/AI suggestions and notes will appear here/);
  await waitFor(() => expect(api.request).toHaveBeenCalled());
  for (const name of ['Suggest follow-ups', 'Generate notes', 'Generate interview report'])
    expect(screen.getByRole('button', { name })).toBeDisabled();
});
