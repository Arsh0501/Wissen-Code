import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import AdminLayout from '../../components/AdminLayout';
import { Spinner, EmptyState, parseJsonArray } from '../../components/ui';
import { getQuestions, getQuestion, deleteQuestion, importQuestionFromMd, getExportMdUrl, apiError } from '../../services/api';
import type { Question } from '../../types';
import {
  Plus, Edit, Trash2, FileText, Search, ChevronDown, Upload, Eye, X, Download, EyeOff,
} from 'lucide-react';

export default function QuestionBank() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [tag, setTag] = useState('');
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<Question | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  async function loadQuestions() {
    try {
      setLoading(true);
      setQuestions(await getQuestions());
    } catch (err) {
      setError(apiError(err, 'Failed to load questions'));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(q: Question) {
    const used = q._count?.assessments ?? 0;
    const msg = used
      ? `"${q.title}" is used in ${used} assessment${used === 1 ? '' : 's'}. Deleting it removes it from those assessments and deletes candidates' answers to it. Continue?`
      : `Delete "${q.title}"? This cannot be undone.`;
    if (!confirm(msg)) return;
    try {
      await deleteQuestion(q.id);
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
      if (preview?.id === q.id) setPreview(null);
    } catch (err) {
      setError(apiError(err, 'Failed to delete question'));
    }
  }

  async function openPreview(id: number) {
    try {
      setPreview(await getQuestion(id));
    } catch (err) {
      setError(apiError(err, 'Failed to load question'));
    }
  }

  const allTags = useMemo(() => Array.from(new Set(questions.flatMap((q) => parseJsonArray(q.tags)))).sort(), [questions]);
  const counts = useMemo(
    () => ({
      easy: questions.filter((q) => q.difficulty === 'easy').length,
      medium: questions.filter((q) => q.difficulty === 'medium').length,
      hard: questions.filter((q) => q.difficulty === 'hard').length,
    }),
    [questions]
  );

  const filteredQuestions = questions.filter(
    (q) =>
      q.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (!difficulty || q.difficulty === difficulty) &&
      (!tag || parseJsonArray(q.tags).includes(tag))
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.md')) {
      alert('Please select a Markdown (.md) file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('File is too large. Maximum size is 2MB.');
      return;
    }

    setImporting(true);
    setShowNewDropdown(false);

    try {
      const text = await file.text();
      const data = await importQuestionFromMd(text);
      if (data.warnings && data.warnings.length > 0) {
        alert('Import warnings:\n' + data.warnings.join('\n'));
      }
      navigate('/admin/questions/new', { state: { prefill: data } });
    } catch (err: any) {
      alert('Import failed: ' + apiError(err, 'Failed to import MD file'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <AdminLayout
      title="Question Bank"
      subtitle={`${questions.length} questions · ${counts.easy} easy · ${counts.medium} medium · ${counts.hard} hard`}
      actions={
        <div className="relative">
          <button onClick={() => setShowNewDropdown(!showNewDropdown)} disabled={importing} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            {importing ? 'Importing...' : 'New Question'}
            <ChevronDown className="w-4 h-4 ml-1" />
          </button>
          {showNewDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNewDropdown(false)} />
              <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-surface-800 ring-1 ring-black ring-opacity-5 z-50 overflow-hidden">
                <div className="py-1">
                  <Link to="/admin/questions/new" className="block px-4 py-2 text-sm text-surface-200 hover:bg-surface-700">
                    Manual
                  </Link>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full text-left px-4 py-2 text-sm text-surface-200 hover:bg-surface-700 flex items-center justify-between"
                  >
                    <span>Import from MD file</span>
                    <Upload className="w-3 h-3 text-surface-400" />
                  </button>
                </div>
              </div>
            </>
          )}
          <input type="file" ref={fileInputRef} className="hidden" accept=".md,text/markdown" onChange={handleFileUpload} />
        </div>
      }
    >
      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            className="input pl-10"
            placeholder="Search questions by title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select className="input w-auto" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Topic">
          <option value="">All topics</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {(searchTerm || difficulty || tag) && (
          <button onClick={() => { setSearchTerm(''); setDifficulty(''); setTag(''); }} className="btn-ghost text-sm">
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading questions..." />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No questions yet"
          body="Create your first question to get started."
          action={<Link to="/admin/questions/new" className="btn-primary"><Plus className="w-4 h-4" /> Create Question</Link>}
        />
      ) : filteredQuestions.length === 0 ? (
        <p className="text-center text-surface-500 py-16">No questions match these filters.</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-800 text-xs font-medium text-surface-500 uppercase tracking-wider whitespace-nowrap">
                  <th className="text-left px-6 py-3">Title</th>
                  <th className="text-left px-4 py-3">Difficulty</th>
                  <th className="text-left px-4 py-3">Topics</th>
                  <th className="text-right px-4 py-3">Test cases</th>
                  <th className="text-right px-4 py-3">Languages</th>
                  <th className="text-right px-4 py-3">Used in</th>
                  <th className="text-right px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/50">
                {filteredQuestions.map((q) => (
                  <tr key={q.id} className="hover:bg-surface-800/30 transition-colors">
                    <td className="px-6 py-3">
                      <button onClick={() => openPreview(q.id)} className="font-medium text-surface-100 hover:text-primary-300 text-left">
                        {q.title}
                      </button>
                    </td>
                    <td className="px-4 py-3"><span className={`badge-${q.difficulty}`}>{q.difficulty}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {parseJsonArray(q.tags).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTag(t)}
                            className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700 hover:text-white"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-surface-400 text-sm tabular-nums">{q._count?.testCases ?? 0}</td>
                    <td className="px-4 py-3 text-right text-surface-400 text-sm tabular-nums">{q._count?.starterCodes ?? 0}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums whitespace-nowrap">
                      {q._count?.assessments ? (
                        <span className="text-surface-300">{q._count.assessments} assessment{q._count.assessments === 1 ? '' : 's'}</span>
                      ) : (
                        <span className="text-surface-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openPreview(q.id)} className="btn-ghost p-2" title="Preview">
                          <Eye className="w-4 h-4" />
                        </button>
                        <Link to={`/admin/questions/${q.id}/edit`} className="btn-ghost p-2" title="Edit">
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(q)}
                          className="btn-ghost p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview drawer */}
      {preview && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPreview(null)} />
          <aside className="relative w-full max-w-2xl h-full bg-surface-900 border-l border-surface-800 overflow-y-auto animate-slide-in">
            <div className="sticky top-0 bg-surface-900/95 backdrop-blur border-b border-surface-800 px-6 py-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">{preview.title}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-surface-400">
                  <span className={`badge-${preview.difficulty}`}>{preview.difficulty}</span>
                  {parseJsonArray(preview.tags).map((t) => <span key={t}>#{t}</span>)}
                  <span>· {preview.timeLimit}s · {Math.round(preview.memoryLimit / 1024)} MB</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => {
                  const token = localStorage.getItem('wissen-token');
                  fetch(getExportMdUrl(preview.id), { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
                    .then(res => res.blob())
                    .then(blob => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `question-${preview.id}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }).catch(err => {
                      console.error(err);
                      alert('Failed to export markdown');
                    });
                }} className="btn-ghost p-2" title="Export as Markdown"><Download className="w-4 h-4" /></button>
                <Link to={`/admin/questions/${preview.id}/edit`} className="btn-ghost p-2" title="Edit"><Edit className="w-4 h-4" /></Link>
                <button onClick={() => setPreview(null)} className="btn-ghost p-2" aria-label="Close"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="prose prose-invert prose-sm max-w-none text-surface-200 [&_code]:text-primary-300 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-3">
                <ReactMarkdown>{preview.statement}</ReactMarkdown>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Test cases ({preview.testCases?.length ?? 0})</h3>
                <div className="space-y-2">
                  {preview.testCases?.map((tc, i) => (
                    <div key={tc.id} className="rounded-lg border border-surface-800 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-800/50 text-xs">
                        <span className="text-surface-300">Test {i + 1}</span>
                        {tc.isSample ? (
                          <span className="text-emerald-400 flex items-center gap-1"><Eye className="w-3 h-3" /> Sample</span>
                        ) : (
                          <span className="text-surface-500 flex items-center gap-1"><EyeOff className="w-3 h-3" /> Hidden</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-surface-800 text-xs font-mono">
                        <pre className="p-2 text-surface-300 whitespace-pre-wrap">{tc.input}</pre>
                        <pre className="p-2 text-emerald-300 whitespace-pre-wrap">{tc.expectedOutput}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Starter code</h3>
                <p className="text-sm text-surface-400">
                  {preview.starterCodes?.length ? preview.starterCodes.map((s) => s.languageName).join(', ') : 'None'}
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </AdminLayout>
  );
}
