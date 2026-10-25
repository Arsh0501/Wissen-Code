import { useEffect, useState, type ReactNode } from 'react';
import InterviewAIControls from './InterviewAIControls';
import QuestionConversation from './QuestionConversation';
import CollaborativeEditor from './CollaborativeEditor';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AIEvaluationData } from '../ai/InterviewAI';
import InterviewAIConversation from './InterviewAIConversation';
import { InterviewLiveState } from '../../hooks/useInterviewLive';
import { apiData, Evaluation } from '../../services/workflows';
import { apiError } from '../../services/api';
import { Question } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { RotateCcw } from 'lucide-react';
import { getStarterCodeForLanguage, getAvailableQuestionLanguages } from '../../services/starterCodes';
import ExecutionResults from './ExecutionResults';
import QuestionDescription from '../questions/QuestionDescription';
import ExpandableQuestionContent from './ExpandableQuestionContent';
import LiveInterviewEvents from './LiveInterviewEvents';
import CurrentQuestionSources from './CurrentQuestionSources';
import { TranscriptionControlsContext } from './TranscriptionControlsContext';
type LiveRoomSection = 'question' | 'communication' | 'ai' | 'notes' | 'activity';
const LIVE_ROOM_SECTIONS = [
  { id: 'question', label: 'Question & code' },
  { id: 'communication', label: 'Video, chat & board' },
  { id: 'ai', label: 'AI assistance' },
  { id: 'notes', label: 'Private notes' },
  { id: 'activity', label: 'Live events' },
] as const;
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
  codeRevision?: number;
  currentLanguageId: number;
  questions: {
    questionId: number;
    question: Question;
    candidateAnswer?: string;
    notes?: string;
    sourceSetItemId?: number | null;
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
  communication,
}: {
  interview: LiveRoomInterview;
  live: InterviewLiveState;
  evaluations: Evaluation[];
  onQuestion: (id: number) => void;
  communication?: ReactNode;
}) {
  const { theme } = useTheme();
  const client = useQueryClient();
  const [notes, setNotes] = useState('');
  const [transcriptionTarget, setTranscriptionTarget] = useState<HTMLDivElement | null>(null);
  const [section, setSection] = useState<LiveRoomSection>('question');
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const status = live.snapshot.status ?? interview.status;
  const activeId = live.snapshot.questionId !== undefined ? live.snapshot.questionId : interview.currentQuestionId;
  const activeQuestionLink = interview.questions.find((q) => q.questionId === activeId);
  const question = activeId == null ? undefined :
    live.snapshot.question?.id === activeId ? live.snapshot.question : activeQuestionLink?.question;
  const nonCoding = ['written', 'mcq', 'project'].includes(question?.questionType ?? '');
  const newerSavedCode = interview.codeRevision !== undefined && interview.codeRevision > (live.snapshot.codeRevision ?? -1);
  const code = newerSavedCode ? interview.currentCode : live.snapshot.code ?? interview.currentCode;
  const languageId = newerSavedCode ? interview.currentLanguageId : live.snapshot.languageId ?? interview.currentLanguageId;
  const revision = newerSavedCode ? interview.codeRevision : live.snapshot.codeRevision;

  const [resetStarterCode, setResetStarterCode] = useState<{
    text: string;
    languageId: number;
    timestamp: number;
  } | null>(null);

  const handleApplyStarterCode = (targetLangId: number) => {
    const starter = getStarterCodeForLanguage(question, targetLangId);
    setResetStarterCode({
      text: starter,
      languageId: targetLangId,
      timestamp: Date.now(),
    });
  };

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
  const extendMutation = useMutation({
    mutationFn: (extensionMinutes: number) =>
      apiData(`/interviews/${interview.id}/extend`, 'post', { extensionMinutes }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['interview', interview.id] });
    },
  });

  return (
    <TranscriptionControlsContext.Provider value={transcriptionTarget}><div className="space-y-5">
      <div className="card flex flex-wrap justify-between gap-5 items-center">
        <div>
          <h2 className="text-xl font-semibold">Live Interview Room</h2>
          <p className="text-sm text-surface-400">
            {interview.candidateName} · {interview.candidateEmail}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            role="status"
            className={`badge ${live.connection === 'connected' ? 'text-emerald-700' : 'text-amber-700'}`}
          >
            {live.connection}
          </span>
          {status === 'in_progress' && (
            <button
              onClick={() => extendMutation.mutate(15)}
              disabled={extendMutation.isPending}
              className="btn-outline text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10 px-2.5 py-1 flex items-center gap-1 font-medium"
              title="Extend interview duration by 15 minutes"
            >
              +15m Extend
            </button>
          )}
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
      <nav aria-label="Live room sections" className="flex gap-2 overflow-x-auto pb-2">
        {LIVE_ROOM_SECTIONS.map(item => <button
          key={item.id}
          aria-pressed={section === item.id}
          onClick={() => setSection(item.id)}
          className={`${section === item.id ? 'btn-primary' : 'btn-outline'} text-xs shrink-0`}
        >{item.label}</button>)}
      </nav>
      <div className="max-h-[70dvh] overflow-y-auto min-w-0">
      <div hidden={section !== 'communication'}>{communication ?? <p className="card">Communication tools are unavailable.</p>}</div>
      <div hidden={section !== 'question' && section !== 'communication'} className={section === 'communication' ? 'mt-5' : ''}>
      <div className={`grid ${nonCoding ? '' : 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'} gap-5 min-w-0`}>
        <section className="card space-y-4 min-w-0 max-w-full overflow-hidden">
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
          <CurrentQuestionSources interviewId={interview.id} questions={interview.questions} disabled={busy || status !== 'in_progress'} />
          {question ? (
            <>
              <h3 className="font-semibold [overflow-wrap:anywhere]">{question.title}</h3>
              <ExpandableQuestionContent key={question.id}><QuestionDescription question={question} /></ExpandableQuestionContent>
            </>
          ) : (
            <p className="text-surface-500">No active question selected.</p>
          )}
          {question && activeId && <QuestionConversation key={`conversation:${interview.id}:${activeId}`} interviewId={interview.id} questionId={activeId} active={status === 'in_progress'} controls={<div ref={setTranscriptionTarget} />} />}
          {!nonCoding && <p className="text-xs text-surface-500">Conversation follow-ups use the reviewed transcript for the current turn. Speech alone does not verify code correctness.</p>}
          {question?.settings?.rubric && (
            <p className="text-sm whitespace-pre-wrap">
              Rubric: {question.settings.rubric}
            </p>
          )}
        </section>
        {!nonCoding && <section className="card space-y-4 min-w-0 max-w-full overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">Candidate code</h3>
              <span className="badge">
                {{ 71: 'Python', 63: 'JavaScript', 62: 'Java', 54: 'C++', 82: 'SQL' }[
                  languageId
                ] || `Language ${languageId}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="input py-1 px-2 text-xs"
                value={languageId}
                disabled={status !== 'in_progress'}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  handleApplyStarterCode(next);
                }}
              >
                {getAvailableQuestionLanguages(question).map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
              </select>
              <button
                type="button"
                className="btn-outline text-xs py-1 px-2.5 flex items-center gap-1.5 whitespace-nowrap"
                disabled={status !== 'in_progress'}
                onClick={() => handleApplyStarterCode(languageId)}
                title="Reset editor to question starter code for the selected language"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Set to starter code
              </button>
            </div>
          </div>
          <p className="text-xs text-surface-400">Shared coding area: you and the candidate can edit the same code during the interview.</p>
          <CollaborativeEditor
            key={activeId}
            socket={live.socket}
            initialCode={code}
            serverRevision={revision}
            languageId={languageId}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            readOnly={status !== 'in_progress'}
            onCode={live.updateDraft}
            resetStarterCode={resetStarterCode}
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
          {live.result !== null && <ExecutionResults value={live.result} />}
        </section>}
      </div>
      </div>
      <div hidden={section !== 'activity'} className="card"><LiveInterviewEvents id={interview.id} socket={live.socket} active={status === 'in_progress'} /></div>
      <div hidden={section !== 'notes'}>
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
      </div>
      <div hidden={section !== 'ai'}>
        <InterviewAIConversation
          status={status}
          results={{ ...live.ai, evaluation,
            followUps: live.ai.followUps.map((item) => ({ ...item, status: (decisions[`follow:${item.id}`] || item.status) as typeof item.status })),
            notes: live.ai.notes.map((item) => ({ ...item, status: (decisions[`note:${item.id}`] || item.status) as typeof item.status })),
          }}
          busy={review.isPending}
          error={review.error ? apiError(review.error) : undefined}
          controls={<InterviewAIControls embedded id={interview.id} questionId={activeId} status={status} onResults={live.receiveAI} />}
          onReview={async (item, decision, content) => {
            await review.mutateAsync({ itemId: item.id, decision, content });
            decide(`${decision === 'ask' || decision === 'dismiss' ? 'follow' : 'note'}:${item.id}`,
              { ask: 'asked', dismiss: 'dismissed', accept: 'accepted', reject: 'rejected' }[decision]);
          }}
        />
      </div>
      </div>
    </div></TranscriptionControlsContext.Provider>
  );
}
