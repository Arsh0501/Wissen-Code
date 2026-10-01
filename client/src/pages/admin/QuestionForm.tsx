import { useTheme } from '../../context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import {
  getQuestion, createQuestion, updateQuestion,
  addTestCases, deleteTestCase, saveStarterCode,
  getExportMdUrl
} from '../../services/api';
import type { TestCase, StarterCode } from '../../types';
import {
  ArrowLeft, Save, Plus, Trash2, Code2, FlaskConical,
  Eye, EyeOff, Download, ListChecks, CheckSquare, Square
} from 'lucide-react';
import styles from './QuestionForm.module.css';
import { LANGUAGES, MAX_OPTIONS, OPTION_IDS, QUESTION_FORM_MESSAGES as MSG } from '../../constants';

export default function QuestionForm() {
  const { theme } = useTheme();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEdit = Boolean(id);

  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [tagsInput, setTagsInput] = useState('');
  const [timeLimit, setTimeLimit] = useState(2);
  const [memoryLimit, setMemoryLimit] = useState(256000);
  const [activeTab, setActiveTab] = useState<'details' | 'testcases' | 'starter' | 'options'>('details');
  const [saving, setSaving] = useState(false);
  const [qType, setQType] = useState<'coding' | 'mcq'>('coding');
  const [topic, setTopic] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  // Multiple choice
  const [options, setOptions] = useState<{ id: string; text: string }[]>([
    { id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' },
  ]);
  const [correct, setCorrect] = useState<string[]>([]);
  const [explanation, setExplanation] = useState('');
  const isMcq = qType === 'mcq';

  // Test cases state
  const [testCases, setTestCases] = useState<(TestCase & { isNew?: boolean })[]>([]);
  const [newTC, setNewTC] = useState({ input: '', expectedOutput: '', isSample: false });

  // Starter codes state
  const [starterCodes, setStarterCodes] = useState<Record<number, string>>({});
  const [activeStarterLang, setActiveStarterLang] = useState(71);

  useEffect(() => {
    if (isEdit && id) {
      loadQuestion(parseInt(id));
    } else if (location.state?.prefill) {
      loadPrefill(location.state.prefill);
    }
  }, [id, location.state]);

  function loadPrefill(prefill: any) {
    if (prefill.title) setTitle(prefill.title);
    if (prefill.statement) setStatement(prefill.statement);
    if (prefill.difficulty) setDifficulty(prefill.difficulty);
    if (prefill.tags) setTagsInput(prefill.tags.join(', '));
    if (prefill.timeLimit) setTimeLimit(prefill.timeLimit);
    if (prefill.memoryLimit) setMemoryLimit(prefill.memoryLimit);
    
    const newTestCases: (TestCase & { isNew?: boolean })[] = [];
    if (prefill.sample_testcases) {
      prefill.sample_testcases.forEach((tc: any, i: number) => {
        newTestCases.push({ id: Date.now() + i, questionId: 0, input: tc.input, expectedOutput: tc.expectedOutput, isSample: true, isNew: true });
      });
    }
    if (prefill.hidden_testcases) {
      prefill.hidden_testcases.forEach((tc: any, i: number) => {
        newTestCases.push({ id: Date.now() + 1000 + i, questionId: 0, input: tc.input, expectedOutput: tc.expectedOutput, isSample: false, isNew: true });
      });
    }
    setTestCases(newTestCases);

    if (prefill.starter_code) {
      const codes: Record<number, string> = {};
      prefill.starter_code.forEach((sc: any) => {
        codes[sc.languageId] = sc.code;
      });
      setStarterCodes(codes);
    }
    
    // Clear location state so refresh doesn't trigger it again
    window.history.replaceState({}, document.title);
  }

  async function loadQuestion(qId: number) {
    try {
      const q = await getQuestion(qId);
      setTitle(q.title);
      setStatement(q.statement);
      setDifficulty(q.difficulty as 'easy' | 'medium' | 'hard');
      setTagsInput(JSON.parse(q.tags || '[]').join(', '));
      setTimeLimit(q.timeLimit);
      setMemoryLimit(q.memoryLimit);
      setTestCases(q.testCases || []);
      setQType(q.type === 'mcq' ? 'mcq' : 'coding');
      setTopic(q.topic || '');
      setSkillsInput(JSON.parse(q.skills || '[]').join(', '));
      if (q.type === 'mcq') {
        setOptions(JSON.parse(q.options || '[]'));
        setCorrect(JSON.parse(q.correctOptions || '[]'));
        setExplanation(q.explanation || '');
      }

      const codes: Record<number, string> = {};
      (q.starterCodes || []).forEach((sc: StarterCode) => {
        codes[sc.languageId] = sc.code;
      });
      setStarterCodes(codes);
    } catch (err) {
      console.error('Failed to load question:', err);
    }
  }

  async function handleSave() {
    if (!title.trim() || !statement.trim()) {
      alert(MSG.titleProblemStatementRequired);
      return;
    }
    const filledOptions = options.map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text);
    if (isMcq) {
      const problem =
        filledOptions.length < 2 ? MSG.addLeast2Answer
        : new Set(filledOptions.map((o) => o.text.toLowerCase())).size !== filledOptions.length ? MSG.twoOptionsHaveSame
        : !correct.some((c) => filledOptions.some((o) => o.id === c)) ? MSG.markLeastOneOption
        : null;
      if (problem) {
        setActiveTab('options');
        alert(problem);
        return;
      }
    }
    const typeFields = {
      type: qType,
      topic: topic.trim(),
      skills: skillsInput.split(',').map((s) => s.trim()).filter(Boolean),
      ...(isMcq
        ? { options: filledOptions, correctOptions: correct.filter((c) => filledOptions.some((o) => o.id === c)), explanation }
        : {}),
    };

    setSaving(true);
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);

      const starterCodesArr = Object.entries(starterCodes)
        .filter(([, code]) => code.trim())
        .map(([langId, code]) => {
          const lang = LANGUAGES.find((l) => l.id === parseInt(langId));
          return {
            languageId: parseInt(langId),
            languageName: lang?.name || 'Unknown',
            code,
          };
        });

      if (isEdit && id) {
        await updateQuestion(parseInt(id), {
          title, statement, difficulty, tags, timeLimit, memoryLimit, ...typeFields,
        });

        // Save starter codes individually
        for (const sc of starterCodesArr) {
          await saveStarterCode(parseInt(id), sc);
        }

        // Add new test cases
        const newTCs = testCases.filter((tc) => tc.isNew);
        if (newTCs.length > 0) {
          await addTestCases(
            parseInt(id),
            newTCs.map((tc) => ({
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isSample: tc.isSample,
            }))
          );
        }
      } else {
        const newTCs = testCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isSample: tc.isSample,
        }));

        await createQuestion({
          title, statement, difficulty, tags, timeLimit, memoryLimit, ...typeFields,
          starterCodes: isMcq ? [] : starterCodesArr,
          testCases: isMcq ? [] : newTCs,
        });
      }

      navigate('/admin/questions');
    } catch (err) {
      console.error('Failed to save question:', err);
      alert(MSG.failedSaveQuestionCheck);
    } finally {
      setSaving(false);
    }
  }

  function addTestCase() {
    if (!newTC.input.trim() && !newTC.expectedOutput.trim()) return;
    setTestCases((prev) => [
      ...prev,
      {
        id: Date.now(),
        questionId: parseInt(id || '0'),
        input: newTC.input,
        expectedOutput: newTC.expectedOutput,
        isSample: newTC.isSample,
        isNew: true,
      },
    ]);
    setNewTC({ input: '', expectedOutput: '', isSample: false });
  }

  async function removeTestCase(tc: TestCase & { isNew?: boolean }) {
    if (!tc.isNew && isEdit) {
      try {
        await deleteTestCase(tc.id);
      } catch (err) {
        console.error('Failed to delete test case:', err);
        return;
      }
    }
    setTestCases((prev) => prev.filter((t) => t.id !== tc.id));
  }

  return (
    <div className={styles.arrowLeftBox}>
      {/* Header */}
      <header className={styles.arrowLeftHeader}>
        <div className={styles.arrowLeftBox2}>
          <div className={styles.arrowLeftBox3}>
            <Link to="/admin/questions" className={styles.arrowLeftLink}>
              <ArrowLeft className={styles.arrowLeftIcon} />
            </Link>
            <div className={styles.codeBox}>
              <Code2 className={styles.codeIcon} />
              <h1 className={styles.headerTitle}>
                {isEdit ? 'Edit Question' : 'New Question'}
              </h1>
            </div>
          </div>
          <div className={styles.saveBox}>
            {isEdit && id && (
              <button 
                type="button"
                onClick={() => {
                  const token = localStorage.getItem('wissen-token');
                  fetch(getExportMdUrl(parseInt(id)), { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
                    .then(res => res.blob())
                    .then(blob => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `question-${id}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }).catch(err => {
                      console.error(err);
                      alert('Failed to export markdown');
                    });
                }}
                className="btn-outline"
              >
                <Download className={styles.downloadIcon} />
                Export as MD
              </button>
            )}
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              <Save className={styles.downloadIcon} />
              {saving ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </div>
      </header>

      <main className={styles.headerMain}>
        {/* Tabs */}
        <div className={styles.tabsBox}>
          {(isMcq ? (['details', 'options'] as const) : (['details', 'testcases', 'starter'] as const)).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`${styles.tabsButton} ${activeTab === tab
                  ? styles.tabsButtonSelected
                  : styles.tabsButtonDefault}`}
            >
              {tab === 'details' && 'Question Details'}
              {tab === 'testcases' && `Test Cases (${testCases.length})`}
              {tab === 'starter' && 'Starter Code'}
              {tab === 'options' && `Answer Options (${options.filter((o) => o.text.trim()).length})`}
            </button>
          ))}
        </div>

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className={styles.questionTypeBox}>
            <div>
              <label className="label">Question type</label>
              <div className={styles.detailsTabBox}>
                {([
                  { key: 'coding', label: 'Coding', hint: MSG.candidateWritesProgramGraded, icon: Code2 },
                  { key: 'mcq', label: 'Multiple choice', hint: MSG.candidatePicksAnswerGraded, icon: ListChecks },
                ] as const).map(({ key, label, hint, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={isEdit}
                    onClick={() => { setQType(key); setActiveTab('details'); }}
                    className={`${styles.labelButton} ${qType === key ? styles.labelButtonSelected : styles.labelButtonDefault}`}
                  >
                    <Icon className={`${styles.detailsTabIcon} ${qType === key ? styles.detailsTabIconSelected : styles.detailsTabIconDefault}`} />
                    <span>
                      <span className={styles.label}>{label}</span>
                      <span className={styles.hintLabel}>{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              {isEdit && <p className={styles.theTypeCanText}>{MSG.typeCantChangedAfter}</p>}
            </div>
            <div className={styles.titleBox}>
              <div className={styles.titleBox2}>
                <label className="label">Title</label>
                <input
                  className="input"
                  placeholder={MSG.twoSumReverseLinkedExample}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Difficulty</label>
                <select
                  className="input"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div>
                <label className="label">Tags (comma-separated)</label>
                <input
                  className="input"
                  placeholder="array, hash-map, sorting"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Topic</label>
                <input className="input" placeholder={MSG.arraysReactHooksExample} value={topic} onChange={(e) => setTopic(e.target.value)} />
              </div>

              <div>
                <label className="label">Skills assessed (comma-separated)</label>
                <input className="input" placeholder="JavaScript, Problem Solving" value={skillsInput} onChange={(e) => setSkillsInput(e.target.value)} />
              </div>

              {!isMcq && <>
              <div>
                <label className="label">{MSG.cpuTimeLimitSeconds}</label>
                <input
                  type="number"
                  className="input"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseFloat(e.target.value))}
                  step={0.5}
                  min={0.5}
                />
              </div>

              <div>
                <label className="label">Memory Limit (KB)</label>
                <input
                  type="number"
                  className="input"
                  value={memoryLimit}
                  onChange={(e) => setMemoryLimit(parseInt(e.target.value))}
                  step={1000}
                  min={1000}
                />
              </div>
              </>}
            </div>

            <div>
              <label className="label">{MSG.problemStatementMarkdownSupported}</label>
              <textarea
                className={styles.writeTheProblemTextarea}
                placeholder={MSG.writeProblemStatementHere}
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Answer Options Tab (multiple choice) */}
        {activeTab === 'options' && isMcq && (
          <div className={styles.tickEveryCorrectBox}>
            <p className={styles.tickEveryCorrectText}>
              {MSG.tickEveryCorrectAnswer}</p>
            <div className={styles.answerOptionsBox}>
              {options.map((o, i) => {
                const isCorrect = correct.includes(o.id);
                return (
                  <div key={o.id} className={`${styles.idBox} ${isCorrect ? styles.idBoxCorrect : styles.idBoxDefault}`}>
                    <button
                      type="button"
                      onClick={() => setCorrect((c) => (c.includes(o.id) ? c.filter((x) => x !== o.id) : [...c, o.id]))}
                      className={styles.answerOptionsButton}
                      aria-label={isCorrect ? MSG.unmarkOptionCorrect(o.id.toUpperCase()) : MSG.markOptionCorrect(o.id.toUpperCase())}
                      title={isCorrect ? 'Correct answer' : 'Mark as correct'}
                    >
                      {isCorrect ? <CheckSquare className={styles.checkSquareIcon} /> : <Square className={styles.squareIcon} />}
                    </button>
                    <span className={styles.idLabel}>{o.id}</span>
                    <input
                      className={styles.optionInput}
                      placeholder={`Option ${o.id.toUpperCase()}`}
                      value={o.text}
                      onChange={(e) => setOptions((opts) => opts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      disabled={options.length <= 2}
                      onClick={() => { setOptions((opts) => opts.filter((_, j) => j !== i)); setCorrect((c) => c.filter((x) => x !== o.id)); }}
                      className={styles.removeOptionButton}
                      aria-label={`Remove option ${o.id.toUpperCase()}`}
                    >
                      <Trash2 className={styles.downloadIcon} />
                    </button>
                  </div>
                );
              })}
            </div>
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={() => setOptions((opts) => [...opts, { id: OPTION_IDS.find((id) => !opts.some((o) => o.id === id))!, text: '' }])}
                className={styles.addOptionButton}
              >
                <Plus className={styles.downloadIcon} /> Add option
              </button>
            )}
            <div>
              <label className="label">Explanation <span className={styles.shownToAdminsLabel}>{MSG.shownAdminsReports}</span></label>
              <textarea className={styles.whyTheCorrectTextarea} placeholder={MSG.whyCorrectAnswerCorrect} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
            </div>
          </div>
        )}

        {/* Test Cases Tab */}
        {activeTab === 'testcases' && (
          <div className={styles.questionTypeBox}>
            {/* Existing test cases */}
            {testCases.length > 0 && (
              <div className={styles.existingTestBox}>
                {testCases.map((tc, idx) => (
                  <div
                    key={tc.id}
                    className={styles.trashBox}
                  >
                    <div className={styles.inputBox}>
                      <div>
                        <label className={styles.inputLabel}>Input</label>
                        <pre className={styles.existingTestPre}>{tc.input || '(empty)'}</pre>
                      </div>
                      <div>
                        <label className={styles.inputLabel}>Expected Output</label>
                        <pre className={styles.existingTestPre}>{tc.expectedOutput}</pre>
                      </div>
                    </div>
                    <div className={styles.trashBox2}>
                      <span
                        className={`${styles.existingTestLabel} ${tc.isSample
                            ? styles.existingTestLabelSample
                            : styles.existingTestLabelDefault}`}
                      >
                        {tc.isSample ? (
                          <><Eye className={styles.eyeIcon} /> Sample</>
                        ) : (
                          <><EyeOff className={styles.eyeIcon} /> Hidden</>
                        )}
                      </span>
                      <button
                        onClick={() => removeTestCase(tc)}
                        className={styles.trashButton}
                      >
                        <Trash2 className={styles.downloadIcon} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add new test case */}
            <div className={styles.flaskConicalBox}>
              <h3 className={styles.addTestCaseTitle}>
                <FlaskConical className={styles.downloadIcon} />
                Add Test Case
              </h3>
              <div className={styles.inputStdinBox}>
                <div>
                  <label className="label">Input (stdin)</label>
                  <textarea
                    className={styles.addNewTextarea}
                    placeholder="5&#10;1 2 3 4 5"
                    value={newTC.input}
                    onChange={(e) => setNewTC((p) => ({ ...p, input: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Expected Output</label>
                  <textarea
                    className={styles.addNewTextarea}
                    placeholder="15"
                    value={newTC.expectedOutput}
                    onChange={(e) => setNewTC((p) => ({ ...p, expectedOutput: e.target.value }))}
                  />
                </div>
              </div>
              <div className={styles.plusBox}>
                <label className={styles.sampleTestCaseLabel}>
                  <input
                    type="checkbox"
                    checked={newTC.isSample}
                    onChange={(e) => setNewTC((p) => ({ ...p, isSample: e.target.checked }))}
                    className={styles.addNewInput}
                  />
                  <span className={styles.sampleTestCaseLabel2}>
                    {MSG.sampleTestCaseVisible}</span>
                </label>
                <button onClick={addTestCase} className="btn-outline">
                  <Plus className={styles.downloadIcon} /> Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Starter Code Tab */}
        {activeTab === 'starter' && (
          <div className="animate-fade-in">
            {/* Language tabs */}
            <div className={styles.languageTabsBox}>
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setActiveStarterLang(lang.id)}
                  className={`${styles.nameButton} ${activeStarterLang === lang.id
                      ? styles.nameButtonSelected
                      : styles.nameButtonDefault}`}
                >
                  {lang.name}
                </button>
              ))}
            </div>

            {/* Monaco Editor */}
            <div className={styles.monacoEditorBox}>
              <Editor
                height="400px"
                language={LANGUAGES.find((l) => l.id === activeStarterLang)?.monacoLang || 'python'}
                value={
                  starterCodes[activeStarterLang] ??
                  LANGUAGES.find((l) => l.id === activeStarterLang)?.defaultCode ??
                  ''
                }
                onChange={(value) => {
                  setStarterCodes((prev) => ({
                    ...prev,
                    [activeStarterLang]: value || '',
                  }));
                }}
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  padding: { top: 16 },
                }}
              />
            </div>
            <p className={styles.thisCodeWillText}>
              {MSG.codePreFilledEditor}</p>
          </div>
        )}
      </main>
    </div>
  );
}
