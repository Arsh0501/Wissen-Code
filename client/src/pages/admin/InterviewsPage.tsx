import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import AdminLayout from '../../components/AdminLayout';
import QuestionPicker from '../../components/questions/QuestionPicker';
import { apiData, workflowKeys } from '../../services/workflows';
import {
  apiError,
  getQuestions,
  getAssessments,
  getReportData,
} from '../../services/api';
import { Question } from '../../types';
import { Spinner } from '../../components/ui';
export interface InterviewSummary {
  id: number;
  title: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  timeLimitMinutes: number;
  roomToken: string;
  scheduledAt: string | null;
}
export default function InterviewsPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const list = useQuery({
    queryKey: workflowKeys.interviews,
    queryFn: () => apiData<InterviewSummary[]>('/interviews'),
    refetchInterval: 30000,
  });
  const bank = useQuery({
    queryKey: ['question-bank'],
    queryFn: () => getQuestions(),
  });
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [duration, setDuration] = useState(45);
  const [scheduled, setScheduled] = useState('');
  const [questionIds, setQuestions] = useState<number[]>([]);
  const [preview, setPreview] = useState<Question | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [validation, setValidation] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateAssessment, setCandidateAssessment] = useState('');
  const directory = useQuery({
    queryKey: ['candidate-directory', candidateSearch],
    queryFn: () =>
      apiData<{ id: number; name: string; email: string }[]>(
        `/candidates?search=${encodeURIComponent(candidateSearch)}`,
      ),
    enabled: creating && step === 1,
  });
  const assessmentList = useQuery({
    queryKey: ['assessments'],
    queryFn: getAssessments,
    enabled: creating && step === 1,
  });
  const assessmentCandidates = useQuery({
    queryKey: ['assessment-candidates', Number(candidateAssessment)],
    queryFn: () =>
      apiData<{ candidates: { name: string }[] }>(
        `/assessments/${candidateAssessment}/candidates`,
      ),
    enabled: creating && step === 1 && !!candidateAssessment,
  });
  const resolveCandidate = useMutation({
    mutationFn: (candidate: string) =>
      getReportData(candidate, Number(candidateAssessment)),
    onSuccess: (data, candidate) => {
      setName(candidate);
      setEmail(data.candidate?.email || '');
    },
  });
  const candidates = [
    ...new Map(
      [
        ...(Array.isArray(directory.data)
          ? directory.data.map((c) => ({
              candidateName: c.name,
              candidateEmail: c.email,
            }))
          : []),
        ...(list.data ?? []),
      ].map((i) => [
        i.candidateEmail,
        { name: i.candidateName, email: i.candidateEmail },
      ]),
    ).values(),
  ].filter((c) =>
    `${c.name} ${c.email}`
      .toLowerCase()
      .includes(candidateSearch.toLowerCase()),
  );
  const visible = (list.data ?? []).filter(
    (i) =>
      (!status || i.status === status) &&
      `${i.title} ${i.candidateName} ${i.candidateEmail}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const create = useMutation({
    mutationFn: async (start: boolean) => {
      let id = createdId;
      if (!id) {
        const result = await apiData<{ interview: InterviewSummary }>(
          '/interviews',
          'post',
          {
            title,
            candidateName: name,
            candidateEmail: email,
            timeLimitMinutes: duration,
            scheduledAt: scheduled ? new Date(scheduled).toISOString() : null,
            questionIds,
          },
        );
        id = result.interview.id;
        setCreatedId(id);
      }
      if (start) await apiData(`/interviews/${id}/start`, 'post', {});
      return { id, start };
    },
    onSuccess: async ({ id, start }) => {
      await client.invalidateQueries({ queryKey: workflowKeys.interviews });
      navigate(`/admin/interviews/${id}${start ? '?tab=live' : ''}`);
    },
  });
  const start = useMutation({
    mutationFn: (id: number) => apiData(`/interviews/${id}/start`, 'post', {}),
    onSuccess: async (_result, id) => {
      await client.invalidateQueries({ queryKey: workflowKeys.interviews });
      navigate(`/admin/interviews/${id}?tab=live`);
    },
  });
  function next() {
    const error =
      step === 0
        ? !title.trim()
          ? 'Enter an interview title.'
          : !Number.isInteger(duration) || duration < 5 || duration > 240
            ? 'Duration must be 5–240 minutes.'
            : ''
        : step === 1
          ? !name.trim()
            ? 'Select or enter a candidate.'
            : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
              ? 'Enter a valid candidate email.'
              : ''
          : !questionIds.length
            ? 'Select at least one question.'
            : '';
    setValidation(error);
    if (!error) setStep((v) => v + 1);
  }
  return (
    <AdminLayout
      title="Interview Dashboard"
      subtitle="Create an interview, select a candidate and questions, then enter the live room"
      actions={
        <button
          className="btn-primary"
          disabled={create.isPending}
          onClick={() => {
            setCreating((v) => !v);
            setValidation('');
          }}
        >
          {creating ? 'Close creation flow' : 'Create Interview'}
        </button>
      }
    >
      {creating && (
        <section className="card space-y-5 mb-6">
          <nav
            aria-label="Interview creation steps"
            className="flex gap-2 flex-wrap"
          >
            {[
              'Create Interview',
              'Select Candidate',
              'Select Questions',
              'Start Interview',
            ].map((label, index) => (
              <span
                key={label}
                aria-current={step === index ? 'step' : undefined}
                className={`badge px-3 py-2 ${step === index ? 'bg-primary-500/15 text-primary-700' : ''}`}
              >
                {index + 1}. {label}
              </span>
            ))}
          </nav>
          {step === 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              <label className="label">
                Interview title
                <input
                  className="input mt-2"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="label">
                Duration (minutes)
                <input
                  type="number"
                  min={5}
                  max={240}
                  className="input mt-2"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <label className="label">
                Scheduled time
                <input
                  type="datetime-local"
                  className="input mt-2"
                  value={scheduled}
                  onChange={(e) => setScheduled(e.target.value)}
                />
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-semibold">Select Candidate</h2>
              {directory.isLoading && (
                <p role="status">Loading candidate directory…</p>
              )}
              {directory.error && (
                <p role="alert">{apiError(directory.error)}</p>
              )}
              <label className="label">
                Candidates from an assessment
                <select
                  className="input mt-2"
                  value={candidateAssessment}
                  onChange={(e) => setCandidateAssessment(e.target.value)}
                >
                  <option value="">
                    Choose an assessment to browse participants
                  </option>
                  {assessmentList.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {assessmentList.error && (
                <p role="alert">{apiError(assessmentList.error)}</p>
              )}
              {assessmentCandidates.isLoading && candidateAssessment && (
                <p role="status">Loading assessment candidates…</p>
              )}
              {assessmentCandidates.error && (
                <p role="alert">{apiError(assessmentCandidates.error)}</p>
              )}
              {assessmentCandidates.data && (
                <div className="flex gap-2 flex-wrap">
                  {assessmentCandidates.data.candidates
                    .filter((c) =>
                      c.name
                        .toLowerCase()
                        .includes(candidateSearch.toLowerCase()),
                    )
                    .map((c) => (
                      <button
                        key={c.name}
                        className="btn-outline text-sm"
                        disabled={resolveCandidate.isPending}
                        onClick={() => resolveCandidate.mutate(c.name)}
                      >
                        {c.name}
                      </button>
                    ))}
                  {!assessmentCandidates.data.candidates.length && (
                    <p className="text-sm text-surface-500">
                      This assessment has no candidate attempts yet.
                    </p>
                  )}
                </div>
              )}
              {resolveCandidate.error && (
                <p role="alert">{apiError(resolveCandidate.error)}</p>
              )}
              <input
                className="input"
                aria-label="Search candidates"
                placeholder="Search previously interviewed candidates"
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
              />
              <div className="grid md:grid-cols-2 gap-3 max-h-48 overflow-auto">
                {candidates.map((c) => (
                  <button
                    key={c.email}
                    className={`p-3 rounded border text-left ${email === c.email ? 'border-primary-500' : 'border-surface-700'}`}
                    aria-pressed={email === c.email}
                    onClick={() => {
                      setName(c.name);
                      setEmail(c.email);
                    }}
                  >
                    <strong className="text-sm block">{c.name}</strong>
                    <span className="text-xs text-surface-500">{c.email}</span>
                  </button>
                ))}
              </div>
              {!candidates.length && (
                <p className="text-sm text-surface-500">
                  No matching previous candidates. Enter a new candidate below.
                </p>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <label className="label">
                  Candidate name
                  <input
                    className="input mt-2"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="label">
                  Candidate email
                  <input
                    type="email"
                    className="input mt-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
          {step === 2 && (
            <>
              {bank.isLoading ? (
                <Spinner label="Loading question bank…" />
              ) : bank.error ? (
                <div role="alert">
                  {apiError(bank.error)}
                  <button
                    className="btn-outline ml-3"
                    onClick={() => bank.refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <QuestionPicker
                  questions={bank.data ?? []}
                  selectedIds={questionIds}
                  onChange={setQuestions}
                  onPreview={setPreview}
                />
              )}{' '}
              {preview && (
                <div className="p-4 border border-surface-700 rounded space-y-3">
                  <div className="flex justify-between">
                    <h3 className="font-semibold">{preview.title}</h3>
                    <button
                      className="btn-ghost"
                      onClick={() => setPreview(null)}
                    >
                      Close preview
                    </button>
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{preview.statement}</ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-semibold">Ready to start</h2>
              <dl className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-surface-500">Interview</dt>
                  <dd>
                    {title} · {duration} minutes
                  </dd>
                </div>
                <div>
                  <dt className="text-surface-500">Candidate</dt>
                  <dd>
                    {name} · {email}
                  </dd>
                </div>
              </dl>
              <ol className="list-decimal pl-5 text-sm space-y-2">
                {questionIds.map((id) => (
                  <li key={id}>{bank.data?.find((q) => q.id === id)?.title}</li>
                ))}
              </ol>
              {createdId && (
                <p className="text-amber-700 text-sm">
                  Interview #{createdId} was created. Retry starting it, or open
                  its workspace; it will not be created twice.
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-primary"
                  disabled={create.isPending}
                  onClick={() => create.mutate(true)}
                >
                  {create.isPending
                    ? 'Starting…'
                    : createdId
                      ? 'Retry start interview'
                      : 'Start Interview & enter live room'}
                </button>
                <button
                  className="btn-outline"
                  disabled={create.isPending}
                  onClick={() => create.mutate(false)}
                >
                  {createdId
                    ? 'Open saved interview'
                    : 'Save scheduled interview'}
                </button>
              </div>
            </div>
          )}
          {(validation || create.error) && (
            <p role="alert" className="text-red-600">
              {validation || apiError(create.error)}
            </p>
          )}
          <div className="flex justify-between">
            <button
              className="btn-ghost"
              disabled={!step || create.isPending || !!createdId}
              onClick={() => {
                setStep((v) => v - 1);
                setValidation('');
              }}
            >
              Back
            </button>
            {step < 3 && (
              <button className="btn-outline" onClick={next}>
                Next:{' '}
                {
                  ['Select Candidate', 'Select Questions', 'Start Interview'][
                    step
                  ]
                }
              </button>
            )}
          </div>
        </section>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {['scheduled', 'in_progress', 'completed', 'cancelled'].map((value) => (
          <button
            className={`card text-left ${status === value ? 'ring-2 ring-primary-500' : ''}`}
            key={value}
            onClick={() => setStatus((prev) => (prev === value ? '' : value))}
          >
            <span className="text-sm capitalize">
              {value.replace(/_/g, ' ')}
            </span>
            <strong className="block text-2xl mt-1">
              {list.data?.filter((i) => i.status === value).length ?? 0}
            </strong>
          </button>
        ))}
      </div>
      <div className="flex gap-3 mb-5">
        <input
          className="input"
          aria-label="Search interviews"
          placeholder="Search interviews or candidates"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(status || search) && (
          <button
            className="btn-outline"
            onClick={() => {
              setStatus('');
              setSearch('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {start.error && (
        <p role="alert" className="text-red-600 mb-4">
          {apiError(start.error)}
        </p>
      )}
      {list.isLoading ? (
        <Spinner label="Loading interviews…" />
      ) : list.error ? (
        <div className="card" role="alert">
          {apiError(list.error)}
          <button className="btn-outline ml-3" onClick={() => list.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!visible.length && (
            <div className="card">
              {list.data?.length
                ? 'No interviews match these filters.'
                : 'Create your first interview to get started.'}
            </div>
          )}
          {visible.map((i) => (
            <article
              className="card flex flex-wrap justify-between items-center gap-4"
              key={i.id}
            >
              <div>
                <h2 className="font-semibold">{i.title}</h2>
                <p className="text-sm text-surface-500">
                  {i.candidateName} · {i.timeLimitMinutes} min ·{' '}
                  {i.status.replace(/_/g, ' ')}
                  {i.scheduledAt &&
                    ` · ${new Date(i.scheduledAt).toLocaleString()}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {i.status === 'scheduled' && (
                  <button
                    className="btn-primary"
                    disabled={start.isPending}
                    onClick={() => start.mutate(i.id)}
                  >
                    Start interview
                  </button>
                )}
                <Link
                  className="btn-outline"
                  to={`/admin/interviews/${i.id}${i.status === 'in_progress' ? '?tab=live' : ''}`}
                >
                  {i.status === 'in_progress'
                    ? 'Join live room'
                    : i.status === 'completed'
                      ? 'View evaluation'
                      : 'Plan and review'}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
