import { useState } from 'react';
import { Info } from 'lucide-react';

export default function DirectApproveInfo({
  id,
  verifiesStarters,
}: {
  id: number;
  verifiesStarters: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative flex items-center"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className="p-2 text-surface-400 hover:text-primary-400 rounded-lg focus-visible:outline focus-visible:outline-primary-500"
        aria-label="About Direct Approve"
        aria-expanded={open}
        aria-controls={`direct-approve-info-${id}`}
        title="What Direct Approve does"
        onClick={() => setOpen(!open)}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`direct-approve-info-${id}`}
          role="note"
          aria-label="Direct approval operations"
          className="absolute bottom-full right-0 z-20 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-surface-700 bg-surface-900 p-4 shadow-xl text-sm space-y-2"
        >
          <h4 className="font-semibold">What Direct Approve does</h4>
          <ol className="list-decimal pl-4 space-y-2 text-surface-300">
            <li>Saves your current edits first.</li>
            <li>Skips AI review of correctness, ambiguity, difficulty and edge-case coverage.</li>
            {verifiesStarters ? (
              <>
                <li>Checks the starter structure and marked core-logic region.</li>
                <li>
                  Inserts the reference function into the Python starter and runs every sample and
                  hidden test to check parsing and output formatting.
                </li>
                <li>
                  Compiles/runs other language starters on one sample. These placeholder runs do not
                  verify their algorithm.
                </li>
              </>
            ) : (
              <li>
                This older draft does not use the marked core-logic contract, so starter driver
                execution checks do not apply.
              </li>
            )}
            <li>Checks for an exact duplicate title or statement in the Question Bank.</li>
            <li>
              If all required checks pass, saves the question, test cases and starter code to the
              Question Bank and marks the draft Approved. Otherwise, shows the failures and required
              fixes.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
