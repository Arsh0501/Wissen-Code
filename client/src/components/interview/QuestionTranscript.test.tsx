import { expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import QuestionTranscript from './QuestionTranscript';

it('appends live speech without losing corrections and saves reviewed text before requesting follow-ups', async () => {
  const segments = [{ id: 'one', text: 'We used readings.', startedAt: new Date().toISOString() }];
  vi.mocked(api.request).mockImplementation(async (config: any) => ({ data:
    config.url.includes('ai-results') ? { configured: true, jobs: [] } :
      config.method === 'get' ? { segments: [...segments], evidence: null } : { status: 'queued' },
  }));
  let client!: QueryClient;
  function Harness() {
    client = useQueryClient();
    return <QuestionTranscript interviewId={20} questionId={7} active live />;
  }
  renderWithProviders(<Harness />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  const editor = await screen.findByRole('textbox', { name: 'Live transcript for this question' });
  await waitFor(() => expect(editor).toHaveValue('We used readings.'));
  await user.clear(editor);
  await user.type(editor, 'We used Redis.');
  segments.push({ id: 'two', text: 'It caches sessions.', startedAt: new Date().toISOString() });
  await act(async () => { await client.invalidateQueries({ queryKey: ['question-transcript', 20, 7] }); });
  await waitFor(() => expect(editor).toHaveValue('We used Redis.\nIt caches sessions.'));
  await user.click(screen.getByRole('button', { name: 'Suggest follow-ups from transcript' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/ai/jobs', method: 'post', data: { kind: 'interview-assistant', interviewId: 20, input: { questionId: 7 } } })));
  const calls = vi.mocked(api.request).mock.calls.map(([config]) => config);
  const saveIndex = calls.findIndex(config => config.method === 'put');
  expect(calls[saveIndex]).toMatchObject({ url: '/interviews/20/questions/7/transcript', data: { segmentIds: ['one', 'two'], text: 'We used Redis.\nIt caches sessions.' } });
  expect(saveIndex).toBeLessThan(calls.findIndex(config => config.url === '/ai/jobs'));
  expect(editor).toHaveValue('We used Redis.\nIt caches sessions.');
});

it('saves only selected segments with corrected text before generating question-scoped follow-ups', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({ data:
    config.url.includes('ai-results') ? { configured: true, jobs: [], results: {} } :
    config.method === 'get' ? { segments: [{ id: 'one', text: 'We used readings.', startedAt: new Date().toISOString() }, { id: 'two', text: 'Unrelated detail.', startedAt: new Date().toISOString() }], evidence: null } :
    config.url === '/ai/jobs' ? { status: 'queued' } : { status: 200 },
  }));
  renderWithProviders(<QuestionTranscript interviewId={20} questionId={7} active />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Use transcript for this question' }));
  const generate = await screen.findByRole('button', { name: 'Generate follow-ups from selected transcript' });
  expect(generate).toBeDisabled();
  const checkboxes = await screen.findAllByRole('checkbox');
  await user.click(checkboxes[0]);
  const editor = screen.getByRole('textbox', { name: 'Reviewed transcript for this question' });
  expect(editor).toHaveValue('We used readings.');
  await user.clear(editor); await user.type(editor, 'We used Redis.');
  await user.click(generate);
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/ai/jobs', method: 'post', data: { kind: 'interview-assistant', interviewId: 20, input: { questionId: 7 } } })));
  const calls = vi.mocked(api.request).mock.calls.map(([config]) => config);
  const saveIndex = calls.findIndex(config => config.method === 'put');
  const generateIndex = calls.findIndex(config => config.url === '/ai/jobs');
  expect(saveIndex).toBeLessThan(generateIndex);
  expect(calls[saveIndex]).toMatchObject({ url: '/interviews/20/questions/7/transcript', data: { segmentIds: ['one'], text: 'We used Redis.' } });
  expect(editor).toHaveValue('We used Redis.');
});

it('does not generate follow-ups when saving transcript evidence fails', async () => {
  vi.mocked(api.request).mockImplementation(async (config: any) => {
    if (config.method === 'put') throw new Error('Question changed');
    return { data: config.url.includes('ai-results') ? { configured: true, jobs: [] } : { segments: [{ id: 'one', text: 'Answer', startedAt: new Date().toISOString() }], evidence: null } };
  });
  renderWithProviders(<QuestionTranscript interviewId={20} questionId={7} active />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Use transcript for this question' }));
  await user.click(await screen.findByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Generate follow-ups from selected transcript' }));
  await screen.findByRole('alert');
  expect(vi.mocked(api.request).mock.calls.some(([config]) => config.url === '/ai/jobs')).toBe(false);
});
