import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
type Template = {
  key: string;
  name: string;
  minutes: number;
  topics: string[];
  questionTypes: string[];
  description: string;
};
export function TemplatesPanel() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['assessment-templates'],
    queryFn: () => apiData<Template[]>('/platform/templates'),
  });
  const create = useMutation({
    mutationFn: (template: Template) =>
      apiData<{ id: number }>('/platform/templates/draft', 'post', {
        name: template.name,
        minutes: template.minutes,
        topics: template.topics,
        questionTypes: template.questionTypes,
        questionCount: 5,
      }),
    onSuccess: (draft) => navigate(`/admin/assessments/${draft.id}/edit`),
  });
  return (
    <section className="space-y-4">
      <p className="card text-sm text-surface-500">
        Templates create editable drafts using matching questions from your
        bank. Review question coverage, difficulty, and scoring before
        publishing.
      </p>
      {query.error && <p role="alert">{apiError(query.error)}</p>}
      <div className="grid lg:grid-cols-3 gap-4">
        {query.data?.map((t) => (
          <div className="card space-y-4" key={t.key}>
            <h2 className="font-semibold">{t.name}</h2>
            <p className="text-sm text-surface-500">{t.description}</p>
            <p>
              {t.minutes} minutes · {t.topics.join(', ')}
            </p>
            <button
              className="btn-primary"
              disabled={create.isPending}
              onClick={() => create.mutate(t)}
            >
              Create draft
            </button>
          </div>
        ))}
      </div>
      {create.error && <p role="alert">{apiError(create.error)}</p>}
    </section>
  );
}
export function AccommodationsPanel({ id }: { id: string }) {
  const users = useQuery({
    queryKey: ['accommodation-candidates'],
    queryFn: () =>
      apiData<{ id: number; name: string; email: string; role: string }[]>(
        '/users',
      ),
  });
  const [candidate, setCandidate] = useState('');
  const [minutes, setMinutes] = useState(15);
  const [reason, setReason] = useState('');
  const request = useMutation({
    mutationFn: () =>
      apiData(`/platform/assessments/${id}/accommodations`, 'post', {
        candidateUserId: Number(candidate),
        extraMinutes: minutes,
        reason,
      }),
  });
  return (
    <section className="card space-y-4 max-w-3xl">
      <h2 className="font-semibold">Candidate accommodations</h2>
      <p className="text-sm text-surface-500">
        Extra time is enforced by the server and applied when a new attempt
        starts. Active attempts keep their original deadline. Enter only the
        operational reason; avoid recording sensitive medical details.
      </p>
      <label className="label">
        Candidate
        <select
          className="input mt-2"
          value={candidate}
          onChange={(e) => setCandidate(e.target.value)}
        >
          <option value="">Select candidate</option>
          {users.data
            ?.filter((u) => u.role === 'candidate')
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.email}
              </option>
            ))}
        </select>
      </label>
      <label className="label">
        Extra minutes
        <input
          type="number"
          min={0}
          max={240}
          className="input mt-2"
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </label>
      <label className="label">
        Operational reason
        <textarea
          className="input mt-2"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        className="btn-primary"
        disabled={!candidate || reason.trim().length < 5 || request.isPending}
        onClick={() => request.mutate()}
      >
        Save accommodation
      </button>
      {request.isSuccess && (
        <p role="status">Accommodation saved for future attempts.</p>
      )}
      {request.error && <p role="alert">{apiError(request.error)}</p>}
      {users.error && <p role="alert">{apiError(users.error)}</p>}
    </section>
  );
}
