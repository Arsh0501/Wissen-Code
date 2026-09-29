import { useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import ValidationPanel, { VerdictBadge } from '../../components/ValidationPanel';
import { apiError } from '../../services/api';
import {
  approveQuestion, generateQuestions, getAIStatus, saveDraftsForReview, validateQuestions,
} from '../../services/ai';
import type { GenerateRequest, GeneratedQuestion, ValidationReport } from '../../services/ai';
import {
  Sparkles, Wand2, ShieldCheck, CheckCircle, Edit, Trash2, Plus, X, AlertTriangle, ChevronDown,
  Inbox, ListChecks, Code2, Square, CheckSquare,
} from 'lucide-react';

type Item = { q: GeneratedQuestion; report?: ValidationReport; include: boolean; editing: boolean };

const STEPS = ['Define', 'Generate', 'Preview & edit', 'Validate', 'Approve'] as const;

export default function AIQuestionStudio() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: getAIStatus });

  const [form, setForm] = useState<GenerateRequest>({ topic: '', difficulty: 'mixed', questionType: 'mixed', count: 4, skills: [], notes: '' });
  const [skillDraft, setSkillDraft] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [result, setResult] = useState<{ approved: string[]; blocked: { title: string; reason: string }[]; saved: number } | null>(null);

  const generate = useMutation({
    mutationFn: () => generateQuestions({ ...form, notes: form.notes?.trim() || undefined }),
    onSuccess: (data) => {
      setItems(data.questions.map((q) => ({ q, include: true, editing: false })));
      setResult(null);
    },
  });

  const validate = useMutation({
    mutationFn: () => validateQuestions(items.map((i) => i.q)),
    onSuccess: (reports) => setItems((prev) => prev.map((it, i) => ({ ...it, report: reports[i] }))),
  });

  // Approve = save to the review queue, then approve each (the server re-validates and refuses failures)
  const approve = useMutation({
    mutationFn: async (mode: 'approve' | 'save') => {
      const chosen = items.filter((i) => i.include);
      const saved = await saveDraftsForReview(chosen.map((i) => i.q), chosen.map((i) => i.report));
      if (mode === 'save') return { approved: [], blocked: [], saved: saved.length };
      const approved: string[] = [];
      const blocked: { title: string; reason: string }[] = [];
      for (const s of saved) {
        try {
          await approveQuestion(s.id);
          approved.push(s.title);
        } catch (err) {
          blocked.push({ title: s.title, reason: apiError(err, 'Failed validation') });
        }
      }
      return { approved, blocked, saved: saved.length };
    },
    onSuccess: (r) => {
      setResult(r);
      setItems([]);
      qc.invalidateQueries({ queryKey: ['questions'] });
    },
  });

  const chosen = items.filter((i) => i.include);
  const allValidated = chosen.length > 0 && chosen.every((i) => i.report);
  const failing = chosen.filter((i) => i.report?.verdict === 'fail');
  const step = result ? 5 : !items.length ? (generate.isPending ? 1 : 0) : !allValidated ? 2 : 4;

  function update(idx: number, patch: Partial<GeneratedQuestion>) {
    // Any edit invalidates the previous validation result for that question
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, q: { ...it.q, ...patch }, report: undefined } : it)));
  }

  function addSkill() {
    const s = skillDraft.trim().replace(/,$/, '');
    if (s && !form.skills.includes(s) && form.skills.length < 15) setForm((f) => ({ ...f, skills: [...f.skills, s] }));
    setSkillDraft('');
  }

  return (
    <AdminLayout
      title="Generate questions with AI"
      subtitle="Describe what you need, review and edit the drafts, validate them, then approve them into the question bank"
      maxWidth="max-w-6xl"
      actions={<Link to="/admin/questions?tab=review" className="btn-outline text-sm"><Inbox className="w-4 h-4" /> Review queue</Link>}
    >
      {/* Progress */}
      <ol className="flex flex-wrap items-center gap-2 mb-6 text-xs font-medium">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${i < step ? 'bg-emerald-500/10 text-emerald-700' : i === step ? 'bg-primary-500/10 text-primary-700 ring-1 ring-primary-500/30' : 'bg-surface-800 text-surface-500'}`}>
              {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="w-4 h-px bg-surface-700" aria-hidden="true" />}
          </li>
        ))}
        <li className="flex items-center gap-2 ml-1 text-surface-500">→ Question bank</li>
      </ol>

      {status.data && status.data.provider === 'stand-in' && (
        <p className="mb-5 text-xs text-surface-500 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary-600" />
          AI is running on the built-in stand-in until the AI backend is connected. Output is realistic sample content.
        </p>
      )}

      {result && (
        <div className="card mb-6">
          <h2 className="text-base font-semibold text-white flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-600" /> Done</h2>
          <ul className="text-sm text-surface-300 mt-3 space-y-1">
            {result.approved.length > 0 && <li><b className="text-white">{result.approved.length}</b> approved and added to the question bank: {result.approved.join(', ')}.</li>}
            {result.approved.length === 0 && result.blocked.length === 0 && <li><b className="text-white">{result.saved}</b> saved to the review queue for approval later.</li>}
            {result.blocked.map((b) => <li key={b.title} className="text-red-700">"{b.title}" stayed in the review queue: {b.reason}</li>)}
          </ul>
          <div className="flex gap-2 mt-4">
            <Link to="/admin/questions" className="btn-primary text-sm">Go to question bank</Link>
            {(result.blocked.length > 0 || result.approved.length === 0) && <Link to="/admin/questions?tab=review" className="btn-outline text-sm">Open review queue</Link>}
            <button onClick={() => setResult(null)} className="btn-ghost text-sm">Generate more</button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* ── Define ── */}
        <form
          className="card space-y-4 lg:sticky lg:top-4"
          onSubmit={(e) => { e.preventDefault(); if (form.topic.trim().length >= 2) generate.mutate(); }}
        >
          <h2 className="text-sm font-semibold text-white">What do you need?</h2>
          <div>
            <label className="label" htmlFor="g-topic">Topic *</label>
            <input id="g-topic" className="input" placeholder="e.g. Frontend engineering, Arrays" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="g-diff">Difficulty</label>
              <select id="g-diff" className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as GenerateRequest['difficulty'] })}>
                <option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="g-count">Number of questions</label>
              <input id="g-count" type="number" min={1} max={10} className="input" value={form.count} onChange={(e) => setForm({ ...form, count: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
            </div>
          </div>
          <div>
            <span className="label">Question type</span>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-surface-800">
              {([['mixed', 'Mixed'], ['coding', 'Coding'], ['mcq', 'MCQ']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, questionType: k })} className={`py-1.5 rounded-md text-sm font-medium ${form.questionType === k ? 'bg-surface-900 text-white shadow-sm' : 'text-surface-500'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="g-skill">Required skills</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.skills.map((s) => (
                <span key={s} className="badge bg-primary-500/10 text-primary-700 ring-1 ring-primary-500/20 gap-1">
                  {s}
                  <button type="button" onClick={() => setForm({ ...form, skills: form.skills.filter((x) => x !== s) })} aria-label={`Remove ${s}`}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <input
              id="g-skill"
              className="input"
              placeholder="Type a skill and press Enter"
              value={skillDraft}
              onChange={(e) => setSkillDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); } }}
              onBlur={addSkill}
            />
          </div>
          <div>
            <label className="label" htmlFor="g-notes">Notes <span className="text-surface-500 font-normal">(optional)</span></label>
            <textarea id="g-notes" className="input min-h-[70px]" placeholder="e.g. focus on real-world scenarios, avoid trick questions" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
          </div>
          {generate.isError && <p className="text-sm text-red-600">{apiError(generate.error, 'Generation failed')}</p>}
          {items.length > 0 && !generate.isPending && <p className="text-xs text-amber-700">Generating again replaces the current drafts.</p>}
          <button type="submit" disabled={generate.isPending || form.topic.trim().length < 2} className="btn-primary w-full">
            <Wand2 className="w-4 h-4" /> {generate.isPending ? 'Generating...' : items.length ? 'Regenerate' : 'Generate'}
          </button>
        </form>

        {/* ── Preview / edit / validate / approve ── */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {!items.length ? (
            <div className="card text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-primary-500/10 text-primary-600 flex items-center justify-center mx-auto mb-4">
                {generate.isPending ? <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-7 h-7" />}
              </div>
              <p className="text-sm font-semibold text-white">{generate.isPending ? 'Writing questions...' : 'Drafts will appear here'}</p>
              <p className="text-xs text-surface-500 mt-1">Nothing is added to the question bank until you approve it.</p>
            </div>
          ) : (
            <>
              <div className="card flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="text-sm text-surface-300">
                  <b className="text-white">{chosen.length}</b> of {items.length} selected
                  {allValidated && (failing.length ? <span className="text-red-700"> · {failing.length} failed validation</span> : <span className="text-emerald-700"> · all validated</span>)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => validate.mutate()} disabled={validate.isPending || !items.length} className={allValidated ? 'btn-outline text-sm' : 'btn-primary text-sm'}>
                    <ShieldCheck className="w-4 h-4" /> {validate.isPending ? 'Validating...' : allValidated ? 'Validate again' : 'Validate'}
                  </button>
                  <button onClick={() => approve.mutate('save')} disabled={approve.isPending || !chosen.length} className="btn-outline text-sm" title="Keep in the review queue for someone to approve later">
                    <Inbox className="w-4 h-4" /> Save for review
                  </button>
                  <button
                    onClick={() => approve.mutate('approve')}
                    disabled={approve.isPending || !allValidated || failing.length > 0}
                    className="btn-primary text-sm"
                    title={!allValidated ? 'Validate first' : failing.length ? 'Fix or deselect the failing questions' : 'Add to the question bank'}
                  >
                    <CheckCircle className="w-4 h-4" /> {approve.isPending ? 'Approving...' : `Approve ${chosen.length}`}
                  </button>
                </div>
                {validate.isError && <p className="w-full text-sm text-red-600">{apiError(validate.error, 'Validation failed')}</p>}
                {approve.isError && <p className="w-full text-sm text-red-600">{apiError(approve.error, 'Could not save')}</p>}
              </div>

              {items.map((it, idx) => (
                <DraftCard
                  key={idx}
                  index={idx}
                  item={it}
                  onToggleInclude={() => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, include: !x.include } : x)))}
                  onToggleEdit={() => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, editing: !x.editing } : x)))}
                  onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  onChange={(patch) => update(idx, patch)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function DraftCard({ item, index, onToggleInclude, onToggleEdit, onRemove, onChange }: {
  item: Item; index: number; onToggleInclude: () => void; onToggleEdit: () => void; onRemove: () => void; onChange: (p: Partial<GeneratedQuestion>) => void;
}) {
  const { q, report } = item;
  const [showReport, setShowReport] = useState(false);
  const TypeIcon = q.type === 'mcq' ? ListChecks : Code2;
  return (
    <div className={`card p-0 overflow-hidden ${item.include ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={onToggleInclude} className="mt-0.5 shrink-0" aria-label={item.include ? 'Exclude from approval' : 'Include in approval'} title={item.include ? 'Selected' : 'Not selected'}>
            {item.include ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-surface-500" />}
          </button>
          <div className="min-w-0">
            <h3 className="font-semibold text-white">Q{index + 1}. {q.title}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700 gap-1"><TypeIcon className="w-3 h-3" /> {q.type === 'mcq' ? 'Multiple choice' : 'Coding'}</span>
              <span className={`badge-${q.difficulty} capitalize`}>{q.difficulty}</span>
              {q.skills.slice(0, 4).map((s) => <span key={s} className="badge bg-surface-800 text-surface-500 ring-1 ring-surface-700">{s}</span>)}
              <VerdictBadge report={report} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onToggleEdit} className={`btn-ghost p-2 ${item.editing ? 'text-primary-700' : ''}`} title={item.editing ? 'Done editing' : 'Edit'}><Edit className="w-4 h-4" /></button>
          <button onClick={onRemove} className="btn-ghost p-2 hover:text-red-600" title="Discard"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {item.editing ? <DraftEditor q={q} onChange={onChange} /> : <DraftPreview q={q} />}

      {report && (
        <>
          <button onClick={() => setShowReport((v) => !v)} className="w-full flex items-center justify-between px-5 py-2.5 border-t border-surface-800 bg-surface-950 text-xs font-medium text-surface-400 hover:bg-surface-800/50 cursor-pointer" aria-expanded={showReport}>
            <span className="flex items-center gap-2">
              Validation report
              {report.duplicateOf && <span className="text-amber-700">· similar to "{report.duplicateOf.title}"</span>}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showReport ? 'rotate-180' : ''}`} />
          </button>
          {showReport && <div className="p-5 border-t border-surface-800"><ValidationPanel report={report} /></div>}
        </>
      )}
    </div>
  );
}

