import BulkTestCaseImport from '../../components/questions/BulkTestCaseImport';
import { useTheme } from '../../context/ThemeContext';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import Editor from '../../components/editor/CodeEditor';
import {
  getQuestion,
  createQuestion,
  updateQuestion,
  addTestCases,
  deleteTestCase,
  saveStarterCode,
  getExportMdUrl,
} from '../../services/api';
import type { Question, TestCase, StarterCode } from '../../types';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Code2,
  FlaskConical,
  Eye,
  EyeOff,
  Download,
} from 'lucide-react';

const LANGUAGES = [
  {
    id: 82,
    name: 'SQL',
    monacoLang: 'sql',
    defaultCode: '-- Write your SQL query here\n',
  },
  {
    id: 71,
    name: 'Python',
    monacoLang: 'python',
    defaultCode: '# Write your solution here\n\ndef solve():\n    pass\n\nsolve()',
  },
  {
    id: 62,
    name: 'Java',
    monacoLang: 'java',
    defaultCode:
      'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your solution here\n    }\n}',
  },
  {
    id: 54,
    name: 'C++',
    monacoLang: 'cpp',
    defaultCode:
      '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}',
  },
  {
    id: 63,
    name: 'JavaScript',
    monacoLang: 'javascript',
    defaultCode:
      '// Write your solution here\nconst readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin });\n\nrl.on("line", (line) => {\n    console.log(line);\n});',
  },
];

