import RoomTools from '../../components/interview/RoomTools';
import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useInterviewLive } from '../../hooks/useInterviewLive';
import LiveInterviewRoom from '../../components/interview/LiveInterviewRoom';
import AdminLayout from '../../components/AdminLayout';
import { Spinner } from '../../components/ui';
import { apiError } from '../../services/api';
import {
  apiData,
  workflowKeys,
  InterviewPlan,
  PlanInput,
  PlanSection,
  Evaluation,
  SkillRating,
} from '../../services/workflows';
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
function planQuestions(plan?: InterviewPlan | null) {
  return (
    plan?.sections.flatMap((section) =>
      section.questions.map((statement) => {
        let hash = 5381;
        for (const char of `${section.skill}:${statement}`)
          hash = (Math.imul(hash, 33) ^ char.charCodeAt(0)) | 0;
        const id = -(Math.abs(hash) || 1);
        return {
          questionId: id,
          candidateAnswer: '',
          notes: '',
          question: {
            id,
            title: `${section.skill} discussion`,
            statement,
            difficulty: 'medium' as const,
            tags: '[]',
            timeLimit: 2,
            memoryLimit: 256000,
            createdAt: '',
            updatedAt: '',
          },
        };
      }),
    ) ?? []
  );
}
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
  const [generateOnOpen, setGenerateOnOpen] = useState(false);
  const [openFinalFeedback, setOpenFinalFeedback] = useState(false);
  const id = Number(useParams().id);
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const tab = requestedTab && ['plan', 'live', 'ai', 'evaluation', 'feedback'].includes(requestedTab)
    ? requestedTab : 'plan';
  const setTab = (value: string) => setParams({ tab: value });
  const interview = useQuery({
    queryKey: ['interview', id],
    queryFn: () => apiData<Interview>(`/interviews/${id}`),
    refetchInterval: 5000,
  });
  const plan = useQuery({
    queryKey: workflowKeys.plan(id),
    queryFn: () =>
      apiData<InterviewPlan | null>(`/interview-workflows/${id}/plan`),
    refetchInterval: 5000,
  });
  const evaluations = useQuery({
    queryKey: workflowKeys.evaluations(id),
    queryFn: () =>
      apiData<Evaluation[]>(`/interview-workflows/${id}/evaluations`),
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
      return client.invalidateQueries({ queryKey: ['interview', id] });
    },
  });
  const i = interview.data;
  const targetId =
    questionId ?? i?.currentQuestionId ?? i?.questions[0]?.questionId;
  const prompts = [...(i?.questions ?? []), ...planQuestions(plan.data)];
  const question = prompts.find((q) => q.questionId === targetId);
  const evaluation = evaluations.data?.find((e) => e.questionId === targetId);
  if (role === 'admin') {
    return (
      <AdminLayout
        title={i?.title || 'Interview details'}
        subtitle="View scheduled interviews and review results"
        actions={<Link to="/admin/interviews" className="btn-outline">All interviews</Link>}
      >
        {interview.isLoading ? <Spinner /> : interview.error ? (
          <p role="alert">{apiError(interview.error)}</p>
        ) : i && (
          <div className="space-y-5">
            <div className="flex gap-3"><ScheduledInterviewActions interview={i} /></div>
            <dl className="card grid md:grid-cols-2 gap-4">
              <div><dt className="label">Candidate</dt><dd>{i.candidateName} ({i.candidateEmail})</dd></div>
              <div><dt className="label">Interviewer</dt><dd>{i.interviewer?.name || 'Unassigned'}</dd></div>
              <div><dt className="label">Scheduled time</dt><dd>{i.scheduledAt ? new Date(i.scheduledAt).toLocaleString() : 'Flexible'}</dd></div>
              <div><dt className="label">Duration</dt><dd>{i.timeLimitMinutes} minutes</dd></div>
              <div><dt className="label">Status</dt><dd>{i.status === 'expired' ? 'Ended — not started' : i.status.replace(/_/g, ' ')}</dd></div>
            </dl>
            {(i.candidateResume || i.candidateResumeUrl) && <section className="card"><h2 className="font-semibold">Candidate resume</h2><ResumeViewer interview={i} /></section>}
            <section className="card space-y-3">
              <h2 className="font-semibold">Interview questions</h2>
              {i.questions.length ? i.questions.map(({ question }) => (
                <div key={question.id}>
                  <h3 className="font-medium">{question.title}</h3>
                  <ReactMarkdown>{question.statement}</ReactMarkdown>
                </div>
              )) : <p>The assigned interviewer will prepare the questions.</p>}
            </section>
            {i.finalFeedback && <section className="card"><h2 className="font-semibold">Final feedback</h2><p className="whitespace-pre-wrap">{i.finalFeedback}</p></section>}
            <InterviewFeedbackReportDownload interviewId={id} submitted={i.status === 'completed' && !!i.finalFeedback} />
            {!!i.feedbackCriteria?.length && <section className="card space-y-3"><h2 className="font-semibold">Interview feedback criteria</h2>{i.feedbackCriteria.map(criterion => <div key={criterion.key}><h3 className="font-medium">{criterion.label}: {criterion.rating}/5</h3><p className="whitespace-pre-wrap text-sm">{criterion.feedback}</p></div>)}</section>}
          </div>
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
            {preparing && <QuestionPreparation interviewId={id} autoGenerate={generateOnOpen}
              onClose={() => { setPreparing(false); setGenerateOnOpen(false); }}
              onViewResume={() => { setGenerateOnOpen(false); setViewingResume(true); }} />}
            {viewingResume && <ResumeDialog interview={i} onClose={() => setViewingResume(false)}
              backLabel={preparing ? 'Back to questions' : 'Back to interview'}
              onGenerate={['scheduled', 'in_progress'].includes(i.status) ? () => { setViewingResume(false); setGenerateOnOpen(true); setPreparing(true); } : undefined} />}
            <div className="card mb-5 flex flex-wrap gap-3 items-center">
              <button className="btn-primary" disabled={!['scheduled', 'in_progress'].includes(i.status)} onClick={() => setPreparing(true)}>Prepare questions</button>
              <button className="btn-outline" disabled={!i.candidateResume && !i.candidateResumeUrl} onClick={() => setViewingResume(true)}>View resume</button>
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
            {i.status === 'completed' && tab !== 'feedback' && <section className="card mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Interview ended</h2><button className="btn-primary" onClick={() => { setOpenFinalFeedback(true); setTab('feedback'); }}>{i.finalFeedback ? 'Edit feedback' : 'Submit feedback'}</button></section>}
            <div className="flex gap-3 mb-5 overflow-x-auto">
              {['plan', 'live', 'ai', 'evaluation', 'feedback'].map((t) => (
                <button
                  className={`${tab === t ? 'btn-primary' : 'btn-outline'} shrink-0`}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t === 'plan'
                    ? 'Interview plan'
                    : t === 'live'
                      ? 'Live room'
                      : t === 'ai' ? 'AI Tools'
                      : t === 'feedback' ? 'Feedback'
                        : 'Questions and evaluation'}
                </button>
              ))}
            </div>
            <div hidden={tab !== 'feedback'}><InterviewFeedback key={id} interview={i} openFinal={openFinalFeedback} /></div>
            {tab === 'plan' &&
              (plan.isLoading ? (
                <Spinner />
              ) : plan.error ? (
                <p role="alert">{apiError(plan.error)}</p>
              ) : (
                <PlanEditor
                  key={
                    plan.data?.id + ':' + JSON.stringify(plan.data?.sections)
                  }
                  id={id}
                  plan={plan.data ?? null}
                  duration={i.timeLimitMinutes}
                />
              ))}
            {tab === 'ai' && <InterviewAgentsPanel key={id} id={id} status={i.status} />}
            {tab === 'live' && (
              <>
                <LiveInterviewRoom
                  key={id}
                  interview={i}
                  live={live}
                  evaluations={evaluations.data ?? []}
                  plan={plan.data ?? null}
                  planLoading={plan.isLoading}
                  planError={plan.error ? apiError(plan.error) : undefined}
                  onOpenPlan={() => setTab('plan')}
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

            {tab === 'evaluation' && (
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
                {question && (
                  <div className="card mb-5">
                    <div className="flex justify-between mb-3">
                      <h2 className="text-lg font-semibold">
                        {question.question.title}
                      </h2>
                      <button
                        className="btn-outline text-sm"
                        disabled={
                          action.isPending ||
                          i.status !== 'in_progress' ||
                          (targetId ?? 0) < 0
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
                      {question.questionId < 0 && (
                        <p>
                          Plan discussion question: ask it verbally and record
                          the candidate answer below.
                        </p>
                      )}
                      <ReactMarkdown>
                        {question.question.statement}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
                {evaluations.isLoading ? (
                  <Spinner />
                ) : evaluations.error ? (
                  <p role="alert">{apiError(evaluations.error)}</p>
                ) : (
                  question && (
                    <EvaluationEditor
                      key={`${targetId}:${evaluation?.id}:${evaluation?.revision}`}
                      id={id}
                      questionId={question.questionId}
                      existing={evaluation}
                      answer={question.candidateAnswer}
                      questionFeedback={readQuestionFeedback(question.notes)}
                      code={
                        targetId === i.currentQuestionId
                          ? (liveCode ?? i.currentCode)
                          : (i.submissions.find(
                              (s) => s.questionId === targetId,
                            )?.code ?? '')
                      }
                      latestSubmission={i.submissions.find(
                        (s) => s.questionId === targetId,
                      )}
                      planSkills={plan.data?.requiredSkills ?? []}
                    />
                  )
                )}
              </>
            )}
          </>
        )
      )}
    </AdminLayout>
  );
}
function PlanEditor({
  id,
  plan,
  duration,
}: {
  id: number;
  plan: InterviewPlan | null;
  duration: number;
}) {
  const client = useQueryClient();
  const [input, setInput] = useState<PlanInput>(
    plan ?? {
      jobRequirements: '',
      candidateExperience: '',
      requiredSkills: [
        'React',
        'JavaScript',
        'DSA',
        'Debugging',
        'Communication',
      ],
      durationMinutes: duration,
    },
  );
  const [skills, setSkills] = useState(input.requiredSkills.join(', '));
  const [includeSelectedQuestions, setIncludeSelectedQuestions] = useState(false);
  const [sections, setSections] = useState<PlanSection[]>(plan?.sections ?? []);
  const [saved, setSaved] = useState(false);
  const total = sections.reduce((sum, s) => sum + s.minutes, 0);
  const mutate = useMutation({
    mutationFn: (mode: 'generate' | 'save') =>
      apiData<InterviewPlan>(
        `/interview-workflows/${id}/plan${mode === 'generate' ? '/generate' : ''}`,
        mode === 'generate' ? 'post' : 'put',
        {
          ...input,
          ...(mode === 'generate' ? { includeSelectedQuestions } : {}),
          requiredSkills: skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          ...(mode === 'save' ? { sections } : {}),
        },
      ),
    onSuccess: async (result) => {
      setSections(result.sections);
      setSaved(true);
      await client.invalidateQueries({ queryKey: workflowKeys.plan(id) });
      await client.invalidateQueries({ queryKey: ['interview', id] });
    },
  });
  const update = (index: number, data: Partial<PlanSection>) => {
    setSaved(false);
    setSections((all) =>
      all.map((s, n) => (n === index ? { ...s, ...data } : s)),
    );
  };
  return (
    <div className="space-y-5">
      <div className="card grid md:grid-cols-2 gap-4">
        <label className="label">
          Job requirements
          <textarea
            className="input mt-2"
            rows={4}
            value={input.jobRequirements}
            onChange={(e) => {
              setSaved(false);
              setInput((v) => ({ ...v, jobRequirements: e.target.value }));
            }}
          />
        </label>
        <label className="label">
          Candidate experience
          <textarea
            className="input mt-2"
            rows={4}
            value={input.candidateExperience}
            onChange={(e) => {
              setSaved(false);
              setInput((v) => ({ ...v, candidateExperience: e.target.value }));
            }}
          />
        </label>
        <label className="label">
          Required skills
          <input
            className="input mt-2"
            value={skills}
            onChange={(e) => {
              setSaved(false);
              setSkills(e.target.value);
            }}
          />
        </label>
        <label className="label">
          Interview duration
          <input
            className="input mt-2"
            type="number"
            min={5}
            max={240}
            value={input.durationMinutes}
            onChange={(e) => {
              setSaved(false);
              setInput((v) => ({
                ...v,
                durationMinutes: Number(e.target.value),
              }));
            }}
          />
        </label>
        <button
          className="btn-primary"
          disabled={
            mutate.isPending ||
            !input.jobRequirements.trim() ||
            !input.candidateExperience.trim()
          }
          onClick={() => mutate.mutate('generate')}
        >
          {mutate.isPending ? 'Working…' : 'Generate interview plan'}
        </button>
        <label className="flex items-start gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={includeSelectedQuestions} disabled={mutate.isPending} onChange={event => { setIncludeSelectedQuestions(event.target.checked); setSaved(false); }} />
          <span>Use questions selected for this interview (optional)<span className="block text-xs text-surface-400">Generate the plan around the currently assigned interview questions. Leave unchecked to plan from job requirements, experience and skills only.</span></span>
        </label>
        <button
          className="btn-outline"
          onClick={() => {
            setSaved(false);
            setSections((v) => [
              ...v,
              {
                skill: '',
                minutes: 5,
                objective: '',
                questions: [''],
                followUps: [],
              },
            ]);
          }}
        >
          Add section manually
        </button>
      </div>
      {sections.length > 0 && (
        <div className="card space-y-4">
          <h2 className="font-semibold">
            Editable interview plan · {total}/{input.durationMinutes} minutes
          </h2>
          {sections.map((s, n) => (
            <div
              key={n}
              className="border border-surface-700 rounded-lg p-4 space-y-3"
            >
              <div className="flex gap-3">
                <label className="label flex-1">
                  Skill
                  <input
                    className="input mt-2"
                    value={s.skill}
                    onChange={(e) => update(n, { skill: e.target.value })}
                  />
                </label>
                <label className="label w-28">
                  Minutes
                  <input
                    type="number"
                    min={1}
                    className="input mt-2"
                    value={s.minutes}
                    onChange={(e) =>
                      update(n, { minutes: Number(e.target.value) })
                    }
                  />
                </label>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setSaved(false);
                    setSections((v) => v.filter((_, i) => i !== n));
                  }}
                >
                  Remove
                </button>
                <button
                  className="btn-ghost"
                  disabled={n === 0}
                  onClick={() => {
                    const next = [...sections];
                    [next[n - 1], next[n]] = [next[n], next[n - 1]];
                    setSections(next);
                    setSaved(false);
                  }}
                >
                  ↑
                </button>
              </div>
              <label className="label">
                Objective
                <input
                  className="input mt-2"
                  value={s.objective}
                  onChange={(e) => update(n, { objective: e.target.value })}
                />
              </label>
              <label className="label">
                Questions (one per line)
                <textarea
                  rows={3}
                  className="input mt-2"
                  value={s.questions.join('\n')}
                  onChange={(e) =>
                    update(n, { questions: e.target.value.split('\n') })
                  }
                />
              </label>
              <label className="label">
                Follow-ups (one per line)
                <textarea
                  rows={2}
                  className="input mt-2"
                  value={s.followUps.join('\n')}
                  onChange={(e) =>
                    update(n, {
                      followUps: e.target.value.split('\n').filter(Boolean),
                    })
                  }
                />
              </label>
            </div>
          ))}
          <button
            className="btn-primary"
            disabled={mutate.isPending || total !== input.durationMinutes}
            onClick={() => mutate.mutate('save')}
          >
            Save edited plan
          </button>
          {total !== input.durationMinutes && (
            <p className="text-amber-700">
              Adjust section times to match the interview duration.
            </p>
          )}
        </div>
      )}
      {mutate.error && (
        <p role="alert" className="text-red-600">
          {apiError(mutate.error)}
        </p>
      )}
      {saved && (
        <p role="status" className="text-emerald-700">
          Plan saved.
        </p>
      )}
    </div>
  );
}
function readQuestionFeedback(notes?: string): string {
  try { const value = JSON.parse(notes ?? '{}').interviewerFeedback; return typeof value === 'string' ? value : ''; }
  catch { return ''; }
}

export function EvaluationEditor({
  id,
  questionId,
  existing,
  answer,
  code,
  latestSubmission,
  planSkills,
  questionFeedback = '',
}: {
  id: number;
  questionId: number;
  existing?: Evaluation;
  answer: string;
  code: string;
  latestSubmission?: { id: number; score: number; results: string };
  planSkills: string[];
  questionFeedback?: string;
}) {
  const client = useQueryClient();
  const [candidateAnswer, setAnswer] = useState(
    existing?.candidateAnswer ?? answer ?? '',
  );
  const [candidateCode, setCode] = useState(existing?.candidateCode ?? code);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saved, setSaved] = useState(false);
  const [skills, setSkills] = useState<SkillRating[]>(
    existing?.skills ??
      [
        ...new Set([
          ...planSkills,
          'React',
          'JavaScript',
          'DSA',
          'Problem Solving',
          'Debugging',
          'Communication',
        ]),
      ].map((skill) => ({ skill, rating: null, rationale: '' })),
  );
  const [newSkill, setNewSkill] = useState('');
  const skillName = newSkill.trim();
  const duplicateSkill = skills.some((skill) => skill.skill.trim().toLowerCase() === skillName.toLowerCase());
  const addSkill = () => {
    if (!skillName || duplicateSkill || skills.length >= 30) return;
    setSkills((current) => [...current, { skill: skillName, rating: null, rationale: '' }]);
    setNewSkill('');
    setSaved(false);
  };
  const saveEvaluation = (status: 'draft' | 'final') =>
    apiData<Evaluation>(`/interview-workflows/${id}/evaluations`, 'put', {
      questionId, candidateAnswer, candidateCode, notes, skills, status,
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
      return apiData<Evaluation>(`/interview-workflows/${id}/evaluations/${evaluation.id}/observe`, 'post');
    },
    onSuccess: () => client.invalidateQueries({ queryKey: workflowKeys.evaluations(id) }),
  });
  const dirty =
    !existing ||
    candidateAnswer !== existing.candidateAnswer ||
    candidateCode !== existing.candidateCode ||
    notes !== existing.notes ||
    JSON.stringify(skills) !== JSON.stringify(existing.skills);
  const hasEvidence = !!(candidateAnswer.trim() || candidateCode.trim() || notes.trim() || questionFeedback.trim() || skills.some((skill) => skill.rationale.trim()));
  const incompleteFinalSkills = existing?.status === 'final' && skills.some((skill) => skill.rating === null || !skill.rationale.trim());
  return (
    <fieldset disabled={observe.isPending || save.isPending} className="space-y-5 min-w-0">
      <div className="card grid md:grid-cols-2 gap-5">
        <label className="label">
          Candidate answer
          <textarea
            rows={7}
            className="input mt-2"
            value={candidateAnswer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button
            className="btn-ghost text-xs"
            onClick={() => setAnswer(answer)}
          >
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
                Submission #{latestSubmission.id} · score{' '}
                {latestSubmission.score.toFixed(0)}%
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
      <div className="card space-y-4">
        <h2 className="font-semibold">Evaluation by skill</h2>
        <p className="text-sm text-surface-500">
          Rate 1–5 and cite evidence. Leave unobserved skills unrated; remove
          them before finalizing.
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
                          rating: e.target.value
                            ? Number(e.target.value)
                            : null,
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
                  all.map((r, i) =>
                    i === n ? { ...r, rationale: e.target.value } : r,
                  ),
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
            <label className="label flex-1 min-w-0">Skill name
              <input className="input mt-2" value={newSkill} maxLength={100} placeholder="e.g. Spring Boot, SQL, System Design" onChange={(event) => setNewSkill(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSkill(); } }} />
            </label>
            <button type="button" className="btn-outline" disabled={!skillName || duplicateSkill || skills.length >= 30} onClick={addSkill}>Add skill</button>
          </div>
          {skillName && duplicateSkill && <p className="text-xs text-amber-600">This skill already has an evaluation row.</p>}
          {skills.length >= 30 && <p className="text-xs text-surface-500">You can evaluate up to 30 skills per question.</p>}
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
              save.isPending || observe.isPending ||
              !skills.length ||
              skills.some((s) => s.rating === null || !s.rationale.trim())
            }
            onClick={() => save.mutate('final')}
          >
            Finalize evaluation
          </button>
          <button
            className="btn-outline"
            disabled={!hasEvidence || !skills.length || incompleteFinalSkills || save.isPending || observe.isPending}
            onClick={() => observe.mutate()}
          >
            {observe.isPending ? 'Analyzing evidence…' : 'Get AI observations'}
          </button>
        </div>
        <p className="text-xs text-surface-500">
          {!hasEvidence ? 'Add an answer, code, interviewer notes or skill rationale to request AI observations.' : dirty ? 'Your current evidence and skill feedback will be saved before AI analysis.' : 'AI uses the saved answer, code, execution results, interviewer notes and skill feedback for this question.'}
        </p>
        {incompleteFinalSkills && <p className="text-xs text-amber-600">Rate each added skill and provide supporting feedback before requesting observations for this final evaluation, or save it as a draft first.</p>}
        {existing && (
          <p className="text-sm">Evaluation status: {existing.status}</p>
        )}
        {saved && <p role="status">Evaluation saved.</p>}
        {(save.error || observe.error) && (
          <p role="alert" className="text-red-600">
            {apiError(save.error || observe.error)}
          </p>
        )}
      </div>
      <div className="card space-y-4">
        <h2 className="font-semibold">
          AI observations with supporting evidence
        </h2>
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
              <blockquote
                key={k}
                className="mt-3 pl-3 border-l-2 border-primary-500 text-sm"
              >
                <span className="text-xs text-surface-500">
                  Source: {e.source} · evaluation #{existing.id}
                </span>
                <pre className="whitespace-pre-wrap font-sans mt-1">
                  {e.quote}
                </pre>
              </blockquote>
            ))}
          </div>
        ))}
        <p className="text-xs text-surface-500">
          AI observations support interviewer judgment; the final skill ratings
          are human decisions.
        </p>
      </div>
    </fieldset>
  );
}
