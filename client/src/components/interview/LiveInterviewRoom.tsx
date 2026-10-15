import { useEffect, useState } from 'react';
import InterviewAIControls from './InterviewAIControls';
import CollaborativeEditor from './CollaborativeEditor';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AIFollowUp,
  AINotes,
  AIEvaluation,
  AIEvaluationData,
  FollowUpSuggestion,
} from '../ai/InterviewAI';
import { InterviewLiveState } from '../../hooks/useInterviewLive';
import { apiData, Evaluation } from '../../services/workflows';
import { apiError } from '../../services/api';
import { Question } from '../../types';
import { useTheme } from '../../context/ThemeContext';
export interface LiveRoomInterview {
  id: number;
  candidateName: string;
  candidateEmail: string;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  timeLimitMinutes: number;
  currentQuestionId: number | null;
  currentCode: string;
  currentLanguageId: number;
  questions: {
    questionId: number;
    question: Question;
    candidateAnswer?: string;
  }[];
  notes: { id: number; content: string }[];
}
function useClock(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  minutes: number,
  status: string,
) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (status !== 'in_progress') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status]);
  return startedAt
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(startedAt) +
            minutes * 60000 -
            (endedAt ? Date.parse(endedAt) : now)) /
            1000,
        ),
      )
    : minutes * 60;
}
export default function LiveInterviewRoom({
  interview,
  live,
  evaluations,
  onQuestion,
}: {
  interview: LiveRoomInterview;
  live: InterviewLiveState;
  evaluations: Evaluation[];
  onQuestion: (id: number) => void;
}) {
  const { theme } = useTheme();
  const client = useQueryClient();
  const [notes, setNotes] = useState('');
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const status = live.snapshot.status ?? interview.status;
  const activeId = live.snapshot.questionId ?? interview.currentQuestionId;
  const question =
    live.snapshot.question ??
    interview.questions.find((q) => q.questionId === activeId)?.question;
  const code = live.snapshot.code ?? interview.currentCode;
  const languageId = live.snapshot.languageId ?? interview.currentLanguageId;
  const seconds = useClock(
    live.snapshot.startedAt ?? interview.startedAt,
    live.snapshot.endedAt ?? interview.endedAt,
    interview.timeLimitMinutes,
    status,
  );
  const busy = ['running', 'submitting'].includes(live.activity);
  const runnable =
    !['mcq', 'written', 'project'].includes(question?.questionType ?? '') &&
    status === 'in_progress' &&
    live.connection === 'connected' &&
    !busy &&
    !!activeId;
  const decide = (id: string, status: string) =>
    setDecisions((prev) => ({ ...prev, [id]: status }));
  const review = useMutation({
    mutationFn: ({
      itemId,
      decision,
      content,
    }: {
      itemId: string;
      decision: string;
      content?: string;
    }) => {
      const item = [...live.ai.followUps, ...live.ai.notes].find(
        (i) => i.id === itemId,
      );
      if (!item?.jobId)
        throw new Error(
          'This suggestion has no backend job. Refresh AI results before reviewing it.',
        );
      return apiData(`/ai/jobs/${item.jobId}/review`, 'post', {
        itemId,
        decision,
        content,
      });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['interview-ai', interview.id] });
      client.invalidateQueries({ queryKey: ['interview', interview.id] });
    },
  });
  const saveNote = useMutation({
    mutationFn: (content: string) =>
      apiData(`/interviews/${interview.id}/notes`, 'post', {
        content,
        category: 'general',
        isPrivate: true,
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['interview', interview.id] }),
  });
  const evaluation: AIEvaluationData = live.ai.evaluation ?? {
    skills: evaluations.flatMap((e) =>
      e.observations.map((o) => ({
        skill: o.skill,
        observation: o.observation,
        evidence: o.evidence.map((v) => `${v.source}: ${v.quote}`),
      })),
    ),
    codingObservations: evaluations.flatMap((e) =>
      e.observations
        .filter((o) => o.evidence.some((v) => v.source === 'code'))
        .map((o) => o.observation),
    ),
    areasToProbe: [],
    summary: '',
  };
  const pending = live.ai.followUps.filter(
    (s) => (decisions[`follow:${s.id}`] || s.status || 'pending') === 'pending',
  );
  const asked = live.ai.followUps.filter(
    (s) => (decisions[`follow:${s.id}`] || s.status) === 'asked',
  );
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap justify-between gap-5 items-center">
        <div>
          <h2 className="text-xl font-semibold">Live Interview Room</h2>
          <p className="text-sm text-surface-400">
            {interview.candidateName} · {interview.candidateEmail}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span
            role="status"
            className={`badge ${live.connection === 'connected' ? 'text-emerald-700' : 'text-amber-700'}`}
          >
            {live.connection}
          </span>
          <span
            role="timer"
            aria-label="Interview time remaining"
            className={`font-mono text-2xl ${seconds <= 300 ? 'text-amber-700' : ''}`}
          >
            {Math.floor(seconds / 60)
              .toString()
              .padStart(2, '0')}
            :{(seconds % 60).toString().padStart(2, '0')}
          </span>
        </div>
      </div>
      {live.connection !== 'connected' && (
        <div className="card">
          <p>
            Live updates are unavailable. Saved interview data remains visible.
          </p>
          <button className="btn-outline mt-3" onClick={live.reconnect}>
            Reconnect
          </button>
        </div>
      )}
      {live.error && (
        <p role="alert" className="text-red-600">
          {live.error}
        </p>
      )}
      {status === 'in_progress' && !seconds && (
        <p className="card text-amber-700">
          The planned duration has elapsed. End the interview when the
          discussion is complete.
        </p>
      )}
      <div className="grid xl:grid-cols-[1fr_1.2fr] gap-5">
        <section className="card space-y-4">
          <label className="label">
            Current question
            <select
              className="input mt-2"
              value={activeId ?? ''}
              disabled={busy || status !== 'in_progress'}
              onChange={(e) => onQuestion(Number(e.target.value))}
            >
              <option value="" disabled>
                Select a question
              </option>
              {interview.questions.map((q) => (
                <option key={q.questionId} value={q.questionId}>
                  {q.question.title}
                </option>
              ))}
            </select>
          </label>
          {question ? (
            <>
              <h3 className="font-semibold">{question.title}</h3>
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{question.statement}</ReactMarkdown>
              </div>
            </>
          ) : (
            <p className="text-surface-500">No active question selected.</p>
          )}
          <section>
            <h3 className="font-semibold mb-2">Candidate answer</h3>
            <pre className="sample-box whitespace-pre-wrap text-sm">
              {interview.questions.find((q) => q.questionId === activeId)
                ?.candidateAnswer || 'No answer saved yet.'}
            </pre>
          </section>
          {question?.settings?.rubric && (
            <p className="text-sm whitespace-pre-wrap">
              Rubric: {question.settings.rubric}
            </p>
          )}
          {asked.length > 0 && (
            <section className="border-t border-surface-800 pt-4">
              <h3 className="font-semibold mb-2">Follow-ups to ask</h3>
              <ol className="space-y-3">
                {asked.map((s) => (
                  <li key={s.id}>
                    <p className="text-sm">{s.question}</p>
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => decide(`follow:${s.id}`, 'discussed')}
                    >
                      Mark discussed
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </section>
        <section className="card space-y-4">
          <div className="flex justify-between">
            <h3 className="font-semibold">Candidate code</h3>
            <span className="badge">
              {{ 71: 'Python', 63: 'JavaScript', 62: 'Java', 54: 'C++' }[
                languageId
              ] || `Language ${languageId}`}
            </span>
          </div>
          <CollaborativeEditor
            key={activeId}
            socket={live.socket}
            initialCode={code}
            languageId={languageId}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            readOnly={status !== 'in_progress'}
            onCode={live.updateDraft}
          />
          <div className="flex flex-wrap gap-3 items-center">
            <button
              className="btn-outline"
              disabled={!runnable}
              onClick={() =>
                live.execute('run', { code, languageId, questionId: activeId! })
              }
            >
              Run candidate code
            </button>
            <button
              className="btn-primary"
              disabled={!runnable}
              onClick={() =>
                live.execute('submit', {
                  code,
                  languageId,
                  questionId: activeId!,
                })
              }
            >
              Submit for evaluation
            </button>
            <span role="status" className="text-xs text-surface-500">
              {live.activity === 'idle'
                ? 'No execution yet'
                : live.activity === 'running'
                  ? 'Running code…'
                  : live.activity === 'submitting'
                    ? 'Submitting code…'
                    : live.activity === 'failed'
                      ? 'Execution needs attention'
                      : 'Execution completed'}
            </span>
          </div>
          {live.result !== null && (
            <details open>
              <summary className="text-sm font-medium">
                Execution results
              </summary>
              <pre className="bg-surface-800 p-3 rounded mt-2 text-xs overflow-auto max-h-64">
                {JSON.stringify(live.result, null, 2)}
              </pre>
            </details>
          )}
        </section>
      </div>
      <div className="grid xl:grid-cols-2 gap-5">
        <section className="card space-y-4">
          <h3 className="font-semibold">Interviewer notes</h3>
          <label className="label">
            Private notes
            <textarea
              rows={5}
              className="input mt-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record observed behavior, decisions and evidence…"
            />
          </label>
          <button
            className="btn-primary"
            disabled={!notes.trim() || saveNote.isPending}
            onClick={() =>
              saveNote.mutate(notes.trim(), { onSuccess: () => setNotes('') })
            }
          >
            {saveNote.isPending ? 'Saving…' : 'Save notes'}
          </button>
          {saveNote.error && (
            <p role="alert" className="text-red-600">
              {apiError(saveNote.error)}
            </p>
          )}
          {saveNote.isSuccess && (
            <p role="status" className="text-sm text-emerald-700">
              Notes saved.
            </p>
          )}
          <ul className="space-y-2">
            {interview.notes.map((n) => (
              <li
                key={n.id}
                className="p-3 rounded bg-surface-800/40 text-sm whitespace-pre-wrap"
              >
                {n.content}
              </li>
            ))}
          </ul>
          {!interview.notes.length && (
            <p className="text-sm text-surface-500">No saved notes yet.</p>
          )}
        </section>
        <section className="space-y-4">
          <h3 className="font-semibold">AI suggestions</h3>
          <InterviewAIControls
            id={interview.id}
            status={status}
            onResults={live.receiveAI}
          />
          {review.error && (
            <p role="alert" className="text-red-600">
              {apiError(review.error)}
            </p>
          )}
          {!pending.length && (
            <div className="card text-surface-500 text-sm">
              No pending follow-ups. Suggested follow-ups will appear when
              available.
            </div>
          )}
          {pending.map((s) => (
            <AIFollowUp
              key={s.id}
              suggestion={s}
              onAsk={(suggestion: FollowUpSuggestion) =>
                review.mutate(
                  { itemId: suggestion.id, decision: 'ask' },
                  {
                    onSuccess: () => decide(`follow:${suggestion.id}`, 'asked'),
                  },
                )
              }
              onDismiss={(id) =>
                review.mutate(
                  { itemId: id, decision: 'dismiss' },
                  { onSuccess: () => decide(`follow:${id}`, 'dismissed') },
                )
              }
            />
          ))}
          {live.ai.notes.map((n) => (
            <AINotes
              key={n.id}
              note={{
                ...n,
                status: (decisions[`note:${n.id}`] ||
                  n.status ||
                  'pending') as typeof n.status,
              }}
              onAccept={async (id, content) => {
                await review.mutateAsync({
                  itemId: id,
                  decision: 'accept',
                  content,
                });
                decide(`note:${id}`, 'accepted');
              }}
              onReject={(id) =>
                review.mutate(
                  { itemId: id, decision: 'reject' },
                  { onSuccess: () => decide(`note:${id}`, 'rejected') },
                )
              }
            />
          ))}
          <AIEvaluation evaluation={evaluation} />
        </section>
      </div>
    </div>
  );
}
