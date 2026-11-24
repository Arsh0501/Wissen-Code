import { beforeEach, expect, it, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import AssessmentManager from './AssessmentManager';

vi.mock('../../components/assessments/BulkAssessmentInvites', () => ({
  default: ({ assessment, onClose }: any) => (
    <div role="dialog" aria-label="Bulk invitations">
      <p>{assessment.name}</p>
      <button onClick={onClose}>Close invitations</button>
    </div>
  ),
}));
vi.mock('../../components/assessments/ShareLinksModal', () => ({
  default: ({ assessment, onClose }: any) => (
    <div role="dialog" aria-label="Share assessment">
      <p>{assessment.name}</p>
      <button onClick={onClose}>Close sharing</button>
    </div>
  ),
}));
const assessment = {
  id: 12,
  name: 'Demo assessment',
  status: 'published',
  availability: 'open',
  description: '',
  createdAt: '2026-11-23T12:00:00Z',
  allowedLanguages: '[]',
  questions: [],
  _count: { questions: 2 },
  timeLimitMinutes: 30,
  passingScore: 60,
  showResults: true,
};
beforeEach(() => {
  vi.spyOn(api, 'getAssessments').mockResolvedValue([assessment] as any);
});

it('shows only the summary on the card and all available actions in its dialog', async () => {
  renderWithProviders(<AssessmentManager />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  const card = await screen.findByRole('button', { name: 'Open actions for Demo assessment' });
  expect(screen.queryByRole('button', { name: 'Results' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  await user.click(card);
  const dialog = screen.getByRole('dialog', { name: 'Demo assessment' });
  for (const name of [
    'Results',
    'Share link',
    'Bulk invite candidates',
    'Edit',
    'Duplicate',
    'Unpublish',
    'Archive',
    'Delete',
  ]) {
    expect(within(dialog).getByRole('button', { name })).toBeEnabled();
  }
  expect(document.body.style.overflow).toBe('hidden');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe('hidden');
  expect(card).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog', { name: 'Demo assessment' })).toBeVisible();
});

it('opens sharing and bulk invitations from the action dialog without stacking dialogs', async () => {
  renderWithProviders(<AssessmentManager />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Open actions for Demo assessment' }));
  await user.click(screen.getByRole('button', { name: 'Share link' }));
  expect(screen.getByRole('dialog', { name: 'Share assessment' })).toHaveTextContent(
    'Demo assessment',
  );
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Close sharing' }));
  await user.click(screen.getByRole('button', { name: 'Open actions for Demo assessment' }));
  await user.click(screen.getByRole('button', { name: 'Bulk invite candidates' }));
  expect(screen.getByRole('dialog', { name: 'Bulk invitations' })).toHaveTextContent(
    'Demo assessment',
  );
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('preserves draft restrictions and restores archived assessments to draft', async () => {
  vi.mocked(api.getAssessments).mockResolvedValue([
    { ...assessment, status: 'draft', availability: 'draft', _count: { questions: 0 } },
  ] as any);
  const update = vi.spyOn(api, 'updateAssessment').mockResolvedValue(assessment as any);
  const { unmount } = renderWithProviders(<AssessmentManager />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Open actions for Demo assessment' }));
  expect(screen.getByRole('button', { name: 'Bulk invite candidates' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  unmount();
  vi.mocked(api.getAssessments).mockResolvedValue([
    { ...assessment, status: 'archived', availability: 'archived' },
  ] as any);
  renderWithProviders(<AssessmentManager />, { loggedInAs: adminUser });
  await user.click(await screen.findByRole('button', { name: 'Open actions for Demo assessment' }));
  await user.click(screen.getByRole('button', { name: 'Restore as draft' }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(12, { status: 'draft' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('runs duplicate through the existing action and closes the dialog on success', async () => {
  const duplicate = vi.spyOn(api, 'duplicateAssessment').mockResolvedValue(assessment as any);
  renderWithProviders(<AssessmentManager />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Open actions for Demo assessment' }));
  await user.click(screen.getByRole('button', { name: 'Duplicate' }));
  expect(duplicate).toHaveBeenCalledWith(12);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('defaults to newest and opens sorting choices only from the icon', async () => {
  vi.mocked(api.getAssessments).mockResolvedValue([
    { ...assessment, id: 11, name: 'Earlier assessment', createdAt: '2026-11-20T12:00:00Z' },
    assessment,
  ] as any);
  renderWithProviders(<AssessmentManager />, { loggedInAs: adminUser });
  const user = userEvent.setup();
  await screen.findByRole('button', { name: 'Open actions for Demo assessment' });
  const cards = () => screen.getAllByRole('button', { name: /^Open actions for/ });
  expect(cards()[0]).toHaveAccessibleName('Open actions for Demo assessment');
  expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
  const sort = screen.getByRole('button', { name: 'Sort assessments' });
  await user.click(sort);
  expect(screen.getByRole('menuitemradio', { name: 'Newest' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await user.click(screen.getByRole('menuitemradio', { name: 'Oldest' }));
  expect(cards()[0]).toHaveAccessibleName('Open actions for Earlier assessment');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(sort).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitemradio', { name: 'Oldest' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(sort).toHaveFocus();
});
