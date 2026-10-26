import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { apiData } from '../../services/workflows';
import {
  apiError,
  createAssessmentFromResume,
  updateAssessment,
  type ResumeAssessmentResult,
} from '../../services/api';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  FileUp,
  Rocket,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';

const MAX_PDF_MB = 8;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Upload a resume → AI profiles the candidate → matching questions → draft assessment. */
export default function AIAssessmentPage() {
  const navigate = useNavigate();
  const status = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => apiData<{ configured: boolean; canVerify: boolean }>('/ai/status'),
  });
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [role, setRole] = useState('');
  const [questionCount, setQuestionCount] = useState(4);
  const [difficulty, setDifficulty] = useState<'mixed' | 'easy' | 'medium' | 'hard'>('mixed');
  const [timeLimit, setTimeLimit] = useState<number | ''>('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'reading' | 'generating' | 'publishing'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResumeAssessmentResult | null>(null);
  const [published, setPublished] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    setError('');
    if (!f) return setFile(null);
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const isText = f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name);
    if (!isPdf && !isText) return setError('Upload a PDF or a plain-text resume.');
    if (f.size > MAX_PDF_MB * 1024 * 1024) return setError(`File must be under ${MAX_PDF_MB} MB.`);
    setFile(f);
  }

  async function generate() {
    setError('');
    setResult(null);
    setPublished(false);
    try {
      setBusy('reading');
      const payload: Parameters<typeof createAssessmentFromResume>[0] = {
        questionCount,
        difficulty,
        role: role.trim() || undefined,
        timeLimitMinutes: timeLimit === '' ? undefined : Number(timeLimit),
        candidateEmail: candidateEmail.trim() || undefined,
      };
      if (file) {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) payload.resumePdfBase64 = await readFileAsBase64(file);
        else payload.resumeText = await readFileAsText(file);
        payload.fileName = file.name;
      } else payload.resumeText = pastedText;
      setBusy('generating');
      setResult(await createAssessmentFromResume(payload));
    } catch (err) {
      setError(apiError(err, 'Could not create the assessment.'));
    } finally {
      setBusy('idle');
    }
  }

  async function publish() {
    if (!result) return;
    setBusy('publishing');
    setError('');
    try {
      await updateAssessment(result.assessmentId, { status: 'published' } as any);
      setPublished(true);
    } catch (err) {
      setError(apiError(err, 'Could not publish.'));
    } finally {
      setBusy('idle');
    }
  }

  const canGenerate =
    busy === 'idle' &&
    !!status.data?.configured &&
    (!!file || pastedText.trim().length >= 80);

  return (
    <AdminLayout
      title="Create with AI"
      subtitle="Upload a resume. We read it, pick or write matching questions, and set up the assessment."
      actions={
        <Link to="/admin/assessments" className="btn-outline">
          All assessments
        </Link>
      }
    >
      {!status.isLoading && !status.data?.configured && (
        <p className="card mb-4 text-amber-700">
          AI is not configured on the backend yet (OPENAI_API_KEY / OPENAI_BASE_URL in
          server/.env).
        </p>
      )}

      {!result && (
        <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
          <section className="card space-y-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary-600" /> Resume
            </h2>
            <div
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? 'border-primary-500 bg-primary-500/5' : 'border-surface-700'}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileUp className="w-5 h-5 text-primary-600" />
                  <span className="text-sm text-white">{file.name}</span>
                  <span className="text-xs text-surface-500">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    className="btn-ghost p-1"
                    aria-label="Remove file"
                    onClick={() => pick(null)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-7 h-7 mx-auto text-surface-500 mb-2" />
                  <p className="text-sm text-surface-300">
                    Drop a PDF here, or{' '}
                    <button
                      type="button"
                      className="text-primary-600 underline"
                      onClick={() => fileInput.current?.click()}
                    >
                      choose a file
                    </button>
                  </p>
                  <p className="text-xs text-surface-500 mt-1">PDF or .txt, up to {MAX_PDF_MB} MB</p>
                </>
              )}
            </div>
            {!file && (
              <label className="label">
                Or paste the resume text
                <textarea
                  rows={8}
                  className="input mt-2 text-sm"
                  placeholder="Name, experience, projects, skills…"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
              </label>
            )}
            <p className="text-xs text-surface-500">
              The resume is only used to pick question topics. It is not stored.
            </p>
          </section>

          <section className="card space-y-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary-600" /> Assessment settings
            </h2>
            <label className="label">
              Role (optional)
              <input
                className="input mt-2"
                placeholder="Backend Engineer, SDE Intern…"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="label">
                Questions
                <input
                  type="number"
                  min={1}
                  max={8}
                  className="input mt-2"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Math.min(8, Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
              <label className="label">
                Difficulty
                <select
                  className="input mt-2"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                >
                  {['mixed', 'easy', 'medium', 'hard'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="label">
                Duration (min)
                <input
                  type="number"
                  min={10}
                  max={240}
                  className="input mt-2"
                  placeholder="auto"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </label>
              <label className="label">
                Candidate email (optional)
                <input
                  type="email"
                  className="input mt-2"
                  placeholder="only they can take it"
                  value={candidateEmail}
                  onChange={(e) => setCandidateEmail(e.target.value)}
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button className="btn-primary w-full py-3" disabled={!canGenerate} onClick={generate}>
              <Sparkles className="w-4 h-4" />
              {busy === 'reading'
                ? 'Reading resume…'
                : busy === 'generating'
                  ? 'Profiling candidate and preparing questions…'
                  : 'Create assessment'}
            </button>
            {busy === 'generating' && (
              <p className="text-xs text-surface-500 text-center">
                Usually 20–60 seconds. Questions missing from the bank are written now.
              </p>
            )}
          </section>
        </div>
      )}

      {result && (
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5">
          <section className="card space-y-3">
            <h2 className="font-semibold text-white">Candidate profile</h2>
            <p className="text-lg font-semibold text-white">{result.profile.candidateName}</p>
            <p className="text-sm text-surface-400 capitalize">
              {result.profile.experienceLevel} · {result.profile.yearsOfExperience} yrs
              {result.profile.primaryLanguages.length
                ? ` · ${result.profile.primaryLanguages.join(', ')}`
                : ''}
            </p>
            <p className="text-sm text-surface-300">{result.profile.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {result.profile.skills.map((s) => (
                <span key={s} className="badge bg-surface-800 text-surface-300 ring-1 ring-surface-700">
                  {s}
                </span>
              ))}
            </div>
          </section>
          <section className="card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">{result.name}</h2>
                <p className="text-sm text-surface-500">
                  {result.questions.length} questions · {result.timeLimitMinutes} min · saved as draft
                </p>
              </div>
              {published ? (
                <span className="badge bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/25">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Published
                </span>
              ) : (
                <span className="badge bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/25">
                  Draft
                </span>
              )}
            </div>
            <ol className="space-y-2 text-sm">
              {result.questions.map((q, i) => (
                <li key={q.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-800/50 border border-surface-700">
                  <span className="text-surface-500 tabular-nums">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <Link className="font-medium text-white hover:text-primary-700" to={`/admin/questions/${q.id}/edit`}>
                      {q.title}
                    </Link>
                    <p className="text-xs text-surface-500">{q.topic}</p>
                  </div>
                  <span className={`badge-${q.difficulty}`}>{q.difficulty}</span>
                  <span className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700">
                    {q.source === 'bank' ? 'from bank' : 'new · unverified'}
                  </span>
                </li>
              ))}
            </ol>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={publish} disabled={busy !== 'idle' || published}>
                <Rocket className="w-4 h-4" /> {busy === 'publishing' ? 'Publishing…' : published ? 'Published' : 'Publish now'}
              </button>
              <button
                className="btn-outline"
                onClick={() => navigate(`/admin/assessments/${result.assessmentId}/edit`)}
              >
                Review & edit <ArrowRight className="w-4 h-4" />
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setResult(null);
                  setPublished(false);
                }}
              >
                Start another
              </button>
            </div>
            <p className="text-xs text-surface-500">
              New questions are tagged “unverified” until a live judge runs their reference
              solutions. Review them before a real assessment.
            </p>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
