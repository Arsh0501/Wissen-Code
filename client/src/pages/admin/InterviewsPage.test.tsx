import { it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import api, * as services from '../../services/api';
import InterviewsPage from './InterviewsPage';
import { renderWithProviders, adminUser } from '../../test/test-utils';
it('selects an existing candidate and question before creating, starting and entering the live room', async () => {
  const user = userEvent.setup();
  vi.spyOn(services, 'getQuestions').mockResolvedValue([
    {
      id: 1,
      title: 'Array sum',
      statement: 'Read and sum an array',
      difficulty: 'easy',
      questionType: 'coding',
      tags: '["arrays"]',
    },
  ] as any);
  vi.spyOn(services, 'getAssessments').mockResolvedValue([]);
  vi.mocked(api.request).mockImplementation(async (config: any) => ({
    data:
      config.url === '/interviews' && config.method === 'get'
        ? [
            {
              id: 7,
              title: 'Earlier interview',
              candidateName: 'Maya',
              candidateEmail: 'maya@example.test',
              status: 'completed',
              timeLimitMinutes: 30,
            },
          ]
        : config.url === '/interviews'
          ? { interview: { id: 8 } }
          : { success: true },
  }));
  renderWithProviders(
    <Routes>
      <Route path="/" element={<InterviewsPage />} />
      <Route path="/admin/interviews/:id" element={<p>Live workspace</p>} />
    </Routes>,
    { loggedInAs: adminUser },
  );
  await user.click(screen.getByRole('button', { name: 'Create Interview' }));
  await user.type(
    screen.getByLabelText('Interview title'),
    'Frontend Interview',
  );
  await user.click(
    screen.getByRole('button', { name: 'Next: Select Candidate' }),
  );
  await user.click(
    await screen.findByRole('button', { name: /Maya maya@example.test/i }),
  );
  expect(screen.getByLabelText('Candidate email')).toHaveValue(
    'maya@example.test',
  );
  await user.click(
    screen.getByRole('button', { name: 'Next: Select Questions' }),
  );
  await user.click(await screen.findByLabelText('Select Array sum'));
  await user.click(
    screen.getByRole('button', { name: 'Next: Start Interview' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Start Interview & enter live room' }),
  );
  expect(await screen.findByText('Live workspace')).toBeInTheDocument();
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/interviews/8/start', method: 'post' }),
  );
});
