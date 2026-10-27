import { expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import CurrentQuestionSources from './CurrentQuestionSources';

it('adds a manual question before activating its persisted ID', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: { question: { questionId: 45 } } });
  renderWithProviders(<CurrentQuestionSources interviewId={20} questions={[]} disabled={false} />, {
    loggedInAs: adminUser,
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add question manually' }));
  await user.type(screen.getByLabelText('Question title'), 'Caching');
  await user.type(screen.getByLabelText('Question prompt'), 'Explain cache invalidation.');
  await user.click(screen.getByRole('button', { name: 'Add and ask this question' }));
  await screen.findByText('Question selected and shared with the candidate.');
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/interviews/20/questions',
      method: 'post',
      data: expect.objectContaining({ title: 'Caching', statement: 'Explain cache invalidation.' }),
    }),
  );
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/interviews/20/current-question',
      method: 'put',
      data: { questionId: 45 },
    }),
  );
});
