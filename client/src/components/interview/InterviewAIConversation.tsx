import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  AIEvaluation,
  AIGenerationMetadata,
  FollowUpSuggestion,
  GeneratedNote,
} from '../ai/InterviewAI';
import { InterviewAIResults } from '../../hooks/useInterviewLive';

type ReviewItem = FollowUpSuggestion | GeneratedNote;
export type AIReview = (
  item: ReviewItem,
  decision: 'ask' | 'dismiss' | 'accept' | 'reject',
  content?: string,
) => Promise<unknown>;

function preview(text: string) {
  const plain = text.replace(/\s+/g, ' ').trim();
  return plain.length > 170 ? `${plain.slice(0, 167)}…` : plain;
}
function source(item: AIGenerationMetadata & { evidence?: string }) {
  const eventId = item.trigger?.eventId ?? item.evidence?.match(/event:(\d+)/)?.[1];
  const event = item.trigger?.eventType?.toLowerCase().replace(/_/g, ' ');
  if (!eventId && !event)
    return item.trigger?.mode === 'manual'
      ? 'Requested by interviewer'
      : 'Based on available interview activity';
  return `${item.trigger?.mode === 'manual' ? 'Requested after' : item.trigger?.mode === 'automatic' ? 'After' : 'Based on'} ${event || 'event'}${eventId ? ` #${eventId}` : ''}`;
}

