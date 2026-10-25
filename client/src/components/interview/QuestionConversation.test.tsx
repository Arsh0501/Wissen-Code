import { expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import QuestionConversation from './QuestionConversation';

it('appends new speech to the active chat turn while preserving interviewer corrections', async () => {
  const segments = [{ id: 'one', text: 'We used readings.' }];
  vi.mocked(api.request).mockImplementation(async () => ({ data: {
    revision: 1, turns: [{ id: 'main', question: 'Explain caching.', transcript: '', segmentIds: [] }], segments: [...segments], suggestions: [], feedback: '',
  } }));
  let client!: QueryClient;
  function Harness() { client = useQueryClient(); return <QuestionConversation interviewId={20} questionId={7} active />; }
  renderWithProviders(<Harness />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  const editor = await screen.findByRole('textbox', { name: 'Live transcript for this question' });
  await waitFor(() => expect(editor).toHaveValue('We used readings.'));
  await user.clear(editor); await user.type(editor, 'We used Redis.');
  segments.push({ id: 'two', text: 'It caches sessions.' });
  await act(async () => { await client.invalidateQueries({ queryKey: ['question-conversation', 20, 7] }); });
  await waitFor(() => expect(editor).toHaveValue('We used Redis.\nIt caches sessions.'));
});

it('advances a question chat with fresh transcripts, clears unused suggestions, and edits AI feedback at the end', async () => {
  const state: any = { revision: 0, turns: [], suggestions: [], segments: [], feedback: '' };
  vi.mocked(api.request).mockImplementation(async request => {
    if (request.method === 'post') {
      const input: any = request.data;
      state.revision++;
      if (input.action === 'start') state.turns.push({ id: 'main', question: 'Explain caching.', transcript: '', segmentIds: [] });
      if (['send', 'save', 'feedback'].includes(input.action)) state.turns[state.turns.length - 1].transcript = input.text;
      if (input.action === 'send') state.suggestions = [
        { id: 'one', question: state.turns.length === 1 ? 'How do you invalidate it?' : 'What if writes fail?', context: 'Probe consistency' },
        { id: 'two', question: 'Unused suggestion', context: '' },
      ];
      if (input.action === 'ask') {
        state.turns.push({ id: 'follow', question: state.suggestions.find((item: any) => item.id === input.suggestionId).question, transcript: '', segmentIds: [] });
        state.suggestions = [];
        state.segments = [];
      }
      if (input.action === 'feedback') return { data: { feedback: 'AI feedback covering the whole conversation.' } };
      if (input.action === 'save-feedback') state.feedback = input.text;
    }
    return { data: JSON.parse(JSON.stringify(state)) };
  });
  renderWithProviders(<QuestionConversation interviewId={20} questionId={7} active controls={<button>Start transcription</button>} />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Ask main question' }));
  const firstEditor = await screen.findByRole('textbox', { name: 'Live transcript for this question' });
  const expand = screen.getByRole('button', { name: 'Expand question' });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  await user.click(expand);
  expect(screen.getByRole('button', { name: 'Collapse question' })).toHaveAttribute('aria-expanded', 'true');
  await user.click(screen.getByRole('button', { name: 'Collapse question' }));
  expect(screen.getByRole('button', { name: 'Expand question' })).toHaveAttribute('aria-expanded', 'false');
  await user.type(firstEditor, 'We use Redis.');
  await user.click(screen.getByRole('button', { name: 'Send transcript & suggest follow-ups' }));
  await screen.findByText('Unused suggestion');
  await user.type(firstEditor, ' With a TTL.');
  await user.click(within(screen.getByText('How do you invalidate it?').closest('article')!).getByRole('button', { name: 'Ask' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Live transcript for this question' })).toHaveValue(''));
  expect(screen.queryByText('Unused suggestion')).not.toBeInTheDocument();
  expect(screen.getByText('We use Redis. With a TTL.')).toBeVisible();
  expect(screen.getByText('How do you invalidate it?')).toBeVisible();
  await user.type(screen.getByRole('textbox', { name: 'Live transcript for this question' }), 'Writes invalidate cache entries.');
  await user.click(screen.getByRole('button', { name: 'Send transcript & suggest follow-ups' }));
  await screen.findByText('What if writes fail?');
  await user.click(screen.getByRole('button', { name: 'Ask AI for feedback' }));
  const feedback = screen.getByRole('textbox', { name: 'Your feedback for this question' });
  await waitFor(() => expect(feedback).toHaveValue('AI feedback covering the whole conversation.'));
  expect(state.feedback).toBe('');
  await user.clear(feedback);
  await user.type(feedback, 'Interviewer reviewed feedback.');
  await user.click(screen.getByRole('button', { name: 'Save question feedback' }));
  await screen.findByText('Question feedback saved.');
  expect(state.feedback).toBe('Interviewer reviewed feedback.');
  const lastSend: any = vi.mocked(api.request).mock.calls.map(([request]) => request).filter(request => (request.data as any)?.action === 'send').pop();
  expect(lastSend.data).toMatchObject({ turnId: 'follow', text: 'Writes invalidate cache entries.' });
});
