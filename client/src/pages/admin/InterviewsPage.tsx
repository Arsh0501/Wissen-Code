import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  Clock,
  Play,
  FileText,
  Star,
  Upload,
  CheckCircle2,
  Eye,
  X,
} from 'lucide-react';
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
import { useAuth } from '../../context/AuthContext';
import ResumeDialog from '../../components/interview/ResumeDialog';
import ScheduledInterviewActions from '../../components/interview/ScheduledInterviewActions';
import InterviewNavigation from '../../components/interview/InterviewNavigation';

export interface InterviewSummary {
  id: number;
  title: string;
  candidateName: string;
  candidateEmail: string;
  candidateResume?: string | null;
  candidateResumeUrl?: string | null;
  status: string;
  timeLimitMinutes: number;
  extendedMinutes?: number;
  roomToken: string;
  scheduledAt: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  finalFeedback?: string | null;
  finalRating?: number | null;
  finalRecommendation?: string | null;
  interviewer?: { id: number; name: string; email: string; role?: string };
  candidate?: { id: number; name: string; email: string };
  _count?: { questions: number };
}

export default function InterviewsPage() {
  const { role } = useAuth();
  const schedulingOnly = role === 'admin';
  const reviewStep = schedulingOnly ? 2 : 3;
  const creationSteps = schedulingOnly
    ? ['Create Interview', 'Select Candidate', 'Review & Schedule']
    : ['Create Interview', 'Select Candidate', 'Select Questions', 'Start Interview'];
  const navigate = useNavigate();
  const client = useQueryClient();

  const list = useQuery({
    queryKey: workflowKeys.interviews,
    queryFn: () => apiData<InterviewSummary[]>('/interviews'),
    refetchInterval: 15000,
  });

  const bank = useQuery({
    queryKey: ['question-bank'],
    queryFn: () => getQuestions(),
    enabled: !schedulingOnly,
  });

  // Creation flow state
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [interviewerId, setInterviewerId] = useState<string>('');
  const [candidateResume, setCandidateResume] = useState<string>('');
  const [resumePdf, setResumePdf] = useState('');
  const [readingResume, setReadingResume] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string>('');
  const [duration, setDuration] = useState(45);
  const [scheduled, setScheduled] = useState('');
  const [questionIds, setQuestions] = useState<number[]>([]);
  const [preview, setPreview] = useState<Question | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [validation, setValidation] = useState('');

  // Filter state
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateAssessment, setCandidateAssessment] = useState('');

  // Modal state for viewing feedback / resume
  const [viewingFeedback, setViewingFeedback] = useState<InterviewSummary | null>(null);
  const [viewingResume, setViewingResume] = useState<InterviewSummary | null>(null);

  // Fetch available interviewers (role: interviewer or admin, not candidate)
  const interviewersQuery = useQuery({
    queryKey: ['available-interviewers'],
    queryFn: () =>
      apiData<{ id: number; name: string; email: string; role: string }[]>(
        '/users/interviewers',
      ),
    enabled: creating,
  });

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
      `${i.title} ${i.candidateName} ${i.candidateEmail} ${i.interviewer?.name || ''}`
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
            interviewerId: interviewerId ? Number(interviewerId) : undefined,
            candidateResume: candidateResume ? candidateResume.trim() : undefined,
            candidateResumeUrl: resumePdf || undefined,
            timeLimitMinutes: duration,
            scheduledAt: scheduled ? new Date(scheduled).toISOString() : null,
            questionIds: schedulingOnly ? [] : questionIds,
          },
        );
        id = result.interview.id;
        setCreatedId(id);
      }
      if (start && !schedulingOnly) await apiData(`/interviews/${id}/start`, 'post', {});
      return { id, start };
    },
    onSuccess: async ({ id, start }) => {
      await client.invalidateQueries({ queryKey: workflowKeys.interviews });
      await client.invalidateQueries({ queryKey: ['interviewer-interviews'] });
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

  // Schedule timing window checker
  const getStartWindowInfo = (scheduledAt: string | null, durationMinutes: number) => {
    if (!scheduledAt) return { canStart: true, reason: 'Immediate interview' };
    const now = Date.now();
    const scheduledTime = new Date(scheduledAt).getTime();
    const earliestStart = scheduledTime - 15 * 60 * 1000;
    const latestStart = scheduledTime + durationMinutes * 60 * 1000;

    if (now < earliestStart) {
      const minsRemaining = Math.ceil((earliestStart - now) / 60000);
      const hours = Math.floor(minsRemaining / 60);
      const mins = minsRemaining % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return {
        canStart: false,
        reason: `Window opens 15m prior (in ${timeStr})`,
        isEarly: true,
      };
    }
    if (now >= latestStart) {
      return {
        canStart: false,
        reason: 'Scheduled window has expired',
        isExpired: true,
      };
    }
    return { canStart: true, reason: 'Within scheduled start window' };
  };

  const handleResumeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(txt|md|pdf)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setValidation('Upload a PDF, .txt or .md resume, 5 MB or smaller.');
      e.target.value = '';
      return;
    }
    setValidation('');
    setReadingResume(true);
    setResumeFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => { setReadingResume(false); setValidation('Could not read the resume. Try uploading it again.'); };
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (/\.pdf$/i.test(file.name)) {
        setResumePdf(`data:application/pdf;base64,${content.split(',')[1]}`);
        setCandidateResume('');
      } else {
        setResumePdf('');
        setCandidateResume((content || '').replace(/\u0000/g, ''));
      }
      setReadingResume(false);
    };
    if (/\.pdf$/i.test(file.name)) reader.readAsDataURL(file);
    else reader.readAsText(file);
  };

  function next() {
    const error =
      step === 0
        ? !title.trim()
          ? 'Enter an interview title.'
          : schedulingOnly && !interviewerId
            ? 'Select an interviewer.'
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
      title="Interview Dashboard & Scheduler"
      subtitle="Schedule multiple interviews, select interviewers & candidates, upload resumes, and review live progress"
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
      <InterviewNavigation />
      {creating && (
        <section className="card space-y-5 mb-6 border border-primary-500/30">
          <nav
            aria-label="Interview creation steps"
            className="flex gap-2 flex-wrap"
          >
            {creationSteps.map((label, index) => (
              <span
                key={label}
                aria-current={step === index ? 'step' : undefined}
                className={`badge px-3 py-2 ${
                  step === index ? 'bg-primary-500/20 text-primary-300 border border-primary-500/40' : ''
                }`}
              >
                {index + 1}. {label}
              </span>
            ))}
          </nav>

          {/* STEP 0: Interview details & Assigned Interviewer */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <label className="label">
                  Interview title
                  <input
                    className="input mt-2"
                    placeholder="e.g. Senior Fullstack Technical Interview"
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
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <label className="label">
                  Scheduled time
                  <input
                    type="datetime-local"
                    className="input mt-2"
                    value={scheduled}
                    onChange={(e) => setScheduled(e.target.value)}
                  />
                  <span className="text-[11px] text-surface-400 mt-1 block">
                    Interviews can be started up to 15 minutes before this scheduled time.
                  </span>
                </label>

                <label className="label">
                  Assigned Interviewer
                  <select
                    className="input mt-2"
                    value={interviewerId}
                    onChange={(e) => setInterviewerId(e.target.value)}
                  >
                    <option value="">{schedulingOnly ? 'Select an interviewer' : 'Default (Current Interviewer)'}</option>
                    {Array.isArray(interviewersQuery.data)
                      ? interviewersQuery.data.map((interviewer) => (
                          <option key={interviewer.id} value={interviewer.id}>
                            {interviewer.name} ({interviewer.email}) — Role: {interviewer.role}
                          </option>
                        ))
                      : null}
                  </select>
                  <span className="text-[11px] text-surface-400 mt-1 block">
                    Only users with Interviewer or Admin role can conduct interviews. Candidates cannot be selected as interviewers.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 1: Select Candidate & Upload Resume */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-white">Select Candidate & Candidate Resume</h2>
              {directory.isLoading && (
                <p role="status" className="text-xs text-surface-400">Loading candidate directory…</p>
              )}
              {directory.error && (
                <p role="alert" className="text-xs text-red-400">{apiError(directory.error)}</p>
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
                        className="btn-outline text-xs"
                        disabled={resolveCandidate.isPending}
                        onClick={() => resolveCandidate.mutate(c.name)}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
              )}

              <input
                className="input"
                aria-label="Search candidates"
                placeholder="Search candidates by name or email…"
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
              />

              <div className="grid md:grid-cols-2 gap-3 max-h-40 overflow-auto">
                {candidates.map((c) => (
                  <button
                    key={c.email}
                    type="button"
                    className={`p-3 rounded-lg border text-left transition-all ${
                      email === c.email
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-surface-700 hover:border-surface-600'
                    }`}
                    aria-pressed={email === c.email}
                    onClick={() => {
                      setName(c.name);
                      setEmail(c.email);
                    }}
                  >
                    <strong className="text-sm block text-white">{c.name}</strong>
                    <span className="text-xs text-surface-400">{c.email}</span>
                  </button>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <label className="label">
                  Candidate name
                  <input
                    className="input mt-2"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Candidate full name"
                  />
                </label>
                <label className="label">
                  Candidate email
                  <input
                    type="email"
                    className="input mt-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="candidate@example.com"
                  />
                </label>
              </div>

              {/* Resume Upload Box */}
              <div className="p-4 bg-surface-950/60 border border-surface-700/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-primary-400" />
                    <span className="text-sm font-semibold text-white">
                      Candidate Resume (Optional but Recommended)
                    </span>
                  </div>
                  {resumeFileName && (
                    <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {resumeFileName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-400">
                  Upload a PDF or text resume (.txt or .md), up to 5 MB. The assigned interviewer can view it and generate questions before the interview. For scanned PDFs, paste the resume text below.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <label className="btn-outline text-xs cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    Browse Resume File
                    <input
                      type="file"
                      accept=".txt,.md,.pdf,application/pdf"
                      disabled={readingResume}
                      className="hidden"
                      onChange={handleResumeFileUpload}
                    />
                  </label>
                  {(candidateResume || resumePdf) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCandidateResume('');
                        setResumePdf('');
                        setResumeFileName('');
                      }}
                      className="btn-ghost text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                      disabled={readingResume}
                    >
                      <X className="w-3 h-3" /> Clear Resume
                    </button>
                  )}
                </div>

                <textarea
                  rows={4}
                  className="input w-full text-xs font-mono mt-2"
                  placeholder="Or paste candidate resume text directly here (skills, work history, projects, tech stack)…"
                  value={candidateResume}
                  onChange={(e) => setCandidateResume(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 2: Select Questions */}
          {!schedulingOnly && step === 2 && (
            <>
              {bank.isLoading ? (
                <Spinner label="Loading question bank…" />
              ) : bank.error ? (
                <div role="alert" className="text-red-400 text-sm">
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
              )}
              {preview && (
                <div className="p-4 border border-surface-700 rounded-lg space-y-3 bg-surface-950/40">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-white">{preview.title}</h3>
                    <button
                      className="btn-ghost text-xs"
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

          {/* STEP 3: Review & Start */}
          {step === reviewStep && (
            <div className="space-y-4">
              <h2 className="font-semibold text-white">Review Interview Details</h2>
              <dl className="grid md:grid-cols-2 gap-4 text-sm bg-surface-950/50 p-4 rounded-lg border border-surface-800">
                <div>
                  <dt className="text-surface-400 text-xs">Interview Title & Duration</dt>
                  <dd className="text-white font-medium">
                    {title} · {duration} minutes
                  </dd>
                </div>
                <div>
                  <dt className="text-surface-400 text-xs">Scheduled Time</dt>
                  <dd className="text-white font-medium">
                    {scheduled ? new Date(scheduled).toLocaleString() : 'Immediate / Flexible'}
                  </dd>
                </div>
                <div>
                  <dt className="text-surface-400 text-xs">Candidate</dt>
                  <dd className="text-white font-medium">
                    {name} ({email})
                  </dd>
                </div>
                <div>
                  <dt className="text-surface-400 text-xs">Assigned Interviewer</dt>
                  <dd className="text-white font-medium">
                    {interviewerId && Array.isArray(interviewersQuery.data)
                      ? interviewersQuery.data.find((i) => i.id === Number(interviewerId))?.name ||
                        `Interviewer #${interviewerId}`
                      : interviewerId
                        ? `Interviewer #${interviewerId}`
                        : 'Default (Current Scheduler)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-surface-400 text-xs">Resume Status</dt>
                  <dd className="text-white font-medium">
                    {candidateResume || resumePdf ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {resumePdf ? 'PDF attached' : `Attached (${candidateResume.length} chars)`}
                      </span>
                    ) : (
                      <span className="text-surface-500">No resume attached</span>
                    )}
                  </dd>
                </div>
                {!schedulingOnly && <div>
                  <dt className="text-surface-400 text-xs">Questions Selected</dt>
                  <dd className="text-white font-medium">
                    {questionIds.length} question(s)
                  </dd>
                </div>}
              </dl>

              <ol className="list-decimal pl-5 text-xs space-y-1 text-surface-300">
                {questionIds.map((id) => (
                  <li key={id}>{bank.data?.find((q) => q.id === id)?.title}</li>
                ))}
              </ol>

              {createdId && (
                <p className="text-amber-400 text-xs">
                  Interview #{createdId} was saved. You can enter its workspace now or manage it from the dashboard.
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                {!schedulingOnly && <button
                  className="btn-primary"
                  disabled={create.isPending}
                  onClick={() => create.mutate(true)}
                >
                  {create.isPending
                    ? 'Starting…'
                    : createdId
                      ? 'Retry start interview'
                      : 'Start Interview & enter live room'}
                </button>}
                <button
                  className="btn-outline"
                  disabled={create.isPending || readingResume}
                  onClick={() => create.mutate(false)}
                >
                  {createdId ? 'Open saved interview' : 'Save scheduled interview'}
                </button>
              </div>
            </div>
          )}

          {(validation || create.error) && (
            <p role="alert" className="text-red-400 text-sm">
              {validation || apiError(create.error)}
            </p>
          )}

          <div className="flex justify-between border-t border-surface-800 pt-3">
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
            {step < reviewStep && (
              <button className="btn-outline" onClick={next} disabled={readingResume}>
                Next:{' '}
                {creationSteps[step + 1]}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Metrics filter cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        {['scheduled', 'in_progress', 'completed', 'cancelled', 'expired'].map((value) => {
          const count = list.data?.filter((i) => i.status === value).length ?? 0;
          return (
            <button
              className={`card text-left transition-all p-4 ${
                status === value
                  ? 'ring-2 ring-primary-500 bg-surface-800'
                  : 'hover:bg-surface-850'
              }`}
              key={value}
              onClick={() => setStatus((prev) => (prev === value ? '' : value))}
            >
              <div className="flex items-center justify-between text-surface-400">
                <span className="text-xs uppercase font-semibold tracking-wider capitalize">
                  {value === 'expired' ? 'Ended — not started' : value === 'in_progress' ? 'Live Now' : value.replace(/_/g, ' ')}
                </span>
                {value === 'in_progress' && count > 0 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                )}
              </div>
              <strong className="block text-2xl mt-1 text-white">{count}</strong>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap sm:flex-nowrap gap-3 mb-5">
        <input
          className="input flex-1 min-w-0"
          aria-label="Search interviews"
          placeholder="Search interviews by candidate, title, or assigned interviewer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input w-auto shrink-0"
          aria-label="Filter interviews by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">Ongoing</option>
          <option value="completed">Finished</option>
          <option value="expired">Ended — not started</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {(status || search) && (
          <button
            className="btn-outline text-xs"
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
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
          {apiError(start.error)}
        </div>
      )}

      {/* Main Interviews List */}
      {list.isLoading ? (
        <Spinner label="Loading interviews…" />
      ) : list.error ? (
        <div className="card text-red-400" role="alert">
          {apiError(list.error)}
          <button className="btn-outline ml-3" onClick={() => list.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!visible.length && (
            <div className="card text-center py-8 text-surface-400">
              {list.data?.length
                ? 'No interviews match these filters.'
                : 'Create your first interview to get started.'}
            </div>
          )}

          {visible.map((i) => {
            const timing = getStartWindowInfo(i.scheduledAt, i.timeLimitMinutes);
            const isLive = i.status === 'in_progress';
            const isCompleted = i.status === 'completed';
            const isScheduled = i.status === 'scheduled';

            return (
              <article
                className={`card flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all border ${
                  isLive
                    ? 'border-emerald-500/40 bg-emerald-950/10'
                    : isCompleted
                      ? 'border-surface-800 bg-surface-900/60'
                      : 'border-surface-700/60'
                }`}
                key={i.id}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-white text-base">{i.title}</h2>
                    {i.status === 'expired' && <span className="badge bg-surface-800 text-surface-400">Ended — not started</span>}
                    {isLive && (
                      <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5 flex items-center gap-1 font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        LIVE NOW
                      </span>
                    )}
                    {isScheduled && (
                      <span className="badge bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs px-2 py-0.5">
                        Scheduled
                      </span>
                    )}
                    {isCompleted && (
                      <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs px-2 py-0.5">
                        Completed
                      </span>
                    )}
                    {i.extendedMinutes && i.extendedMinutes > 0 && (
                      <span className="badge bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5">
                        +{i.extendedMinutes}m Extended
                      </span>
                    )}
                    {(i.candidateResume || i.candidateResumeUrl) && (
                      <button
                        onClick={() => setViewingResume(i)}
                        className="badge bg-surface-800 text-surface-300 hover:text-white border border-surface-700 text-xs px-2 py-0.5 flex items-center gap-1 cursor-pointer"
                        title="View uploaded resume"
                      >
                        <FileText className="w-3 h-3 text-primary-400" />
                        Resume
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-surface-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-surface-300">
                      <strong>Candidate:</strong> {i.candidateName} ({i.candidateEmail})
                    </span>
                    {i.interviewer && (
                      <span className="text-surface-400">
                        <strong>Interviewer:</strong> {i.interviewer.name}
                      </span>
                    )}
                    <span>{i.timeLimitMinutes} mins</span>
                    {i.scheduledAt && (
                      <span>Scheduled: {new Date(i.scheduledAt).toLocaleString()}</span>
                    )}
                  </p>

                  {/* Window timing indicator for scheduled */}
                  {isScheduled && !timing.canStart && (
                    <p className="text-[11px] text-amber-400/90 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timing.reason}
                    </p>
                  )}

                  {/* Rating / Feedback Preview for completed interviews */}
                  {isCompleted && (
                    <div className="flex items-center gap-2 pt-1">
                      {i.finalRating ? (
                        <div className="flex items-center gap-1 text-amber-400 text-xs">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${
                                  s <= (i.finalRating || 0)
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-surface-600'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="font-semibold text-white ml-1">
                            {i.finalRating}/5
                          </span>
                        </div>
                      ) : null}
                      {i.finalRecommendation && (
                        <span className="badge bg-primary-500/20 text-primary-300 border border-primary-500/30 text-[11px] px-2 py-0.2">
                          {i.finalRecommendation}
                        </span>
                      )}
                      {i.finalFeedback && (
                        <button
                          onClick={() => setViewingFeedback(i)}
                          className="text-xs text-primary-400 hover:underline flex items-center gap-1 ml-1"
                        >
                          <Eye className="w-3 h-3" />
                          View Final Feedback
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Right side buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <ScheduledInterviewActions interview={i} />
                  {!schedulingOnly && isScheduled && (
                    <button
                      className={`btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 ${
                        !timing.canStart
                          ? 'opacity-50 cursor-not-allowed bg-surface-700 text-surface-400'
                          : ''
                      }`}
                      disabled={!timing.canStart || start.isPending}
                      title={timing.canStart ? 'Start interview' : timing.reason}
                      onClick={() => start.mutate(i.id)}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Start interview
                    </button>
                  )}

                  <Link
                    className={`text-xs px-3.5 py-2 rounded-lg font-medium transition-colors ${
                      isLive
                        ? 'btn-primary bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5'
                        : 'btn-outline'
                    }`}
                    to={`/admin/interviews/${i.id}${isLive && !schedulingOnly ? '?tab=live' : ''}`}
                  >
                    {schedulingOnly ? 'View interview' : isLive
                      ? 'Join live room'
                      : isCompleted
                        ? 'View Evaluation'
                        : 'Plan and review'}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Final Feedback Modal */}
      {viewingFeedback && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-surface-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Final Interview Feedback</h3>
                <p className="text-xs text-surface-400 mt-0.5">
                  {viewingFeedback.candidateName} · {viewingFeedback.title}
                </p>
              </div>
              <button
                onClick={() => setViewingFeedback(null)}
                className="btn-ghost text-xs text-surface-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-3 bg-surface-950/60 rounded-lg border border-surface-800">
                <div>
                  <span className="text-xs text-surface-400 block mb-1">Overall Rating</span>
                  <div className="flex items-center gap-1 text-amber-400">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= (viewingFeedback.finalRating || 0)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-surface-600'
                        }`}
                      />
                    ))}
                    <span className="text-sm font-semibold text-white ml-2">
                      {viewingFeedback.finalRating || 'N/A'}/5
                    </span>
                  </div>
                </div>

                {viewingFeedback.finalRecommendation && (
                  <div>
                    <span className="text-xs text-surface-400 block mb-1">Recommendation</span>
                    <span className="badge bg-primary-500/20 text-primary-300 border border-primary-500/30 text-xs px-2.5 py-1">
                      {viewingFeedback.finalRecommendation}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-surface-400 block mb-1.5">
                  Interviewer Evaluation & Observations
                </span>
                <div className="p-4 bg-surface-950/70 border border-surface-800 rounded-lg text-xs leading-relaxed text-surface-200 whitespace-pre-wrap font-mono">
                  {viewingFeedback.finalFeedback || 'No feedback notes recorded.'}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-surface-800 flex justify-end">
              <button
                onClick={() => setViewingFeedback(null)}
                className="btn-primary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingResume && <ResumeDialog interview={viewingResume} onClose={() => setViewingResume(null)} />}
    </AdminLayout>
  );
}
