import { it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as services from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import AssessmentDashboard from './AssessmentDashboard';
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
  expect(
    within(region).getByRole('link', { name: 'Alpha Draft' }),
  ).toBeInTheDocument();
  const active = within(
    screen.getByRole('navigation', { name: 'Assessment status filters' }),
  ).getByRole('button', { name: /^active/i });
  await user.click(active);
  expect(active).toHaveAttribute('aria-pressed', 'true');
  expect(
    within(region).queryByRole('link', { name: 'Alpha Draft' }),
  ).not.toBeInTheDocument();
  expect(
    within(region).getByRole('link', { name: 'Beta Active' }),
  ).toBeInTheDocument();
  await user.type(
    screen.getByRole('searchbox', { name: 'Search assessments' }),
    'Alpha',
  );
  expect(within(region).getByText('No assessments match')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(
    within(region).getByRole('link', { name: 'Alpha Draft' }),
  ).toBeInTheDocument();
  expect(
    within(region).getByRole('link', { name: 'Beta Active' }),
  ).toBeInTheDocument();
});
