import { it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import QuestionFollowUps from './QuestionFollowUps';

it('sets an asked follow-up as current subquestion, supports another follow-up and returns to the main question', async () => {
  let current: { id: string; question: string } | null = null;
  vi.mocked(api.request).mockImplementation(async request => {
    if (request.url?.endsWith('/current')) {
      if (request.method === 'delete') current = null;
      return { data: current };
    }
    if (request.url?.endsWith('/review')) {
      const { itemId } = request.data as { itemId: string };
      current = { id: itemId, question: itemId === 'first' ? 'Explain cache invalidation' : 'What about concurrent writes?' };
      return { data: { decision: 'ask' } };
    }
    return { data: request.url?.includes('ai-results') ? { configured: true, jobs: [], results: {} } : request.url === '/ai/jobs' ? { status: 'queued' } : [] };
  });
  renderWithProviders(<QuestionFollowUps interviewId={20} questionId={7} status="in_progress" suggestions={[
    { id: 'first', jobId: 'job', questionId: 7, context: '', question: 'Explain cache invalidation' },
    { id: 'second', jobId: 'job', questionId: 7, context: '', question: 'What about concurrent writes?' },
  ]} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  const first = screen.getByText('Explain cache invalidation').closest('article')!;
  await user.click(within(first).getByRole('button', { name: 'Ask' }));
  expect(await screen.findByRole('generic', { name: 'Current subquestion' })).toHaveTextContent('Explain cache invalidation');
  await user.click(screen.getByRole('button', { name: 'Ask AI for follow-ups' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/ai/jobs', data: { kind: 'interview-assistant', interviewId: 20, input: { questionId: 7 } } })));
  await user.click(within(screen.getByText('What about concurrent writes?').closest('article')!).getByRole('button', { name: 'Ask' }));
  await waitFor(() => expect(screen.getByRole('generic', { name: 'Current subquestion' })).toHaveTextContent('What about concurrent writes?'));
  await user.click(screen.getByRole('button', { name: 'Return to main question' }));
  await waitFor(() => expect(screen.queryByRole('generic', { name: 'Current subquestion' })).not.toBeInTheDocument());
});

it('removes dismissed follow-ups and keeps previously dismissed items hidden', async () => {
  vi.mocked(api.request).mockImplementation(async request => ({ data: request.url?.includes('ai-results')
    ? { configured: true, results: {}, jobs: [] }
    : request.url?.endsWith('/review') ? { decision: 'dismiss' }
      : [{ id: 'manual-dismissed', question: 'Dismissed manual question', status: 'dismissed' }] }));
  renderWithProviders(<QuestionFollowUps interviewId={20} questionId={7} status="in_progress" suggestions={[
    { id: 'pending', jobId: 'job', questionId: 7, context: '', question: 'Remove this suggestion' },
    { id: 'dismissed', jobId: 'old', questionId: 7, context: '', question: 'Previously dismissed suggestion', status: 'dismissed' },
    { id: 'asked', jobId: 'asked', questionId: 7, context: '', question: 'Keep asked question', status: 'asked' },
  ]} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  expect(screen.queryByText('Previously dismissed suggestion')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  await waitFor(() => expect(screen.queryByText('Remove this suggestion')).not.toBeInTheDocument());
  expect(screen.queryByText('Dismissed manual question')).not.toBeInTheDocument();
  expect(screen.queryByText('AI · Dismissed')).not.toBeInTheDocument();
  expect(screen.getByText('Keep asked question')).toBeVisible();
});

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
