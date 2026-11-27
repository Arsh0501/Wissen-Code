import { expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import QuestionForm from './QuestionForm';
vi.mock('../../components/editor/CodeEditor', () => ({ default: () => <div>Code editor</div> }));

it('shows themed errors, highlights invalid fields and focuses the first one without browser alerts', async () => {
  const create = vi.spyOn(api, 'createQuestion');
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  renderWithProviders(<QuestionForm />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Save Question' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Please correct the highlighted fields');
  expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Question (Markdown supported)')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(screen.getByLabelText('Title')).toHaveFocus();
  expect(create).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Title'), 'Valid title');
  await user.type(screen.getByLabelText('Question (Markdown supported)'), 'Valid question');
  await user.clear(screen.getAllByRole('spinbutton')[0]);
  await user.type(screen.getAllByRole('spinbutton')[0], '0');
  await user.click(screen.getByRole('button', { name: 'Save Question' }));
  expect(screen.getByRole('alert')).toHaveTextContent('CPU time must be between');
  expect(screen.getAllByRole('spinbutton')[0]).toHaveAttribute('aria-invalid', 'true');
  expect(create).not.toHaveBeenCalled();
});

it('offers a type toggle, hides coding fields for MCQs and saves options with an answer key', async () => {
  const create = vi.spyOn(api, 'createQuestion').mockResolvedValue({ id: 20 } as any);
  renderWithProviders(<QuestionForm />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  expect(screen.queryByRole('option', { name: 'Debugging' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'MCQ' }));
  expect(screen.queryByRole('button', { name: /Test Cases/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Starter Code' })).not.toBeInTheDocument();
  expect(screen.queryByText('Difficulty')).not.toBeInTheDocument();
  expect(screen.queryByText('Tags (comma-separated)')).not.toBeInTheDocument();
  expect(screen.queryByText('Memory Limit (KB)')).not.toBeInTheDocument();
  const firstInput = screen.getAllByRole('textbox')[0];
  expect(firstInput).toHaveAccessibleName('Title');
  await user.type(screen.getByLabelText('Title'), 'MCQ example');
  await user.type(
    screen.getByPlaceholderText('Type a question...'),
    'Which option is correct?',
  );
  await user.click(screen.getByRole('button', { name: 'Save Question' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Add at least two non-empty options');
  expect(create).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Choice 1'), 'First option');
  await user.type(screen.getByLabelText('Choice 2'), 'Second option');
  await user.click(screen.getByLabelText('Correct choice 2'));
  await user.click(screen.getByRole('button', { name: 'Save Question' }));
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        questionType: 'mcq',
        starterCodes: [],
        testCases: [],
        settings: expect.objectContaining({
          correctOptionIds: ['b'],
          options: [
            { id: 'a', text: 'First option' },
            { id: 'b', text: 'Second option' },
          ],
        }),
      }),
    ),
  );
});
