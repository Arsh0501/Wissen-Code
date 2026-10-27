import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import InterviewAIControls from './InterviewAIControls';
import { InterviewAIResults } from '../../hooks/useInterviewLive';
import InterviewAIConversation from './InterviewAIConversation';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';

export default function InterviewAgentsPanel({ id, status }: { id: number; status: string }) {
  const client = useQueryClient();
  const [results, setResults] = useState<InterviewAIResults>({ followUps: [], notes: [] });
  const receive = useCallback((value: InterviewAIResults) => setResults(value), []);
  const review = useMutation({
    mutationFn: ({
      jobId,
      ...body
    }: {
      jobId: string;
      itemId: string;
      decision: string;
      content?: string;
    }) => apiData(`/ai/jobs/${jobId}/review`, 'post', body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['interview-ai', id] });
      await client.invalidateQueries({ queryKey: ['interview', id] });
    },
  });
  return (
    <InterviewAIConversation
      results={results}
      status={status}
      busy={review.isPending}
      error={review.error ? apiError(review.error) : undefined}
      controls={<InterviewAIControls embedded id={id} status={status} onResults={receive} />}
      onReview={async (item, decision, content) => {
        await review.mutateAsync({
          jobId: item.jobId!,
          itemId: item.id,
          decision,
          ...(content !== undefined ? { content } : {}),
        });
        setResults((previous) => ({
          ...previous,
          followUps: previous.followUps.map((value) =>
            value.id === item.id
              ? { ...value, status: decision === 'ask' ? 'asked' : 'dismissed' }
              : value,
          ),
          notes: previous.notes.map((value) =>
            value.id === item.id
              ? { ...value, status: decision === 'accept' ? 'accepted' : 'rejected' }
              : value,
          ),
        }));
      }}
    />
  );
}
