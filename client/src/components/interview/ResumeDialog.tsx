import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ResumeViewer from './ResumeViewer';

export default function ResumeDialog({ interview, onClose, backLabel = 'Back to interviews' }: {
  interview: { id: number; candidateName: string; candidateEmail: string; candidateResume?: string | null; candidateResumeUrl?: string | null };
  onClose: () => void; backLabel?: string;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const workspace = document.getElementById('workspace-content');
    const previousOverflow = workspace?.style.overflow;
    if (workspace) workspace.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
    };
    document.addEventListener('keydown', handleKey);
    backButton.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (workspace) workspace.style.overflow = previousOverflow || '';
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-surface-900" role="dialog" aria-modal="true" aria-label={`Resume: ${interview.candidateName}`}>
      <div className="w-full h-dvh flex flex-col overflow-hidden">
        <header className="px-4 py-3 shrink-0 border-b border-surface-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <button ref={backButton} onClick={onClose} className="btn-outline text-xs">{backLabel}</button>
            <div><h2 className="font-semibold">Resume: {interview.candidateName}</h2><p className="text-xs text-surface-400">{interview.candidateEmail}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-ghost text-xs">Close</button>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-hidden p-2 text-sm text-surface-300">
          <ResumeViewer interview={interview} expanded />
        </div>
      </div>
    </div>, document.body,
  );
}
