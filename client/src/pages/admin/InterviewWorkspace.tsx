import InterviewReplay from '../../components/interview/InterviewReplay';
import RoomTools from '../../components/interview/RoomTools';
import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useInterviewLive } from '../../hooks/useInterviewLive';
import LiveInterviewRoom from '../../components/interview/LiveInterviewRoom';
import AdminLayout from '../../components/AdminLayout';
import { Spinner } from '../../components/ui';
import api, { apiError } from '../../services/api';
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
  startedAt?: string | null;
  endedAt?: string | null;
  currentQuestionId: number | null;
  currentCode: string;
  currentLanguageId: number;
  questions: {
    questionId: number;
    candidateAnswer: string;
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
  const id = Number(useParams().id);
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'plan';
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
  });
  const evaluations = useQuery({
    queryKey: workflowKeys.evaluations(id),
    queryFn: () =>
      apiData<Evaluation[]>(`/interview-workflows/${id}/evaluations`),
  });
  const [copyStatus, setCopyStatus] = useState('');
  const [questionId, setQuestionId] = useState<number | null>(null);
  const live = useInterviewLive(id, () => {
    void client.invalidateQueries({ queryKey: ['interview', id] });
  });
  const liveCode = live.snapshot.code;
  const action = useMutation({
    mutationFn: ({ operation, body }: { operation: string; body?: unknown }) =>
      apiData(
        operation === 'platform-invitation'
          ? `/platform/interviews/${id}/invitation`
          : `/interviews/${id}/${operation}`,
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
            <div className="card mb-5 flex flex-wrap gap-3 items-center">
              <button
                className="btn-outline"
                disabled={action.isPending || i.status !== 'scheduled'}
                onClick={() =>
                  action.mutate({ operation: 'platform-invitation' })
                }
              >
                Email invitation
              </button>
              <button
                className="btn-outline"
                disabled={!i.scheduledAt}
                onClick={async () => {
                  try {
                    const response = await api.get(
                      `/platform/interviews/${id}/calendar`,
                      { responseType: 'blob' },
                    );
                    const url = URL.createObjectURL(response.data);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `interview-${id}.ics`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    setCopyStatus('Could not download the calendar event.');
                  }
                }}
              >
                Download calendar event
              </button>
              <a
                className="btn-outline"
                href={`/interview/${i.roomToken}`}
                target="_blank"
                rel="noreferrer"
              >
                Open candidate room
              </a>
              <button
                className="btn-outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/interview/${i.roomToken}`,
                    );
                    setCopyStatus('Candidate link copied.');
                  } catch {
                    setCopyStatus(
                      'Unable to copy. Open the candidate room and copy its address.',
                    );
                  }
                }}
              >
                Copy candidate link
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
            {copyStatus && (
              <p role="status" className="text-xs text-surface-500 mb-4">
                {copyStatus}
              </p>
            )}
            <div className="flex gap-3 mb-5">
              {['plan', 'live', 'evaluation', 'replay'].map((t) => (
                <button
                  className={tab === t ? 'btn-primary' : 'btn-outline'}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t === 'plan'
                    ? 'Interview plan'
                    : t === 'live'
                      ? 'Live room'
                      : t === 'replay'
                        ? 'Replay'
                        : 'Questions and evaluation'}
                </button>
              ))}
            </div>
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
            {tab === 'replay' && <InterviewReplay id={id} />}
            {tab === 'live' && (
              <>
                <LiveInterviewRoom
                  key={id}
                  interview={i}
                  live={live}
                  evaluations={evaluations.data ?? []}
                  onQuestion={(questionId) =>
                    action.mutate({
                      operation: 'current-question',
                      body: { questionId },
                    })
                  }
                />
                <RoomTools socket={live.socket} interviewer />
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
function EvaluationEditor({
  id,
  questionId,
  existing,
  answer,
  code,
  latestSubmission,
  planSkills,
}: {
  id: number;
  questionId: number;
  existing?: Evaluation;
  answer: string;
  code: string;
  latestSubmission?: { id: number; score: number; results: string };
  planSkills: string[];
}) {
  const client = useQueryClient();
  const [candidateAnswer, setAnswer] = useState(
    existing?.candidateAnswer || answer || '',
  );
  const [candidateCode, setCode] = useState(existing?.candidateCode || code);
  const [notes, setNotes] = useState(existing?.notes || '');
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
  const save = useMutation({
    mutationFn: (status: 'draft' | 'final') =>
      apiData<Evaluation>(`/interview-workflows/${id}/evaluations`, 'put', {
        questionId,
        candidateAnswer,
        candidateCode,
        notes,
        skills,
        status,
      }),
    onSuccess: async () => {
      setSaved(true);
      await client.invalidateQueries({
        queryKey: workflowKeys.evaluations(id),
      });
    },
  });
  const observe = useMutation({
    mutationFn: () =>
      apiData<Evaluation>(
        `/interview-workflows/${id}/evaluations/${existing!.id}/observe`,
        'post',
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: workflowKeys.evaluations(id) }),
  });
  const dirty =
    !existing ||
    candidateAnswer !== existing.candidateAnswer ||
    candidateCode !== existing.candidateCode ||
    notes !== existing.notes ||
    JSON.stringify(skills) !== JSON.stringify(existing.skills);
  return (
    <div className="space-y-5">
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
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-outline"
            disabled={save.isPending || !skills.length}
            onClick={() => save.mutate('draft')}
          >
            Save evaluation draft
          </button>
          <button
            className="btn-primary"
            disabled={
              save.isPending ||
              !skills.length ||
              skills.some((s) => s.rating === null || !s.rationale.trim())
            }
            onClick={() => save.mutate('final')}
          >
            Finalize evaluation
          </button>
          <button
            className="btn-outline"
            disabled={!existing || dirty || observe.isPending}
            onClick={() => observe.mutate()}
          >
            {observe.isPending ? 'Analyzing evidence…' : 'Get AI observations'}
          </button>
        </div>
        {dirty && (
          <p className="text-xs text-surface-500">
            Save the response and notes before requesting AI observations.
          </p>
        )}
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
    </div>
  );
}
