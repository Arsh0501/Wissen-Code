import { it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import QuestionFollowUps from './QuestionFollowUps';

it('generates and asks AI follow-ups scoped to the current question', async () => {
  vi.mocked(api.request).mockImplementation(async request => ({ data: request.url?.includes('ai-results')
    ? { configured: true, results: {}, jobs: [] }
    : request.url === '/ai/jobs' ? { status: 'completed' }
      : request.url?.endsWith('/review') ? { decision: 'ask' } : [] }));
  renderWithProviders(<QuestionFollowUps interviewId={20} questionId={7} status="in_progress" suggestions={[
    { id: 'job-0', jobId: 'job', questionId: 7, context: 'Probe concurrency', question: 'How would you prevent a race condition?' },
    { id: 'other-0', jobId: 'other', questionId: 8, context: 'Other question', question: 'WRONG_QUESTION_SUGGESTION' },
  ]} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask AI for follow-ups' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Ask AI for follow-ups' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/ai/jobs', method: 'post', data: { kind: 'interview-assistant', interviewId: 20, input: { questionId: 7 } } })));
  expect(screen.queryByText('WRONG_QUESTION_SUGGESTION')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  expect(await screen.findByText('AI · Asked')).toBeVisible();
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/ai/jobs/job/review', method: 'post', data: { itemId: 'job-0', decision: 'ask' } }));
});

it('adds a manual follow-up and can mark it asked without using AI', async () => {
  const items: { id: string; question: string; status: string }[] = [];
  vi.mocked(api.request).mockImplementation(async request => {
    if (request.url?.includes('ai-results')) return { data: { configured: false, results: {}, jobs: [] } };
    if (request.method === 'post') {
      const data = request.data as { requestId: string; question: string; askNow: boolean };
      const item = { id: data.requestId, question: data.question, status: data.askNow ? 'asked' : 'pending' };
      items.push(item);
      return { data: item };
    }
    if (request.method === 'put') { items[0].status = 'asked'; return { data: items[0] }; }
    return { data: [...items] };
  });
  renderWithProviders(<QuestionFollowUps interviewId={20} questionId={7} status="in_progress" suggestions={[]} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Ask follow-up' }));
  await user.type(screen.getByLabelText('Manual follow-up'), 'What changes if there are two writers?');
  await user.click(screen.getByRole('button', { name: 'Add follow-up' }));
  expect(await screen.findByText('Manual · Pending')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  expect(await screen.findByText('Manual · Asked')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Ask follow-up' }));
  await user.type(screen.getByLabelText('Manual follow-up'), 'What about three writers?');
  await user.click(screen.getByRole('button', { name: 'Ask now' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'post', data: expect.objectContaining({ question: 'What about three writers?', askNow: true }) })));
  expect(vi.mocked(api.request).mock.calls.some(([request]) => request.url === '/ai/jobs')).toBe(false);
});

it('disables additions and asking after the interview ends', async () => {
  vi.mocked(api.request).mockImplementation(async request => ({ data: request.url?.includes('ai-results') ? { configured: true, results: {}, jobs: [] } : [] }));
  renderWithProviders(<QuestionFollowUps interviewId={20} questionId={7} status="completed" suggestions={[
    { id: 'job-0', jobId: 'job', questionId: 7, context: '', question: 'Follow-up?' },
  ]} />, { loggedInAs: adminUser });
  expect(screen.getByRole('button', { name: 'Ask follow-up' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Ask AI for follow-ups' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
});
