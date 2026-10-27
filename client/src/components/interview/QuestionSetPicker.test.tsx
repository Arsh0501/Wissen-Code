import { it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import QuestionSetPicker from './QuestionSetPicker';

it('keeps selections across sets and imports them together without already assigned questions', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data:
      url === '/interview-question-sets'
        ? [
            { id: 1, title: 'Java', _count: { questions: 2 } },
            { id: 2, title: 'Databases', _count: { questions: 1 } },
          ]
        : url.endsWith('/1')
          ? {
              questions: [
                {
                  id: 11,
                  title: 'Explain Java locks',
                  statement: 'Explain locks.',
                  answer: 'Private answer',
                },
                { id: 12, title: 'Assigned question', statement: 'Already assigned.' },
              ],
            }
          : {
              questions: [
                { id: 21, title: 'Explain transactions', statement: 'Explain isolation.' },
              ],
            },
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { count: 2 } });
  const onAdded = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(<QuestionSetPicker interviewId={30} assignedIds={[12]} onAdded={onAdded} />, {
    loggedInAs: adminUser,
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Java (2)' }));
  expect(await screen.findByRole('checkbox', { name: /Assigned question/ })).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: 'Explain Java locks' }));
  await user.click(screen.getByRole('button', { name: 'Databases (1)' }));
  await user.click(await screen.findByRole('checkbox', { name: 'Explain transactions' }));
  expect(screen.getByText('Selected across sets: 2')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add selected to interview' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/interviews/30/import-set-questions', { itemIds: [11, 21] }),
  );
  await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
  get.mockRestore();
  post.mockRestore();
});

it('selects a whole set, reflects partial selection, and leaves other sets selected when cleared', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data:
      url === '/interview-question-sets'
        ? [
            { id: 1, title: 'Java', _count: { questions: 3 } },
            { id: 2, title: 'Databases', _count: { questions: 1 } },
          ]
        : url.endsWith('/1')
          ? {
              questions: [
                { id: 11, title: 'Locks', statement: 'Explain locks.' },
                { id: 12, title: 'Already assigned', statement: 'Assigned.' },
                { id: 13, title: 'Threads', statement: 'Explain threads.' },
              ],
            }
          : { questions: [{ id: 21, title: 'Transactions', statement: 'Explain transactions.' }] },
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { count: 3 } });
  renderWithProviders(
    <QuestionSetPicker
      interviewId={30}
      assignedIds={[12]}
      onAdded={vi.fn().mockResolvedValue(undefined)}
    />,
    { loggedInAs: adminUser },
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Databases (1)' }));
  await user.click(await screen.findByRole('checkbox', { name: 'Transactions' }));
  await user.click(screen.getByRole('button', { name: 'Java (3)' }));
  await user.click(
    await screen.findByRole('checkbox', { name: /Select all questions in this set/ }),
  );
  expect(screen.getByRole('checkbox', { name: 'Locks' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Threads' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Already assigned/ })).toBeDisabled();
  expect(screen.getByText('Selected across sets: 3')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Locks' }));
  expect(
    screen.getByRole('checkbox', { name: /Select all questions in this set/ }),
  ).toBePartiallyChecked();
  await user.click(screen.getByRole('checkbox', { name: /Select all questions in this set/ }));
  await user.click(screen.getByRole('checkbox', { name: /Select all questions in this set/ }));
  expect(screen.getByText('Selected across sets: 1')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: /Select all questions in this set/ }));
  await user.click(screen.getByRole('button', { name: 'Add selected to interview' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/interviews/30/import-set-questions', {
      itemIds: [11, 13, 21],
    }),
  );
  get.mockRestore();
  post.mockRestore();
});
