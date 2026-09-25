import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import DashboardPage from './DashboardPage';
import { renderWithProviders, adminUser, examineeUser } from '../test/test-utils';
import * as api from '../services/api';

vi.mock('../services/api');

const mockedApi = vi.mocked(api);

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows question bank stats for an admin', async () => {
    mockedApi.getQuestions.mockResolvedValue([
      { id: 1 } as any,
      { id: 2 } as any,
    ]);

    renderWithProviders(<DashboardPage />, { loggedInAs: adminUser });

    expect(screen.getByText(/welcome back, ava/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(screen.getByText(/questions in bank/i)).toBeInTheDocument();
    expect(mockedApi.getAssessments).not.toHaveBeenCalled();
  });

  it('shows available assessments for an examinee', async () => {
    mockedApi.getAssessments.mockResolvedValue([
      { id: 1, name: 'JS Fundamentals', timeLimitMinutes: 30, questions: [] } as any,
    ]);

    renderWithProviders(<DashboardPage />, { loggedInAs: examineeUser });

    await waitFor(() => expect(screen.getByText('JS Fundamentals')).toBeInTheDocument());
    expect(mockedApi.getQuestions).not.toHaveBeenCalled();
  });

  it('shows an empty state when the examinee has no assessments', async () => {
    mockedApi.getAssessments.mockResolvedValue([]);

    renderWithProviders(<DashboardPage />, { loggedInAs: examineeUser });

    await waitFor(() => expect(screen.getByText(/no assessments available yet/i)).toBeInTheDocument());
  });

  it('shows an error message if loading fails', async () => {
    mockedApi.getAssessments.mockRejectedValue(new Error('network error'));

    renderWithProviders(<DashboardPage />, { loggedInAs: examineeUser });

    await waitFor(() => expect(screen.getByText(/failed to load dashboard data/i)).toBeInTheDocument());
  });
});
