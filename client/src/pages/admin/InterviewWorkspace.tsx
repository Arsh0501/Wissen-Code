import RoomTools from '../../components/interview/RoomTools';
import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useInterviewLive } from '../../hooks/useInterviewLive';
import LiveInterviewRoom from '../../components/interview/LiveInterviewRoom';
import AdminLayout from '../../components/layout/AdminLayout';
import { Spinner } from '../../components/ui';
import { apiError } from '../../services/api';
import { apiData, workflowKeys, Evaluation, SkillRating } from '../../services/workflows';
import { InterviewSummary } from './InterviewsPage';
import { Question } from '../../types';
import { useAuth } from '../../context/AuthContext';
import ResumeViewer from '../../components/interview/ResumeViewer';
import ScheduledInterviewActions from '../../components/interview/ScheduledInterviewActions';
import QuestionPreparation from '../../components/interview/QuestionPreparation';
import ResumeDialog from '../../components/interview/ResumeDialog';
import InterviewAgentsPanel from '../../components/interview/InterviewAgentsPanel';
import InterviewFeedback from '../../components/interview/InterviewFeedback';
import InterviewFeedbackReportDownload from '../../components/interview/InterviewFeedbackReportDownload';
import type { FeedbackCriterion } from '../../services/interviewFeedback';
interface Interview extends InterviewSummary {
  feedbackCriteria?: FeedbackCriterion[];
  feedbackRevision?: number;
  startedAt?: string | null;
  endedAt?: string | null;
  currentQuestionId: number | null;
  currentCode: string;
  currentLanguageId: number;
  questions: {
    questionId: number;
    candidateAnswer: string;
    notes?: string;
    question: Question;
  }[];
  submissions: {
    id: number;
    questionId: number;
    code: string;
    score: number;
    results: string;
  }[];
  notes: { id: number; content: string }[];
}
export default function InterviewWorkspace() {
  const { role } = useAuth();
  const [preparing, setPreparing] = useState(false);
  const [viewingResume, setViewingResume] = useState(false);
  const [openFinalFeedback, setOpenFinalFeedback] = useState(false);
  const id = Number(useParams().id);
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const tab =
    requestedTab && ['live', 'ai', 'evaluation', 'feedback'].includes(requestedTab)
      ? requestedTab
      : 'live';
  const setTab = (value: string) => setParams({ tab: value });
  const interview = useQuery({
    queryKey: ['interview', id],
    queryFn: () => apiData<Interview>(`/interviews/${id}`),
    refetchInterval: 5000,
  });
  const evaluations = useQuery({
    queryKey: workflowKeys.evaluations(id),
    queryFn: () => apiData<Evaluation[]>(`/interview-workflows/${id}/evaluations`),
  });
  const [questionId, setQuestionId] = useState<number | null>(null);
  const live = useInterviewLive(id, () => {
    void client.invalidateQueries({ queryKey: ['interview', id] });
  });
  const liveCode = live.snapshot.code;
  const action = useMutation({
    mutationFn: ({ operation, body }: { operation: string; body?: unknown }) =>
      apiData(
        `/interviews/${id}/${operation}`,
        operation === 'current-question' ? 'put' : 'post',
        body,
      ),
    onSuccess: (_result, variables) => {
      if (variables.operation === 'start') setTab('live');
      if (variables.operation === 'end') {
        setOpenFinalFeedback(true);
        setTab('feedback');
      }
      return client.invalidateQueries({ queryKey: ['interview', id] });
    },
  });
  const i = interview.data;
  const targetId = questionId ?? i?.currentQuestionId ?? i?.questions[0]?.questionId;
  const prompts = i?.questions ?? [];
  const question = prompts.find((q) => q.questionId === targetId);
  const evaluation = evaluations.data?.find((e) => e.questionId === targetId);
  if (role === 'admin') {
    return (
      <AdminLayout
        title={i?.title || 'Interview details'}
        subtitle="View scheduled interviews and review results"
        actions={
          <Link to="/admin/interviews" className="btn-outline">
            All interviews
          </Link>
        }
      >
        {interview.isLoading ? (
          <Spinner />
        ) : interview.error ? (
          <p role="alert">{apiError(interview.error)}</p>
        ) : (
          i && (
            <div className="space-y-5">
              <div className="flex gap-3">
                <ScheduledInterviewActions interview={i} />
              </div>
              <dl className="card grid md:grid-cols-2 gap-4">
                <div>
                  <dt className="label">Candidate</dt>
                  <dd>
                    {i.candidateName} ({i.candidateEmail})
                  </dd>
                </div>
                <div>
                  <dt className="label">Interviewer</dt>
                  <dd>{i.interviewer?.name || 'Unassigned'}</dd>
                </div>
                <div>
                  <dt className="label">Scheduled time</dt>
                  <dd>{i.scheduledAt ? new Date(i.scheduledAt).toLocaleString() : 'Flexible'}</dd>
                </div>
                <div>
                  <dt className="label">Duration</dt>
                  <dd>{i.timeLimitMinutes} minutes</dd>
                </div>
                <div>
                  <dt className="label">Status</dt>
                  <dd>
                    {i.status === 'expired' ? 'Ended — not started' : i.status.replace(/_/g, ' ')}
                  </dd>
                </div>
              </dl>
              {(i.candidateResume || i.candidateResumeUrl) && (
                <section className="card">
                  <h2 className="font-semibold">Candidate resume</h2>
                  <ResumeViewer interview={i} />
                </section>
              )}
              <section className="card space-y-3">
                <h2 className="font-semibold">Interview questions</h2>
                {i.questions.length ? (
                  i.questions.map(({ question }) => (
                    <div key={question.id}>
                      <h3 className="font-medium">{question.title}</h3>
                      <ReactMarkdown>{question.statement}</ReactMarkdown>
                    </div>
                  ))
                ) : (
                  <p>The assigned interviewer will prepare the questions.</p>
                )}
              </section>
              {i.finalFeedback && (
                <section className="card">
                  <h2 className="font-semibold">Final feedback</h2>
                  <p className="whitespace-pre-wrap">{i.finalFeedback}</p>
                </section>
              )}
              <InterviewFeedbackReportDownload
                interviewId={id}
                completed={i.status === 'completed'}
                submitted={i.status === 'completed' && !!i.finalFeedback}
              />
              {!!i.feedbackCriteria?.length && (
                <section className="card space-y-3">
                  <h2 className="font-semibold">Interview feedback criteria</h2>
                  {i.feedbackCriteria.map((criterion) => (
                    <div key={criterion.key}>
                      <h3 className="font-medium">
                        {criterion.label}: {criterion.rating}/5
                      </h3>
                      <p className="whitespace-pre-wrap text-sm">{criterion.feedback}</p>
                    </div>
                  ))}
                </section>
              )}
            </div>
          )
        )}
      </AdminLayout>
    );
  }
  return (
    <AdminLayout
      title={i?.title || 'Interview workspace'}
      subtitle={
        i
          ? `${i.candidateName} · ${i.status.replace(/_/g, ' ')} · ${i.timeLimitMinutes} minutes`
          : ''
      }
      actions={
        <Link to="/admin/interviews" className="btn-outline">
          All interviews
        </Link>
      }
    >
      {interview.isLoading ? (
        <Spinner />
      ) : interview.error ? (
        <p role="alert">{apiError(interview.error)}</p>
      ) : (
        i && (
          <>
            {preparing && (
              <QuestionPreparation interviewId={id} onClose={() => setPreparing(false)} />
            )}
            {viewingResume && (
              <ResumeDialog
                interview={i}
                onClose={() => setViewingResume(false)}
                backLabel="Back to interview"
              />
            )}
            <div className="card mb-5 flex flex-wrap gap-3 items-center">
              <button
                className="btn-primary"
                disabled={!['scheduled', 'in_progress'].includes(i.status)}
                onClick={() => setPreparing(true)}
              >
                Prepare questions
              </button>
              <button
                className="btn-outline"
                disabled={!i.candidateResume && !i.candidateResumeUrl}
                onClick={() => setViewingResume(true)}
              >
                View resume
              </button>
              <button
                className="btn-primary"
                disabled={action.isPending || i.status !== 'scheduled'}
                onClick={() => action.mutate({ operation: 'start' })}
              >
                Start interview
              </button>
              <button
                className="btn-outline"
                disabled={action.isPending || i.status !== 'in_progress'}
                onClick={() => action.mutate({ operation: 'end' })}
              >
                End interview
              </button>
              {action.error && <p role="alert">{apiError(action.error)}</p>}
            </div>
            {i.status === 'completed' && tab !== 'feedback' && (
              <div className="space-y-3 mb-5">
                <section className="card flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">Interview ended</h2>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setOpenFinalFeedback(true);
                      setTab('feedback');
                    }}
                  >
                    {i.finalFeedback ? 'Edit feedback' : 'Submit feedback'}
                  </button>
                </section>
                <InterviewFeedbackReportDownload
                  interviewId={id}
                  completed
                  submitted={!!i.finalFeedback}
                />
              </div>
            )}
            <div className="flex gap-3 mb-5 overflow-x-auto">
              {['live', 'ai', 'evaluation', 'feedback'].map((t) => (
                <button
                  className={`${tab === t ? 'btn-primary' : 'btn-outline'} shrink-0`}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t === 'live'
                    ? 'Live room'
                    : t === 'ai'
                      ? 'AI Tools'
                      : t === 'feedback'
                        ? 'Feedback'
                        : 'Questions and evaluation'}
                </button>
              ))}
            </div>
            <div hidden={tab !== 'feedback'}>
              <InterviewFeedback key={id} interview={i} openFinal={openFinalFeedback} />
            </div>
            {tab === 'ai' && <InterviewAgentsPanel key={id} id={id} status={i.status} />}
            {tab === 'live' && (
              <>
                <LiveInterviewRoom
                  key={id}
                  interview={i}
                  live={live}
                  evaluations={evaluations.data ?? []}
                  communication={<RoomTools socket={live.socket} interviewer />}
                  onQuestion={(questionId) =>
                    action.mutate({
                      operation: 'current-question',
                      body: { questionId },
                    })
                  }
                />
              </>
            )}

            {(tab === 'evaluation' || tab === 'feedback') && (
              <>
                <label className="label mb-4">
                  Question
                  <select
                    className="input mt-2"
                    value={targetId ?? ''}
                    onChange={(e) => {
                      setQuestionId(Number(e.target.value));
                    }}
                  >
                    {prompts.map((q) => (
                      <option key={q.questionId} value={q.questionId}>
                        {q.question.title}
                      </option>
                    ))}
                  </select>
                </label>
                {tab === 'evaluation' && question && (
                  <div className="card mb-5">
                    <div className="flex justify-between mb-3">
                      <h2 className="text-lg font-semibold">{question.question.title}</h2>
                      <button
                        className="btn-outline text-sm"
                        disabled={
                          action.isPending || i.status !== 'in_progress' || (targetId ?? 0) < 0
                        }
                        onClick={() =>
                          action.mutate({
                            operation: 'current-question',
                            body: { questionId: targetId },
                          })
                        }
                      >
                        Make active question
                      </button>
                    </div>
                    <div className="prose prose-invert max-w-none text-sm">
                      <ReactMarkdown>{question.question.statement}</ReactMarkdown>
                    </div>
                  </div>
                )}
                {tab === 'evaluation' && question && (
                  <AskedFollowUps
                    interviewId={id}
                    questionId={question.questionId}
                    notes={question.notes}
                    active={i.status === 'in_progress'}
                  />
                )}
                {tab === 'feedback' && (
                  <>
                    {evaluations.isLoading ? (
                      <Spinner />
                    ) : evaluations.error ? (
                      <p role="alert">{apiError(evaluations.error)}</p>
                    ) : (
                      question && (
                        <EvaluationEditor
                          key={`${targetId}:${evaluation?.id}:${evaluation?.revision}`}
                          skillsOnly
                          id={id}
                          questionId={question.questionId}
                          existing={evaluation}
                          answer={question.candidateAnswer}
                          questionFeedback={readQuestionFeedback(question.notes)}
                          code={
                            targetId === i.currentQuestionId
                              ? (liveCode ?? i.currentCode)
                              : (i.submissions.find((s) => s.questionId === targetId)?.code ?? '')
                          }
                          latestSubmission={i.submissions.find((s) => s.questionId === targetId)}
                        />
                      )
                    )}
                  </>
                )}
              </>
            )}
          </>
        )
      )}
    </AdminLayout>
  );
}
function AskedFollowUps({
  interviewId,
  questionId,
  notes,
  active,
}: {
  interviewId: number;
  questionId: number;
  notes?: string;
  active: boolean;
}) {
  const saved = useQuery({
    queryKey: ['question-follow-ups', interviewId, questionId],
    queryFn: () =>
      apiData<{ id: string; question: string; status: string }[]>(
        `/interviews/${interviewId}/questions/${questionId}/follow-ups`,
      ),
    refetchInterval: active ? 5000 : false,
  });
  let turns: { question: string }[] = [];
  try {
    const value = JSON.parse(notes ?? '{}').conversation?.turns;
    if (Array.isArray(value))
      turns = value.slice(1).filter((turn) => typeof turn?.question === 'string');
  } catch {}
  const questions = [
    ...new Set([
      ...turns.map((turn) => turn.question),
      ...(saved.data ?? []).filter((item) => item.status === 'asked').map((item) => item.question),
    ]),
  ];
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Asked follow-ups</h2>
      {saved.isLoading && <Spinner />}
      {saved.error && <p role="alert">{apiError(saved.error)}</p>}
      {questions.length ? (
        <ol className="list-decimal pl-5 space-y-3">
          {questions.map((question) => (
            <li key={question} className="break-words whitespace-pre-wrap">
              {question}
            </li>
          ))}
        </ol>
      ) : (
        !saved.isLoading &&
        !saved.error && (
          <p className="text-sm text-surface-500">
            No follow-ups have been asked for this question.
          </p>
        )
      )}
    </section>
  );
}

