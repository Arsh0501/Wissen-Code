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

export default function InterviewFeedbackReportDownload({ interviewId, submitted, completed = false, compact = false }: {
  interviewId: number;
  submitted: boolean;
  completed?: boolean;
  compact?: boolean;
}) {
  const client = useQueryClient();
  const key = ['interview-feedback-report', interviewId];
  const report = useQuery({
    queryKey: key,
    queryFn: () => apiData<FeedbackReportMetadata | null>(`/interviews/${interviewId}/feedback/report`),
    enabled: submitted && !compact,
    refetchInterval: query => query.state.data?.status === 'pending' ? 2000 : false,
  });
  const download = useMutation({ mutationFn: () => downloadInterviewFeedbackReport(interviewId) });
  const prepareDownload = useMutation({ mutationFn: async () => {
    let metadata = await apiData<FeedbackReportMetadata | null>(`/interviews/${interviewId}/feedback/report`);
    if (metadata?.status !== 'ready') metadata = await apiData<FeedbackReportMetadata>(`/interviews/${interviewId}/feedback/report`, 'post');
    client.setQueryData(key, metadata);
    if (metadata?.status !== 'ready') throw new Error(metadata?.error || 'Report generation is not complete. Open the interview to check its status.');
    await downloadInterviewFeedbackReport(interviewId);
  } });
  const generate = useMutation({
    mutationFn: () => apiData<FeedbackReportMetadata>(`/interviews/${interviewId}/feedback/report`, 'post'),
    onSuccess: data => {
      client.setQueryData(key, data);
      if (data.status === 'ready') download.mutate();
    },
  });
  if (!submitted && !completed) return null;
  if (compact) return <div className="shrink-0 space-y-1">
    <button type="button" className="btn-outline text-xs px-3 py-2 whitespace-nowrap" disabled={!submitted || prepareDownload.isPending} title={submitted ? 'Generate or download the complete interview report' : 'The interviewer must submit final feedback before downloading the report.'} onClick={() => prepareDownload.mutate()}>{prepareDownload.isPending ? 'Preparing PDF…' : 'Download PDF report'}</button>
    {!submitted && <p className="text-xs text-surface-400">Awaiting final feedback</p>}
    {prepareDownload.error && <p role="alert" className="text-xs text-red-400 max-w-64 whitespace-normal">{apiError(prepareDownload.error)}</p>}
  </div>;
  return <section aria-label="Interview feedback PDF report" className="rounded-xl border border-surface-700 p-4 space-y-3">
    <h3 className="font-semibold">Interview report PDF</h3>
    <p className="text-sm text-surface-400">Includes main questions, asked follow-ups and their transcript answers, feedback for each question, submitted code, and final interview feedback.</p>
    {!submitted ? <><button type="button" className="btn-outline" disabled>Download PDF report</button><p className="text-sm text-surface-400">The interviewer must submit final feedback before this report can be downloaded.</p></> : <>
    {report.isLoading && <p role="status">Checking report…</p>}
    {report.data?.status === 'ready'
      ? <button type="button" className="btn-outline" disabled={download.isPending} onClick={() => download.mutate()}>{download.isPending ? 'Downloading…' : 'Download PDF report'}</button>
      : <button type="button" className="btn-outline" disabled={report.isLoading || generate.isPending || report.data?.status === 'pending'} onClick={() => generate.mutate()}>{generate.isPending || report.data?.status === 'pending' ? 'Generating PDF report…' : report.data ? 'Regenerate PDF report' : 'Generate PDF report'}</button>}
    {report.data?.error && <p role="status" className="text-sm text-amber-500">{report.data.error}</p>}
    {(report.error || generate.error || download.error) && <p role="alert" className="text-sm text-red-400">{apiError(report.error || generate.error || download.error, 'Could not prepare the PDF download. Retry using the button above.')}</p>}
    </>}
  </section>;
}
