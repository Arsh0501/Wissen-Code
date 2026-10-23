import { it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import QuestionPreparation from './QuestionPreparation';

it('allows question addition, editing and removal during an ongoing interview', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: { id: 20, title: 'Live interview', status: 'in_progress', candidateName: 'Candidate', questions: [{ questionId: 4, question: { id: 4, title: 'Current question', statement: 'Explain your approach.', difficulty: 'easy', tags: '[]' } }] } });
  const originalDelete = api.delete;
  const remove = vi.fn().mockResolvedValue({ data: { success: true } });
  api.delete = remove;
  renderWithProviders(<QuestionPreparation interviewId={20} onClose={vi.fn()} onViewResume={vi.fn()} />, { loggedInAs: adminUser });
  expect(await screen.findByRole('button', { name: 'Add question' })).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit question' }));
  expect(screen.getByLabelText('Question title')).toHaveValue('Current question');
  await user.click(screen.getByRole('button', { name: 'Update question' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interviews/20/questions/4', method: 'put' })));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove question' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Remove question' }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith('/interviews/20/questions/4'));
  api.delete = originalDelete;
});

it('shows only the selected preparation section and preserves question-set selections', async () => {
  vi.mocked(api.request).mockImplementation(async config => ({ data: config.url === '/questions' ? [] : {
    id: 20, title: 'Live interview', status: 'in_progress', candidateName: 'Candidate',
    candidateResume: 'Resume text for this candidate',
    questions: [{ questionId: 4, question: { id: 4, title: 'Current question', statement: 'Explain your approach.', difficulty: 'easy', tags: '[]' } }],
  } }));
  vi.mocked(api.get).mockImplementation(async url => ({ data: url === '/interview-question-sets'
    ? [{ id: 1, title: 'Java', _count: { questions: 1 } }]
    : url === '/interview-question-sets/1'
      ? { questions: [{ id: 11, title: 'Locks', statement: 'Explain locks.' }] }
      : { user: adminUser } }));
  const onViewResume = vi.fn();
  renderWithProviders(<QuestionPreparation interviewId={20} onClose={vi.fn()} onViewResume={onViewResume} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  expect(await screen.findByRole('region', { name: 'Current interview questions' })).toBeVisible();
  expect(screen.queryByLabelText('Question title')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Select questions' }));
  expect(await screen.findByRole('region', { name: 'Question bank' })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Current interview questions' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Question sets' }));
  expect(screen.queryByRole('region', { name: 'Question bank' })).not.toBeInTheDocument();
  await user.click(await screen.findByRole('button', { name: 'Java (1)' }));
  await user.click(await screen.findByRole('checkbox', { name: 'Locks' }));
  await user.click(screen.getByRole('button', { name: 'View resume' }));
  expect(screen.getByRole('region', { name: 'Resume preview' })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Question sets' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open full window' }));
  expect(onViewResume).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Generate from resume' }));
  expect(screen.getByRole('region', { name: 'Generate resume questions' })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Resume preview' })).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Select questions' }));
  expect(screen.getByRole('checkbox', { name: 'Locks' })).toBeChecked();
});
