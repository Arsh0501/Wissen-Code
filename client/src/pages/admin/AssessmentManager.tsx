import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAssessments, getQuestions, createAssessment,
  deleteAssessment, updateAssessment
} from '../../services/api';
import type { Assessment, Question } from '../../types';
import {
  ArrowLeft, Plus, Trash2, Code2, Clock, Save, X, CheckSquare, Users
} from 'lucide-react';

export default function AssessmentManager() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [a, q] = await Promise.all([getAssessments(), getQuestions()]);
      setAssessments(a);
      setQuestions(q);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditId(null);
    setName('');
    setTimeLimitMinutes(60);
    setSelectedQuestionIds([]);
    setShowForm(true);
  }

  function openEditForm(a: Assessment) {
    setEditId(a.id);
    setName(a.name);
    setTimeLimitMinutes(a.timeLimitMinutes);
    setSelectedQuestionIds(a.questions.map((aq) => aq.questionId));
    setShowForm(true);
  }

  async function handleSave() {
    if (!name.trim() || selectedQuestionIds.length === 0) {
      alert('Name and at least one question are required.');
      return;
    }

    try {
      if (editId) {
        await updateAssessment(editId, { name, timeLimitMinutes, questionIds: selectedQuestionIds });
      } else {
        await createAssessment({ name, timeLimitMinutes, questionIds: selectedQuestionIds });
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      console.error('Failed to save assessment:', err);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this assessment?')) return;
    try {
      await deleteAssessment(id);
      setAssessments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete assessment:', err);
    }
  }

  function toggleQuestion(qId: number) {
    setSelectedQuestionIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  }

  return (
    <div className="min-h-screen bg-surface-950">
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="btn-ghost p-2">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary-400" />
              <h1 className="text-lg font-bold text-white">Assessment Manager</h1>
            </div>
          </div>
          <button onClick={openCreateForm} className="btn-primary">
            <Plus className="w-4 h-4" /> New Assessment
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="card w-full max-w-lg max-h-[80vh] overflow-y-auto animate-fade-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">
                  {editId ? 'Edit Assessment' : 'Create Assessment'}
                </h2>
                <button onClick={() => setShowForm(false)} className="btn-ghost p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">Assessment Name</label>
                  <input
                    className="input"
                    placeholder="e.g. TCS Assessment 2021"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="label">Time Limit (minutes)</label>
                  <input
                    type="number"
                    className="input"
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(parseInt(e.target.value))}
                    min={1}
                  />
                </div>

                <div>
                  <label className="label">
                    Select Questions ({selectedQuestionIds.length} selected)
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {questions.map((q) => (
                      <label
                        key={q.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                          selectedQuestionIds.includes(q.id)
                            ? 'bg-primary-600/10 border border-primary-500/30'
                            : 'bg-surface-800 border border-surface-700 hover:border-surface-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedQuestionIds.includes(q.id)}
                          onChange={() => toggleQuestion(q.id)}
                          className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-500"
                        />
                        <span className="text-sm text-surface-200 flex-1">{q.title}</span>
                        <span className={`badge-${q.difficulty} text-xs`}>{q.difficulty}</span>
                      </label>
                    ))}
                    {questions.length === 0 && (
                      <p className="text-sm text-surface-500 text-center py-4">
                        No questions available. Create questions first.
                      </p>
                    )}
                  </div>
                </div>

                <button onClick={handleSave} className="btn-primary w-full mt-4">
                  <Save className="w-4 h-4" />
                  {editId ? 'Update Assessment' : 'Create Assessment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assessment List */}
        {loading ? (
          <div className="text-center py-20 text-surface-500">Loading...</div>
        ) : assessments.length === 0 ? (
          <div className="text-center py-20">
            <CheckSquare className="w-16 h-16 text-surface-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-surface-400 mb-2">No assessments yet</h3>
            <p className="text-surface-500 text-sm mb-6">Create your first assessment.</p>
            <button onClick={openCreateForm} className="btn-primary">
              <Plus className="w-4 h-4" /> Create Assessment
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {assessments.map((a) => (
              <div key={a.id} className="card flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{a.name}</h3>
                  <div className="flex items-center gap-4 mt-1 text-sm text-surface-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {a.timeLimitMinutes} min
                    </span>
                    <span>{a._count?.questions ?? a.questions?.length ?? 0} questions</span>
                  </div>
                  {a.questions && a.questions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {a.questions.map((aq) => (
                        <span key={aq.id} className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700 text-xs">
                          {aq.question.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/admin/submissions/${a.id}`}
                    className="btn-outline text-sm"
                    id={`view-submissions-${a.id}`}
                  >
                    <Users className="w-4 h-4" />
                    Submissions
                  </Link>
                  <button onClick={() => openEditForm(a)} className="btn-outline text-sm">
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="btn-ghost p-2 text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
