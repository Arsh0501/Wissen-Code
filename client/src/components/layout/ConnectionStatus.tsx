import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

// One public probe for the shell. Never retries writes or interrupts exam autosave.
export default function ConnectionStatus() {
  const [unavailable, setUnavailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function check() {
      setChecking(true);
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/ready`, { signal: controller.signal });
        if (!stopped) setUnavailable(!response.ok);
      } catch { if (!stopped) setUnavailable(true); }
      finally {
        clearTimeout(timeout);
        if (!stopped) {
          setChecking(false);
          timer = setTimeout(() => setAttempt(value => value + 1), 30000);
        }
      }
    }
    void check();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [attempt]);
  if (!unavailable) return null;
  return (
    <div role="status" className="connection-status">
      <WifiOff size={16} aria-hidden="true" />
      <span>Service temporarily unavailable. Some actions may not save.</span>
      <button type="button" disabled={checking} onClick={() => setAttempt(value => value + 1)}>
        <RefreshCw size={14} aria-hidden="true" /> {checking ? 'Checking…' : 'Try again'}
      </button>
    </div>
  );
}
