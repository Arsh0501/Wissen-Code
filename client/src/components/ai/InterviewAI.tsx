import { useState } from 'react';
export interface AIGenerationMetadata {
  createdAt?: string;
  trigger?: { mode?: string; eventId?: number; eventType?: string; createdAt?: string };
}
export interface FollowUpSuggestion extends AIGenerationMetadata {
  id: string;
  jobId?: string;
  questionId?: number;
  questionTitle?: string;
  context: string;
  question: string;
  evidence?: string;
  status?: 'pending' | 'asked' | 'dismissed';
}
export interface GeneratedNote extends AIGenerationMetadata {
  id: string;
  jobId?: string;
  content: string;
  body?: string;
  category?: string;
  evidence?: string;
  status?: 'pending' | 'accepted' | 'rejected';
}
export interface AIEvaluationData extends AIGenerationMetadata {
  basis?: 'skill-evaluations';
  summaryEvidence?: string[];
  skills: { skill: string; evidence: string[]; observation?: string }[];
  codingObservations: string[];
  areasToProbe: string[];
  summary: string;
}
export function AIFollowUp({
  suggestion,
  onAsk,
  onDismiss,
  readOnly = false,
}: {
  suggestion: FollowUpSuggestion;
  onAsk: (suggestion: FollowUpSuggestion) => void | Promise<void>;
  onDismiss: (id: string) => void | Promise<void>;
  readOnly?: boolean;
}) {
  const status = suggestion.status || 'pending';
  return (
    <article className="card space-y-3">
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold">AI Suggested Follow-up</h3>
        <span className="badge capitalize">{status}</span>
      </div>
      <p className="text-sm text-surface-400">{suggestion.context}</p>
      <p className="font-medium">{suggestion.question}</p>
      {suggestion.evidence && (
        <blockquote className="border-l-2 border-primary-500 pl-3 text-sm text-surface-500">
          {suggestion.evidence}
        </blockquote>
      )}
      {status === 'pending' && !readOnly && (
        <div className="flex gap-3">
          <button className="btn-primary" onClick={() => onAsk(suggestion)}>
            Ask
          </button>
          <button className="btn-outline" onClick={() => onDismiss(suggestion.id)}>
            Dismiss
          </button>
        </div>
      )}
      {status === 'asked' && (
        <p role="status" className="text-xs text-surface-500">
          Added to your questions to ask. Ask it verbally when ready.
        </p>
      )}
    </article>
  );
}
export function AINotes({
  note,
  onAccept,
  onReject,
}: {
  note: GeneratedNote;
  onAccept: (id: string, content: string) => void | Promise<void>;
  onReject: (id: string) => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [content, setContent] = useState(note.content);
  const status = note.status || 'pending';
  return (
    <article className="card space-y-3">
      <div className="flex justify-between">
        <h3 className="font-semibold">AI Notes</h3>
        <span className="badge capitalize">{status}</span>
      </div>
      <label className="label">
        Generated notes
        <textarea
          className="input mt-2"
          rows={4}
          value={content}
          disabled={status !== 'pending' || saving}
          onChange={(e) => setContent(e.target.value)}
        />
      </label>
      {status === 'pending' && (
        <div className="flex gap-3">
          <button
            className="btn-primary"
            disabled={!content.trim() || saving}
            onClick={async () => {
              setSaving(true);
              setError('');
              try {
                await onAccept(note.id, content.trim());
              } catch {
                setError('Notes were not saved. Please retry.');
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving notes…' : 'Accept notes'}
          </button>
          <button className="btn-outline" disabled={saving} onClick={() => onReject(note.id)}>
            Reject notes
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </article>
  );
}
export function AIEvaluation({ evaluation }: { evaluation: AIEvaluationData }) {
  return (
    <section className="card space-y-5" aria-label="AI evaluation">
      <h3 className="font-semibold">AI Evaluation</h3>
      <div>
        <h4 className="text-sm font-semibold mb-2">Skill and evidence</h4>
        {!evaluation.skills.length && (
          <p className="text-sm text-surface-500">No skill observations provided yet.</p>
        )}
        {evaluation.skills.map((s, index) => (
          <article
            key={`${s.skill}:${index}`}
            className="border border-surface-800 rounded p-3 mb-2"
          >
            <strong>{s.skill}</strong>
            {s.observation && <p className="text-sm mt-1">{s.observation}</p>}
            {s.evidence.length ? (
              s.evidence.map((e, i) => (
                <blockquote
                  key={i}
                  className="border-l-2 border-primary-500 pl-3 mt-2 whitespace-pre-wrap text-xs"
                >
                  {e}
                </blockquote>
              ))
            ) : (
              <p className="text-xs text-amber-700 mt-2">
                Supporting evidence has not been provided.
              </p>
            )}
          </article>
        ))}
      </div>
      <AIList title="Coding observations" values={evaluation.codingObservations} />
      <AIList title="Areas to probe" values={evaluation.areasToProbe} />
      <div>
        <h4 className="text-sm font-semibold">
          {evaluation.basis === 'skill-evaluations'
            ? 'Final summary based on skill evaluations'
            : 'Interview summary'}
        </h4>
        <p className="text-sm text-surface-400 mt-2">
          {evaluation.summary || 'No interview summary provided yet.'}
        </p>
        {!!evaluation.summaryEvidence?.length && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-surface-500">
              Supporting ratings and feedback
            </summary>
            {evaluation.summaryEvidence.map((quote, index) => (
              <blockquote
                key={index}
                className="border-l-2 border-primary-500 pl-3 mt-2 text-xs whitespace-pre-wrap"
              >
                {quote}
              </blockquote>
            ))}
          </details>
        )}
      </div>
      <p className="text-xs text-surface-500">
        AI results are suggestions. Review the evidence before accepting notes or making an
        evaluation.
      </p>
    </section>
  );
}
function AIList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      {values.length ? (
        <ul className="list-disc pl-5 text-sm text-surface-400 mt-2 space-y-1">
          {values.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-surface-500 mt-2">Nothing provided yet.</p>
      )}
    </div>
  );
}
