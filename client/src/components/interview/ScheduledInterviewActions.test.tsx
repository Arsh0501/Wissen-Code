import { it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import ScheduledInterviewActions from './ScheduledInterviewActions';
import type { InterviewSummary } from '../../pages/admin/InterviewsPage';

const interview: InterviewSummary = {
  id: 9, title: 'Frontend interview', candidateName: 'Maya', candidateEmail: 'maya@example.test',
  status: 'scheduled', timeLimitMinutes: 45, scheduledAt: null, roomToken: 'test-room',
  interviewer: { id: 2, name: 'Assigned interviewer', email: 'interviewer@example.test' },
};

it('saves admin edits including the new interviewer, date and duration', async () => {
  const user = userEvent.setup();
  vi.mocked(api.request).mockImplementation(async () => ({ data: [
    interview.interviewer, { id: 3, name: 'New interviewer', email: 'new@example.test' },
  ] }));
  renderWithProviders(<ScheduledInterviewActions interview={interview} />, { loggedInAs: adminUser });
  await user.click(screen.getByRole('button', { name: 'Edit interview' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.clear(dialog.getByLabelText('Interview title'));
  await user.type(dialog.getByLabelText('Interview title'), 'Updated interview');
  await dialog.findByRole('option', { name: /New interviewer/ });
  await user.selectOptions(dialog.getByLabelText('Assigned interviewer'), '3');
  await user.clear(dialog.getByLabelText('Duration (minutes)'));
  await user.type(dialog.getByLabelText('Duration (minutes)'), '90');
  await user.type(dialog.getByLabelText('Scheduled time'), '2026-11-04T10:30');
  await user.click(dialog.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
    url: '/interviews/9', method: 'put', data: expect.objectContaining({
      title: 'Updated interview', interviewerId: 3, timeLimitMinutes: 90,
      scheduledAt: new Date('2026-11-04T10:30').toISOString(),
    }),
  }));
});

it('requires explicit confirmation before cancelling', async () => {
  const user = userEvent.setup();
  vi.mocked(api.request).mockResolvedValue({ data: { success: true } });
  renderWithProviders(<ScheduledInterviewActions interview={interview} />, { loggedInAs: adminUser });
  await user.click(screen.getByRole('button', { name: 'Cancel interview' }));
  expect(api.request).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/interviews/9/cancel', method: 'post' }));
});

it.each(['interviewer', 'candidate'])('hides editing and cancellation for %s', (accessRole) => {
  localStorage.setItem('wissen-user', JSON.stringify({ ...adminUser, role: accessRole, accessRole }));
  localStorage.setItem('wissen-token', 'test-token');
  renderWithProviders(<ScheduledInterviewActions interview={interview} />);
  expect(screen.queryByRole('button', { name: 'Edit interview' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel interview' })).not.toBeInTheDocument();
});

it.each(['in_progress', 'completed', 'cancelled'])('hides scheduled actions for %s interviews', (status) => {
  renderWithProviders(<ScheduledInterviewActions interview={{ ...interview, status }} />, { loggedInAs: adminUser });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
