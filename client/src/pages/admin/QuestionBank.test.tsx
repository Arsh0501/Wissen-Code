import { beforeEach, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
    questionType: 'debugging',
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
it('bulk-selects visible bank questions and saves an ordered draft assessment selection', async () => {
  const user = userEvent.setup();
  renderWithProviders(<QuestionBank />, { loggedInAs: adminUser });
  await screen.findByLabelText('Select Array sum');
  await user.selectOptions(screen.getByLabelText('Question type'), 'debugging');
  await user.click(screen.getByLabelText('Select all visible questions'));
  await user.selectOptions(screen.getByLabelText('Draft assessment'), '10');
  await user.click(
    await screen.findByRole('button', { name: 'Add selected questions' }),
  );
  expect(screen.getByText('Assessment questions (1)')).toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Save assessment selection' }),
  );
  await waitFor(() =>
    expect(services.updateAssessment).toHaveBeenCalledWith(10, {
      questions: [{ questionId: 2, marks: 30 }],
      questionCount: 1,
    }),
  );
});
