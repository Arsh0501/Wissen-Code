import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
import ExpandableQuestionContent from './ExpandableQuestionContent';

interface Turn {
  id: string;
  question: string;
  transcript: string;
  segmentIds: string[];
  startedAt: string;
}
interface Segment {
  id: string;
  text: string;
}
interface Conversation {
  revision: number;
  turns: Turn[];
  segments: Segment[];
  feedback: string;
  suggestions: { id: string; question: string; context: string }[];
}
interface Draft {
  text: string;
  segmentIds: string[];
  turnId: string;
}

function TranscriptComposer({
  turn,
  segments,
  disabled,
  controls,
  onDraft,
}: {
  turn: Turn;
  segments: Segment[];
  disabled: boolean;
  controls?: ReactNode;
  onDraft: (draft: Draft) => void;
}) {
  const [text, setText] = useState(turn.transcript);
  const [segmentIds, setSegmentIds] = useState(turn.segmentIds);
  const seen = useRef(new Set(turn.segmentIds));
  useEffect(() => {
    const incoming = segments.filter((segment) => !seen.current.has(segment.id));
    if (incoming.length) {
      incoming.forEach((segment) => seen.current.add(segment.id));
      setText((previous) =>
        [previous, ...incoming.map((segment) => segment.text)].filter(Boolean).join('\n'),
      );
      setSegmentIds((previous) => [
        ...new Set([...previous, ...incoming.map((segment) => segment.id)]),
      ]);
    }
  }, [segments]);
  useEffect(() => {
    onDraft({ text, segmentIds, turnId: turn.id });
  }, [text, segmentIds, turn.id, onDraft]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <label className="label" htmlFor={`conversation-transcript-${turn.id}`}>
          Live transcript for this question
        </label>
        {controls}
      </div>
      <textarea
        id={`conversation-transcript-${turn.id}`}
        className="input w-full"
        rows={5}
        value={text}
        maxLength={10000}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        placeholder="Candidate speech appears here. Review or edit the transcript before sending."
      />
      <p className="text-xs text-surface-400">
        New speech is appended to this turn without replacing your edits. Send the reviewed answer
        to request follow-ups.
      </p>
    </div>
  );
}