function Message({
  item,
  isNote,
  status,
  busy,
  onReview,
}: {
  item: ReviewItem;
  isNote: boolean;
  status: string;
  busy?: boolean;
  onReview: AIReview;
}) {
  const note = item as GeneratedNote;
  const follow = item as FollowUpSuggestion;
  const [content, setContent] = useState(note.body ?? note.content ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const review = async (decision: 'ask' | 'dismiss' | 'accept' | 'reject') => {
    setSaving(true);
    setError('');
    try {
      await onReview(item, decision, decision === 'accept' ? content.trim() : undefined);
    } catch {
      setError('Could not save your review. Please retry.');
    } finally {
      setSaving(false);
    }
  };
  const pending = (item.status ?? 'pending') === 'pending';
  const editable = isNote
    ? ['in_progress', 'completed'].includes(status)
    : status === 'in_progress';
  return (
    <article className="min-w-0 border-l-2 border-primary-500 pl-3 py-1 space-y-2 [overflow-wrap:anywhere]">
      <div className="flex items-center justify-between gap-2 text-xs text-surface-400">
        <strong>{isNote ? 'AI note' : 'AI follow-up'}</strong>
        <span className="capitalize">{item.status ?? 'pending'}</span>
      </div>
      <p className="text-xs text-surface-500">
        {source(item)}
        {item.createdAt && (
          <>
            {' '}
            ·{' '}
            <time dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </>
        )}
      </p>
      {!isNote && follow.questionTitle && (
        <p className="text-xs text-primary-400">For: {follow.questionTitle}</p>
      )}
      <details className="group">
        <summary className="cursor-pointer text-sm leading-relaxed">
          {preview(isNote ? content : follow.question)}
          <span className="ml-2 text-xs text-primary-400 group-open:hidden">Expand</span>
          <span className="ml-2 text-xs text-primary-400 hidden group-open:inline">Collapse</span>
        </summary>
        <div className="pt-3 space-y-3 text-sm whitespace-pre-wrap">
          {isNote ? (
            <label className="label">
              Generated notes
              <textarea
                className="input mt-2 w-full"
                rows={5}
                value={content}
                disabled={!pending || !editable || saving || busy}
                onChange={(e) => setContent(e.target.value)}
              />
            </label>
          ) : (
            <>
              <p>{follow.question}</p>
              <p className="text-surface-400">{follow.context}</p>
            </>
          )}
          {item.evidence && (
            <blockquote className="border-l border-surface-700 pl-3 text-xs text-surface-500">
              {item.evidence}
            </blockquote>
          )}
        </div>
      </details>
      {pending && editable && (
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary text-xs"
            disabled={busy || saving || (isNote && !content.trim())}
            onClick={() => void review(isNote ? 'accept' : 'ask')}
          >
            {isNote ? 'Accept notes' : 'Ask'}
          </button>
          <button
            className="btn-outline text-xs"
            disabled={busy || saving}
            onClick={() => void review(isNote ? 'reject' : 'dismiss')}
          >
            {isNote ? 'Reject notes' : 'Dismiss'}
          </button>
        </div>
      )}
      {item.status === 'asked' && (
        <p className="text-xs text-surface-500">Added to your questions to ask.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </article>
  );
}

export default function InterviewAIConversation({
  results,
  status,
  controls,
  onReview,
  busy,
  error,
}: {
  results: InterviewAIResults;
  status: string;
  controls?: ReactNode;
  onReview: AIReview;
  busy?: boolean;
  error?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const atTop = useRef(true);
  const messages = [
    ...results.followUps.map((item) => ({ item, isNote: false })),
    ...results.notes.map((item) => ({ item, isNote: true })),
  ].sort(
    (a, b) => (Date.parse(b.item.createdAt ?? '') || 0) - (Date.parse(a.item.createdAt ?? '') || 0),
  );
  const firstId = messages[0]?.item.id;
  useEffect(() => {
    if (atTop.current && feed.current) feed.current.scrollTop = 0;
  }, [firstId, messages.length]);
  const evaluation = results.evaluation;
  const hasEvaluation =
    evaluation &&
    (evaluation.summary ||
      evaluation.skills.length ||
      evaluation.codingObservations.length ||
      evaluation.areasToProbe.length);
  return (
    <section
      className="min-w-0 overflow-hidden rounded-xl border border-surface-800 bg-surface-950"
      aria-label="Interview AI conversation"
    >
      <header className="flex items-center justify-between gap-3 border-b border-surface-800 p-4">
        <div>
          <h3 className="font-semibold">Interview AI</h3>
          <p className="text-xs text-surface-500">
            Suggestions and notes linked to interview activity
          </p>
        </div>
        <button
          className="btn-outline text-xs shrink-0"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Compact panel' : 'Expand panel'}
        </button>
      </header>
      <div
        ref={feed}
        role="region"
        aria-label="AI activity feed"
        tabIndex={0}
        onScroll={() => {
          if (feed.current) atTop.current = feed.current.scrollTop < 50;
        }}
        className={`overflow-y-auto overscroll-contain p-4 space-y-5 min-h-48 ${expanded ? 'h-[75dvh]' : 'max-h-[28rem]'}`}
      >
        {!messages.length && !hasEvaluation && (
          <p className="text-sm text-surface-500">
            AI suggestions and notes will appear here after interview activity. Expand a message to
            see its details and evidence.
          </p>
        )}
        {messages.map(({ item, isNote }) => (
          <Message key={item.id} {...{ item, isNote, status, busy, onReview }} />
        ))}
        {!!results.timeline?.length && (
          <details className="text-sm">
            <summary className="cursor-pointer text-surface-400">
              Interview timeline · {results.timeline.length} events
            </summary>
            <ol className="mt-3 space-y-2 text-xs text-surface-500">
              {results.timeline.map((event) => (
                <li key={event.eventId}>
                  Event #{event.eventId}: {event.description}
                </li>
              ))}
            </ol>
          </details>
        )}
        {!!hasEvaluation && (
          <details className="text-sm">
            <summary className="cursor-pointer">
              AI evaluation ·{' '}
              {preview(evaluation!.summary || `${evaluation!.skills.length} skill observations`)}
            </summary>
            <div className="mt-3 min-w-0 [overflow-wrap:anywhere]">
              <AIEvaluation evaluation={evaluation!} />
            </div>
          </details>
        )}
      </div>
      {(controls || error) && (
        <div className="border-t border-surface-800 p-4 space-y-2">
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          {controls}
        </div>
      )}
    </section>
  );
}
