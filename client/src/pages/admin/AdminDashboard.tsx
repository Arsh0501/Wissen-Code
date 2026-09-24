import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getQuestions, deleteQuestion } from '../../services/api';
import type { Question } from '../../types';
import {
  Plus, Edit, Trash2, Code2, LogOut, FileText,
  ClipboardList, Search, ChevronDown, Upload
} from 'lucide-react';
import { importQuestionFromMd } from '../../services/api';

export default function AdminDashboard() {
  const { candidateName, logout } = useAuth();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  async function loadQuestions() {
    try {
      setLoading(true);
      const data = await getQuestions();
      setQuestions(data);
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this question? This cannot be undone.')) return;
    try {
      await deleteQuestion(id);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch (err) {
      console.error('Failed to delete question:', err);
    }
  }

  const filteredQuestions = questions.filter(
    (q) =>
      q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.difficulty.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const parseTags = (tags: string): string[] => {
    try {
      return JSON.parse(tags);
    } catch {
      return [];
    }
  };

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
        alert('Import warnings:\\n' + data.warnings.join('\\n'));
      }
      navigate('/admin/questions/new', { state: { prefill: data } });
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to import MD file';
      alert('Import failed: ' + errorMsg);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">WissenCode</h1>
              <p className="text-xs text-surface-500">Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/admin/assessments" className="btn-outline text-sm">
              <ClipboardList className="w-4 h-4" />
              Assessments
            </Link>
            <span className="text-sm text-surface-400">Hi, {candidateName}</span>
            <button onClick={() => { logout(); navigate('/'); }} className="btn-ghost text-sm">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Top Actions */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Question Bank</h2>
            <p className="text-surface-400 text-sm mt-1">{questions.length} questions created</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowNewDropdown(!showNewDropdown)}
              disabled={importing}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" />
              {importing ? 'Importing...' : 'New Question'}
              <ChevronDown className="w-4 h-4 ml-1" />
            </button>

            {showNewDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowNewDropdown(false)} 
                />
                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-surface-800 ring-1 ring-black ring-opacity-5 z-50 overflow-hidden">
                  <div className="py-1">
                    <Link
                      to="/admin/questions/new"
                      className="block px-4 py-2 text-sm text-surface-200 hover:bg-surface-700"
                    >
                      Manual
                    </Link>
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-surface-200 hover:bg-surface-700 opacity-50 cursor-not-allowed"
                      title="URL import exists in another branch"
                    >
                      Import from link
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full text-left px-4 py-2 text-sm text-surface-200 hover:bg-surface-700 flex items-center justify-between"
                    >
                      <span>Import from MD file</span>
                      <Upload className="w-3 h-3 text-surface-400" />
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".md,text/markdown"
                      onChange={handleFileUpload}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            className="input pl-10"
            placeholder="Search questions by title or difficulty..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Questions Table */}
        {loading ? (
          <div className="text-center py-20 text-surface-500">Loading...</div>
        ) : filteredQuestions.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-16 h-16 text-surface-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-surface-400 mb-2">No questions yet</h3>
            <p className="text-surface-500 text-sm mb-6">Create your first question to get started.</p>
            <Link to="/admin/questions/new" className="btn-primary">
              <Plus className="w-4 h-4" /> Create Question
            </Link>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-800">
                  <th className="text-left text-xs font-medium text-surface-500 uppercase tracking-wider px-6 py-3">Title</th>
                  <th className="text-left text-xs font-medium text-surface-500 uppercase tracking-wider px-6 py-3">Difficulty</th>
                  <th className="text-left text-xs font-medium text-surface-500 uppercase tracking-wider px-6 py-3">Tags</th>
                  <th className="text-left text-xs font-medium text-surface-500 uppercase tracking-wider px-6 py-3">Test Cases</th>
                  <th className="text-left text-xs font-medium text-surface-500 uppercase tracking-wider px-6 py-3">Starters</th>
                  <th className="text-right text-xs font-medium text-surface-500 uppercase tracking-wider px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/50">
                {filteredQuestions.map((q) => (
                  <tr key={q.id} className="hover:bg-surface-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-medium text-surface-100">{q.title}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge-${q.difficulty}`}>{q.difficulty}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {parseTags(q.tags).map((tag, i) => (
                          <span key={i} className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-surface-400 text-sm">
                      {q._count?.testCases ?? 0}
                    </td>
                    <td className="px-6 py-4 text-surface-400 text-sm">
                      {q._count?.starterCodes ?? 0} lang
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/questions/${q.id}/edit`}
                          className="btn-ghost p-2"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(q.id)}
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
        )}
      </main>
    </div>
  );
}
