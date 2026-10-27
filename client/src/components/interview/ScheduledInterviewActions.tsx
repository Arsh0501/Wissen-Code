import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { apiData, workflowKeys } from '../../services/workflows';
import { apiError } from '../../services/api';
import type { InterviewSummary } from '../../pages/admin/InterviewsPage';

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function ScheduledInterviewActions({ interview }: { interview: InterviewSummary }) {
  const { user } = useAuth();
  const isAdmin = (user?.accessRole ?? user?.role) === 'admin';
  const client = useQueryClient();
  const [mode, setMode] = useState<'edit' | 'cancel' | null>(null);
  const [form, setForm] = useState({
    title: '',
    candidateName: '',
    candidateEmail: '',
    interviewerId: '',
    timeLimitMinutes: 45,
    scheduledAt: '',
  });
  const interviewers = useQuery({
    queryKey: ['available-interviewers'],
    queryFn: () => apiData<{ id: number; name: string; email: string }[]>('/users/interviewers'),
    enabled: isAdmin && mode === 'edit',
  });
  const mutation = useMutation({
    mutationFn: (operation: 'edit' | 'cancel') =>
      operation === 'cancel'
        ? apiData(`/interviews/${interview.id}/cancel`, 'post', {})
        : apiData(`/interviews/${interview.id}`, 'put', {
            ...form,
            title: form.title.trim(),
            candidateName: form.candidateName.trim(),
            candidateEmail: form.candidateEmail.trim(),
            interviewerId: Number(form.interviewerId),
            scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
          }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: workflowKeys.interviews }),
        client.invalidateQueries({ queryKey: ['interviewer-interviews'] }),
        client.invalidateQueries({ queryKey: ['interview', interview.id] }),
      ]);
      setMode(null);
    },
  });
  if (!isAdmin || interview.status !== 'scheduled') return null;
  function open(operation: 'edit' | 'cancel') {
    mutation.reset();
    setForm({
      title: interview.title,
      candidateName: interview.candidateName,
      candidateEmail: interview.candidateEmail,
      interviewerId: String(interview.interviewer?.id ?? ''),
      timeLimitMinutes: interview.timeLimitMinutes,
      scheduledAt: localDateTime(interview.scheduledAt),
    });
    setMode(operation);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode) mutation.mutate(mode);
  }
  return (
    <>
      <button className="btn-outline text-xs" onClick={() => open('edit')}>
        Edit interview
      </button>
      <button className="btn-outline text-xs text-red-400" onClick={() => open('cancel')}>
        Cancel interview
      </button>
      {mode && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`schedule-dialog-${interview.id}`}
            className="card w-full max-w-xl max-h-[90vh] overflow-y-auto"
          >
            <h2 id={`schedule-dialog-${interview.id}`} className="text-lg font-semibold mb-4">
              {mode === 'edit' ? 'Edit scheduled interview' : 'Cancel scheduled interview?'}
            </h2>
            <form onSubmit={submit} className="space-y-4">
              {mode === 'cancel' ? (
                <p>
                  Cancel “{interview.title}” for {interview.candidateName}? The interview will
                  remain visible with a cancelled status.
                </p>
              ) : (
                <>
                  <label className="label">
                    Interview title
                    <input
                      className="input mt-2"
                      required
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <label className="label">
                      Candidate name
                      <input
                        className="input mt-2"
                        required
                        value={form.candidateName}
                        onChange={(e) => setForm({ ...form, candidateName: e.target.value })}
                      />
                    </label>
                    <label className="label">
                      Candidate email
                      <input
                        type="email"
                        className="input mt-2"
                        required
                        value={form.candidateEmail}
                        onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })}
                      />
                    </label>
                    <label className="label">
                      Duration (minutes)
                      <input
                        type="number"
                        min={5}
                        max={240}
                        className="input mt-2"
                        required
                        value={form.timeLimitMinutes}
                        onChange={(e) =>
                          setForm({ ...form, timeLimitMinutes: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="label">
                      Scheduled time
                      <input
                        type="datetime-local"
                        className="input mt-2"
                        value={form.scheduledAt}
                        onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="label">
                    Assigned interviewer
                    <select
                      className="input mt-2"
                      required
                      value={form.interviewerId}
                      onChange={(e) => setForm({ ...form, interviewerId: e.target.value })}
                    >
                      <option value="">Select an interviewer</option>
                      {interviewers.data?.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name} ({person.email})
                        </option>
                      ))}
                    </select>
                  </label>
                  {interviewers.isLoading && <p role="status">Loading interviewers…</p>}
                  {interviewers.error && <p role="alert">{apiError(interviewers.error)}</p>}
                </>
              )}
              {mutation.error && (
                <p role="alert" className="text-red-400">
                  {apiError(mutation.error)}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="btn-outline"
                  disabled={mutation.isPending}
                  onClick={() => setMode(null)}
                >
                  {mode === 'cancel' ? 'Keep interview' : 'Close'}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    mutation.isPending ||
                    (mode === 'edit' && (interviewers.isLoading || !!interviewers.error))
                  }
                >
                  {mutation.isPending
                    ? 'Saving…'
                    : mode === 'edit'
                      ? 'Save changes'
                      : 'Confirm cancellation'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