export default function QuestionForm() {
  const { theme } = useTheme();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEdit = Boolean(id);

  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionType, setQuestionType] = useState<NonNullable<Question['questionType']>>('coding');
  const [settings, setSettings] = useState<NonNullable<Question['settings']>>({
    options: [
      { id: 'a', text: '' },
      { id: 'b', text: '' },
    ],
    correctOptionIds: [],
    multiple: false,
  });
  const [projectFiles, setProjectFiles] = useState(
    '[{"path":"src/solution.ts","content":"// Implement your solution\\n"}]',
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const focusValidation = useRef(false);
  const field = (key: string) => ({
    'aria-invalid': !!fieldErrors[key],
    'aria-describedby': fieldErrors[key] ? 'question-validation-errors' : undefined,
    'data-validation-key': key,
    style: fieldErrors[key]
      ? { borderColor: '#dc2626', boxShadow: '0 0 0 1px #dc2626' }
      : undefined,
  });
  const [formError, setFormError] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [timeLimit, setTimeLimit] = useState(2);
  const [memoryLimit, setMemoryLimit] = useState(256000);
  const [activeTab, setActiveTab] = useState<'details' | 'testcases' | 'starter'>('details');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!focusValidation.current) return;
    focusValidation.current = false;
    const target = document.querySelector<HTMLElement>(
      '[data-question-form] [aria-invalid="true"]',
    );
    target?.focus();
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [fieldErrors, activeTab]);

  // Test cases state
  const [testCases, setTestCases] = useState<(TestCase & { isNew?: boolean })[]>([]);
  const [newTC, setNewTC] = useState({
    input: '',
    expectedOutput: '',
    isSample: false,
  });

  // Starter codes state
  const [starterCodes, setStarterCodes] = useState<Record<number, string>>({});
  const [activeStarterLang, setActiveStarterLang] = useState(71);

  useEffect(() => {
    setActiveStarterLang(questionType === 'sql' ? 82 : 71);
  }, [questionType]);

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
        newTestCases.push({
          id: Date.now() + i,
          questionId: 0,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isSample: true,
          isNew: true,
        });
      });
    }
    if (prefill.hidden_testcases) {
      prefill.hidden_testcases.forEach((tc: any, i: number) => {
        newTestCases.push({
          id: Date.now() + 1000 + i,
          questionId: 0,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isSample: false,
          isNew: true,
        });
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
      setQuestionType(q.questionType || 'coding');
      if (q.settings) {
        setSettings(q.settings);
        if (q.settings.files) setProjectFiles(JSON.stringify(q.settings.files, null, 2));
      }
      setTitle(q.title);
      setStatement(q.statement);
      setDifficulty(q.difficulty as 'easy' | 'medium' | 'hard');
      setTagsInput(JSON.parse(q.tags || '[]').join(', '));
      setTimeLimit(q.timeLimit);
      setMemoryLimit(q.memoryLimit);
      setTestCases(q.testCases || []);

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
    if (saving) return;
    const errors: Record<string, string> = {};
    if (!title.trim() || title.trim().length > 200)
      errors.title = 'Enter a title of 1?200 characters.';
    if (!statement.trim() || statement.trim().length > 100000)
      errors.statement = 'Enter a question of 1?100,000 characters.';
    if (questionType === 'mcq') {
      const options = settings.options ?? [];
      const answers = settings.correctOptionIds ?? [];
      if (
        options.length < 2 ||
        options.length > 12 ||
        options.some((option) => !option.text.trim() || option.text.trim().length > 2000) ||
        !answers.length ||
        (!settings.multiple && answers.length !== 1) ||
        new Set(answers).size !== answers.length ||
        answers.some((id) => !options.some((option) => option.id === id))
      )
        errors.choices = 'Add at least two non-empty options and select the correct answer.';
    } else {
      if (!['easy', 'medium', 'hard'].includes(difficulty))
        errors.difficulty = 'Choose a valid difficulty.';
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (tags.length > 40 || tags.some((tag) => tag.length > 100))
        errors.tags = 'Use up to 40 tags, each at most 100 characters.';
      if (!Number.isFinite(timeLimit) || timeLimit < 0.1 || timeLimit > 20)
        errors.timeLimit = 'CPU time must be between 0.1 and 20 seconds.';
      if (!Number.isInteger(memoryLimit) || memoryLimit < 16000 || memoryLimit > 512000)
        errors.memoryLimit = 'Memory must be a whole number between 16,000 and 512,000 KB.';
      if (
        testCases.length > 100 ||
        testCases.some((test) => test.input.length > 100000 || test.expectedOutput.length > 100000)
      )
        errors.testcases =
          'Use at most 100 test cases; each input/output must be at most 100,000 characters.';
      if (newTC.input || newTC.expectedOutput)
        errors.testcases =
          'A test case has not been added. Click Add or clear its fields before saving.';
      if (Object.values(starterCodes).some((code) => code.length > 100000))
        errors.starter = 'Starter code must be at most 100,000 characters per language.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormError(errors.choices ?? 'Please correct the highlighted fields before saving.');
      setActiveTab(
        errors.title ||
          errors.statement ||
          errors.choices ||
          errors.difficulty ||
          errors.tags ||
          errors.timeLimit ||
          errors.memoryLimit
          ? 'details'
          : errors.testcases
            ? 'testcases'
            : 'starter',
      );
      focusValidation.current = true;
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const questionSettings =
        questionType === 'mcq'
          ? {
              options: settings.options?.map((option) => ({ ...option, text: option.text.trim() })),
              correctOptionIds: settings.correctOptionIds,
              multiple: !!settings.multiple,
              explanation: settings.explanation,
            }
          : questionType === 'project'
            ? { rubric: settings.rubric, files: JSON.parse(projectFiles) }
            : questionType === 'written'
              ? { rubric: settings.rubric }
              : questionType === 'sql'
                ? { sqlSchema: settings.sqlSchema }
                : {};
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const starterCodesArr = Object.entries(questionType === 'mcq' ? {} : starterCodes)
        .filter(
          ([id, code]) =>
            code.trim() && (questionType === 'sql' ? Number(id) === 82 : Number(id) !== 82),
        )
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
          title: title.trim(),
          statement: statement.trim(),
          questionType,
          settings: questionSettings,
          ...(questionType === 'mcq' ? {} : { difficulty, tags, timeLimit, memoryLimit }),
        });

        // Save starter codes individually
        for (const sc of starterCodesArr) {
          await saveStarterCode(parseInt(id), sc);
        }

        // Add new test cases
        const newTCs = questionType === 'mcq' ? [] : testCases.filter((tc) => tc.isNew);
        if (newTCs.length > 0) {
          await addTestCases(
            parseInt(id),
            newTCs.map((tc) => ({
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isSample: tc.isSample,
            })),
          );
        }
      } else {
        const newTCs = (questionType === 'mcq' ? [] : testCases).map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isSample: tc.isSample,
        }));

        await createQuestion({
          title,
          statement,
          questionType,
          settings: questionSettings,
          ...(questionType === 'mcq' ? {} : { difficulty, tags, timeLimit, memoryLimit }),
          starterCodes: starterCodesArr,
          testCases: newTCs,
        });
      }

      navigate('/admin/questions');
    } catch (err) {
      console.error('Failed to save question:', err);
      setFormError(
        (err as any)?.response?.data?.error ||
          (err instanceof Error ? err.message : 'Failed to save question.'),
      );
    } finally {
      setSaving(false);
    }
  }

  function addTestCase() {
    if (testCases.length >= 100) {
      setFormError('A question can contain up to 100 test cases.');
      return;
    }
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
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <header className="relative bg-surface-900 border-b border-surface-800">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/questions" className="btn-ghost p-2">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary-600" />
              <h1 className="text-lg font-bold text-white">
                {isEdit ? 'Edit Question' : 'New Question'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isEdit && id && (
              <button
                type="button"
                onClick={() => {
                  const token = localStorage.getItem('wissen-token');
                  fetch(getExportMdUrl(parseInt(id)), {
                    headers: {
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                  })
                    .then((res) => res.blob())
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `question-${id}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    })
                    .catch((err) => {
                      console.error(err);
                      setFormError('Failed to export markdown. Please try again.');
                    });
                }}
                className="btn-outline"
              >
                <Download className="w-4 h-4" />
                Export as MD
              </button>
            )}
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </div>
      </header>

      <main data-question-form className="max-w-5xl mx-auto px-6 py-8">
        {formError && (
          <div
            role="alert"
            id="question-validation-errors"
            className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600"
          >
            <p className="font-semibold">{formError}</p>
            {!!Object.keys(fieldErrors).length && (
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {Object.entries(fieldErrors).map(([key, message]) => (
                  <li key={key}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div
          className="mb-6 inline-flex gap-1 rounded-xl border border-surface-700 bg-surface-900 p-1"
          role="group"
          aria-label="Question type"
        >
          {(['coding', 'mcq'] as const).map((type) => (
            <button
              type="button"
              key={type}
              aria-pressed={questionType === type}
              className={
                'rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ' +
                (questionType === type
                  ? 'bg-primary-600 text-on-accent shadow-sm'
                  : 'text-surface-400 hover:bg-primary-500/10')
              }
              onClick={() => {
                setQuestionType(type);
                setActiveTab('details');
                if (type === 'mcq')
                  setSettings((previous) =>
                    previous.options?.length
                      ? previous
                      : {
                          options: [
                            { id: 'a', text: '' },
                            { id: 'b', text: '' },
                          ],
                          correctOptionIds: [],
                          multiple: false,
                        },
                  );
              }}
            >
              {type === 'mcq' ? 'MCQ' : 'Coding'}
            </button>
          ))}
        </div>
        {/* Tabs */}
        {questionType !== 'mcq' && (
          <div className="flex flex-wrap gap-1 mb-6 bg-surface-900 rounded-xl p-1 w-fit">
            {(['details', 'testcases', 'starter'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeTab === tab
                    ? 'bg-primary-600 text-on-accent shadow-lg'
                    : 'text-surface-400 hover:text-on-accent hover:bg-surface-800'
                }`}
              >
                {tab === 'details' && 'Question Details'}
                {tab === 'testcases' && `Test Cases (${testCases.length})`}
                {tab === 'starter' && 'Starter Code'}
              </button>
            ))}
          </div>
        )}

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="space-y-6 animate-fade-in">
            <div className="md:col-span-2">
              <label className="label" htmlFor="question-title">
                Title
              </label>
              <input
                id="question-title"
                {...field('title')}
                className="input"
                placeholder={
                  questionType === 'mcq'
                    ? 'Enter a short title'
                    : 'e.g. Two Sum, Reverse Linked List'
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="question-statement">
                {questionType === 'mcq' ? 'Question' : 'Question (Markdown supported)'}
              </label>
              <textarea
                id="question-statement"
                {...field('statement')}
                className="input min-h-[220px] text-sm leading-relaxed"
                placeholder={
                  questionType === 'mcq'
                    ? 'Type a question...'
                    : `Write the problem statement here. Markdown is supported.\n\n## Example:\nGiven an array of integers, find two numbers that add up to a specific target.\n\n**Input:** nums = [2, 7, 11, 15], target = 9\n**Output:** [0, 1]`
                }
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
              />
            </div>

            {questionType !== 'mcq' && (
              <section className="card space-y-4">
                <h2 className="font-semibold">Coding settings</h2>
                <div className="grid md:grid-cols-2 gap-5">
                  {' '}
                  <div>
                    <label className="label">Difficulty</label>
                    <select
                      className="input"
                      {...field('difficulty')}
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
                      {...field('tags')}
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">CPU Time Limit (seconds)</label>
                    <input
                      type="number"
                      className="input"
                      {...field('timeLimit')}
                      value={Number.isFinite(timeLimit) ? timeLimit : ''}
                      onChange={(e) => setTimeLimit(parseFloat(e.target.value))}
                      step={0.5}
                      min={0.1}
                      max={20}
                    />
                  </div>
                  <div>
                    <label className="label">Memory Limit (KB)</label>
                    <input
                      type="number"
                      className="input"
                      {...field('memoryLimit')}
                      value={Number.isFinite(memoryLimit) ? memoryLimit : ''}
                      onChange={(e) => setMemoryLimit(parseInt(e.target.value))}
                      step={1000}
                      min={16000}
                      max={512000}
                    />
                  </div>
                </div>
              </section>
            )}
            {questionType === 'mcq' && (
              <section tabIndex={-1} {...field('choices')} className="card mb-5 space-y-4">
                <h2 className="font-semibold">Choices and answer key</h2>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={!!settings.multiple}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        multiple: e.target.checked,
                        correctOptionIds: [],
                      }))
                    }
                  />
                  Allow multiple answers
                </label>
                {(settings.options ?? []).map((o, index) => (
                  <div
                    className="flex gap-3 items-center rounded-xl border border-surface-700 p-3"
                    key={o.id}
                  >
                    <input
                      aria-label={`Correct choice ${index + 1}`}
                      type={settings.multiple ? 'checkbox' : 'radio'}
                      name="correct-choice"
                      checked={settings.correctOptionIds?.includes(o.id) ?? false}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          correctOptionIds: s.multiple
                            ? e.target.checked
                              ? [...(s.correctOptionIds ?? []), o.id]
                              : s.correctOptionIds?.filter((id) => id !== o.id)
                            : [o.id],
                        }))
                      }
                    />
                    <input
                      aria-label={`Choice ${index + 1}`}
                      aria-invalid={!!fieldErrors.choices && !o.text.trim()}
                      className="input"
                      value={o.text}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          options: s.options?.map((option) =>
                            option.id === o.id ? { ...option, text: e.target.value } : option,
                          ),
                        }))
                      }
                    />
                    <button
                      className="btn-outline"
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          options: s.options?.filter((option) => option.id !== o.id),
                          correctOptionIds: s.correctOptionIds?.filter((id) => id !== o.id),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  className="btn-outline"
                  disabled={(settings.options?.length ?? 0) >= 12}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      options: [
                        ...(s.options ?? []),
                        { id: crypto.randomUUID().slice(0, 8), text: '' },
                      ],
                    }))
                  }
                >
                  Add choice
                </button>
              </section>
            )}
          </div>
        )}

        {/* Test Cases Tab */}
        {activeTab === 'testcases' && (
          <div
            tabIndex={-1}
            {...field('testcases')}
            className="space-y-6 animate-fade-in rounded-xl"
          >
            <BulkTestCaseImport
              remaining={100 - testCases.length}
              onImport={(cases) =>
                setTestCases((previous) => [
                  ...previous,
                  ...cases.map((test) => ({
                    ...test,
                    id: Date.now() + Math.random(),
                    questionId: Number(id || 0),
                    isNew: true,
                  })),
                ])
              }
            />
            {/* Existing test cases */}
            {testCases.length > 0 && (
              <div className="space-y-3">
                {testCases.map((tc) => (
                  <div key={tc.id} className="card flex items-start gap-4 p-4">
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-surface-500 mb-1 block">Input</label>
                        <pre className="sample-box text-xs">{tc.input || '(empty)'}</pre>
                      </div>
                      <div>
                        <label className="text-xs text-surface-500 mb-1 block">
                          Expected Output
                        </label>
                        <pre className="sample-box text-xs">{tc.expectedOutput}</pre>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <span
                        className={`badge text-xs ${
                          tc.isSample
                            ? 'bg-primary-500/15 text-primary-600 ring-1 ring-primary-500/25'
                            : 'bg-surface-800 text-surface-500 ring-1 ring-surface-700'
                        }`}
                      >
                        {tc.isSample ? (
                          <>
                            <Eye className="w-3 h-3 mr-1" /> Sample
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3 mr-1" /> Hidden
                          </>
                        )}
                      </span>
                      <button
                        onClick={() => removeTestCase(tc)}
                        className="btn-ghost p-1.5 text-red-600 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add new test case */}
            <div className="card border-dashed border-2 border-surface-700">
              <h3 className="text-sm font-medium text-surface-300 mb-4 flex items-center gap-2">
                <FlaskConical className="w-4 h-4" />
                Add Test Case
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Input (stdin)</label>
                  <textarea
                    className="input font-mono text-sm min-h-[80px]"
                    placeholder="5&#10;1 2 3 4 5"
                    value={newTC.input}
                    onChange={(e) => setNewTC((p) => ({ ...p, input: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Expected Output</label>
                  <textarea
                    className="input font-mono text-sm min-h-[80px]"
                    placeholder="15"
                    value={newTC.expectedOutput}
                    onChange={(e) =>
                      setNewTC((p) => ({
                        ...p,
                        expectedOutput: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTC.isSample}
                    onChange={(e) => setNewTC((p) => ({ ...p, isSample: e.target.checked }))}
                    className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm text-surface-300">
                    Sample test case (visible to candidate)
                  </span>
                </label>
                <button onClick={addTestCase} className="btn-outline">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Starter Code Tab */}
        {activeTab === 'starter' && (
          <div tabIndex={-1} {...field('starter')} className="animate-fade-in rounded-xl">
            {/* Language tabs */}
            <div className="flex gap-1 mb-4 bg-surface-900 rounded-lg p-1 w-fit">
              {LANGUAGES.filter((lang) =>
                questionType === 'sql' ? lang.id === 82 : lang.id !== 82,
              ).map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setActiveStarterLang(lang.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeStarterLang === lang.id
                      ? 'bg-surface-700 text-white'
                      : 'text-surface-400 hover:text-white'
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>

            {/* Monaco Editor */}
            <div className="rounded-xl overflow-hidden border border-surface-800">
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
            <p className="text-xs text-surface-500 mt-2">
              This code will be pre-filled in the editor when a candidate starts the question.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
