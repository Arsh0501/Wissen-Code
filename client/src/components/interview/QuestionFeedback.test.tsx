import { expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import QuestionFeedback from './QuestionFeedback';
import InterviewAIControls from './InterviewAIControls';

it('saves interviewer feedback against the selected question and keeps it editable', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: { feedback: 'Candidate missed deadlocks.' } });
  renderWithProviders(
    <QuestionFeedback
      interviewId={20}
      questionId={7}
      notes='{"interviewerFeedback":"Discussed locking."}'
      active
    />,
    { loggedInAs: adminUser },
  );
  const user = userEvent.setup();
  const editor = screen.getByRole('textbox', { name: 'Your feedback for this question' });
  expect(editor).toHaveValue('Discussed locking.');
  await user.clear(editor);
  await user.type(editor, 'Candidate missed deadlocks.');
  await user.click(screen.getByRole('button', { name: 'Save question feedback' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/interviews/20/questions/7/feedback',
        method: 'put',
        data: { feedback: 'Candidate missed deadlocks.' },
      }),
    ),
  );
  expect(await screen.findByText('Question feedback saved.')).toBeInTheDocument();
});

it('sends selected question ID when requesting follow-ups', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: { configured: true, jobs: [], results: {} } });
  renderWithProviders(
    <InterviewAIControls id={20} questionId={7} status="in_progress" onResults={vi.fn()} />,
    { loggedInAs: adminUser },
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Suggest follow-ups' })).toBeEnabled(),
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Suggest follow-ups' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/ai/jobs',
        data: { kind: 'interview-assistant', interviewId: 20, input: { questionId: 7 } },
      }),
    ),
  );
});