function DraftPreview({ q }: { q: GeneratedQuestion }) {
  const samples = q.testCases.filter((t) => t.isSample);
  return (
    <div className="px-5 pb-5 space-y-3">
      <div className="text-sm text-surface-300 space-y-2 max-h-72 overflow-y-auto pr-2 [&_strong]:text-white [&_code]:px-1 [&_code]:rounded [&_code]:bg-surface-800 [&_pre]:bg-surface-950 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown>{q.statement}</ReactMarkdown>
      </div>
      {q.type === 'mcq' ? (
        <ul className="space-y-1.5">
          {q.options.map((o) => {
            const right = q.correctOptionIds.includes(o.id);
            return <li key={o.id} className={`px-3 py-2 rounded-lg border text-sm ${right ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700' : 'border-surface-800 text-surface-300'}`}><b className="uppercase mr-2">{o.id}</b>{o.text}{right && ' ✓'}</li>;
          })}
        </ul>
      ) : (
        <p className="text-xs text-surface-500">{samples.length} sample · {q.testCases.length - samples.length} hidden test cases · reference solution {q.referenceSolution.trim() ? 'included' : 'missing'}</p>
      )}
    </div>
  );
}

function DraftEditor({ q, onChange }: { q: GeneratedQuestion; onChange: (p: Partial<GeneratedQuestion>) => void }) {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  return (
    <div className="px-5 pb-5 space-y-4 border-t border-surface-800 pt-4">
      <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Editing clears this question&apos;s validation. Validate again before approving.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="label">Title</label>
          <input className="input" value={q.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={200} />
        </div>
        <div>
          <label className="label">Difficulty</label>
          <select className="input" value={q.difficulty} onChange={(e) => onChange({ difficulty: e.target.value as GeneratedQuestion['difficulty'] })}>
            <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Statement (Markdown)</label>
        <textarea className="input min-h-[180px] font-mono text-xs" value={q.statement} onChange={(e) => onChange({ statement: e.target.value })} />
      </div>
      {q.type === 'mcq' ? (
        <div className="space-y-2">
          <span className="label">Options — tick the correct answer(s)</span>
          {q.options.map((o, i) => {
            const right = q.correctOptionIds.includes(o.id);
            return (
              <div key={o.id} className="flex items-center gap-2">
                <button type="button" onClick={() => onChange({ correctOptionIds: right ? q.correctOptionIds.filter((c) => c !== o.id) : [...q.correctOptionIds, o.id] })} aria-label={`Toggle ${o.id} correct`}>
                  {right ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5 text-surface-500" />}
                </button>
                <span className="w-5 text-sm font-semibold text-surface-500 uppercase">{o.id}</span>
                <input className="input flex-1" value={o.text} onChange={(e) => onChange({ options: q.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                <button type="button" disabled={q.options.length <= 2} onClick={() => onChange({ options: q.options.filter((_, j) => j !== i), correctOptionIds: q.correctOptionIds.filter((c) => c !== o.id) })} className="btn-ghost p-1.5 disabled:opacity-30" aria-label={`Remove option ${o.id}`}><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
          {q.options.length < 6 && (
            <button type="button" onClick={() => onChange({ options: [...q.options, { id: ids.find((id) => !q.options.some((o) => o.id === id))!, text: '' }] })} className="btn-ghost text-sm"><Plus className="w-4 h-4" /> Add option</button>
          )}
          <div>
            <label className="label">Explanation</label>
            <textarea className="input min-h-[60px]" value={q.explanation} onChange={(e) => onChange({ explanation: e.target.value })} />
          </div>
        </div>
      ) : (
        <>
          <div>
            <span className="label">Test cases</span>
            <div className="space-y-2">
              {q.testCases.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-start">
                  <textarea className="input font-mono text-xs min-h-[52px]" placeholder="Input" value={t.input} onChange={(e) => onChange({ testCases: q.testCases.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)) })} />
                  <textarea className="input font-mono text-xs min-h-[52px]" placeholder="Expected output" value={t.expectedOutput} onChange={(e) => onChange({ testCases: q.testCases.map((x, j) => (j === i ? { ...x, expectedOutput: e.target.value } : x)) })} />
                  <label className="flex items-center gap-1 text-xs text-surface-400 pt-2 whitespace-nowrap">
                    <input type="checkbox" checked={t.isSample} onChange={(e) => onChange({ testCases: q.testCases.map((x, j) => (j === i ? { ...x, isSample: e.target.checked } : x)) })} /> Sample
                  </label>
                  <button type="button" onClick={() => onChange({ testCases: q.testCases.filter((_, j) => j !== i) })} className="btn-ghost p-1.5 mt-1" aria-label={`Remove test ${i + 1}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onChange({ testCases: [...q.testCases, { input: '', expectedOutput: '', isSample: false }] })} className="btn-ghost text-sm mt-2"><Plus className="w-4 h-4" /> Add test case</button>
          </div>
          <div>
            <label className="label">Reference solution (Python) <span className="text-surface-500 font-normal">— used to verify expected outputs</span></label>
            <textarea className="input font-mono text-xs min-h-[120px] [font-variant-ligatures:none]" value={q.referenceSolution} onChange={(e) => onChange({ referenceSolution: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}
