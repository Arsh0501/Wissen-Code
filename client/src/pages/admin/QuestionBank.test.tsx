import { beforeEach, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as services from '../../services/api';
import QuestionBank from './QuestionBank';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import { Question } from '../../types';
const questions: Question[] = [
  {
    id: 1,
    title: 'Array sum',
    statement: 'Add all array elements',
    difficulty: 'easy',
    questionType: 'coding',
    tags: '["arrays"]',
    timeLimit: 2,
    memoryLimit: 256000,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 2,
    title: 'Fix cache',
    statement: 'Find and repair memoization bugs',
    difficulty: 'hard',
    questionType: 'mcq',
    tags: '["React"]',
    timeLimit: 2,
    memoryLimit: 256000,
    createdAt: '',
    updatedAt: '',
  },
];
beforeEach(() => {
  vi.spyOn(services, 'getQuestions').mockResolvedValue(questions);
  vi.spyOn(services, 'getAssessments').mockResolvedValue([
    { id: 10, name: 'Draft test', status: 'draft' },
  ] as any);
  vi.spyOn(services, 'getAssessment').mockResolvedValue({
    id: 10,
    name: 'Draft test',
    status: 'draft',
    updatedAt: 'stable',
    questions: [],
    questionCount: 1,
  } as any);
  vi.spyOn(services, 'updateAssessment').mockResolvedValue({ id: 10 } as any);
});
it('opens the preview outside the page layout and restores scrolling when closed', async () => {
  vi.spyOn(services, 'getQuestion').mockResolvedValue(questions[0]);
  const user = userEvent.setup();
  renderWithProviders(<QuestionBank />, { loggedInAs: adminUser });
  await user.click(await screen.findByRole('button', { name: 'Array sum' }));
  const dialog = await screen.findByRole('dialog', { name: 'Question preview' });
  expect(dialog.parentElement?.parentElement).toBe(document.body);
  expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Select question' })).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Question preview' })).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('');
});
it('filters questions without assessment controls or selection checkboxes', async () => {
  const user = userEvent.setup();
  renderWithProviders(<QuestionBank />, { loggedInAs: adminUser });
  await screen.findByRole('button', { name: 'Array sum' });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByText('Add questions to an assessment')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Draft assessment')).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Question type'), 'mcq');
  expect(screen.getByRole('button', { name: 'Fix cache' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Array sum' })).not.toBeInTheDocument();
  expect(screen.getByText('1 questions shown')).toBeVisible();
});
