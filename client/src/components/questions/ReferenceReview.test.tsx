import { expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import api from '../../services/api';
import ReferenceReview from './ReferenceReview';
import type { QuestionDraft } from '../../services/workflows';
const draft = {
  id: 5,
  revision: 1,
  referenceVerified: false,
  content: {
    questionType: 'coding',
    testCases: Array.from({ length: 10 }, (_, i) => ({
      input: String(i),
      expectedOutput: String(i),
      isSample: i < 2,
    })),
  },
} as QuestionDraft;
it('verifies all saved input/output pairs without a confirmation form', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: {} });
  const user = userEvent.setup();
  renderWithProviders(<ReferenceReview draft={draft} dirty={false} disabled={false} />, {
    loggedInAs: adminUser,
  });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByText('Review confirmation')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Verify solution against test cases' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/ai/drafts/5/verify-reference',
        data: { revision: 1, mode: 'generated' },
      }),
    ),
  );
});
it('blocks missing generated outputs so old drafts cannot bypass verification', () => {
  renderWithProviders(
    <ReferenceReview
      draft={{
        ...draft,
        content: {
          ...draft.content,
          testCases: [{ input: '0', expectedOutput: '', isSample: true }],
        } as QuestionDraft['content'],
      }}
      dirty={false}
      disabled={false}
    />,
    { loggedInAs: adminUser },
  );
  expect(screen.getByRole('button', { name: 'Verify solution against test cases' })).toBeDisabled();
  expect(screen.getByText(/Generate inputs and expected outputs/)).toBeInTheDocument();
});
it('blocks execution until edits are saved', () => {
  renderWithProviders(<ReferenceReview draft={draft} dirty disabled={false} />, {
    loggedInAs: adminUser,
  });
  expect(screen.getByRole('button', { name: 'Verify solution against test cases' })).toBeDisabled();
});
it('shows case failures from the server without claiming success', async () => {
  vi.mocked(api.request).mockRejectedValue(new Error('Test cases 2 failed'));
  renderWithProviders(<ReferenceReview draft={draft} dirty={false} disabled={false} />, {
    loggedInAs: adminUser,
  });
  await userEvent.click(screen.getByRole('button', { name: 'Verify solution against test cases' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Test cases 2 failed'));
  expect(screen.queryByText('10 test cases passed')).not.toBeInTheDocument();
});
it('shows saved success and keeps case details collapsed until opened', async () => {
  renderWithProviders(
    <ReferenceReview
      draft={{ ...draft, referenceVerified: true }}
      dirty={false}
      disabled={false}
    />,
    { loggedInAs: adminUser },
  );
  expect(screen.getByText('10 test cases passed')).toBeInTheDocument();
  const summary = screen.getByText('Test 1').closest('summary')!;
  expect(summary.parentElement).not.toHaveAttribute('open');
  await userEvent.click(summary);
  expect(summary.parentElement).toHaveAttribute('open');
});

it('shows actual and expected output for failed verification and allows correcting a test', async () => {
  const user = userEvent.setup();
  const onDirtyChange = vi.fn();
  vi.mocked(api.request).mockRejectedValue({
    response: {
      data: {
        error: 'Test cases 1 failed',
        revision: 1,
        executions: [
          {
            index: 0,
            passed: false,
            status: 'Output mismatch',
            expectedOutput: '0',
            actualOutput: '99',
            details: 'Diagnostic text',
          },
        ],
      },
    },
  });
  renderWithProviders(
    <ReferenceReview draft={draft} dirty={false} disabled={false} onDirtyChange={onDirtyChange} />,
    { loggedInAs: adminUser },
  );
  await user.click(screen.getByRole('button', { name: 'Verify solution against test cases' }));
  await waitFor(() => expect(screen.getByText('99')).toBeVisible());
  expect(screen.getByText('Actual output')).toBeVisible();
  expect(screen.getByLabelText('Expected output 1')).toHaveValue('0');
  expect(screen.getByText('Diagnostic text')).toBeVisible();
  await user.clear(screen.getByLabelText('Expected output 1'));
  await user.type(screen.getByLabelText('Expected output 1'), '42');
  expect(screen.queryByText('99')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Verify solution against test cases' })).toBeDisabled();
  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
});
it('adds a manual case and saves inputs, outputs, and visibility with the revision', async () => {
  const user = userEvent.setup();
  vi.mocked(api.request).mockResolvedValue({ data: {} });
  const editStarter = vi.fn();
  renderWithProviders(
    <ReferenceReview draft={draft} dirty={false} disabled={false} onEditStarter={editStarter} />,
    { loggedInAs: adminUser },
  );
  await user.click(screen.getByRole('button', { name: 'Edit starter code' }));
  expect(editStarter).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Add test case' }));
  await user.type(screen.getByLabelText('Input 11'), '10');
  await user.type(screen.getByLabelText('Expected output 11'), '10');
  expect(screen.getByRole('button', { name: 'Edit starter code' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Save test cases' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/ai/coding/5',
        method: 'put',
        data: expect.objectContaining({
          revision: 1,
          stage: 'tests',
          data: expect.arrayContaining([
            expect.objectContaining({ input: '10', expectedOutput: '10', isSample: false }),
          ]),
        }),
      }),
    ),
  );
});
