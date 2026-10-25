import { useTheme } from '../../context/ThemeContext';
import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Editor from '../CodeEditor';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
type Event = {
  id: number;
  eventType: string;
  actorRole: string;
  createdAt: string;
  payload: Record<string, unknown>;
};
type Page = {
  events: Event[];
  next: number | null;
  interview: { title: string; candidateName: string };
};
export default function InterviewReplay({ id }: { id: number }) {
  const { theme } = useTheme();
  const query = useInfiniteQuery({
    queryKey: ['interview-replay', id],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiData<Page>(
        `/platform/interviews/${id}/replay${pageParam ? `?after=${pageParam}` : ''}`,
      ),
    getNextPageParam: (page) => page.next ?? undefined,
  });
  const events = query.data?.pages.flatMap((p) => p.events) ?? [];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing || index >= events.length - 1) return;
    const delta =
      new Date(events[index + 1].createdAt).getTime() -
      new Date(events[index].createdAt).getTime();
    const timer = setTimeout(
      () => setIndex((i) => i + 1),
      Math.max(80, Math.min(delta / speed, 4000)),
    );
    return () => clearTimeout(timer);
  }, [playing, index, events.length, speed]);
  const before = events.slice(0, index + 1);
  const code = [...before]
    .reverse()
    .find((e) => typeof e.payload.code === 'string');
  const selected = events[index];
  const first = events[0];
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <h2 className="font-semibold mr-auto">Interview replay</h2>
        <button
          className="btn-primary"
          disabled={!events.length}
          onClick={() => {
            if (index >= events.length - 1) setIndex(0);
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <label>
          Speed{' '}
          <select
            className="input"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {[1, 2, 4, 8].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-surface-500">
        Reconstructs saved code changes and interview events. Long pauses are
        shortened to four seconds during playback. Older sessions may have
        events without code snapshots.
      </p>
      {query.isPending && <p role="status">Loading recording…</p>}
      {query.error && <p role="alert">{apiError(query.error)}</p>}
      {!query.isPending && !events.length && (
        <p>No interview events have been recorded yet.</p>
      )}
      {events.length > 0 && (
        <>
          <input
            aria-label="Replay position"
            className="w-full"
            type="range"
            min={0}
            max={Math.max(0, events.length - 1)}
            value={index}
            onChange={(e) => {
              setIndex(Number(e.target.value));
              setPlaying(false);
            }}
          />
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="max-h-[440px] overflow-auto space-y-2">
              {events.map((e, n) => (
                <button
                  className={`block w-full text-left p-3 rounded-lg ${index === n ? 'bg-primary-600 text-on-accent' : 'bg-surface-800'}`}
                  key={e.id}
                  onClick={() => {
                    setIndex(n);
                    setPlaying(false);
                  }}
                >
                  <span className="text-xs">
                    +
                    {Math.round(
                      (new Date(e.createdAt).getTime() -
                        new Date(first.createdAt).getTime()) /
                        1000,
                    )}
                    s · {e.actorRole}
                  </span>
                  <p className="text-sm">{e.eventType.replace(/_/g, ' ')}</p>
                </button>
              ))}
            </div>
            <div className="lg:col-span-2 space-y-3">
              <Editor
                height="360px"
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                language={
                  (
                    {
                      71: 'python',
                      63: 'javascript',
                      62: 'java',
                      54: 'cpp',
                      82: 'sql',
                    } as Record<number, string>
                  )[Number(code?.payload.languageId)] ?? 'plaintext'
                }
                value={String(
                  code?.payload.code ?? '// No code snapshot at this point',
                )}
                options={{ readOnly: true, minimap: { enabled: false } }}
              />
              <details>
                <summary>Event evidence · {selected?.createdAt}</summary>
                <pre className="sample-box whitespace-pre-wrap text-xs">
                  {JSON.stringify(selected?.payload, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </>
      )}
      {query.hasNextPage && (
        <button
          className="btn-outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more events
        </button>
      )}
    </section>
  );
}
