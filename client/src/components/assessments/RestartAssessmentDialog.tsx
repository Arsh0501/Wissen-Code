import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import { apiError, restartCandidateAssessment } from '../../services/api';

export default function RestartAssessmentDialog({
  assessmentId,
  candidate,
  onClose,
  onRestart,
}: {
  assessmentId: number;
  candidate: { id: number; name: string };
  onClose: () => void;
  onRestart: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [allowClosed, setAllowClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Enter a reason for restarting this assessment.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await restartCandidateAssessment(assessmentId, candidate.id, reason.trim(), allowClosed);
      onRestart();
    } catch (error) {
      setError(apiError(error, 'Could not restart this assessment.'));
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="restart-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-surface-700 bg-surface-900 p-6 text-surface-100 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit}>
        <div className="mb-4 flex items-center gap-3">
          <RotateCcw className="h-5 w-5 text-primary-500" />
          <h2 id="restart-title" className="text-xl font-semibold">
            Restart assessment
          </h2>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-surface-400">
          Give <strong className="text-surface-100">{candidate.name}</strong> one fresh attempt.
          Previous attempts remain as invalidated history. Existing tabs cannot submit those
          attempts.
        </p>
        <label className="block text-sm font-medium">
          Reason
          <textarea
            autoFocus
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={!!error}
            className="input mt-2 min-h-24 w-full"
            placeholder="For example, the candidate system computer crashed"
            disabled={busy}
          />
        </label>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-primary-500"
            checked={allowClosed}
            onChange={(e) => setAllowClosed(e.target.checked)}
            disabled={busy}
          />
          Allow this candidate to restart even if the assessment has closed.
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-outline" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Restarting...' : 'Restart assessment'}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
