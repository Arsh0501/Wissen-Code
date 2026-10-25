import { useId, useState, type ReactNode } from 'react';

export default function ExpandableQuestionContent({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className="min-w-0 max-w-full space-y-2">
    <div id={id} className={`${expanded ? '' : 'max-h-[360px]'} min-w-0 max-w-full overflow-auto [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] [&_code]:[overflow-wrap:anywhere] [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_img]:max-w-full`}>
      {children}
    </div>
    <button type="button" className="btn-ghost text-xs" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? 'Collapse question' : 'Expand question'}</button>
  </div>;
}
