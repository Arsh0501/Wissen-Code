import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Link2,
  Mail,
  Edit,
  Rocket,
  Copy,
  EyeOff,
  Archive,
  Trash2,
  X,
  ArrowUpRight,
} from 'lucide-react';
import type { Assessment, AssessmentStatus } from '../../types';
import { AvailabilityBadge } from '../ui';

export default function AssessmentActionsDialog({
  assessment,
  busy,
  error,
  onClose,
  onResults,
  onShare,
  onBulkInvite,
  onEdit,
  onStatus,
  onDuplicate,
  onDelete,
}: {
  assessment: Assessment;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onResults: () => void;
  onShare: () => void;
  onBulkInvite: () => void;
  onEdit: () => void;
  onStatus: (status: AssessmentStatus) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const primary = [
    {
      label: 'Results',
      description: assessment.stats?.inProgress
        ? `Review scores and submissions (${assessment.stats.inProgress} live)`
        : 'Review candidate scores and submissions',
      icon: Users,
      action: onResults,
    },
    {
      label: 'Share link',
      description: 'Create and manage assessment links',
      icon: Link2,
      action: onShare,
    },
    {
      label: 'Bulk invite candidates',
      description: 'Send invitations using Excel or saved candidates',
      icon: Mail,
      action: onBulkInvite,
      disabled: assessment.status !== 'published',
    },
    {
      label: 'Edit',
      description: 'Update questions and assessment settings',
      icon: Edit,
      action: onEdit,
    },
  ];
  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          onClose();
        }
        if (event.key === 'Tab') {
          const buttons =
            panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          if (!buttons?.length) return;
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-surface-800">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary-600 uppercase tracking-wider mb-2">
              Assessment actions
            </p>
            <h2 id={titleId} className="text-xl font-bold break-words">
              {assessment.name}
            </h2>
            <div className="mt-2">
              <AvailabilityBadge value={assessment.availability} />
            </div>
          </div>
          <button
            ref={close}
            type="button"
            className="btn-ghost p-2 shrink-0"
            aria-label="Close assessment actions"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-5 sm:p-6 space-y-5">
          <p id={descriptionId} className="text-sm text-surface-500">
            Choose an action for this assessment.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {primary.map(({ label, description, icon: Icon, action, disabled }) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                disabled={busy || disabled}
                onClick={action}
                className="group flex items-start gap-3 rounded-xl border border-surface-700 p-4 text-left transition-colors hover:border-primary-500/50 hover:bg-primary-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="rounded-lg bg-primary-500/10 p-2 text-primary-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs leading-relaxed text-surface-500 mt-1">
                    {description}
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-surface-500" />
              </button>
            ))}
          </div>
          <div className="border-t border-surface-800 pt-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
              Manage assessment
            </h3>
            <div className="flex flex-wrap gap-2">
              {assessment.status === 'draft' && (
                <button
                  type="button"
                  className="btn-primary text-sm"
                  disabled={busy || !assessment._count?.questions}
                  title={
                    assessment._count?.questions
                      ? 'Make visible to candidates'
                      : 'Add questions first'
                  }
                  onClick={() => onStatus('published')}
                >
                  <Rocket className="h-4 w-4" />
                  Publish
                </button>
              )}
              <button
                type="button"
                className="btn-outline text-sm"
                disabled={busy}
                onClick={onDuplicate}
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </button>
              {assessment.status === 'published' && (
                <button
                  type="button"
                  className="btn-outline text-sm"
                  disabled={busy}
                  onClick={() => onStatus('draft')}
                >
                  <EyeOff className="h-4 w-4" />
                  Unpublish
                </button>
              )}
              <button
                type="button"
                className="btn-outline text-sm"
                disabled={busy}
                onClick={() => onStatus(assessment.status === 'archived' ? 'draft' : 'archived')}
              >
                <Archive className="h-4 w-4" />
                {assessment.status === 'archived' ? 'Restore as draft' : 'Archive'}
              </button>
              <button
                type="button"
                className="btn-outline text-sm text-red-600 hover:bg-red-500/10"
                disabled={busy}
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
          {busy && (
            <p role="status" className="text-sm text-surface-500">
              Updating assessment...
            </p>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
