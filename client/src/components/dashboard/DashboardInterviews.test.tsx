import { expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import DashboardInterviews from './DashboardInterviews';

it('shows recent five interviews and expands, collapses, searches and filters the full list', async () => {
  vi.mocked(api.request).mockResolvedValue({
    data: Array.from({ length: 7 }, (_, index) => ({
      id: 20 - index,
      title: `Interview ${index + 1}`,
      candidateName: `Candidate ${index + 1}`,
      candidateEmail: `candidate${index + 1}@example.test`,
      interviewer: { name: 'David', email: 'david@example.test' },
      status: index === 0 ? 'in_progress' : 'completed',
      createdAt: `2026-11-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
      scheduledAt: null,
      timeLimitMinutes: 30,
      _count: { questions: 2 },
      finalRating: null,
    })),
  });
  renderWithProviders(<DashboardInterviews />, { loggedInAs: adminUser });
  const region = screen.getByRole('region', { name: 'Interviews' });
  await screen.findByRole('link', { name: 'Interview 7' });
  const user = userEvent.setup();
  expect(within(region).getAllByRole('row')).toHaveLength(6);
  expect(within(region).getAllByRole('row')[1]).toHaveTextContent('Interview 7');
  expect(screen.queryByRole('link', { name: 'Interview 1' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Show all 7 interviews' }));
  expect(within(region).getAllByRole('row')).toHaveLength(8);
  expect(screen.getByRole('link', { name: 'Interview 1' })).toHaveAttribute(
    'href',
    '/admin/interviews/20',
  );
  await user.click(screen.getByRole('button', { name: 'Show recent 5 interviews' }));
  expect(within(region).getAllByRole('row')).toHaveLength(6);
  const search = screen.getByRole('searchbox', { name: 'Search interviews' });
  await user.type(search, 'candidate1@example.test');
  expect(within(region).getAllByRole('row')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Interview 1' })).toBeVisible();
  await user.click(
    within(screen.getByRole('navigation', { name: 'Interview status filters' })).getByRole(
      'button',
      { name: /^Completed/ },
    ),
  );
  expect(screen.getByText('No interviews match these filters.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear interview filters' }));
  expect(search).toHaveValue('');
  expect(within(region).getAllByRole('row')).toHaveLength(6);
});

it('shows a useful empty state without an expand control', async () => {
  vi.mocked(api.request).mockResolvedValue({ data: [] });
  renderWithProviders(<DashboardInterviews />, { loggedInAs: adminUser });
  expect(await screen.findByText('No interviews yet.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
});

it('offers a retry after an interview API failure', async () => {
  vi.mocked(api.request).mockRejectedValueOnce(new Error('Interview service unavailable'));
  renderWithProviders(<DashboardInterviews />, { loggedInAs: adminUser });
  expect(await screen.findByRole('alert')).toHaveTextContent('Interview service unavailable');
  vi.mocked(api.request).mockResolvedValue({ data: [] });
  await userEvent.click(screen.getByRole('button', { name: 'Retry interviews' }));
  expect(await screen.findByText('No interviews yet.')).toBeVisible();
});
