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

it('keeps the final feedback popup closed when ending the interview fails', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => {
    if (config.url === '/interviews/20/end') throw new Error('Could not end interview');
    return { data: config.url === '/interviews/20' ? {
      id: 20, title: 'Active interview', candidateName: 'Candidate', candidateEmail: 'candidate@test.invalid', status: 'in_progress', timeLimitMinutes: 45,
      currentQuestionId: null, questions: [], submissions: [], notes: [],
    } : [] };
  });
  renderWithProviders(<Routes><Route path="/admin/interviews/:id" element={<InterviewWorkspace />} /></Routes>, {
    initialEntries: ['/admin/interviews/20?tab=live'], loggedInAs: { ...adminUser, accessRole: 'interviewer' } as typeof adminUser,
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'End interview' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not end interview');
  expect(screen.queryByRole('dialog', { name: 'Interview ended' })).not.toBeInTheDocument();
});

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
  expect(await screen.findByRole('dialog', { name: 'Interview ended' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Submit final feedback' })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('Overall rating'), '4');
  await user.selectOptions(screen.getByLabelText('Recommendation'), 'Hire');
  await user.type(screen.getByRole('textbox', { name: 'Final interview feedback' }), 'Explained concurrency clearly.');
  await user.click(screen.getByRole('button', { name: 'Submit final feedback' }));
  expect(await screen.findByText('Feedback saved successfully.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Interview ended' })).not.toBeInTheDocument();
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interviews/20/feedback', method: 'post', data: expect.objectContaining({
    finalRating: 4, finalRecommendation: 'Hire', finalFeedback: 'Explained concurrency clearly.', revision: 0,
    criteria: [
      { key: 'communication_confidence', label: 'Communication / confidence', rating: 4, feedback: 'Communication / confidence observed with evidence.' },
      { key: 'fundamentals', label: 'Fundamentals', rating: 4, feedback: 'Fundamentals observed with evidence.' },
      { key: 'role_alignment', label: 'Role alignment', rating: 4, feedback: 'Role alignment observed with evidence.' },
    ],
  }) }));
});


it('shows only asked follow-ups in questions and moves skill controls into feedback', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({ data: config.url === '/interviews/20' ? {
    id: 20, title: 'Interview', candidateName: 'Candidate', candidateEmail: 'candidate@test.invalid', status: 'in_progress', timeLimitMinutes: 45,
    currentQuestionId: 3, currentCode: '', questions: [{ questionId: 3, candidateAnswer: 'Answer', question: { id: 3, title: 'Concurrency', statement: 'Explain locking' }, notes: JSON.stringify({ conversation: { turns: [{ question: 'Explain locking' }, { question: 'Why optimistic locking?' }] } }) }], submissions: [], notes: [],
  } : config.url.endsWith('/follow-ups') ? [{ id: 'asked', question: 'How do you retry?', status: 'asked' }, { id: 'pending', question: 'Unasked suggestion', status: 'pending' }] : [] }));
  renderWithProviders(<Routes><Route path="/admin/interviews/:id" element={<InterviewWorkspace />} /></Routes>, {
    initialEntries: ['/admin/interviews/20?tab=evaluation'], loggedInAs: { ...adminUser, accessRole: 'interviewer' } as typeof adminUser,
  });
  expect(await screen.findByText('Why optimistic locking?')).toBeVisible();
  expect(await screen.findByText('How do you retry?')).toBeVisible();
  expect(screen.queryByText('Unasked suggestion')).not.toBeInTheDocument();
  expect(screen.queryByText('Candidate answer')).not.toBeInTheDocument();
  expect(screen.queryByText('Execution results')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Get AI observations' })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Feedback' }));
  expect(await screen.findByText('Evaluation by skill')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Get AI observations' })).toBeVisible();
  expect(screen.queryByText('Candidate code')).not.toBeInTheDocument();
});
