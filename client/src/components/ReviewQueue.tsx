import { useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getQuestions, apiError } from '../services/api';
import { approveQuestion, rejectQuestion, revalidateQuestion, parseReport } from '../services/ai';
import type { Question } from '../types';
import ValidationPanel, { VerdictBadge } from './ValidationPanel';
import { Spinner, EmptyState, parseJsonArray } from './ui';
import { Sparkles, CheckCircle, XCircle, RefreshCw, Edit, ChevronDown, ClipboardCheck } from 'lucide-react';
import styles from './ReviewQueue.module.css';
import { COMMON_MESSAGES, REVIEW_QUEUE_MESSAGES as MSG } from '../constants';

// AI-generated questions waiting for a person to approve them into the bank
export default function ReviewQueue() {
  const qc = useQueryClient();
  const { data: pending, isLoading, error } = useQuery({
    queryKey: ['questions', 'pending_review'],
    queryFn: () => getQuestions({ status: 'pending_review' }),
  });
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['questions'] });
  };

  const approve = useMutation({
    mutationFn: approveQuestion,
    onSuccess: () => { setMessage({ tone: 'ok', text: MSG.approvedAddedQuestionBank }); refresh(); },
    onError: (err) => { setMessage({ tone: 'error', text: apiError(err, 'Could not approve') }); refresh(); },
  });
  const reject = useMutation({
    mutationFn: rejectQuestion,
    onSuccess: () => { setMessage({ tone: 'ok', text: MSG.rejectedNotUsed }); refresh(); },
    onError: (err) => setMessage({ tone: 'error', text: apiError(err, 'Could not reject') }),
  });
  const revalidate = useMutation({
    mutationFn: revalidateQuestion,
    onSuccess: refresh,
    onError: (err) => setMessage({ tone: 'error', text: apiError(err, 'Could not validate') }),
  });

  if (isLoading) return <Spinner label="Loading review queue..." />;
  if (error) return <p className={styles.pText}>{apiError(error, MSG.failedLoadReviewQueue)}</p>;

  return (
    <div className={styles.clipboardCheckBox}>
      <div className={styles.clipboardCheckBox2}>
        <ClipboardCheck className={styles.clipboardCheckIcon} />
        <span>{MSG.aiGeneratedQuestionsStay}</span>
      </div>
      {message && (
        <div className={`${styles.textBox} ${message.tone === 'ok' ? styles.textBoxOk : styles.textBoxDefault}`}>{message.text}</div>
      )}
      {!pending?.length ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing to review"
          body={MSG.questionsGenerateAiSave}
          action={<Link to="/admin/questions/ai" className="btn-primary"><Sparkles className={styles.sparklesIcon} /> Generate with AI</Link>}
        />
      ) : (
        pending.map((q) => (
          <ReviewCard
            key={q.id}
            q={q}
            busy={approve.isPending || reject.isPending || revalidate.isPending}
            onApprove={() => { setMessage(null); approve.mutate(q.id); }}
            onReject={() => { setMessage(null); reject.mutate(q.id); }}
            onRevalidate={() => revalidate.mutate(q.id)}
            validating={revalidate.isPending && revalidate.variables === q.id}
          />
        ))
      )}
    </div>
  );
}

function ReviewCard({ q, busy, validating, onApprove, onReject, onRevalidate }: {
  q: Question; busy: boolean; validating: boolean; onApprove: () => void; onReject: () => void; onRevalidate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const report = parseReport(q.validation);
  const blocked = report?.verdict === 'fail';
  return (
    <div className={styles.chevronDownBox}>
      <div className={styles.runValidationAgainBox}>
        <div className={styles.titleBox}>
          <div className={styles.titleBox2}>
            <h3 className={styles.title}>{q.title}</h3>
            <span className={styles.label}>{q.type === 'mcq' ? 'Multiple choice' : 'Coding'}</span>
            <span className={`${styles.difficultyLabel} badge-${q.difficulty}`}>{q.difficulty}</span>
            <VerdictBadge report={report} />
          </div>
          <p className={styles.pText2}>
            {q.topic && <>{q.topic} · </>}
            {parseJsonArray(q.skills).join(', ') || parseJsonArray(q.tags).filter((t) => t !== 'ai-generated').join(', ')}
          </p>
        </div>
        <div className={styles.titleBox2}>
          <button onClick={onRevalidate} disabled={busy} className={styles.runValidationAgainButton} title="Run validation again">
            <RefreshCw className={`${styles.sparklesIcon} ${validating ? styles.refreshCwIconValidating : ''}`} /> Validate
          </button>
          <Link to={`/admin/questions/${q.id}/edit`} className={styles.editLink}><Edit className={styles.sparklesIcon} /> Edit</Link>
          <button onClick={onReject} disabled={busy} className={styles.rejectButton}><XCircle className={styles.sparklesIcon} /> Reject</button>
          <button onClick={onApprove} disabled={busy || blocked} className={styles.approveButton} title={blocked ? MSG.fixFailedChecksFirst : COMMON_MESSAGES.addQuestionBank}>
            <CheckCircle className={styles.sparklesIcon} /> Approve
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={styles.chevronDownButton}
        aria-expanded={open}
      >
        <span>Question &amp; validation report</span>
        <ChevronDown className={`${styles.chevronDownIcon} ${open ? styles.chevronDownIconOpen : ''}`} />
      </button>
      {open && (
        <div className={styles.statementBox}>
          <div className={styles.statementBox2}>
            <ReactMarkdown>{q.statement}</ReactMarkdown>
            {q.type === 'mcq' && (
              <ul className={styles.ulList}>
                {parseJsonArray<{ id: string; text: string }>(q.options).map((o) => {
                  const right = parseJsonArray(q.correctOptions).includes(o.id);
                  return (
                    <li key={o.id} className={`${styles.textItem} ${right ? styles.textItemRight : styles.textItemDefault}`}>
                      <b className={styles.idBox}>{o.id}</b>{o.text}{right && ' ✓'}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            {report ? <ValidationPanel report={report} /> : <p className={styles.notValidatedYetText}>{MSG.notValidatedYetClick}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
