import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { socketAccessToken } from '../services/api';
import { Question } from '../types';
import type {
  FollowUpSuggestion,
  GeneratedNote,
  AIEvaluationData,
} from '../components/ai/InterviewAI';
export interface InterviewAIResults {
  followUps: FollowUpSuggestion[];
  notes: GeneratedNote[];
  evaluation?: AIEvaluationData;
  timeline?: { eventId: number; description: string }[];
}
export function parseAIResults(raw: unknown): InterviewAIResults {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const followUps = Array.isArray(data.followUps)
    ? data.followUps.filter(
        (item): item is FollowUpSuggestion =>
          !!item &&
          typeof item.id === 'string' &&
          typeof item.context === 'string' &&
          typeof item.question === 'string',
      )
    : [];
  const notes = Array.isArray(data.notes)
    ? data.notes.filter(
        (item): item is GeneratedNote =>
          !!item && typeof item.id === 'string' && typeof item.content === 'string',
      )
    : [];
  const value = data.evaluation as Partial<AIEvaluationData> | undefined;
  const evaluation =
    value &&
    Array.isArray(value.skills) &&
    value.skills.every(
      (s) =>
        typeof s.skill === 'string' &&
        Array.isArray(s.evidence) &&
        s.evidence.every((e) => typeof e === 'string'),
    ) &&
    Array.isArray(value.codingObservations) &&
    value.codingObservations.every((v) => typeof v === 'string') &&
    Array.isArray(value.areasToProbe) &&
    value.areasToProbe.every((v) => typeof v === 'string') &&
    typeof value.summary === 'string'
      ? (value as AIEvaluationData)
      : undefined;
  const timeline = Array.isArray(data.timeline)
    ? data.timeline.filter(
        (item): item is { eventId: number; description: string } =>
          !!item && Number.isInteger(item.eventId) && typeof item.description === 'string',
      )
    : [];
  return { followUps, notes, evaluation, timeline };
}
export function useInterviewLive(id: number, onChange: () => void) {
  const socketRef = useRef<Socket | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting',
  );
  const [snapshot, setSnapshot] = useState<{
    code?: string;
    codeRevision?: number;
    languageId?: number;
    questionId?: number | null;
    question?: Question | null;
    status?: string;
    startedAt?: string | null;
    endedAt?: string | null;
  }>({});
  const [activity, setActivity] = useState<
    'idle' | 'running' | 'submitting' | 'completed' | 'failed'
  >('idle');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [ai, setAI] = useState<InterviewAIResults>({
    followUps: [],
    notes: [],
  });
  useEffect(() => {
    setSnapshot({});
    setAI({ followUps: [], notes: [] });
    setError('');
    setConnection('connecting');
    setActivity('idle');
    setResult(null);
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      auth: (done) => {
        void socketAccessToken()
          .then((token) => done({ token, interviewId: id }))
          .catch((err) => {
            setError(err.message);
            done({});
          });
      },
    });
    socketRef.current = socket;
    const sync = (raw: any) => {
      if (!raw || raw.interviewId !== id) return;
      setSnapshot((previous) =>
        Number.isInteger(raw.codeRevision) && raw.codeRevision < (previous.codeRevision ?? -1)
          ? previous
          : {
              code: raw.currentCode,
              codeRevision: raw.codeRevision,
              languageId: raw.currentLanguageId,
              questionId: raw.currentQuestionId,
              question: raw.currentQuestion,
              status: raw.status,
              startedAt: raw.startedAt,
              endedAt: raw.endedAt,
            },
      );
      if (raw.aiResults) setAI(parseAIResults(raw.aiResults));
    };
    socket.on('connect', () => {
      socket.emit('JOIN_INTERVIEW', { interviewId: id }, (response: any) => {
        if (response?.error || response?.success === false) {
          setError(response.error || 'Could not join interview');
          setConnection('disconnected');
          return;
        }
        setConnection('connected');
        setError('');
        if (response?.syncState) sync(response.syncState);
      });
    });
    socket.on('SYNC_STATE', sync);
    socket.on('CODE_CHANGED', (raw: any) => {
      if (raw?.interviewId && raw.interviewId !== id) return;
      if (raw?.authorSocketId && raw.authorSocketId === socket.id) {
        setSnapshot((previous) => ({
          ...previous,
          codeRevision: Math.max(previous.codeRevision ?? -1, raw.revision ?? -1),
          languageId: raw.languageId ?? previous.languageId,
        }));
        return;
      }
      if (raw && typeof raw.code === 'string')
        setSnapshot((prev) =>
          Number.isInteger(raw.revision) && raw.revision < (prev.codeRevision ?? -1)
            ? prev
            : {
                ...prev,
                code: raw.code,
                codeRevision: raw.revision ?? prev.codeRevision,
                languageId: raw.languageId ?? prev.languageId,
              },
        );
    });
    socket.on('QUESTION_CHANGED', (raw: any) => {
      setSnapshot((prev) => ({
        ...prev,
        questionId: raw.questionId,
        question: raw.question,
        code: raw.starterCode ?? raw.code ?? '',
        codeRevision: raw.codeRevision,
        languageId: raw.languageId ?? prev.languageId,
      }));
      setResult(null);
      setActivity('idle');
      callback.current();
    });
    socket.on('QUESTIONS_UPDATED', (raw: any) => {
      setSnapshot((prev) =>
        raw.questionId === prev.questionId ? { ...prev, question: raw.question } : prev,
      );
      callback.current();
    });
    socket.on('INTERVIEW_STARTED', (raw: any) => {
      setSnapshot((prev) => ({
        ...prev,
        status: 'in_progress',
        startedAt: raw.startedAt ?? prev.startedAt,
      }));
      callback.current();
    });
    socket.on('INTERVIEW_ENDED', (raw: any) => {
      setSnapshot((prev) => ({
        ...prev,
        status: 'completed',
        endedAt: raw.endedAt ?? new Date().toISOString(),
      }));
      callback.current();
    });
    socket.on('INTERVIEW_EXTENDED', () => callback.current());
    for (const event of ['CODE_EXECUTED', 'CODE_SUBMITTED'])
      socket.on(event, (raw: unknown) => {
        setResult(raw);
        setActivity('completed');
        callback.current();
      });
    socket.on('NOTE_ADDED', () => callback.current());
    socket.on('AI_RESULTS', (raw: any) => {
      if (raw?.interviewId === id) setAI(parseAIResults(raw));
    });
    socket.on('disconnect', (reason: string) => {
      if (reason === 'io server disconnect' && localStorage.getItem('wissen-refresh-token')) {
        void socketAccessToken()
          .then(() => socket.connect())
          .catch((err) => setError(err.message));
      }
      setConnection('disconnected');
      setActivity((prev) => (['running', 'submitting'].includes(prev) ? 'failed' : prev));
    });
    socket.on('connect_error', (err: Error) => {
      setConnection('disconnected');
      setError(err.message || 'Connection failed');
    });
    socket.on('ERROR', (raw: any) => {
      setError(raw?.message || 'Interview request failed');
      setActivity('failed');
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [id]);
  const execute = (
    operation: 'run' | 'submit',
    input: { code: string; languageId: number; questionId: number },
  ) => {
    const socket = socketRef.current;
    if (!socket?.connected || connection !== 'connected') {
      setError('Reconnect before running code.');
      return;
    }
    setError('');
    setActivity(operation === 'run' ? 'running' : 'submitting');
    socket
      .timeout(operation === 'run' ? 60000 : 180000)
      .emit(
        operation === 'run' ? 'EXECUTE_CODE' : 'SUBMIT_CODE',
        input,
        (timeoutError: Error | null, response: any) => {
          if (socketRef.current !== socket) return;
          if (timeoutError || response?.success === false || response?.error) {
            setActivity('failed');
            setError(
              timeoutError
                ? 'No acknowledgement received. Check execution status before retrying.'
                : response.error || 'Execution failed',
            );
            return;
          }
          setActivity('completed');
          setResult(response);
          callback.current();
        },
      );
  };
  return {
    updateDraft: (code: string) => setSnapshot((prev) => ({ ...prev, code })),
    socket: socketRef.current,
    connection,
    snapshot,
    activity,
    result,
    error,
    ai,
    receiveAI: setAI,
    execute,
    reconnect: () => {
      const socket = socketRef.current;
      if (!socket) return;
      socket.disconnect();
      setConnection('connecting');
      setError('');
      socket.connect();
    },
  };
}
export type InterviewLiveState = ReturnType<typeof useInterviewLive>;