export default function QuestionConversation({
  interviewId,
  questionId,
  active,
  controls,
}: {
  interviewId: number;
  questionId: number;
  active: boolean;
  controls?: ReactNode;
}) {
  const client = useQueryClient();
  const path = `/interviews/${interviewId}/questions/${questionId}/conversation`;
  const key = ['question-conversation', interviewId, questionId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => apiData<Conversation>(path),
    refetchInterval: active ? 2000 : false,
  });
  const [feedback, setFeedback] = useState('');
  const [feedbackInitialized, setFeedbackInitialized] = useState(false);
  const [notice, setNotice] = useState('');
  const draft = useRef<Draft>({ text: '', segmentIds: [], turnId: '' });
  const [hasDraft, setHasDraft] = useState(false);
  const onDraft = useRef((value: Draft) => {
    draft.current = value;
    setHasDraft(!!value.text.trim() && value.text.length <= 10000);
  }).current;
  useEffect(() => {
    if (!feedbackInitialized && typeof query.data?.feedback === 'string') {
      setFeedback(query.data.feedback);
      setFeedbackInitialized(true);
    }
  }, [query.data?.feedback, feedbackInitialized]);
  const mutation = useMutation({
    mutationFn: async ({ action, suggestionId }: { action: string; suggestionId?: string }) => {
      let revision = query.data?.revision ?? 0;
      // Save any corrections and new speech before advancing to the selected follow-up.
      if (action === 'ask' && draft.current.text.trim()) {
        const saved = await apiData<Conversation>(path, 'post', {
          action: 'save',
          revision,
          ...draft.current,
        });
        revision = saved.revision;
      }
      return apiData<{ feedback?: string }>(path, 'post', {
        action,
        revision,
        ...(suggestionId ? { suggestionId } : {}),
        ...(['send', 'save', 'feedback'].includes(action) ? draft.current : {}),
        ...(action === 'save-feedback' ? { text: feedback } : {}),
      });
    },
    onSuccess: (result, { action }) => {
      setNotice(
        action === 'save-feedback'
          ? 'Question feedback saved.'
          : action === 'feedback'
            ? 'AI feedback draft is ready. Review and edit it before saving.'
            : '',
      );
      if (action === 'feedback' && result.feedback) setFeedback(result.feedback);
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: ['interview', interviewId] }),
      ]);
    },
  });
  const turns = query.data?.turns ?? [];
  const current = turns[turns.length - 1];
  const busy = mutation.isPending;
  const perform = (action: string, suggestionId?: string) => {
    setNotice('');
    mutation.mutate({ action, suggestionId });
  };
  return (
    <section
      aria-label="Question conversation"
      className="border-t border-surface-800 pt-4 space-y-4 min-w-0 max-w-full [overflow-wrap:anywhere]"
    >
      <h3 className="font-semibold">Question conversation</h3>
      {query.isLoading && <p role="status">Loading conversation…</p>}
      {query.error && (
        <p role="alert">
          {apiError(query.error)} <button onClick={() => query.refetch()}>Retry</button>
        </p>
      )}
      {!query.isLoading && !query.error && !turns.length && (
        <button className="btn-primary" disabled={!active || busy} onClick={() => perform('start')}>
          Ask main question
        </button>
      )}
      <ol className="space-y-4 min-w-0 max-w-full" aria-label="Conversation history">
        {turns.map((turn, index) => (
          <li key={turn.id} className="space-y-3 min-w-0 max-w-full">
            <div className="rounded-lg border border-primary-500/30 bg-primary-500/5 p-4 min-w-0 max-w-full overflow-hidden">
              <p className="text-xs text-surface-400 mb-2">
                Interviewer · {index === 0 ? 'Main question' : `Follow-up ${index}`}
              </p>
              <ExpandableQuestionContent>
                <ReactMarkdown>{turn.question}</ReactMarkdown>
              </ExpandableQuestionContent>
            </div>
            {turn.id !== current?.id && (
              <div className="rounded-lg border border-surface-700 p-4 ml-4">
                <p className="text-xs text-surface-400 mb-2">Candidate · Reviewed transcript</p>
                <p className="whitespace-pre-wrap text-sm">
                  {turn.transcript || 'No reviewed response recorded.'}
                </p>
              </div>
            )}
          </li>
        ))}
      </ol>
      {current && (
        <>
          <TranscriptComposer
            key={current.id}
            turn={current}
            segments={query.data?.segments ?? []}
            disabled={!active || busy}
            controls={controls}
            onDraft={onDraft}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={!active || busy || !hasDraft}
              onClick={() => perform('send')}
            >
              {busy && mutation.variables?.action === 'send'
                ? 'Generating follow-ups…'
                : 'Send transcript & suggest follow-ups'}
            </button>
            <button
              className="btn-outline"
              disabled={!active || busy || !hasDraft}
              onClick={() => perform('save')}
            >
              Save transcript
            </button>
          </div>
          {!!query.data?.suggestions?.length && (
            <div className="space-y-3" aria-label="Suggested follow-ups">
              <h4 className="font-medium">Choose the next follow-up</h4>
              {query.data.suggestions.map((item) => (
                <article
                  key={item.id}
                  className="border border-surface-700 rounded-lg p-3 space-y-2"
                >
                  <p className="text-sm">{item.question}</p>
                  {item.context && <p className="text-xs text-surface-400">{item.context}</p>}
                  <div className="flex gap-2">
                    <button
                      className="btn-primary text-xs"
                      disabled={!active || busy}
                      onClick={() => perform('ask', item.id)}
                    >
                      Ask
                    </button>
                    <button
                      className="btn-outline text-xs"
                      disabled={!active || busy}
                      onClick={() => perform('dismiss', item.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <section
            aria-label="Question feedback"
            className="border-t border-surface-800 pt-4 space-y-3"
          >
            <div className="flex flex-wrap justify-between items-center gap-3">
              <h4 className="font-semibold">Feedback for this conversation</h4>
              <button
                className="btn-outline text-xs"
                disabled={!active || busy || (!hasDraft && !turns.some((turn) => turn.transcript))}
                onClick={() => perform('feedback')}
              >
                {busy && mutation.variables?.action === 'feedback'
                  ? 'Drafting feedback…'
                  : 'Ask AI for feedback'}
              </button>
            </div>
            <label className="label block">
              Your feedback for this question
              <textarea
                className="input mt-2 w-full"
                rows={5}
                maxLength={10000}
                value={feedback}
                disabled={!active || busy}
                onChange={(event) => setFeedback(event.target.value)}
              />
            </label>
            <p className="text-xs text-surface-400">
              AI summarizes the concepts this question assesses and how well the candidate
              demonstrated understanding across the full conversation. Review the draft before
              saving.
            </p>
            <button
              className="btn-primary"
              disabled={!active || busy || !feedback.trim()}
              onClick={() => perform('save-feedback')}
            >
              Save question feedback
            </button>
          </section>
        </>
      )}
      {mutation.error && <p role="alert">{apiError(mutation.error)}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
