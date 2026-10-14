import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
import {
  InterviewAIResults,
  parseAIResults,
} from '../../hooks/useInterviewLive';
interface Job {
  id: string;
  kind: string;
  status: string;
  error: string | null;
}
export default function InterviewAIControls({
  id,
  status,
  onResults,
}: {
  id: number;
  status: string;
  onResults: (results: InterviewAIResults) => void;
}) {
  const client = useQueryClient();
  const key = ['interview-ai', id];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      apiData<{ results: unknown; jobs: Job[]; configured: boolean }>(
        `/interview-workflows/${id}/ai-results`,
      ),
    refetchInterval: 5000,
  });
  useEffect(() => {
    if (query.data) onResults(parseAIResults(query.data.results));
  }, [query.data, onResults]);
  const generate = useMutation({
    mutationFn: (kind: string) =>
      apiData('/ai/jobs', 'post', { kind, interviewId: id, input: {} }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const retry = useMutation({
    mutationFn: (jobId: string) =>
      apiData(`/ai/jobs/${jobId}/retry`, 'post', {}),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const pending = query.data?.jobs.some((j) =>
    ['queued', 'running'].includes(j.status),
  );
  return (
    <div className="card space-y-3">
      <h4 className="font-semibold">Generate AI assistance</h4>
      {query.isLoading && <p role="status">Loading AI status…</p>}
      {query.error && (
        <div role="alert">
          {apiError(query.error)}{' '}
          <button className="btn-outline" onClick={() => query.refetch()}>
            Retry AI status
          </button>
        </div>
      )}
      {query.data && !query.data.configured && (
        <p className="text-sm text-amber-700">
          AI is unavailable until the backend has OpenAI and Redis configured.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['interview-assistant', 'Suggest follow-ups'],
            ['note-writer', 'Generate notes'],
            ['evaluation', 'Generate interview report'],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            className="btn-outline"
            disabled={
              !query.data?.configured ||
              generate.isPending ||
              (kind === 'evaluation'
                ? status !== 'completed'
                : status === 'scheduled') ||
              query.data.jobs.some(
                (j) =>
                  j.kind === kind && ['queued', 'running'].includes(j.status),
              )
            }
            onClick={() => generate.mutate(kind)}
          >
            {label}
          </button>
        ))}
      </div>
      {pending && (
        <p role="status">
          AI work is queued or running. Results will appear here.
        </p>
      )}
      {(generate.error || retry.error) && (
        <p role="alert" className="text-red-600">
          {apiError(generate.error || retry.error)}
        </p>
      )}
      {query.data?.jobs
        .filter((j) => j.status === 'failed')
        .slice(0, 3)
        .map((j) => (
          <div key={j.id} className="text-sm">
            <span>
              {j.kind}: {j.error || 'Generation failed'}
            </span>{' '}
            <button
              className="btn-outline"
              disabled={retry.isPending}
              onClick={() => retry.mutate(j.id)}
            >
              Retry generation
            </button>
          </div>
        ))}
    </div>
  );
}
