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
  Eye, EyeOff, Download
} from 'lucide-react';

const LANGUAGES = [
  { id: 71, name: 'Python', monacoLang: 'python', defaultCode: '# Write your solution here\n\ndef solve():\n    pass\n\nsolve()' },
  { id: 62, name: 'Java', monacoLang: 'java', defaultCode: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your solution here\n    }\n}' },
  { id: 54, name: 'C++', monacoLang: 'cpp', defaultCode: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}' },
  { id: 63, name: 'JavaScript', monacoLang: 'javascript', defaultCode: '// Write your solution here\nconst readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin });\n\nrl.on("line", (line) => {\n    console.log(line);\n});' },
];

export default function QuestionForm() {
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
  const [activeTab, setActiveTab] = useState<'details' | 'testcases' | 'starter'>('details');
  const [saving, setSaving] = useState(false);

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
      alert('Title and problem statement are required.');
      return;
    }

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
          title, statement, difficulty, tags, timeLimit, memoryLimit,
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
          title, statement, difficulty, tags, timeLimit, memoryLimit,
          starterCodes: starterCodesArr,
          testCases: newTCs,
        });
      }

      navigate('/admin/questions');
    } catch (err) {
      console.error('Failed to save question:', err);
      alert('Failed to save question. Check the console for details.');
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
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/questions" className="btn-ghost p-2">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary-400" />
              <h1 className="text-lg font-bold text-white">
                {isEdit ? 'Edit Question' : 'New Question'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isEdit && id && (
              <a 
                href={getExportMdUrl(parseInt(id))}
                className="btn-outline"
                download
              >
                <Download className="w-4 h-4" />
                Export as MD
              </a>
            )}
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-surface-900 rounded-xl p-1 w-fit">
          {(['details', 'testcases', 'starter'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-primary-600 text-white shadow-lg'
                  : 'text-surface-400 hover:text-white hover:bg-surface-800'
              }`}
            >
              {tab === 'details' && 'Question Details'}
              {tab === 'testcases' && `Test Cases (${testCases.length})`}
              {tab === 'starter' && 'Starter Code'}
            </button>
          ))}
        </div>

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="label">Title</label>
                <input
                  className="input"
                  placeholder="e.g. Two Sum, Reverse Linked List"
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
                <label className="label">CPU Time Limit (seconds)</label>
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
            </div>

            <div>
              <label className="label">Problem Statement (Markdown supported)</label>
              <textarea
                className="input min-h-[300px] font-mono text-sm"
                placeholder={`Write the problem statement here. Markdown is supported.\n\n## Example:\nGiven an array of integers, find two numbers that add up to a specific target.\n\n**Input:** nums = [2, 7, 11, 15], target = 9\n**Output:** [0, 1]`}
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Test Cases Tab */}
        {activeTab === 'testcases' && (
          <div className="space-y-6 animate-fade-in">
            {/* Existing test cases */}
            {testCases.length > 0 && (
              <div className="space-y-3">
                {testCases.map((tc, idx) => (
                  <div
                    key={tc.id}
                    className="card flex items-start gap-4 p-4"
                  >
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-surface-500 mb-1 block">Input</label>
                        <pre className="sample-box text-xs">{tc.input || '(empty)'}</pre>
                      </div>
                      <div>
                        <label className="text-xs text-surface-500 mb-1 block">Expected Output</label>
                        <pre className="sample-box text-xs">{tc.expectedOutput}</pre>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <span
                        className={`badge text-xs ${
                          tc.isSample
                            ? 'bg-primary-500/15 text-primary-400 ring-1 ring-primary-500/25'
                            : 'bg-surface-800 text-surface-500 ring-1 ring-surface-700'
                        }`}
                      >
                        {tc.isSample ? (
                          <><Eye className="w-3 h-3 mr-1" /> Sample</>
                        ) : (
                          <><EyeOff className="w-3 h-3 mr-1" /> Hidden</>
                        )}
                      </span>
                      <button
                        onClick={() => removeTestCase(tc)}
                        className="btn-ghost p-1.5 text-red-400 hover:bg-red-500/10"
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
                    onChange={(e) => setNewTC((p) => ({ ...p, expectedOutput: e.target.value }))}
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
          <div className="animate-fade-in">
            {/* Language tabs */}
            <div className="flex gap-1 mb-4 bg-surface-900 rounded-lg p-1 w-fit">
              {LANGUAGES.map((lang) => (
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
                theme="vs-dark"
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
