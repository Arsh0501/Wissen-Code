import { it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import InterviewQuestionSets from './InterviewQuestionSets';

it('reviews generated drafts and saves only included questions with the chosen answer settings', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data:
      url === '/interview-question-sets'
        ? []
        : url === '/health'
          ? { judgeMode: 'live' }
          : { user: adminUser },
  }));
  const questions = [
    {
      title: 'Explain locks',
      statement: 'Describe locking strategies.',
      answer: 'Compare pessimistic and optimistic locks.',
      source: 'ai',
    },
    {
      title: 'Explain isolation',
      statement: 'Describe isolation.',
      answer: 'Discuss isolation levels.',
      source: 'ai',
    },
  ];
  vi.mocked(api.post).mockImplementation(async (url, body: any) => ({
    data: url.endsWith('generate-preview') ? { questions } : { ...body, id: 44, revision: 1 },
  }));
  renderWithProviders(<InterviewQuestionSets />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Create question set' }));
  await user.type(screen.getByLabelText('Set title'), 'Concurrency set');
  await user.type(screen.getByLabelText('Topics'), 'Java concurrency');
  await user.type(
    screen.getByLabelText('Question description (optional)'),
    'Scenario-based questions for senior developers',
  );
  await user.selectOptions(screen.getByLabelText('Answer detail'), 'detailed');
  await user.click(screen.getByRole('button', { name: 'Generate review drafts' }));
  await screen.findByText('Review generated questions');
  expect(api.post).toHaveBeenCalledWith(
    '/interview-question-sets/generate-preview',
    {
      topics: 'Java concurrency',
      description: 'Scenario-based questions for senior developers',
      count: 3,
      includeAnswers: true,
      answerDetail: 'detailed',
    },
    { timeout: 600000 },
  );
  expect(
    vi.mocked(api.post).mock.calls.filter(([url]) => url === '/interview-question-sets'),
  ).toHaveLength(0);
  await user.click(screen.getAllByLabelText('Include this draft')[1]);
  await user.clear(screen.getAllByLabelText('Question')[1]);
  await user.click(screen.getByRole('button', { name: 'Add selected to set (1)' }));
  expect(screen.getByText('Set questions (1)')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save question set' }));
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      '/interview-question-sets',
      expect.objectContaining({ title: 'Concurrency set', questions: [questions[0]] }),
    ),
  );
  expect(await screen.findByText('Question set saved.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create question set' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Search question sets' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Set title')).not.toBeInTheDocument();
});

it('uses an in-app discard dialog and preserves edits when cancelled', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data:
      url === '/interview-question-sets'
        ? []
        : url === '/health'
          ? { judgeMode: 'live' }
          : { user: adminUser },
  }));
  const browserConfirm = vi.spyOn(window, 'confirm');
  renderWithProviders(<InterviewQuestionSets />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Create question set' }));
  await user.type(screen.getByLabelText('Set title'), 'Unsaved set');
  await user.click(screen.getByRole('button', { name: 'Back to sets' }));
  expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Set title')).toHaveValue('Unsaved set');
  await user.click(screen.getByRole('button', { name: 'Back to sets' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Back to sets' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Back to sets' }));
  await user.click(screen.getByRole('button', { name: 'Discard and go back' }));
  expect(screen.getByRole('textbox', { name: 'Search question sets' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Set title')).not.toBeInTheDocument();
  expect(browserConfirm).not.toHaveBeenCalled();
  browserConfirm.mockRestore();
});

it('returns immediately for an unchanged set and keeps the editor open if saving fails', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data:
      url === '/interview-question-sets'
        ? []
        : url === '/health'
          ? { judgeMode: 'live' }
          : { user: adminUser },
  }));
  vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'Save failed. Retry.' } } });
  renderWithProviders(<InterviewQuestionSets />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Create question set' }));
  await user.click(screen.getByRole('button', { name: 'Back to sets' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Create question set' }));
  await user.type(screen.getByLabelText('Set title'), 'Keep after failure');
  await user.click(screen.getByRole('button', { name: 'Save question set' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Save failed. Retry.');
  expect(screen.getByLabelText('Set title')).toHaveValue('Keep after failure');
});
