import { useState } from 'react';
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionPicker from './QuestionPicker';
import { Question } from '../../types';
export const questions: Question[] = [
  {
    id: 1,
    title: 'Array sum',
    statement: 'Add all array elements',
    difficulty: 'easy',
    questionType: 'coding',
    tags: '["arrays","Python"]',
    timeLimit: 2,
    memoryLimit: 256000,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 2,
    title: 'Fix React cache',
    statement: 'Debug memoization dependencies',
    difficulty: 'hard',
    questionType: 'debugging',
    tags: '["React"]',
    timeLimit: 2,
    memoryLimit: 256000,
    createdAt: '',
    updatedAt: '',
  },
];
it('filters by type, selects only visible questions, preserves hidden selections and reorders', async () => {
  function Form() {
    const [ids, setIds] = useState<number[]>([]);
    return (
      <>
        <QuestionPicker
          questions={questions}
          selectedIds={ids}
          onChange={setIds}
        />
        <output>{JSON.stringify(ids)}</output>
      </>
    );
  }
  const user = userEvent.setup();
  render(<Form />);
  await user.selectOptions(
    screen.getByLabelText('Question type filter'),
    'debugging',
  );
  expect(screen.queryByLabelText('Select Array sum')).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('Select all visible'));
  expect(screen.getByRole('status')).toHaveTextContent('[2]');
  await user.selectOptions(screen.getByLabelText('Question type filter'), '');
  await user.click(screen.getByLabelText('Select Array sum'));
  expect(screen.getByRole('status')).toHaveTextContent('[2,1]');
  await user.click(screen.getByLabelText('Move question 2 up'));
  expect(screen.getByRole('status')).toHaveTextContent('[1,2]');
  await user.click(screen.getByLabelText('Remove Array sum'));
  expect(screen.getByRole('status')).toHaveTextContent('[2]');
});
it('searches tags and shows a filter empty state', async () => {
  const user = userEvent.setup();
  render(
    <QuestionPicker
      questions={questions}
      selectedIds={[]}
      onChange={() => {}}
    />,
  );
  await user.type(screen.getByLabelText('Search questions'), 'Python');
  expect(screen.getByLabelText('Select Array sum')).toBeInTheDocument();
  expect(
    screen.queryByLabelText('Select Fix React cache'),
  ).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('Search questions'));
  await user.type(screen.getByLabelText('Search questions'), 'no match');
  expect(
    screen.getByText('No questions match these filters.'),
  ).toBeInTheDocument();
});
