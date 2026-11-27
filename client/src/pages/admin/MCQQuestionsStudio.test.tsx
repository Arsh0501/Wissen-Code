import { expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import MCQQuestionsStudio from './MCQQuestionsStudio';
import { renderWithProviders, adminUser } from '../../test/test-utils';
it('retains MCQ batch approval using saved revisions and removes approved questions from the queue', async () => {
  const content = {
    questionType: 'mcq',
    difficulty: 'easy',
    topics: ['SQL'],
    requiredSkills: [],
    title: 'MCQ one',
    statement: 'Choose the correct option in this example.',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    correctOptionId: 'a',
    solutionExplanation: '',
  };
  let drafts: any[] = [
    { id: 20, revision: 2, status: 'draft', content },
    { id: 21, revision: 3, status: 'draft', content: { ...content, title: 'MCQ two' } },
  ];
  const approved: number[] = [];
  vi.mocked(api.request).mockImplementation(async (config: any) => {
    if (config.url === '/ai/status') return { data: { configured: true, canVerify: true } };
    if (config.url === '/ai/drafts') return { data: drafts };
    const match = config.url.match(/\/ai\/drafts\/(\d+)\/approve/);
    if (match) {
      const id = Number(match[1]),
        d = drafts.find((d) => d.id === id);
      expect(config.data).toEqual({ revision: d.revision, directApprove: true });
      approved.push(id);
      drafts = drafts.filter((d) => d.id !== id);
      return { data: { ...d, status: 'approved' } };
    }
    throw new Error(config.url);
  });
  const user = userEvent.setup();
  renderWithProviders(<MCQQuestionsStudio />, { loggedInAs: adminUser });
  await user.click(await screen.findByLabelText('Select MCQ MCQ one'));
  await user.click(screen.getByLabelText('Select MCQ MCQ two'));
  await user.click(screen.getByRole('button', { name: 'Approve selected MCQs (2)' }));
  await waitFor(() => expect(approved).toEqual([20, 21]));
  expect(await screen.findByText('Approved 2 MCQ(s).')).toBeInTheDocument();
  expect(screen.queryByLabelText('Select MCQ MCQ one')).not.toBeInTheDocument();
});
