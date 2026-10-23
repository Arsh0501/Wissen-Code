import { expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import CurrentQuestionSources from './CurrentQuestionSources';

it('adds a manual question before activating its persisted ID', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: { question: { questionId: 45 } } });
  renderWithProviders(<CurrentQuestionSources interviewId={20} questions={[]} plan={null} disabled={false} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add question manually' }));
  await user.type(screen.getByLabelText('Question title'), 'Caching');
  await user.type(screen.getByLabelText('Question prompt'), 'Explain cache invalidation.');
  await user.click(screen.getByRole('button', { name: 'Add and ask this question' }));
  await screen.findByText('Question selected and shared with the candidate.');
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interviews/20/questions', method: 'post', data: expect.objectContaining({ title: 'Caching', statement: 'Explain cache invalidation.' }) }));
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interviews/20/current-question', method: 'put', data: { questionId: 45 } }));
});

it('reuses an assigned planned question rather than creating a duplicate', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: { success: true } });
  const plan = { id: 1, jobRequirements: 'Build APIs', candidateExperience: '3 years', requiredSkills: ['Caching'], durationMinutes: 30, sections: [{ skill: 'Caching', minutes: 30, objective: 'Assess design', questions: ['Explain caching.'], followUps: [] }] };
  renderWithProviders(<CurrentQuestionSources interviewId={20} questions={[{ questionId: 8, question: { title: 'Caching discussion', statement: 'Explain caching.' } }]} plan={plan} disabled={false} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Take from interview plan' }));
  await user.selectOptions(screen.getByLabelText('Interview plan question'), '0');
  await user.click(screen.getByRole('button', { name: 'Ask this planned question' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interviews/20/current-question', data: { questionId: 8 } })));
  expect(vi.mocked(api.request).mock.calls.some(([config]) => config.method === 'post')).toBe(false);
});
