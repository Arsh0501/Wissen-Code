import { it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import api, * as services from '../../services/api';
import InterviewsPage from './InterviewsPage';
import { renderWithProviders, adminUser } from '../../test/test-utils';
it('fills assessment candidate email and clears it when the next candidate has none', async () => {
  const user = userEvent.setup();
  vi.spyOn(services, 'getAssessments').mockResolvedValue([
    { id: 3, name: 'Frontend assessment' },
  ] as any);
  vi.mocked(api.request).mockImplementation(async (config: any) => ({
    data:
      config.url === '/users/interviewers'
        ? [{ id: 2, name: 'Interviewer', email: 'interviewer@example.test', role: 'interviewer' }]
        : config.url === '/assessments/3/candidates'
          ? {
              candidates: [
                { name: 'Maya', email: 'maya@example.test', candidateUserId: 10 },
                { name: 'Guest', email: null },
              ],
            }
          : [],
  }));
  renderWithProviders(<InterviewsPage />, { loggedInAs: adminUser });
  await user.click(screen.getByRole('button', { name: 'Create Interview' }));
  await user.type(screen.getByLabelText('Interview title'), 'Frontend Interview');
  await user.selectOptions(await screen.findByLabelText(/Assigned Interviewer/), '2');
  await user.click(screen.getByRole('button', { name: 'Next: Select Candidate' }));
  await screen.findByRole('option', { name: 'Frontend assessment' });
  await user.selectOptions(screen.getByLabelText('Candidates from an assessment'), '3');
  await user.click(await screen.findByRole('button', { name: 'Maya' }));
  expect(screen.getByLabelText('Candidate name')).toHaveValue('Maya');
  expect(screen.getByLabelText('Candidate email')).toHaveValue('maya@example.test');
  await user.click(screen.getByRole('button', { name: 'Guest' }));
  expect(screen.getByLabelText('Candidate name')).toHaveValue('Guest');
  expect(screen.getByLabelText('Candidate email')).toHaveValue('');
  await user.type(screen.getByLabelText('Candidate email'), 'guest@example.test');
  expect(screen.getByLabelText('Candidate email')).toHaveValue('guest@example.test');
});

it('lets admins select a candidate and schedule without selecting questions or starting', async () => {
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
      config.url === '/users/interviewers'
        ? [
            {
              id: 2,
              name: 'Assigned Interviewer',
              email: 'interviewer@example.test',
              role: 'interviewer',
            },
          ]
        : config.url === '/interviews' && config.method === 'get'
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
  expect(screen.queryByText('Select Questions')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /start interview/i })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Interview title'), 'Frontend Interview');
  await user.selectOptions(screen.getByLabelText(/Assigned Interviewer/), '2');
  await user.click(screen.getByRole('button', { name: 'Next: Select Candidate' }));
  await user.click(await screen.findByRole('button', { name: /Maya maya@example.test/i }));
  expect(screen.getByLabelText('Candidate email')).toHaveValue('maya@example.test');
  await user.upload(
    screen.getByLabelText(/Browse Resume File/),
    new File(['%PDF-1.4\nresume\n%%EOF'], 'candidate-resume.pdf', { type: 'application/pdf' }),
  );
  await user.click(screen.getByRole('button', { name: 'Next: Review & Schedule' }));
  expect(screen.queryByRole('button', { name: /start interview/i })).not.toBeInTheDocument();
  expect(await screen.findByText('PDF attached')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save scheduled interview' }));
  expect(await screen.findByText('Live workspace')).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalledWith(
    expect.objectContaining({ url: '/interviews/8/start', method: 'post' }),
  );
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/interviews',
      method: 'post',
      data: expect.objectContaining({
        questionIds: [],
        interviewerId: 2,
        candidateResumeUrl: expect.stringMatching(/^data:application\/pdf;base64,/),
      }),
    }),
  );
});
