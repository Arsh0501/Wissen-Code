import { it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import InterviewAIControls from './InterviewAIControls';
it('queues backend assistance and polls job status instead of claiming immediate results', async () => {
  let queued = false;
  vi.mocked(api.request).mockImplementation(async (config: any) => {
    if (config.url === '/ai/jobs') {
      queued = true;
      return { data: { id: 'job-1', status: 'queued' } };
    }
    return {
      data: {
        configured: true,
        results: { followUps: [], notes: [] },
        jobs: queued
          ? [
              {
                id: 'job-1',
                kind: 'interview-assistant',
                status: 'queued',
                error: null,
              },
            ]
          : [],
      },
    };
  });
  const onResults = vi.fn();
  renderWithProviders(<InterviewAIControls id={20} status="in_progress" onResults={onResults} />, {
    loggedInAs: adminUser,
  });
  const button = screen.getByRole('button', { name: 'Suggest follow-ups' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.setup().click(button);
  await screen.findByText('AI work is queued or running. Results will appear here.');
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/ai/jobs',
      method: 'post',
      data: { kind: 'interview-assistant', interviewId: 20, input: {} },
    }),
  );
  expect(button).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Generate interview report' })).toBeDisabled();
});
