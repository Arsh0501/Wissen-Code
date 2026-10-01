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
import {
  Sparkles, Wand2, ShieldCheck, CheckCircle, Edit, Trash2, Plus, X, AlertTriangle, ChevronDown,
  Inbox, ListChecks, Code2, Square, CheckSquare,
} from 'lucide-react';
import styles from './AIQuestionStudio.module.css';
import type { StudioItem, GenerateRequest, GeneratedQuestion } from '../../types';
import { AI_STUDIO_STEPS, COMMON_MESSAGES, AI_QUESTION_STUDIO_MESSAGES as MSG } from '../../constants';

export default function AIQuestionStudio() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: getAIStatus });

  const [form, setForm] = useState<GenerateRequest>({ topic: '', difficulty: 'mixed', questionType: 'mixed', count: 4, skills: [], notes: '' });
  const [skillDraft, setSkillDraft] = useState('');
  const [items, setItems] = useState<StudioItem[]>([]);
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
      title={MSG.generateQuestionsAi}
      subtitle={MSG.describeWhatNeedReview}
      maxWidth={styles.generateQuestionsWithMaxWidth}
      actions={<Link to="/admin/questions?tab=review" className={styles.reviewQueueLink}><Inbox className={styles.inboxIcon} /> Review queue</Link>}
    >
      {/* Progress */}
      <ol className={styles.questionBankList}>
        {AI_STUDIO_STEPS.map((label, i) => (
          <li key={label} className={styles.labelItem}>
            <span className={`${styles.label} ${i < step ? styles.labelHigh : i === step ? styles.labelSelected : styles.labelDefault}`}>
              {i < step ? <CheckCircle className={styles.checkCircleIcon} /> : <span className={styles.progressLabel}>{i + 1}</span>}
              {label}
            </span>
            {i < AI_STUDIO_STEPS.length - 1 && <span className={styles.progressLabel2} aria-hidden="true" />}
          </li>
        ))}
        <li className={styles.questionBankItem}>→ Question bank</li>
      </ol>

      {status.data && status.data.provider === 'stand-in' && (
        <p className={styles.aiIsRunningText}>
          <Sparkles className={styles.sparklesIcon} />
          {MSG.aiRunningBuiltStand}</p>
      )}

      {result && (
        <div className={styles.checkCircleBox}>
          <h2 className={styles.doneTitle}><CheckCircle className={styles.checkCircleIcon2} /> Done</h2>
          <ul className={styles.progressList}>
            {result.approved.length > 0 && <li><b className={styles.lengthBox}>{result.approved.length}</b> {MSG.approvedAddedQuestionBank}{result.approved.join(', ')}.</li>}
            {result.approved.length === 0 && result.blocked.length === 0 && <li><b className={styles.lengthBox}>{result.saved}</b> {MSG.savedReviewQueueApproval}</li>}
            {result.blocked.map((b) => <li key={b.title} className={styles.progressItem}>"{b.title}{MSG.stayedReviewQueue}{b.reason}</li>)}
          </ul>
          <div className={styles.goToQuestionBox}>
            <Link to="/admin/questions" className={styles.goToQuestionLink}>{MSG.goQuestionBank}</Link>
            {(result.blocked.length > 0 || result.approved.length === 0) && <Link to="/admin/questions?tab=review" className={styles.reviewQueueLink}>Open review queue</Link>}
            <button onClick={() => setResult(null)} className={styles.generateMoreButton}>Generate more</button>
          </div>
        </div>
      )}

      <div className={styles.whatDoYouBox}>
        {/* ── Define ── */}
        <form
          className={styles.whatDoYouForm}
          onSubmit={(e) => { e.preventDefault(); if (form.topic.trim().length >= 2) generate.mutate(); }}
        >
          <h2 className={styles.whatDoYouTitle}>{MSG.whatDoNeed}</h2>
          <div>
            <label className="label" htmlFor="g-topic">Topic *</label>
            <input id="g-topic" className="input" placeholder={MSG.frontendEngineeringArraysExample} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={120} />
          </div>
          <div className={styles.gDiffBox}>
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
            <div className={styles.defineBox}>
              {([['mixed', 'Mixed'], ['coding', 'Coding'], ['mcq', 'MCQ']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, questionType: k })} className={`${styles.lButton} ${form.questionType === k ? styles.lButtonSelected : styles.lButtonDefault}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="g-skill">Required skills</label>
            <div className={styles.defineBox2}>
              {form.skills.map((s) => (
                <span key={s} className={styles.sLabel}>
                  {s}
                  <button type="button" onClick={() => setForm({ ...form, skills: form.skills.filter((x) => x !== s) })} aria-label={`Remove ${s}`}><X className={styles.xIcon} /></button>
                </span>
              ))}
            </div>
            <input
              id="g-skill"
              className="input"
              placeholder={MSG.typeSkillPressEnter}
              value={skillDraft}
              onChange={(e) => setSkillDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); } }}
              onBlur={addSkill}
            />
          </div>
          <div>
            <label className="label" htmlFor="g-notes">Notes <span className={styles.optionalLabel}>(optional)</span></label>
            <textarea id="g-notes" className={styles.gNotesTextarea} placeholder={MSG.focusRealWorldScenariosExample} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
          </div>
          {generate.isError && <p className={styles.defineText}>{apiError(generate.error, 'Generation failed')}</p>}
          {items.length > 0 && !generate.isPending && <p className={styles.generatingAgainReplacesText}>{MSG.generatingAgainReplacesCurrent}</p>}
          <button type="submit" disabled={generate.isPending || form.topic.trim().length < 2} className={styles.wandButton}>
            <Wand2 className={styles.inboxIcon} /> {generate.isPending ? 'Generating...' : items.length ? 'Regenerate' : 'Generate'}
          </button>
        </form>

        {/* ── Preview / edit / validate / approve ── */}
        <div className={styles.defineBox3}>
          {!items.length ? (
            <div className={styles.nothingIsAddedBox}>
              <div className={styles.defineBox4}>
                {generate.isPending ? <div className={styles.defineBox5} /> : <Sparkles className={styles.sparklesIcon2} />}
              </div>
              <p className={styles.whatDoYouTitle}>{generate.isPending ? 'Writing questions...' : MSG.draftsAppearHere}</p>
              <p className={styles.nothingIsAddedText}>{MSG.nothingAddedQuestionBank}</p>
            </div>
          ) : (
            <>
              <div className={styles.ofBox}>
                <div className={styles.ofBox2}>
                  <b className={styles.lengthBox}>{chosen.length}</b> of {items.length} selected
                  {allValidated && (failing.length ? <span className={styles.progressItem}> · {failing.length} failed validation</span> : <span className={styles.allValidatedLabel}> · all validated</span>)}
                </div>
                <div className={styles.keepInTheBox}>
                  <button onClick={() => validate.mutate()} disabled={validate.isPending || !items.length} className={allValidated ? styles.reviewQueueLink : styles.goToQuestionLink}>
                    <ShieldCheck className={styles.inboxIcon} /> {validate.isPending ? 'Validating...' : allValidated ? 'Validate again' : 'Validate'}
                  </button>
                  <button onClick={() => approve.mutate('save')} disabled={approve.isPending || !chosen.length} className={styles.reviewQueueLink} title={MSG.keepReviewQueueSomeone}>
                    <Inbox className={styles.inboxIcon} /> Save for review
                  </button>
                  <button
                    onClick={() => approve.mutate('approve')}
                    disabled={approve.isPending || !allValidated || failing.length > 0}
                    className={styles.goToQuestionLink}
                    title={!allValidated ? 'Validate first' : failing.length ? MSG.fixDeselectFailingQuestions : COMMON_MESSAGES.addQuestionBank}
                  >
                    <CheckCircle className={styles.inboxIcon} /> {approve.isPending ? 'Approving...' : `Approve ${chosen.length}`}
                  </button>
                </div>
                {validate.isError && <p className={styles.defineText2}>{apiError(validate.error, 'Validation failed')}</p>}
                {approve.isError && <p className={styles.defineText2}>{apiError(approve.error, 'Could not save')}</p>}
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
  item: StudioItem; index: number; onToggleInclude: () => void; onToggleEdit: () => void; onRemove: () => void; onChange: (p: Partial<GeneratedQuestion>) => void;
}) {
  const { q, report } = item;
  const [showReport, setShowReport] = useState(false);
  const TypeIcon = q.type === 'mcq' ? ListChecks : Code2;
  return (
    <div className={`${styles.discardBox} ${item.include ? '' : styles.discardBoxDefault}`}>
      <div className={styles.discardBox2}>
        <div className={styles.qBox}>
          <button onClick={onToggleInclude} className={styles.toggleIncludeButton} aria-label={item.include ? 'Exclude from approval' : 'Include in approval'} title={item.include ? 'Selected' : 'Not selected'}>
            {item.include ? <CheckSquare className={styles.checkSquareIcon} /> : <Square className={styles.squareIcon} />}
          </button>
          <div className={styles.qBox2}>
            <h3 className={styles.qTitle}>Q{index + 1}. {q.title}</h3>
            <div className={styles.difficultyBox}>
              <span className={styles.defineLabel}><TypeIcon className={styles.xIcon} /> {q.type === 'mcq' ? 'Multiple choice' : 'Coding'}</span>
              <span className={`${styles.difficultyLabel} badge-${q.difficulty}`}>{q.difficulty}</span>
              {q.skills.slice(0, 4).map((s) => <span key={s} className={styles.sLabel2}>{s}</span>)}
              <VerdictBadge report={report} />
            </div>
          </div>
        </div>
        <div className={styles.discardBox3}>
          <button onClick={onToggleEdit} className={`${styles.toggleEditButton} ${item.editing ? styles.toggleEditButtonEditing : ''}`} title={item.editing ? 'Done editing' : 'Edit'}><Edit className={styles.inboxIcon} /></button>
          <button onClick={onRemove} className={styles.discardButton} title="Discard"><Trash2 className={styles.inboxIcon} /></button>
        </div>
      </div>

      {item.editing ? <DraftEditor q={q} onChange={onChange} /> : <DraftPreview q={q} />}

      {report && (
        <>
          <button onClick={() => setShowReport((v) => !v)} className={styles.chevronDownButton} aria-expanded={showReport}>
            <span className={styles.labelItem}>
              Validation report
              {report.duplicateOf && <span className={styles.similarToLabel}>· similar to "{report.duplicateOf.title}"</span>}
            </span>
            <ChevronDown className={`${styles.chevronDownIcon} ${showReport ? styles.chevronDownIconReport : ''}`} />
          </button>
          {showReport && <div className={styles.defineBox6}><ValidationPanel report={report} /></div>}
        </>
      )}
    </div>
  );
}

function DraftPreview({ q }: { q: GeneratedQuestion }) {
  const samples = q.testCases.filter((t) => t.isSample);
  return (
    <div className={styles.statementBox}>
      <div className={styles.statementBox2}>
        <ReactMarkdown>{q.statement}</ReactMarkdown>
      </div>
      {q.type === 'mcq' ? (
        <ul className={styles.defineList}>
          {q.options.map((o) => {
            const right = q.correctOptionIds.includes(o.id);
            return <li key={o.id} className={`${styles.textItem} ${right ? styles.textItemRight : styles.textItemDefault}`}><b className={styles.idBox}>{o.id}</b>{o.text}{right && ' ✓'}</li>;
          })}
        </ul>
      ) : (
        <p className={styles.lengthText}>{samples.length} sample · {q.testCases.length - samples.length} {MSG.hiddenTestCasesReference}{q.referenceSolution.trim() ? 'included' : 'missing'}</p>
      )}
    </div>
  );
}

function DraftEditor({ q, onChange }: { q: GeneratedQuestion; onChange: (p: Partial<GeneratedQuestion>) => void }) {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  return (
    <div className={styles.alertTriangleBox}>
      <p className={styles.editingClearsThisText}><AlertTriangle className={styles.checkCircleIcon} /> {MSG.editingClearsQuestionsValidation}</p>
      <div className={styles.titleBox}>
        <div className={styles.titleBox2}>
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
        <textarea className={styles.defineTextarea} value={q.statement} onChange={(e) => onChange({ statement: e.target.value })} />
      </div>
      {q.type === 'mcq' ? (
        <div className={styles.optionsTickTheBox}>
          <span className="label">{MSG.optionsTickCorrectAnswer}</span>
          {q.options.map((o, i) => {
            const right = q.correctOptionIds.includes(o.id);
            return (
              <div key={o.id} className={styles.labelItem}>
                <button type="button" onClick={() => onChange({ correctOptionIds: right ? q.correctOptionIds.filter((c) => c !== o.id) : [...q.correctOptionIds, o.id] })} aria-label={`Toggle ${o.id} correct`}>
                  {right ? <CheckSquare className={styles.checkCircleIcon2} /> : <Square className={styles.squareIcon} />}
                </button>
                <span className={styles.idLabel}>{o.id}</span>
                <input className={styles.defineInput} value={o.text} onChange={(e) => onChange({ options: q.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                <button type="button" disabled={q.options.length <= 2} onClick={() => onChange({ options: q.options.filter((_, j) => j !== i), correctOptionIds: q.correctOptionIds.filter((c) => c !== o.id) })} className={styles.removeOptionButton} aria-label={`Remove option ${o.id}`}><Trash2 className={styles.inboxIcon} /></button>
              </div>
            );
          })}
          {q.options.length < 6 && (
            <button type="button" onClick={() => onChange({ options: [...q.options, { id: ids.find((id) => !q.options.some((o) => o.id === id))!, text: '' }] })} className={styles.generateMoreButton}><Plus className={styles.inboxIcon} /> Add option</button>
          )}
          <div>
            <label className="label">Explanation</label>
            <textarea className={styles.defineTextarea2} value={q.explanation} onChange={(e) => onChange({ explanation: e.target.value })} />
          </div>
        </div>
      ) : (
        <>
          <div>
            <span className="label">Test cases</span>
            <div className={styles.optionsTickTheBox}>
              {q.testCases.map((t, i) => (
                <div key={i} className={styles.sampleBox}>
                  <textarea className={styles.inputTextarea} placeholder="Input" value={t.input} onChange={(e) => onChange({ testCases: q.testCases.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)) })} />
                  <textarea className={styles.inputTextarea} placeholder="Expected output" value={t.expectedOutput} onChange={(e) => onChange({ testCases: q.testCases.map((x, j) => (j === i ? { ...x, expectedOutput: e.target.value } : x)) })} />
                  <label className={styles.sampleLabel}>
                    <input type="checkbox" checked={t.isSample} onChange={(e) => onChange({ testCases: q.testCases.map((x, j) => (j === i ? { ...x, isSample: e.target.checked } : x)) })} /> Sample
                  </label>
                  <button type="button" onClick={() => onChange({ testCases: q.testCases.filter((_, j) => j !== i) })} className={styles.removeTestButton} aria-label={`Remove test ${i + 1}`}><Trash2 className={styles.inboxIcon} /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onChange({ testCases: [...q.testCases, { input: '', expectedOutput: '', isSample: false }] })} className={styles.addTestCaseButton}><Plus className={styles.inboxIcon} /> Add test case</button>
          </div>
          <div>
            <label className="label">Reference solution (Python) <span className={styles.optionalLabel}>{MSG.usedVerifyExpectedOutputs}</span></label>
            <textarea className={styles.defineTextarea3} value={q.referenceSolution} onChange={(e) => onChange({ referenceSolution: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}
