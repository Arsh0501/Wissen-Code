import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAssessments } from '../../services/api';
import type { Assessment } from '../../types';
import {
  Code2, LogOut, Clock, FileText, ChevronRight, Zap
} from 'lucide-react';

export default function ExamDashboard() {
  const { candidateName, logout } = useAuth();
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAssessments();
  }, []);

  async function loadAssessments() {
    try {
      const data = await getAssessments();
      setAssessments(data);
    } catch (err) {
      console.error('Failed to load assessments:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">WissenCode</h1>
              <p className="text-xs text-surface-500">Assessment Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-surface-400">Welcome, {candidateName}</span>
            <button onClick={() => { logout(); navigate('/'); }} className="btn-ghost text-sm">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Available Assessments</h2>
          <p className="text-surface-400 text-sm mt-1">Select an assessment to begin</p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-surface-500">Loading assessments...</div>
        ) : assessments.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-16 h-16 text-surface-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-surface-400 mb-2">No assessments available</h3>
            <p className="text-surface-500 text-sm">Check back later or contact your administrator.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {assessments.map((a) => (
              <div
                key={a.id}
                className="card group hover:border-primary-500/30 transition-all duration-300 cursor-pointer"
                onClick={() => navigate(`/exam/${a.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white group-hover:text-primary-300 transition-colors">
                      {a.name}
                    </h3>
                    <div className="flex items-center gap-6 mt-2 text-sm text-surface-400">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> {a.timeLimitMinutes} minutes
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4" /> {a._count?.questions ?? a.questions?.length ?? 0} questions
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="btn-primary group-hover:shadow-primary-500/40">
                      <Zap className="w-4 h-4" /> Start
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
