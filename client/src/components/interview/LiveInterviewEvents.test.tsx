import { it, expect, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import api from '../../services/api';
import { renderWithProviders, adminUser } from '../../test/test-utils';
import LiveInterviewEvents from './LiveInterviewEvents';
it('shows saved activity and merges interviewer event notifications without duplicates', async () => {
  const handlers = new Map<string, (value: any) => void>();
  const socket = {
    on: vi.fn((name, handler) => handlers.set(name, handler)),
    off: vi.fn(),
  } as unknown as Socket;
  vi.mocked(api.request).mockResolvedValue({
    data: [
      {
        id: 1,
        interviewId: 20,
        eventType: 'CANDIDATE_JOINED',
        actorRole: 'candidate',
        createdAt: new Date().toISOString(),
      },
    ],
  });
  renderWithProviders(<LiveInterviewEvents id={20} socket={socket} active />, {
    loggedInAs: adminUser,
  });
  await screen.findByText(/candidate joined/);
  const event = {
    id: 2,
    interviewId: 20,
    eventType: 'CODE_CHANGED',
    actorRole: 'candidate',
    createdAt: new Date().toISOString(),
  };
  act(() => {
    handlers.get('INTERVIEW_EVENT')!(event);
    handlers.get('INTERVIEW_EVENT')!(event);
    handlers.get('INTERVIEW_EVENT')!({ ...event, id: 3, interviewId: 21 });
  });
  expect(await screen.findAllByText(/code changed/)).toHaveLength(1);
});
