import { beforeEach, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInterviewLive, parseAIResults } from './useInterviewLive';
const fake = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => void>(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
}));
vi.mock('socket.io-client', () => ({
  io: () => ({
    connected: true,
    on: (event: string, handler: (...args: any[]) => void) => {
      fake.handlers.set(event, handler);
    },
    emit: fake.emit,
    timeout() {
      return this;
    },
    disconnect: fake.disconnect,
    connect: fake.connect,
  }),
}));
beforeEach(() => {
  fake.handlers.clear();
  fake.emit.mockImplementation((event: string, _body: any, callback: any) => {
    if (event === 'JOIN_INTERVIEW')
      callback({
        success: true,
        syncState: {
          interviewId: 5,
          currentCode: 'print(1)',
          currentLanguageId: 71,
          currentQuestionId: 1,
          status: 'in_progress',
        },
      });
  });
});
it('syncs the room, receives candidate edits and records execution failures without fake completion', () => {
  const changed = vi.fn();
  const { result, unmount } = renderHook(() => useInterviewLive(5, changed));
  act(() => fake.handlers.get('connect')!());
  expect(result.current.connection).toBe('connected');
  expect(result.current.snapshot.code).toBe('print(1)');
  act(() =>
    fake.handlers.get('CODE_CHANGED')!({ code: 'print(2)', languageId: 71 }),
  );
  expect(result.current.snapshot.code).toBe('print(2)');
  fake.emit.mockImplementation((event: string, _body: any, callback: any) => {
    if (event === 'EXECUTE_CODE')
      callback(null, { success: false, error: 'Compiler unavailable' });
  });
  act(() =>
    result.current.execute('run', {
      code: 'print(2)',
      languageId: 71,
      questionId: 1,
    }),
  );
  expect(result.current.activity).toBe('failed');
  expect(result.current.error).toBe('Compiler unavailable');
  act(() => fake.handlers.get('disconnect')!());
  expect(result.current.connection).toBe('disconnected');
  unmount();
  expect(fake.disconnect).toHaveBeenCalled();
});
it('accepts backend follow-ups while discarding malformed evaluation payloads', () => {
  const value = parseAIResults({
    followUps: [
      {
        id: '1',
        context: 'Candidate mentioned useMemo.',
        question: 'When would useMemo make performance worse?',
      },
      null,
    ],
    evaluation: { skills: [], summary: 'missing arrays' },
  });
  expect(value.followUps).toHaveLength(1);
  expect(value.evaluation).toBeUndefined();
});

it('ignores AI results for another interview and accepts results for the joined room', () => {
  const { result, unmount } = renderHook(() => useInterviewLive(5, vi.fn()));
  const followUps = [
    {
      id: 'job-1-0',
      jobId: 'job-1',
      context: 'Recorded answer',
      question: 'Explain your tradeoff',
    },
  ];
  act(() => fake.handlers.get('AI_RESULTS')!({ interviewId: 6, followUps }));
  expect(result.current.ai.followUps).toHaveLength(0);
  act(() => fake.handlers.get('AI_RESULTS')!({ interviewId: 5, followUps }));
  expect(result.current.ai.followUps).toEqual(followUps);
  unmount();
});
