import { it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
it('shows candidate code, timer and backend AI suggestions with ask/dismiss review controls', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({
    data: config.url.includes('ai-results')
      ? { configured: true, jobs: [], results: {} }
      : { success: true },
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
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  await waitFor(() =>
    expect(screen.getByText('Follow-ups to ask')).toBeInTheDocument(),
  );
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/ai/jobs/job-1/review',
      method: 'post',
      data: { itemId: 'f1', decision: 'ask', content: undefined },
    }),
  );
});
