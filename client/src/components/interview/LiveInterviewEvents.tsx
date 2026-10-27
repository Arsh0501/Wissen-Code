import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
export interface LiveEvent {
  id: number;
  interviewId: number;
  eventType: string;
  actorRole: string;
  createdAt: string;
}
export default function LiveInterviewEvents({
  id,
  socket,
  active,
}: {
  id: number;
  socket: Socket | null;
  active: boolean;
}) {
  const client = useQueryClient();
  const key = ['live-interview-events', id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => apiData<LiveEvent[]>(`/interviews/${id}/events`),
    refetchInterval: active ? 2000 : false,
  });
  useEffect(() => {
    if (!socket) return;
    const receive = (event: LiveEvent) => {
      if (event.interviewId !== id) return;
      client.setQueryData<LiveEvent[]>(['live-interview-events', id], (previous = []) =>
        [event, ...previous.filter((item) => item.id !== event.id)]
          .sort((a, b) => b.id - a.id)
          .slice(0, 100),
      );
      if (event.eventType !== 'CODE_CHANGED')
        void client.invalidateQueries({ queryKey: ['interview', id] });
    };
    socket.on('INTERVIEW_EVENT', receive);
    return () => {
      socket.off('INTERVIEW_EVENT', receive);
    };
  }, [id, socket, client]);
  return (
    <section className="space-y-3" aria-label="Live interview events">
      <h3 className="font-semibold">Live events</h3>
      <p className="text-xs text-surface-500">
        Latest activity first. Saved events refresh automatically if a live update is missed.
      </p>
      {query.isLoading && <p role="status">Loading interview events…</p>}
      {query.error && <p role="alert">{apiError(query.error)}</p>}
      {query.data?.length ? (
        <ol
          className="max-h-64 overflow-y-auto space-y-2"
          aria-live="polite"
          aria-relevant="additions"
        >
          {query.data.map((event) => (
            <li key={event.id} className="rounded border border-surface-700 p-2 text-sm">
              <span className="capitalize">{event.actorRole}</span>
              {' · '}
              {event.eventType.toLowerCase().replace(/_/g, ' ')}
              <time dateTime={event.createdAt} className="block text-xs text-surface-500">
                {new Date(event.createdAt).toLocaleTimeString()}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        !query.isLoading &&
        !query.error && (
          <p className="text-sm text-surface-500">No interview events recorded yet.</p>
        )
      )}
    </section>
  );
}
