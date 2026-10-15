import { beforeEach, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import * as services from '../../services/api';
import AssessmentView from './AssessmentView';
import { renderWithProviders, candidateUser } from '../../test/test-utils';
vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Code editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock('../../hooks/useTabSwitchDetection', () => ({
  useTabSwitchDetection: () => {},
}));
const question = {
  id: 1,
  title: 'Sum numbers',
  statement: 'Read integers and add them.',
  difficulty: 'easy',
  tags: '[]',
  starterCodes: [{ languageId: 71, languageName: 'Python', code: 'print(1)' }],
  testCases: [],
};
const assessment = {
  id: 1,
  name: 'Candidate test',
  description: 'A sample coding test',
  instructions: 'Read carefully before starting.',
  questions: [{ id: 1, questionId: 1, marks: 10, question }],
  timeLimitMinutes: 1,
  passingScore: 50,
  allowedLanguages: '[71]',
  showResults: true,
};
const session = {
  sessionId: 10,
  startedAt: new Date().toISOString(),
  remainingSeconds: 60,
  isFinished: false,
  drafts: [],
  tabSwitchCount: 0,
  tabSwitchLimit: 3,
};
function renderExam() {
  return renderWithProviders(
    <Routes>
      <Route path="/exam/:assessmentId" element={<AssessmentView />} />
    </Routes>,
    { loggedInAs: candidateUser, initialEntries: ['/exam/1'] },
  );
}
beforeEach(() => {
  vi.spyOn(services, 'getAssessment').mockResolvedValue(assessment as any);
  vi.spyOn(services, 'getSessionStatus').mockResolvedValue({ exists: false });
  vi.spyOn(services, 'startSession').mockResolvedValue(session as any);
  vi.spyOn(services, 'saveAllDrafts').mockResolvedValue(undefined);
  vi.spyOn(services, 'saveDraft').mockResolvedValue(undefined);
  vi.spyOn(services, 'finishSession').mockResolvedValue({});
});
it('shows instructions, starts only on click and does not claim success after a submission failure', async () => {
  const user = userEvent.setup();
  renderExam();
  expect(
    await screen.findByText('Read carefully before starting.'),
  ).toBeInTheDocument();
  expect(services.startSession).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Start Assessment' }));
  await screen.findByLabelText('Code editor');
  await user.click(screen.getByRole('button', { name: 'Submit Test' }));
  vi.mocked(services.saveAllDrafts).mockRejectedValueOnce({
    response: { data: { error: 'Network interrupted' } },
  });
  await user.click(
    screen.getByRole('button', {
      name: /confirm.*submit|submit.*assessment|confirm submission/i,
    }),
  );
  expect(
    await screen.findByText('Submission not confirmed'),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('Your assessment submission has been confirmed.'),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry submission' }));
  expect(await screen.findByText('Assessment Submitted')).toBeInTheDocument();
});
it('renders an explicit expired assessment state', async () => {
  vi.mocked(services.getAssessment).mockRejectedValue({
    response: {
      status: 403,
      data: { availability: 'closed', error: 'This assessment has closed' },
    },
  });
  renderExam();
  expect(await screen.findByText('Assessment expired')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Start Assessment' }),
  ).not.toBeInTheDocument();
});
it('renders an empty assessment without starting a session', async () => {
  vi.mocked(services.getAssessment).mockResolvedValue({
    ...assessment,
    questions: [],
  } as any);
  renderExam();
  expect(await screen.findByText('No questions available')).toBeInTheDocument();
  expect(services.startSession).not.toHaveBeenCalled();
});
it('keeps counting down and auto-submits while reviewing answers', async () => {
  vi.mocked(services.getSessionStatus).mockResolvedValue({
    ...session,
    exists: true,
    remainingSeconds: 2,
  } as any);
  const user = userEvent.setup();
  renderExam();
  await screen.findByLabelText('Code editor');
  await user.click(screen.getByRole('button', { name: 'Submit Test' }));
  await waitFor(() => expect(services.finishSession).toHaveBeenCalledWith(10), {
    timeout: 4000,
  });
  expect(await screen.findByText('Assessment Submitted')).toBeInTheDocument();
});

it('shows the completed state when resuming a finished attempt', async () => {
  vi.mocked(services.getSessionStatus).mockResolvedValue({
    ...session,
    exists: true,
    isFinished: true,
    remainingSeconds: 0,
  } as any);
  renderExam();
  expect(await screen.findByText('Assessment completed')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Start Assessment' }),
  ).not.toBeInTheDocument();
});
