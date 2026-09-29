import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { apiError } from '../../services/api';
import { planInterview } from '../../services/ai';
import type { PlanSection } from '../../services/ai';
import { createInterview } from '../../services/interviews';
import { Sparkles, Wand2, Plus, Trash2, ArrowUp, ArrowDown, X, AlertTriangle, CheckCircle, Scale } from 'lucide-react';

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
    <AdminLayout title="Plan an interview" subtitle="Describe the role and the candidate, and get a time-boxed plan you can edit" maxWidth="max-w-6xl">
      <div className="grid lg:grid-cols-5 gap-6 items-start">
        {/* Inputs */}
        <form className="card space-y-4 lg:col-span-2" onSubmit={(e) => { e.preventDefault(); if (canPlan) generate.mutate(); }}>
          <h2 className="text-sm font-semibold text-white">Interview details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="label" htmlFor="p-name">Candidate name *</label>
              <input id="p-name" className="input" value={details.candidateName} onChange={(e) => setDetails({ ...details, candidateName: e.target.value })} maxLength={120} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label" htmlFor="p-email">Email</label>
              <input id="p-email" type="email" className="input" value={details.candidateEmail} onChange={(e) => setDetails({ ...details, candidateEmail: e.target.value })} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label" htmlFor="p-role">Role</label>
              <input id="p-role" className="input" placeholder="e.g. Frontend Engineer" value={details.role} onChange={(e) => setDetails({ ...details, role: e.target.value })} maxLength={120} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label" htmlFor="p-when">Scheduled for</label>
              <input id="p-when" type="datetime-local" className="input" value={details.scheduledAt} onChange={(e) => setDetails({ ...details, scheduledAt: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="p-req">Job requirements</label>
            <textarea id="p-req" className="input min-h-[90px]" placeholder="What the role needs: technologies, responsibilities, level" value={details.jobRequirements} onChange={(e) => setDetails({ ...details, jobRequirements: e.target.value })} maxLength={8000} />
          </div>
          <div>
            <label className="label" htmlFor="p-exp">Candidate experience</label>
            <textarea id="p-exp" className="input min-h-[90px]" placeholder="e.g. 4 years building React apps; led a design-system migration" value={details.candidateExperience} onChange={(e) => setDetails({ ...details, candidateExperience: e.target.value })} maxLength={8000} />
          </div>
          <div>
            <label className="label" htmlFor="p-skill">Required skills *</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {skills.map((s) => (
                <span key={s} className="badge bg-primary-500/10 text-primary-700 ring-1 ring-primary-500/20 gap-1">
                  {s}<button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <input id="p-skill" className="input" placeholder="React, JavaScript, DSA… press Enter" value={skillDraft} onChange={(e) => setSkillDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); } }} onBlur={addSkill} />
          </div>
          <div>
            <label className="label" htmlFor="p-dur">Interview duration (minutes) *</label>
            <input id="p-dur" type="number" min={10} max={240} className="input w-32" value={details.durationMinutes} onChange={(e) => setDetails({ ...details, durationMinutes: Math.max(10, Math.min(240, Number(e.target.value) || 10)) })} />
          </div>
          {generate.isError && <p className="text-sm text-red-600">{apiError(generate.error, 'Could not create a plan')}</p>}
          <button type="submit" disabled={!canPlan || generate.isPending} className="btn-primary w-full">
            <Wand2 className="w-4 h-4" /> {generate.isPending ? 'Planning...' : plan ? 'Regenerate plan' : 'Generate plan'}
          </button>
        </form>

        {/* Plan */}
        <div className="lg:col-span-3 space-y-4 min-w-0">
          {!plan ? (
            <div className="card text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-primary-500/10 text-primary-600 flex items-center justify-center mx-auto mb-4"><Sparkles className="w-7 h-7" /></div>
              <p className="text-sm font-semibold text-white">Your interview plan will appear here</p>
              <p className="text-xs text-surface-500 mt-1">Add the required skills and duration, then generate. You can edit everything.</p>
            </div>
          ) : (
            <>
              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">Interview plan</h2>
                    <p className={`text-sm mt-0.5 tabular-nums flex items-center gap-1.5 ${off === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {off === 0 ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      {total} of {details.durationMinutes} minutes planned{off !== 0 && ` (${off > 0 ? `${off} over` : `${-off} under`})`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {off !== 0 && <button onClick={fitToDuration} className="btn-outline text-sm"><Scale className="w-4 h-4" /> Fit to {details.durationMinutes} min</button>}
                    <button onClick={() => setPlan([...plan, { topic: 'New section', minutes: 5, goals: '', questions: [''] }])} className="btn-ghost text-sm"><Plus className="w-4 h-4" /> Add section</button>
                  </div>
                </div>
                {/* Time bar */}
                <div className="flex h-2.5 rounded-full overflow-hidden mt-4 bg-surface-800" aria-hidden="true">
                  {plan.map((s, i) => (
                    <div key={i} className={['bg-primary-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500'][i % 6]} style={{ width: `${(s.minutes / Math.max(total, details.durationMinutes)) * 100}%` }} title={`${s.topic}: ${s.minutes} min`} />
                  ))}
                </div>
                {rationale && <p className="text-xs text-surface-500 mt-3">{rationale}</p>}
              </div>

              {plan.map((s, i) => (
                <div key={i} className="card space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-8 rounded-full ${['bg-primary-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500'][i % 6]}`} aria-hidden="true" />
                    <input className="input flex-1 font-semibold" value={s.topic} onChange={(e) => updateSection(i, { topic: e.target.value })} aria-label="Section topic" maxLength={80} />
                    <label className="flex items-center gap-1.5 text-sm text-surface-400 shrink-0">
                      <input type="number" min={1} max={240} className="input w-20 text-right tabular-nums" value={s.minutes} onChange={(e) => updateSection(i, { minutes: Math.max(1, Number(e.target.value) || 1) })} aria-label={`Minutes for ${s.topic}`} />
                      min
                    </label>
                    <div className="flex flex-col">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="btn-ghost p-0.5" title="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => move(i, 1)} disabled={i === plan.length - 1} className="btn-ghost p-0.5" title="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <button onClick={() => setPlan(plan.filter((_, j) => j !== i))} className="btn-ghost p-1.5 hover:text-red-600" title="Remove section"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <input className="input text-sm" placeholder="Goal for this section" value={s.goals} onChange={(e) => updateSection(i, { goals: e.target.value })} maxLength={1000} />
                  <div className="space-y-2">
                    {s.questions.map((q, qi) => (
                      <div key={qi} className="flex items-start gap-2">
                        <span className="text-xs text-surface-500 pt-2.5 w-5 text-right tabular-nums">{qi + 1}.</span>
                        <textarea className="input flex-1 text-sm min-h-[40px]" rows={1} value={q} placeholder="Question to ask" onChange={(e) => updateSection(i, { questions: s.questions.map((x, j) => (j === qi ? e.target.value : x)) })} />
                        <button onClick={() => updateSection(i, { questions: s.questions.filter((_, j) => j !== qi) })} className="btn-ghost p-1.5 mt-0.5" aria-label="Remove question"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    {s.questions.length < 10 && <button onClick={() => updateSection(i, { questions: [...s.questions, ''] })} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add question</button>}
                  </div>
                </div>
              ))}

              <div className="card flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-surface-500">Questions become the interview checklist. You can add more during the interview.</p>
                <div className="flex flex-col items-end gap-1">
                  {create.isError && <p className="text-sm text-red-600">{apiError(create.error, 'Could not create the interview')}</p>}
                  <button onClick={() => create.mutate()} disabled={!details.candidateName.trim() || !plan.length || create.isPending} className="btn-primary" title={!details.candidateName.trim() ? 'Enter the candidate name' : ''}>
                    <CheckCircle className="w-4 h-4" /> {create.isPending ? 'Creating...' : 'Create interview'}
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
