import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { apiError } from '../../services/api';
import { apiData } from '../../services/workflows';

export interface FeedbackReportMetadata {
  status: 'pending' | 'ready' | 'failed' | 'outdated';
  feedbackRevision: number;
  generatedAt: string | null;
  error: string | null;
  downloadUrl: string | null;
}

export async function downloadInterviewFeedbackReport(interviewId: number) {
  const { data } = await api.get<Blob>(`/interviews/${interviewId}/feedback/report/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `interview-${interviewId}-feedback-report.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function InterviewFeedbackReportDownload({ interviewId, submitted }: {
  interviewId: number;
  submitted: boolean;
}) {
  const client = useQueryClient();
  const key = ['interview-feedback-report', interviewId];
  const report = useQuery({
    queryKey: key,
    queryFn: () => apiData<FeedbackReportMetadata | null>(`/interviews/${interviewId}/feedback/report`),
    enabled: submitted,
    refetchInterval: query => query.state.data?.status === 'pending' ? 2000 : false,
  });
  const download = useMutation({ mutationFn: () => downloadInterviewFeedbackReport(interviewId) });
  const generate = useMutation({
    mutationFn: () => apiData<FeedbackReportMetadata>(`/interviews/${interviewId}/feedback/report`, 'post'),
    onSuccess: data => {
      client.setQueryData(key, data);
      if (data.status === 'ready') download.mutate();
    },
  });
  if (!submitted) return null;
  return <section aria-label="Interview feedback PDF report" className="rounded-xl border border-surface-700 p-4 space-y-3">
    <h3 className="font-semibold">Interview report PDF</h3>
    <p className="text-sm text-surface-400">Includes feedback, recorded questions and responses, submitted code, and follow-ups marked as asked.</p>
    {report.isLoading && <p role="status">Checking report…</p>}
    {report.data?.status === 'ready'
      ? <button type="button" className="btn-outline" disabled={download.isPending} onClick={() => download.mutate()}>{download.isPending ? 'Downloading…' : 'Download PDF report'}</button>
      : <button type="button" className="btn-outline" disabled={report.isLoading || generate.isPending || report.data?.status === 'pending'} onClick={() => generate.mutate()}>{generate.isPending || report.data?.status === 'pending' ? 'Generating PDF report…' : report.data ? 'Regenerate PDF report' : 'Generate PDF report'}</button>}
    {report.data?.error && <p role="status" className="text-sm text-amber-500">{report.data.error}</p>}
    {(report.error || generate.error || download.error) && <p role="alert" className="text-sm text-red-400">{apiError(report.error || generate.error || download.error, 'Could not prepare the PDF download. Retry using the button above.')}</p>}
  </section>;
}
