import { useEffect, useState } from 'react';
import api, { apiError } from '../../services/api';

export default function ResumeViewer({
  interview,
  expanded = false,
}: {
  expanded?: boolean;
  interview: {
    id: number;
    candidateResume?: string | null;
    candidateResumeUrl?: string | null;
  };
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setUrl('');
    setError('');
    if (interview.candidateResumeUrl) {
      void api
        .get(`/interviews/${interview.id}/resume`, { responseType: 'blob' })
        .then(({ data }) => {
          if (!active) return;
          objectUrl = URL.createObjectURL(data);
          setUrl(objectUrl);
        })
        .catch((err) => {
          if (active) setError(apiError(err, 'Could not load the PDF resume.'));
        });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [interview.id, interview.candidateResumeUrl]);
  return (
    <div className={expanded ? 'h-full min-h-0 flex flex-col gap-2' : 'space-y-3'}>
      {error && <p role="alert">{error}</p>}
      {interview.candidateResumeUrl && !url && !error && <p role="status">Loading PDF resume…</p>}
      {url && (
        <>
          <a
            href={url}
            download={`candidate-resume-${interview.id}.pdf`}
            className="btn-outline text-xs self-start shrink-0"
          >
            Download PDF resume
          </a>
          <iframe
            src={`${url}#view=FitH&navpanes=0`}
            title="Candidate resume PDF"
            className={
              expanded
                ? 'w-full flex-1 min-h-0 border-0 bg-white'
                : 'w-full h-[55vh] rounded-lg bg-white'
            }
          />
        </>
      )}
      {interview.candidateResume && (
        <p
          className={
            expanded
              ? `whitespace-pre-wrap overflow-y-auto ${url ? 'max-h-[20vh] shrink-0' : 'flex-1 min-h-0'}`
              : 'whitespace-pre-wrap'
          }
        >
          {interview.candidateResume}
        </p>
      )}
      {!interview.candidateResume && !interview.candidateResumeUrl && <p>No resume attached.</p>}
    </div>
  );
}
