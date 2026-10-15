import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
      await screen.findByRole('button', { name: /sum integers/i }),
    );
    expect(
      screen.getByRole('button', { name: /approve into question bank/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /^validate$/i })).toBeEnabled();
    await user.type(screen.getByLabelText(/^title$/i), ' edited');
    expect(screen.getByRole('button', { name: /^validate$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save edits/i })).toBeEnabled();
  });
});
