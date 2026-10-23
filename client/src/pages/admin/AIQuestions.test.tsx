import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import AIQuestions from './AIQuestions';
import { renderWithProviders, adminUser } from '../../test/test-utils';

const content = {
  title: 'Sum integers',
  statement: 'Read two integers and print their sum.',
  difficulty: 'easy',
  questionType: 'coding',
  topics: ['arrays'],
  requiredSkills: ['Python'],
  testCases: [
    { input: '1 2', expectedOutput: '3', isSample: true },
    { input: '-1 1', expectedOutput: '0', isSample: false },
  ],
  starterCodePython: '',
  expectedSolutionPython: 'a,b=map(int,input().split()); print(a+b)',
  solutionExplanation: 'Add both parsed integers.',
};
function mockDraft(status: string, configured = true) {
  vi.mocked(api.request).mockImplementation(async (config: any) => ({
    data:
      config.url === '/ai/status'
        ? { configured, canVerify: true }
        : [
            {
              id: 1,
              content,
              revision: 1,
              status,
              validation: null,
              validatedRevision: null,
              questionId: null,
              approvedAt: null,
              approvedBy: null,
            },
          ],
  }));
}
describe('AI question approval workflow', () => {
  it('generates questions without a required skills parameter', async () => {
    const user = userEvent.setup();
    mockDraft('draft');
    renderWithProviders(<AIQuestions />, { loggedInAs: adminUser });
    const generate = await screen.findByRole('button', { name: /^generate$/i });
    await user.type(screen.getByLabelText(/^topic$/i), 'Arrays');
    expect(screen.queryByLabelText(/required skills/i)).not.toBeInTheDocument();
    await user.click(generate);
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/ai/generate',
      data: expect.objectContaining({ topic: 'Arrays' }),
    }));
    const request = vi.mocked(api.request).mock.calls.find(([config]) => config.url === '/ai/generate')?.[0];
    expect(request?.data).not.toHaveProperty('requiredSkills');
    await user.click(await screen.findByRole('button', { name: /^sum integers/i }));
    expect(screen.queryByLabelText(/required skills/i)).not.toBeInTheDocument();
  });
  it('disables generation when AI is unconfigured', async () => {
    mockDraft('draft', false);
    renderWithProviders(<AIQuestions />, { loggedInAs: adminUser });
    expect(
      await screen.findByText(/requires a Groq or OpenAI API key/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^generate$/i })).toBeDisabled();
  });
  it('blocks approval before validation and blocks validation while edits are unsaved', async () => {
    const user = userEvent.setup();
    mockDraft('draft');
    renderWithProviders(<AIQuestions />, { loggedInAs: adminUser });
    await user.click(
      await screen.findByRole('button', { name: /^sum integers/i }),
    );
    expect(
      screen.getByRole('button', { name: /approve into question bank/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /^validate$/i })).toBeEnabled();
    await user.type(screen.getByLabelText(/^title$/i), ' edited');
    expect(screen.getByRole('button', { name: /^validate$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save edits/i })).toBeEnabled();
  });
  it('deletes an unapproved queued draft and refreshes the list', async () => {
    const draft = { id: 1, content, revision: 1, status: 'draft' };
    let removed = false;
    vi.mocked(api.request).mockImplementation(async (config: any) => {
      if (config.method === 'delete') { removed = true; return { data: { success: true } }; }
      return { data: config.url === '/ai/status' ? { configured: true, canVerify: true } : removed ? [] : [draft] };
    });
    renderWithProviders(<AIQuestions />, { loggedInAs: adminUser });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Delete draft Sum integers' }));
    expect(await screen.findByText('Generate questions to begin.')).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/ai/drafts/1', method: 'delete', data: { revision: 1 } }));
  });
  it('retries the original generation request with the same ID and settings', async () => {
    const requests: any[] = [];
    const draft = { id: 1, content, revision: 1, status: 'draft' };
    vi.mocked(api.request).mockImplementation(async (config: any) => {
      if (config.url === '/ai/generate') {
        requests.push(config.data);
        if (requests.length === 1) throw Object.assign(new Error('Generation failed'), { response: { status: 502, data: { error: 'Generation failed' } } });
        return { data: [draft] };
      }
      return { data: config.url === '/ai/status' ? { configured: true, canVerify: true } : [draft] };
    });
    renderWithProviders(<AIQuestions />, { loggedInAs: adminUser });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^topic$/i), 'Arrays');
    await user.click(await screen.findByRole('button', { name: /^generate$/i }));
    const retry = await screen.findByRole('button', { name: 'Retry generation' });
    await user.type(screen.getByLabelText(/^topic$/i), ' changed');
    await user.click(retry);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry generation' })).not.toBeInTheDocument());
  });
  it('keeps unsaved editor changes and offers retry when saving fails', async () => {
    let current = { id: 1, content, revision: 1, status: 'draft' };
    const saves: any[] = [];
    vi.mocked(api.request).mockImplementation(async (config: any) => {
      if (config.method === 'put') {
        saves.push(config.data);
        if (saves.length === 1) throw Object.assign(new Error('Save failed'), { response: { status: 500, data: { error: 'Save failed' } } });
        current = { ...current, content: config.data.content, revision: 2 };
        return { data: current };
      }
      return { data: config.url === '/ai/status' ? { configured: true, canVerify: true } : [current] };
    });
    renderWithProviders(<AIQuestions />, { loggedInAs: adminUser });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^sum integers/i }));
    await user.type(screen.getByLabelText(/^title$/i), ' edited');
    await user.click(screen.getByRole('button', { name: 'Save edits' }));
    expect(await screen.findByRole('button', { name: 'Retry save' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^title$/i)).toHaveValue('Sum integers edited');
    await user.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]).toEqual(saves[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled());
    expect(screen.getByLabelText(/^title$/i)).toHaveValue('Sum integers edited');
  });
});
