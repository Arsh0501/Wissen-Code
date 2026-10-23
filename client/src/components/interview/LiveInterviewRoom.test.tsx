import { it, expect, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import LiveInterviewRoom from './LiveInterviewRoom';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import type { InterviewLiveState } from '../../hooks/useInterviewLive';
vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    options,
  }: {
    value: string;
    options: { readOnly: boolean };
  }) => (
    <textarea
      aria-label="Candidate code"
      readOnly={options.readOnly}
      value={value}
    />
  ),
}));
it('shows a single feedback field for the current question and discards stale question snapshots', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({ data: config.url?.includes('ai-results') ? { configured: true, jobs: [], results: {} } : [] }));
  const first = { id: 1, title: 'Caching strategy', statement: 'Explain caching.', questionType: 'written', difficulty: 'easy', tags: '[]' };
  const second = { ...first, id: 2, title: 'Database strategy', statement: 'Explain indexing.' };
  const interview: any = { id: 20, candidateName: 'Candidate', candidateEmail: 'candidate@test.invalid', status: 'in_progress', startedAt: new Date().toISOString(), timeLimitMinutes: 30, currentQuestionId: 1, currentCode: '', currentLanguageId: 71, notes: [], questions: [
    { questionId: 1, question: first, notes: JSON.stringify({ interviewerFeedback: 'First question feedback' }) },
    { questionId: 2, question: second, notes: JSON.stringify({ interviewerFeedback: 'Second question feedback' }) },
  ] };
  const live = { socket: null, snapshot: { questionId: 1, question: first }, connection: 'connected', activity: 'idle', result: null, error: '', ai: { followUps: [], notes: [] }, updateDraft: vi.fn(), execute: vi.fn(), receiveAI: vi.fn(), reconnect: vi.fn() } as unknown as InterviewLiveState;
  const props = { interview, live, evaluations: [], onQuestion: vi.fn() };
  let updateSnapshot!: (snapshot: InterviewLiveState['snapshot']) => void;
  function TestRoom() {
    const [snapshot, setSnapshot] = useState(live.snapshot);
    updateSnapshot = setSnapshot;
    return <LiveInterviewRoom {...props} live={{ ...live, snapshot }} />;
  }
  renderWithProviders(<TestRoom />, { loggedInAs: adminUser });
  expect(screen.getAllByRole('textbox', { name: 'Your feedback for this question' })).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Your feedback for this question' })).toHaveValue('First question feedback');
  act(() => updateSnapshot({ questionId: 2, question: first as any }));
  expect(screen.getByRole('heading', { name: 'Database strategy' })).toBeVisible();
  expect(screen.getAllByRole('textbox', { name: 'Your feedback for this question' })).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Your feedback for this question' })).toHaveValue('Second question feedback');
  act(() => updateSnapshot({ questionId: 1, question: first as any }));
  expect(screen.getAllByRole('textbox', { name: 'Your feedback for this question' })).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Your feedback for this question' })).toHaveValue('First question feedback');
  act(() => updateSnapshot({ questionId: null, question: first as any }));
  expect(screen.queryByRole('textbox', { name: 'Your feedback for this question' })).not.toBeInTheDocument();
});
it('shows candidate code, timer and backend AI suggestions with ask/dismiss review controls', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({
    data: config.url?.includes('ai-results')
      ? { configured: true, jobs: [], results: {} }
      : config.url.includes('/follow-ups') ? [] : { success: true },
  }));
  const execute = vi.fn();
  const live: InterviewLiveState = {
    socket: null,
    updateDraft: vi.fn(),
    connection: 'connected',
    snapshot: {},
    activity: 'idle',
    result: null,
    error: '',
    execute,
    receiveAI: vi.fn(),
    reconnect: vi.fn(),
    ai: {
      followUps: [
        {
          id: 'f1',
          jobId: 'job-1',
          questionId: 1,
          context: 'Candidate mentioned useMemo.',
          question: 'When would useMemo make performance worse?',
        },
      ],
      notes: [],
    },
  };
  const interview = {
    id: 20,
    candidateName: 'Maya',
    candidateEmail: 'maya@example.test',
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    timeLimitMinutes: 30,
    currentQuestionId: 1,
    currentCode: 'const result = useMemo(compute, []);',
    currentLanguageId: 63,
    questions: [
      {
        questionId: 1,
        question: {
          id: 1,
          title: 'Memoization',
          statement: 'Explain caching',
          difficulty: 'easy',
          tags: '[]',
        },
      },
    ],
    notes: [],
  } as any;
  const user = userEvent.setup();
  renderWithProviders(
    <LiveInterviewRoom
      interview={interview}
      live={live}
      evaluations={[]}
      onQuestion={() => {}}
    />,
    { loggedInAs: adminUser },
  );
  expect(await screen.findByLabelText('Candidate code')).toHaveAttribute(
    'readonly',
  );
  expect(screen.getByRole('timer')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Run candidate code' }));
  expect(execute).toHaveBeenCalledWith('run', {
    code: interview.currentCode,
    languageId: 63,
    questionId: 1,
  });
  await user.click(screen.getByRole('button', { name: 'AI assistance' }));
  expect(screen.queryByRole('button', { name: 'Run candidate code' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await user.click(screen.getByRole('button', { name: 'Question & code' }));
  await waitFor(() =>
    expect(within(screen.getByRole('region', { name: 'Current question follow-ups' })).getByText('AI · Asked')).toBeVisible(),
  );
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/ai/jobs/job-1/review',
      method: 'post',
      data: { itemId: 'f1', decision: 'ask', content: undefined },
    }),
  );
});