function readQuestionFeedback(notes?: string): string {
  try {
    const value = JSON.parse(notes ?? '{}').interviewerFeedback;
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export function EvaluationEditor({
  id,
  questionId,
  existing,
  answer,
  code,
  latestSubmission,
  questionFeedback = '',
  skillsOnly = false,
}: {
  id: number;
  questionId: number;
  existing?: Evaluation;
  answer: string;
  code: string;
  latestSubmission?: { id: number; score: number; results: string };
  questionFeedback?: string;
  skillsOnly?: boolean;
}) {
  const client = useQueryClient();
  const [candidateAnswer, setAnswer] = useState(existing?.candidateAnswer ?? answer ?? '');
  const [candidateCode, setCode] = useState(existing?.candidateCode ?? code);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saved, setSaved] = useState(false);
  const [skills, setSkills] = useState<SkillRating[]>(
    existing?.skills ??
      [
        ...new Set(['React', 'JavaScript', 'DSA', 'Problem Solving', 'Debugging', 'Communication']),
      ].map((skill) => ({ skill, rating: null, rationale: '' })),
  );
  const [newSkill, setNewSkill] = useState('');
  const skillName = newSkill.trim();
  const duplicateSkill = skills.some(
    (skill) => skill.skill.trim().toLowerCase() === skillName.toLowerCase(),
  );
  const addSkill = () => {
    if (!skillName || duplicateSkill || skills.length >= 30) return;
    setSkills((current) => [...current, { skill: skillName, rating: null, rationale: '' }]);
    setNewSkill('');
    setSaved(false);
  };
  const saveEvaluation = (status: 'draft' | 'final') =>
    apiData<Evaluation>(`/interview-workflows/${id}/evaluations`, 'put', {
      questionId,
      candidateAnswer,
      candidateCode,
      notes,
      skills,
      status,
    });
  const save = useMutation({
    mutationFn: saveEvaluation,
    onSuccess: async () => {
      setSaved(true);
      await client.invalidateQueries({ queryKey: workflowKeys.evaluations(id) });
    },
  });
  const observe = useMutation({
    mutationFn: async () => {
      // Save current evidence before analysis, preserving a finalized evaluation's status.
      const evaluation = dirty ? await saveEvaluation(existing?.status ?? 'draft') : existing!;
      return apiData<Evaluation>(
        `/interview-workflows/${id}/evaluations/${evaluation.id}/observe`,
        'post',
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: workflowKeys.evaluations(id) }),
  });
  const dirty =
    !existing ||
    candidateAnswer !== existing.candidateAnswer ||
    candidateCode !== existing.candidateCode ||
    notes !== existing.notes ||
    JSON.stringify(skills) !== JSON.stringify(existing.skills);
  const hasEvidence = !!(
    candidateAnswer.trim() ||
    candidateCode.trim() ||
    notes.trim() ||
    questionFeedback.trim() ||
    skills.some((skill) => skill.rationale.trim())
  );
  const incompleteFinalSkills =
    existing?.status === 'final' &&
    skills.some((skill) => skill.rating === null || !skill.rationale.trim());
  return (
    <fieldset disabled={observe.isPending || save.isPending} className="space-y-5 min-w-0">
      {!skillsOnly && (
        <div className="card grid md:grid-cols-2 gap-5">
          <label className="label">
            Candidate answer
            <textarea
              rows={7}
              className="input mt-2"
              value={candidateAnswer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <button className="btn-ghost text-xs" onClick={() => setAnswer(answer)}>
              Load latest candidate answer
            </button>
          </label>
          <label className="label">
            Candidate code
            <textarea
              rows={7}
              className="input mt-2 font-mono text-xs"
              value={candidateCode}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="btn-ghost text-xs" onClick={() => setCode(code)}>
              Capture latest code
            </button>
          </label>
          <div>
            <h3 className="font-semibold mb-2">Execution results</h3>
            {latestSubmission ? (
              <>
                <p>
                  Submission #{latestSubmission.id} · score {latestSubmission.score.toFixed(0)}%
                </p>
                <pre className="text-xs overflow-auto mt-2 max-h-60">
                  {JSON.stringify(JSON.parse(latestSubmission.results), null, 2)}
                </pre>
              </>
            ) : (
              <p className="text-surface-500">No code submission yet.</p>
            )}
            <p className="text-xs text-surface-500 mt-3">
              Mock verdicts are simulated. They do not verify correctness.
            </p>
          </div>
          <label className="label">
            Interviewer notes
            <textarea
              rows={7}
              className="input mt-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="card space-y-4">
        <h2 className="font-semibold">Evaluation by skill</h2>
        <p className="text-sm text-surface-500">
          Rate 1–5 and cite evidence. Leave unobserved skills unrated; remove them before
          finalizing.
        </p>
        {skills.map((s, n) => (
          <div
            key={s.skill}
            className="grid md:grid-cols-[140px_110px_1fr_70px] gap-3 items-center"
          >
            <strong className="text-sm">{s.skill}</strong>
            <select
              className="input"
              aria-label={`${s.skill} rating`}
              value={s.rating ?? ''}
              onChange={(e) =>
                setSkills((all) =>
                  all.map((r, i) =>
                    i === n
                      ? {
                          ...r,
                          rating: e.target.value ? Number(e.target.value) : null,
                        }
                      : r,
                  ),
                )
              }
            >
              <option value="">Unrated</option>
              {[1, 2, 3, 4, 5].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <input
              className="input"
              aria-label={`${s.skill} evidence`}
              placeholder="Supporting rationale / evidence"
              value={s.rationale}
              onChange={(e) =>
                setSkills((all) =>
                  all.map((r, i) => (i === n ? { ...r, rationale: e.target.value } : r)),
                )
              }
            />
            <button
              className="btn-ghost text-xs"
              onClick={() => setSkills((all) => all.filter((_, i) => i !== n))}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="label flex-1 min-w-0">
              Skill name
              <input
                className="input mt-2"
                value={newSkill}
                maxLength={100}
                placeholder="e.g. Spring Boot, SQL, System Design"
                onChange={(event) => setNewSkill(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addSkill();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="btn-outline"
              disabled={!skillName || duplicateSkill || skills.length >= 30}
              onClick={addSkill}
            >
              Add skill
            </button>
          </div>
          {skillName && duplicateSkill && (
            <p className="text-xs text-amber-600">This skill already has an evaluation row.</p>
          )}
          {skills.length >= 30 && (
            <p className="text-xs text-surface-500">
              You can evaluate up to 30 skills per question.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-outline"
            disabled={save.isPending || observe.isPending || !skills.length}
            onClick={() => save.mutate('draft')}
          >
            Save evaluation draft
          </button>
          <button
            className="btn-primary"
            disabled={
              save.isPending ||
              observe.isPending ||
              !skills.length ||
              skills.some((s) => s.rating === null || !s.rationale.trim())
            }
            onClick={() => save.mutate('final')}
          >
            Finalize evaluation
          </button>
          <button
            className="btn-outline"
            disabled={
              !hasEvidence ||
              !skills.length ||
              incompleteFinalSkills ||
              save.isPending ||
              observe.isPending
            }
            onClick={() => observe.mutate()}
          >
            {observe.isPending ? 'Analyzing evidence…' : 'Get AI observations'}
          </button>
        </div>
        <p className="text-xs text-surface-500">
          {!hasEvidence
            ? 'Add an answer, code, interviewer notes or skill rationale to request AI observations.'
            : dirty
              ? 'Your current evidence and skill feedback will be saved before AI analysis.'
              : 'AI uses the saved answer, code, execution results, interviewer notes and skill feedback for this question.'}
        </p>
        {incompleteFinalSkills && (
          <p className="text-xs text-amber-600">
            Rate each added skill and provide supporting feedback before requesting observations for
            this final evaluation, or save it as a draft first.
          </p>
        )}
        {existing && <p className="text-sm">Evaluation status: {existing.status}</p>}
        {saved && <p role="status">Evaluation saved.</p>}
        {(save.error || observe.error) && (
          <p role="alert" className="text-red-600">
            {apiError(save.error || observe.error)}
          </p>
        )}
      </div>
      <div className="card space-y-4">
        <h2 className="font-semibold">AI observations with supporting evidence</h2>
        {!existing?.observations.length && (
          <p className="text-surface-500">
            No observations yet. Save an evaluation and request AI observations.
          </p>
        )}
        {existing?.observations.map((o, n) => (
          <div key={n} className="p-4 border border-surface-700 rounded-lg">
            <strong>{o.skill}</strong>
            <p className="text-sm mt-2">{o.observation}</p>
            {o.evidence.map((e, k) => (
              <blockquote key={k} className="mt-3 pl-3 border-l-2 border-primary-500 text-sm">
                <span className="text-xs text-surface-500">
                  Source: {e.source} · evaluation #{existing.id}
                </span>
                <pre className="whitespace-pre-wrap font-sans mt-1">{e.quote}</pre>
              </blockquote>
            ))}
          </div>
        ))}
        <p className="text-xs text-surface-500">
          AI observations support interviewer judgment; the final skill ratings are human decisions.
        </p>
      </div>
    </fieldset>
  );
}
