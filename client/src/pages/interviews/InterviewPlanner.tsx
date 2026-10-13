import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { apiError } from '../../services/api';
import { planInterview } from '../../services/ai';
import { createInterview } from '../../services/interviews';
import { Sparkles, Wand2, Plus, Trash2, ArrowUp, ArrowDown, X, AlertTriangle, CheckCircle, Scale } from 'lucide-react';
import styles from './InterviewPlanner.module.css';
import type { PlanSection } from '../../types';
import { INTERVIEW_PLANNER_MESSAGES as MSG } from '../../constants';

// Job requirements + candidate experience + skills + duration → editable AI interview plan
export default function InterviewPlanner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [details, setDetails] = useState({
    candidateName: '', candidateEmail: '', role: '', scheduledAt: '',
    jobRequirements: '', candidateExperience: '', durationMinutes: 45,
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState('');
  const [plan, setPlan] = useState<PlanSection[] | null>(null);
  const [rationale, setRationale] = useState('');

  const generate = useMutation({
    mutationFn: () => planInterview({
      role: details.role,
      jobRequirements: details.jobRequirements,
      candidateExperience: details.candidateExperience,
      skills,
      durationMinutes: details.durationMinutes,
    }),
    onSuccess: (data) => { setPlan(data.sections); setRationale(data.rationale); },
  });

  const create = useMutation({
    mutationFn: () => createInterview({
      ...details,
      candidateEmail: details.candidateEmail.trim(),
      scheduledAt: details.scheduledAt ? new Date(details.scheduledAt).toISOString() : null,
      skills,
      plan: plan ?? [],
      status: 'planned',
    }),
    onSuccess: (iv) => { qc.invalidateQueries({ queryKey: ['interviews'] }); navigate(`/admin/interviews/${iv.id}`); },
  });

  function addSkill() {
    const s = skillDraft.trim().replace(/,$/, '');
    if (s && !skills.includes(s) && skills.length < 12) setSkills([...skills, s]);
    setSkillDraft('');
  }

  const total = plan?.reduce((a, s) => a + (s.minutes || 0), 0) ?? 0;
  const off = plan ? total - details.durationMinutes : 0;
  const canPlan = skills.length > 0 && details.durationMinutes >= 10;

  function updateSection(i: number, patch: Partial<PlanSection>) {
    setPlan((p) => p!.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function move(i: number, dir: -1 | 1) {
    setPlan((p) => {
      const next = [...p!];
      const t = i + dir;
      if (t < 0 || t >= next.length) return next;
      [next[i], next[t]] = [next[t], next[i]];
      return next;
    });
  }
  // Scale every section so the plan adds up to the interview length exactly
  function fitToDuration() {
    setPlan((p) => {
      if (!p || !total) return p;
      const scaled = p.map((s) => ({ ...s, minutes: Math.max(1, Math.round((s.minutes / total) * details.durationMinutes)) }));
      let diff = details.durationMinutes - scaled.reduce((a, s) => a + s.minutes, 0);
      for (let i = 0; diff !== 0 && i < 500; i++) {
        const k = i % scaled.length;
        if (diff > 0) { scaled[k].minutes++; diff--; } else if (scaled[k].minutes > 1) { scaled[k].minutes--; diff++; }
      }
      return scaled;
    });
  }

  return (
    <AdminLayout title="Plan an interview" subtitle={MSG.describeRoleCandidateGet} maxWidth={styles.planAnInterviewMaxWidth}>
      <div className={styles.interviewDetailsBox}>
        {/* Inputs */}
        <form className={styles.interviewDetailsForm} onSubmit={(e) => { e.preventDefault(); if (canPlan) generate.mutate(); }}>
          <h2 className={styles.interviewDetailsTitle}>Interview details</h2>
          <div className={styles.pNameBox}>
            <div className={styles.pNameBox2}>
              <label className="label" htmlFor="p-name">Candidate name *</label>
              <input id="p-name" className="input" value={details.candidateName} onChange={(e) => setDetails({ ...details, candidateName: e.target.value })} maxLength={120} />
            </div>
            <div className={styles.pNameBox2}>
              <label className="label" htmlFor="p-email">Email</label>
              <input id="p-email" type="email" className="input" value={details.candidateEmail} onChange={(e) => setDetails({ ...details, candidateEmail: e.target.value })} />
            </div>
            <div className={styles.pNameBox2}>
              <label className="label" htmlFor="p-role">Role</label>
              <input id="p-role" className="input" placeholder="e.g. Frontend Engineer" value={details.role} onChange={(e) => setDetails({ ...details, role: e.target.value })} maxLength={120} />
            </div>
            <div className={styles.pNameBox2}>
              <label className="label" htmlFor="p-when">Scheduled for</label>
              <input id="p-when" type="datetime-local" className="input" value={details.scheduledAt} onChange={(e) => setDetails({ ...details, scheduledAt: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="p-req">Job requirements</label>
            <textarea id="p-req" className={styles.pReqTextarea} placeholder={MSG.whatRoleNeedsTechnologies} value={details.jobRequirements} onChange={(e) => setDetails({ ...details, jobRequirements: e.target.value })} maxLength={8000} />
          </div>
          <div>
            <label className="label" htmlFor="p-exp">Candidate experience</label>
            <textarea id="p-exp" className={styles.pReqTextarea} placeholder={MSG.experienceExample} value={details.candidateExperience} onChange={(e) => setDetails({ ...details, candidateExperience: e.target.value })} maxLength={8000} />
          </div>
          <div>
            <label className="label" htmlFor="p-skill">Required skills *</label>
            <div className={styles.inputsBox}>
              {skills.map((s) => (
                <span key={s} className={styles.sLabel}>
                  {s}<button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`}><X className={styles.xIcon} /></button>
                </span>
              ))}
            </div>
            <input id="p-skill" className="input" placeholder={MSG.reactJavascriptDsaPress} value={skillDraft} onChange={(e) => setSkillDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); } }} onBlur={addSkill} />
          </div>
          <div>
            <label className="label" htmlFor="p-dur">Interview duration (minutes) *</label>
            <input id="p-dur" type="number" min={10} max={240} className={styles.pDurInput} value={details.durationMinutes} onChange={(e) => setDetails({ ...details, durationMinutes: Math.max(10, Math.min(240, Number(e.target.value) || 10)) })} />
          </div>
          {generate.isError && <p className={styles.inputsText}>{apiError(generate.error, MSG.couldNotCreatePlan)}</p>}
          <button type="submit" disabled={!canPlan || generate.isPending} className={styles.wandButton}>
            <Wand2 className={styles.wandIcon} /> {generate.isPending ? 'Planning...' : plan ? 'Regenerate plan' : 'Generate plan'}
          </button>
        </form>

        {/* Plan */}
        <div className={styles.planBox}>
          {!plan ? (
            <div className={styles.sparklesBox}>
              <div className={styles.sparklesBox2}><Sparkles className={styles.sparklesIcon} /></div>
              <p className={styles.interviewDetailsTitle}>{MSG.interviewPlanAppearHere}</p>
              <p className={styles.addTheRequiredText}>{MSG.addRequiredSkillsDuration}</p>
            </div>
          ) : (
            <>
              <div className="card">
                <div className={styles.interviewPlanBox}>
                  <div>
                    <h2 className={styles.interviewPlanTitle}>Interview plan</h2>
                    <p className={`${styles.totalText} ${off === 0 ? styles.totalTextSelected : styles.totalTextDefault}`}>
                      {off === 0 ? <CheckCircle className={styles.wandIcon} /> : <AlertTriangle className={styles.wandIcon} />}
                      {total} of {details.durationMinutes} minutes planned{off !== 0 && ` (${off > 0 ? `${off} over` : `${-off} under`})`}
                    </p>
                  </div>
                  <div className={styles.plusBox}>
                    {off !== 0 && <button onClick={fitToDuration} className={styles.fitToDurationButton}><Scale className={styles.wandIcon} /> Fit to {details.durationMinutes} min</button>}
                    <button onClick={() => setPlan([...plan, { topic: 'New section', minutes: 5, goals: '', questions: [''] }])} className={styles.addSectionButton}><Plus className={styles.wandIcon} /> Add section</button>
                  </div>
                </div>
                {/* Time bar */}
                <div className={styles.timeBarBox} aria-hidden="true">
                  {plan.map((s, i) => (
                    <div key={i} className={[styles.interviewPrimary, styles.interviewSky, styles.interviewEmerald, styles.interviewAmber, styles.interviewRose, styles.interviewIndigo][i % 6]} style={{ width: `${(s.minutes / Math.max(total, details.durationMinutes)) * 100}%` }} title={`${s.topic}: ${s.minutes} min`} />
                  ))}
                </div>
                {rationale && <p className={styles.rationaleText}>{rationale}</p>}
              </div>

              {plan.map((s, i) => (
                <div key={i} className={styles.removeSectionBox}>
                  <div className={styles.removeSectionBox2}>
                    <span className={`${styles.sectionDot} ${[styles.interviewPrimary, styles.interviewSky, styles.interviewEmerald, styles.interviewAmber, styles.interviewRose, styles.interviewIndigo][i % 6]}`} aria-hidden="true" />
                    <input className={styles.sectionTopicInput} value={s.topic} onChange={(e) => updateSection(i, { topic: e.target.value })} aria-label="Section topic" maxLength={80} />
                    <label className={styles.minLabel}>
                      <input type="number" min={1} max={240} className={styles.minutesForInput} value={s.minutes} onChange={(e) => updateSection(i, { minutes: Math.max(1, Number(e.target.value) || 1) })} aria-label={`Minutes for ${s.topic}`} />
                      min
                    </label>
                    <div className={styles.moveUpBox}>
                      <button onClick={() => move(i, -1)} disabled={i === 0} className={styles.moveUpButton} title="Move up"><ArrowUp className={styles.arrowUpIcon} /></button>
                      <button onClick={() => move(i, 1)} disabled={i === plan.length - 1} className={styles.moveUpButton} title="Move down"><ArrowDown className={styles.arrowUpIcon} /></button>
                    </div>
                    <button onClick={() => setPlan(plan.filter((_, j) => j !== i))} className={styles.removeSectionButton} title="Remove section"><Trash2 className={styles.wandIcon} /></button>
                  </div>
                  <input className={styles.goalForThisInput} placeholder={MSG.goalSection} value={s.goals} onChange={(e) => updateSection(i, { goals: e.target.value })} maxLength={1000} />
                  <div className={styles.timeBarBox2}>
                    {s.questions.map((q, qi) => (
                      <div key={qi} className={styles.removeQuestionBox}>
                        <span className={styles.timeBarLabel2}>{qi + 1}.</span>
                        <textarea className={styles.questionToAskTextarea} rows={1} value={q} placeholder="Question to ask" onChange={(e) => updateSection(i, { questions: s.questions.map((x, j) => (j === qi ? e.target.value : x)) })} />
                        <button onClick={() => updateSection(i, { questions: s.questions.filter((_, j) => j !== qi) })} className={styles.removeQuestionButton} aria-label="Remove question"><X className={styles.wandIcon} /></button>
                      </div>
                    ))}
                    {s.questions.length < 10 && <button onClick={() => updateSection(i, { questions: [...s.questions, ''] })} className={styles.addQuestionButton}><Plus className={styles.arrowUpIcon} /> Add question</button>}
                  </div>
                </div>
              ))}

              <div className={styles.questionsBecomeTheBox}>
                <p className={styles.questionsBecomeTheText}>{MSG.questionsBecomeInterviewChecklist}</p>
                <div className={styles.checkCircleBox}>
                  {create.isError && <p className={styles.inputsText}>{apiError(create.error, MSG.couldNotCreateInterview)}</p>}
                  <button onClick={() => create.mutate()} disabled={!details.candidateName.trim() || !plan.length || create.isPending} className="btn-primary" title={!details.candidateName.trim() ? MSG.enterCandidateName : ''}>
                    <CheckCircle className={styles.wandIcon} /> {create.isPending ? 'Creating...' : 'Create interview'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
