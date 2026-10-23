import { it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import InterviewWorkspace from './InterviewWorkspace';

vi.mock('../../hooks/useInterviewLive', () => ({ useInterviewLive: () => ({ snapshot: {}, socket: null, connection: 'connected', ai: { followUps: [], notes: [] } }) }));
vi.mock('../../components/interview/LiveInterviewRoom', () => ({ default: ({ communication, plan }: { communication: React.ReactNode; plan?: { sections: { objective: string }[] } }) => <><p>Candidate real-time code controls</p>{communication}{plan?.sections.map((section, index) => <p key={index}>{section.objective}</p>)}</> }));
vi.mock('../../components/interview/RoomTools', () => ({ default: () => <p>Video and microphone controls</p> }));

it('Join Live Room opens interviewer controls for an older admin/interviewer session', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({ data: config.url === '/interviews/20' ? {
    id: 20, title: 'Active interview', candidateName: 'Candidate', candidateEmail: 'candidate@test.invalid', status: 'in_progress', timeLimitMinutes: 45,
    currentQuestionId: null, questions: [], submissions: [], notes: [],
  } : config.url.endsWith('/plan') ? null : [] }));
  renderWithProviders(<Routes><Route path="/admin/interviews/:id" element={<InterviewWorkspace />} /></Routes>, {
    initialEntries: ['/admin/interviews/20?tab=live'], loggedInAs: { ...adminUser, accessRole: 'interviewer' } as typeof adminUser,
  });
  expect(await screen.findByText('Candidate real-time code controls')).toBeVisible();
  expect(screen.getByText('Video and microphone controls')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Prepare questions' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'End interview' })).toBeEnabled();
});

it('allows plan generation before starting and passes the persisted plan into the live room', async () => {
  let savedPlan: any = null;
  vi.mocked(api.request).mockImplementation(async (config: any) => {
    if (config.url.endsWith('/plan/generate')) {
      savedPlan = { ...config.data, id: 9, sections: [{ skill: 'Java', minutes: 45, objective: 'Saved pre-interview plan', questions: ['Explain locking.'], followUps: [] }] };
      return { data: savedPlan };
    }
    return { data: config.url === '/interviews/20' ? {
      id: 20, title: 'Scheduled interview', candidateName: 'Candidate', candidateEmail: 'candidate@test.invalid', status: 'scheduled', timeLimitMinutes: 45,
      currentQuestionId: null, questions: [], submissions: [], notes: [],
    } : config.url.endsWith('/plan') ? savedPlan : [] };
  });
  renderWithProviders(<Routes><Route path="/admin/interviews/:id" element={<InterviewWorkspace />} /></Routes>, {
    initialEntries: ['/admin/interviews/20?tab=plan'], loggedInAs: { ...adminUser, accessRole: 'interviewer' } as typeof adminUser,
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Job requirements'), 'Build Java services');
  await user.type(screen.getByLabelText('Candidate experience'), '3 years');
  const selectedQuestions = screen.getByRole('checkbox', { name: /Use questions selected for this interview/ });
  expect(selectedQuestions).not.toBeChecked();
  await user.click(selectedQuestions);
  await user.click(screen.getByRole('button', { name: 'Generate interview plan' }));
  await screen.findByDisplayValue('Saved pre-interview plan');
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interview-workflows/20/plan/generate', method: 'post', data: expect.objectContaining({ includeSelectedQuestions: true }) }));
  expect(vi.mocked(api.request).mock.calls.some(([request]) => request.url === '/interviews/20/start')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Live room' }));
  expect(await screen.findByText('Saved pre-interview plan')).toBeVisible();
});

it('shows the submit-feedback option only after ending succeeds and submits final feedback', async () => {
  let status = 'in_progress';
  vi.mocked(api.request).mockImplementation(async (config: any) => {
    if (config.url === '/interviews/20/end') { status = 'completed'; return { data: { success: true } }; }
    return { data: config.url === '/interviews/20' ? {
      id: 20, title: 'Active interview', candidateName: 'Candidate', candidateEmail: 'candidate@test.invalid', status, timeLimitMinutes: 45,
      currentQuestionId: null, questions: [], submissions: [], notes: [],
    } : config.url.endsWith('/plan') ? null : [] };
  });
  renderWithProviders(<Routes><Route path="/admin/interviews/:id" element={<InterviewWorkspace />} /></Routes>, {
    initialEntries: ['/admin/interviews/20?tab=live'], loggedInAs: { ...adminUser, accessRole: 'interviewer' } as typeof adminUser,
  });
  const user = userEvent.setup();
  const end = await screen.findByRole('button', { name: 'End interview' });
  expect(screen.queryByRole('button', { name: 'Submit feedback' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Feedback' }));
  for (const criterion of ['Communication / confidence', 'Fundamentals', 'Role alignment']) {
    await user.selectOptions(screen.getByLabelText(`${criterion} rating`), '4');
    await user.type(screen.getByLabelText(`${criterion} feedback`), `${criterion} observed with evidence.`);
  }
  await user.click(screen.getByRole('button', { name: 'Live room' }));
  await user.click(end);
  await user.click(await screen.findByRole('button', { name: 'Submit feedback' }));
  expect(screen.getByRole('button', { name: 'Submit final feedback' })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('Overall rating'), '4');
  await user.selectOptions(screen.getByLabelText('Recommendation'), 'Hire');
  await user.type(screen.getByRole('textbox', { name: 'Final interview feedback' }), 'Explained concurrency clearly.');
  await user.click(screen.getByRole('button', { name: 'Submit final feedback' }));
  expect(await screen.findByText('Feedback saved successfully.')).toBeInTheDocument();
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interviews/20/feedback', method: 'post', data: expect.objectContaining({
    finalRating: 4, finalRecommendation: 'Hire', finalFeedback: 'Explained concurrency clearly.', revision: 0,
    criteria: [
      { key: 'communication_confidence', label: 'Communication / confidence', rating: 4, feedback: 'Communication / confidence observed with evidence.' },
      { key: 'fundamentals', label: 'Fundamentals', rating: 4, feedback: 'Fundamentals observed with evidence.' },
      { key: 'role_alignment', label: 'Role alignment', rating: 4, feedback: 'Role alignment observed with evidence.' },
    ],
  }) }));
});
