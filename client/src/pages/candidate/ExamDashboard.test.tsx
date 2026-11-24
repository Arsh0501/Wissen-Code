import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import ExamDashboard from './ExamDashboard';

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

it('filters and expands assessments and switches to upcoming interviews', async () => {
  vi.spyOn(api, 'getAssessments').mockResolvedValue(
    Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      name: `Assessment ${index + 1}`,
      availability: 'open',
      candidateStatus: 'not-started',
      timeLimitMinutes: 30,
      passingScore: 60,
      createdAt: `2026-11-${10 + index}T12:00:00Z`,
    })) as any,
  );
  vi.spyOn(api, 'getCandidateInterviews').mockResolvedValue([
    {
      id: 2,
      title: 'Upcoming interview',
      status: 'scheduled',
      interviewer: { name: 'Alex' },
      timeLimitMinutes: 45,
      roomToken: 'preview',
      questionCount: 2,
    },
  ] as any);
  const { unmount } = renderWithProviders(<ExamDashboard />);
  const user = userEvent.setup();
  await screen.findByRole('navigation', { name: 'Candidate dashboard sections' });
  expect(screen.getByLabelText('Filter dashboard')).toHaveValue('available');
  expect(screen.getByRole('heading', { name: 'Assessment 7' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Assessment 1' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Show all assessments' }));
  expect(screen.getByRole('heading', { name: 'Assessment 1' })).toBeVisible();
  await user.type(screen.getByRole('searchbox'), 'Assessment 4');
  expect(screen.getByRole('heading', { name: 'Assessment 4' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Assessment 7' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'interviews' }));
  expect(screen.getByLabelText('Filter dashboard')).toHaveValue('scheduled');
  expect(screen.getByRole('heading', { name: 'Upcoming interview' })).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Filter dashboard'), 'all');
  await user.type(screen.getByRole('searchbox'), 'Upcoming');
  await user.click(screen.getByLabelText('Sort dashboard'));
  await user.click(screen.getByRole('button', { name: 'Oldest' }));
  unmount();
  renderWithProviders(<ExamDashboard />);
  await screen.findByRole('navigation', { name: 'Candidate dashboard sections' });
  expect(screen.getByRole('button', { name: 'interviews' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByLabelText('Filter dashboard')).toHaveValue('all');
  expect(screen.getByRole('searchbox')).toHaveValue('Upcoming');
  await user.click(screen.getByLabelText('Sort dashboard'));
  expect(screen.getByRole('button', { name: 'Oldest' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('heading', { name: 'Upcoming interview' })).toBeVisible();
});
