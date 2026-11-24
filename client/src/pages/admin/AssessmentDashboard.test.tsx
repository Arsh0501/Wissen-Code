import { beforeEach, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api, * as services from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import AssessmentDashboard from './AssessmentDashboard';

beforeEach(() => {
  vi.mocked(api.request).mockResolvedValue({ data: [] });
});
it('combines assessment search and status filters and lets users clear an empty match', async () => {
  vi.spyOn(services, 'getDashboard').mockResolvedValue({
    totals: {
      assessments: 2,
      published: 1,
      drafts: 1,
      questions: 4,
      candidatesStarted: 3,
      candidatesCompleted: 2,
      inProgress: 1,
      averageScore: 70,
      highestScore: 90,
      passRate: 50,
    },
    scoreDistribution: [],
    recentActivity: [],
    assessments: [
      {
        id: 1,
        name: 'Alpha Draft',
        status: 'draft',
        availability: 'draft',
        timeLimitMinutes: 30,
        passingScore: 60,
        _count: { questions: 2 },
      },
      {
        id: 2,
        name: 'Beta Active',
        status: 'published',
        availability: 'open',
        timeLimitMinutes: 45,
        passingScore: 60,
        _count: { questions: 2 },
      },
    ],
  } as any);
  renderWithProviders(<AssessmentDashboard />, { loggedInAs: adminUser });
  const region = await screen.findByRole('region', { name: 'Assessments' });
  const user = userEvent.setup();
  expect(screen.queryByText('Performance and activity')).not.toBeInTheDocument();
  expect(screen.queryByText('Score distribution')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Interviews' })).toBeInTheDocument();
  expect(within(region).getByRole('link', { name: 'Alpha Draft' })).toBeInTheDocument();
  const active = within(
    screen.getByRole('navigation', { name: 'Assessment status filters' }),
  ).getByRole('button', { name: /^active/i });
  await user.click(active);
  expect(active).toHaveAttribute('aria-pressed', 'true');
  expect(within(region).queryByRole('link', { name: 'Alpha Draft' })).not.toBeInTheDocument();
  expect(within(region).getByRole('link', { name: 'Beta Active' })).toBeInTheDocument();
  await user.type(screen.getByRole('searchbox', { name: 'Search assessments' }), 'Alpha');
  expect(within(region).getByText('No assessments match')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByRole('searchbox', { name: 'Search assessments' })).toHaveValue('');
  expect(within(region).getByRole('link', { name: 'Alpha Draft' })).toBeInTheDocument();
  expect(within(region).getByRole('link', { name: 'Beta Active' })).toBeInTheDocument();
});

it('shows the five most recent assessments by default and toggles older assessments', async () => {
  vi.spyOn(services, 'getDashboard').mockResolvedValue({
    totals: {
      assessments: 7,
      published: 7,
      drafts: 0,
      questions: 14,
      candidatesStarted: 0,
      candidatesCompleted: 0,
      inProgress: 0,
      averageScore: 0,
      highestScore: 0,
      passRate: 0,
    },
    scoreDistribution: [],
    recentActivity: [],
    assessments: Array.from({ length: 7 }, (_, index) => ({
      id: 20 - index,
      name: `Demo ${index + 1}`,
      createdAt: `2026-11-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
      status: 'published',
      availability: 'open',
      timeLimitMinutes: 30,
      passingScore: 60,
      _count: { questions: 2 },
    })),
  } as any);
  renderWithProviders(<AssessmentDashboard />, { loggedInAs: adminUser });
  const region = await screen.findByRole('region', { name: 'Assessments' });
  const user = userEvent.setup();
  expect(within(region).getAllByRole('row')).toHaveLength(6);
  expect(within(region).getAllByRole('row')[1]).toHaveTextContent('Demo 7');
  expect(within(region).queryByRole('link', { name: 'Demo 1' })).not.toBeInTheDocument();
  await user.click(within(region).getByRole('button', { name: 'Show all 7 assessments' }));
  expect(within(region).getAllByRole('row')).toHaveLength(8);
  expect(within(region).getByRole('link', { name: 'Demo 1' })).toBeInTheDocument();
  await user.click(within(region).getByRole('button', { name: 'Show recent 5' }));
  expect(within(region).getAllByRole('row')).toHaveLength(6);
  await user.type(screen.getByRole('searchbox', { name: 'Search assessments' }), 'Demo 1');
  expect(within(region).getByRole('link', { name: 'Demo 1' })).toBeInTheDocument();
  expect(within(region).getAllByRole('row')).toHaveLength(2);
});
