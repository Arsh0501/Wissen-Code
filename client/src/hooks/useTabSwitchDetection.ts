import { useEffect, useRef } from 'react';
import type { TabSwitchEvent } from '../types';
import { MIN_AWAY_MS } from '../constants';

/**
 * Detects the candidate leaving the exam — switching tabs, minimising, or focusing another window —
 * and reports each completed absence once they come back.
 */
export function useTabSwitchDetection(active: boolean, onReturn: (event: TabSwitchEvent) => void) {
  const leftAtRef = useRef<number | null>(null);
  const onReturnRef = useRef(onReturn);
  onReturnRef.current = onReturn;

  useEffect(() => {
    if (!active) {
      leftAtRef.current = null;
      return;
    }

    const leave = () => {
      if (leftAtRef.current === null) leftAtRef.current = Date.now();
    };
    const comeBack = () => {
      const leftAt = leftAtRef.current;
      if (leftAt === null || document.hidden) return;
      leftAtRef.current = null;
      const durationMs = Date.now() - leftAt;
      if (durationMs >= MIN_AWAY_MS) onReturnRef.current({ leftAt: new Date(leftAt), durationMs });
    };
    const onVisibility = () => (document.hidden ? leave() : comeBack());

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', comeBack);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', comeBack);
    };
  }, [active]);
}