it('displays the saved plan and keeps communication mounted when switching live sections', async () => {
  vi.mocked(api.request).mockImplementation(async config => ({
    data: config.url?.includes('ai-results')
      ? { configured: true, jobs: [], results: {} }
      : [],
  }));
  const live = {
    socket: null, snapshot: {}, connection: 'connected', activity: 'idle', result: null,
    error: '', ai: { followUps: [], notes: [] }, updateDraft: vi.fn(), execute: vi.fn(),
    receiveAI: vi.fn(), reconnect: vi.fn(),
  } as unknown as InterviewLiveState;
  const plan = {
    id: 7, jobRequirements: 'Build APIs', candidateExperience: '3 years',
    requiredSkills: ['Java'], durationMinutes: 30,
    sections: [{ skill: 'Java', minutes: 30, objective: 'Assess concurrency design', questions: ['How would you prevent a race condition?'], followUps: ['When would you use a lock?'] }],
  };
  const onOpenPlan = vi.fn();
  renderWithProviders(<LiveInterviewRoom
    interview={{ id: 20, candidateName: 'Candidate', candidateEmail: 'test@test.invalid', status: 'scheduled', timeLimitMinutes: 30, currentQuestionId: null, currentCode: '', currentLanguageId: 71, questions: [], notes: [] }}
    live={live} evaluations={[]} onQuestion={vi.fn()} plan={plan} onOpenPlan={onOpenPlan}
    communication={<div data-testid="communication">Persistent video session</div>}
  />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  const communication = screen.getByTestId('communication');
  expect(communication).not.toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Interview plan' }));
  expect(screen.getByRole('region', { name: 'Saved interview plan' })).toBeVisible();
  expect(screen.getByText('Assess concurrency design')).toBeVisible();
  expect(screen.queryByRole('combobox', { name: 'Current question' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open plan editor' }));
  expect(onOpenPlan).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Video, chat & board' }));
  expect(communication).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Saved interview plan' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Private notes' }));
  expect(screen.getByRole('textbox', { name: 'Private notes' })).toBeVisible();
  await user.type(screen.getByRole('textbox', { name: 'Private notes' }), 'Unsaved observation');
  await user.click(screen.getByRole('button', { name: 'Question & code' }));
  await user.click(screen.getByRole('button', { name: 'Private notes' }));
  expect(screen.getByRole('textbox', { name: 'Private notes' })).toHaveValue('Unsaved observation');
  expect(screen.getByTestId('communication')).toBe(communication);
});
