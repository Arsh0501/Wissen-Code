import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSubmissionResults } from '../../services/api';
import { formatDate, formatDuration, scoreTextClass, PassFailBadge, Spinner } from '../../components/ui';
import type { SubmissionResult as SubmissionResultType, QuestionEvaluation } from '../../types';
import {
  Code2, CheckCircle, XCircle, Trophy, ArrowLeft, Clock, Award, Target, EyeOff, ChevronDown, MinusCircle,
} from 'lucide-react';

function QuestionResult({ q, index }: { q: QuestionEvaluation; index: number }) {
  const [open, setOpen] = useState(false);
  const results = q.submission?.testCaseResults ?? [];

  return (
    <div className="card p-0 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-surface-800/30">
        <div className="min-w-0">
          <h4 className="font-medium text-white truncate">Q{index + 1}. {q.title}</h4>
          <div className="flex items-center gap-2 mt-1 text-xs text-surface-500">
            <span className={`badge-${q.difficulty}`}>{q.difficulty}</span>
            {q.attempted ? <span>{q.submission?.languageName}</span> : <span className="text-amber-400">Not attempted</span>}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-sm text-surface-400 tabular-nums">{q.passedTestCases}/{q.totalTestCases} tests</p>
            <p className={`text-lg font-bold tabular-nums ${scoreTextClass(q.score)}`}>
              {q.marksObtained}<span className="text-surface-500 text-sm font-normal">/{q.marks}</span>
            </p>
          </div>
          <ChevronDown className={`w-4 h-4 text-surface-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Test case strip */}
      {results.length > 0 && (
        <div className="flex gap-1.5 px-4 pb-4 flex-wrap">
          {results.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center justify-center w-8 h-8 rounded-md ${
                r.passed ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25' : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25'
              }`}
              title={`Test ${i + 1}: ${r.statusDesc} (${r.testCase?.isSample ? 'sample' : 'hidden'})`}
            >
              {r.passed ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="border-t border-surface-800 p-4">
          {results.length === 0 ? (
            <p className="text-sm text-surface-500">No answer was submitted for this question.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-surface-500 uppercase tracking-wider">
                  <th className="text-left font-medium pb-2">Test</th>
                  <th className="text-left font-medium pb-2">Type</th>
                  <th className="text-left font-medium pb-2">Verdict</th>
                  <th className="text-right font-medium pb-2">Time</th>
                  <th className="text-right font-medium pb-2">Memory</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/60">
                {results.map((r, i) => (
                  <tr key={r.id}>
                    <td className="py-1.5 text-surface-300">#{i + 1}</td>
                    <td className="py-1.5 text-surface-400">
                      {r.testCase?.isSample ? 'Sample' : <span className="inline-flex items-center gap-1"><EyeOff className="w-3 h-3" /> Hidden</span>}
                    </td>
                    <td className={`py-1.5 ${r.passed ? 'text-emerald-400' : 'text-red-400'}`}>{r.statusDesc}</td>
                    <td className="py-1.5 text-right text-surface-400 tabular-nums">{r.executionTime != null ? `${r.executionTime}s` : '—'}</td>
                    <td className="py-1.5 text-right text-surface-400 tabular-nums">{r.memoryUsed != null ? `${Math.round(r.memoryUsed / 1024)} MB` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function SubmissionResult() {
  const { assessmentId } = useParams();
  const { candidateName } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<SubmissionResultType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!assessmentId || !candidateName) return;
    loadResults();
  }, [assessmentId, candidateName]);

  async function loadResults() {
    try {
      setLoading(true);
      setError('');
      setResult(await getSubmissionResults(parseInt(assessmentId!), candidateName));
    } catch {
      setError('Results not found yet. If you just submitted, they may still be processing.');
    } finally {
      setLoading(false);
    }
  }

  const e = result?.evaluation;

  return (
    <div className="min-h-screen bg-surface-950">
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">WissenCode</span>
          </div>
          <button onClick={() => navigate('/exam')} className="btn-outline text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {loading ? (
          <Spinner label="Loading results..." />
        ) : error || !e ? (
          <div className="card text-center">
            <Trophy className="w-16 h-16 text-primary-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-3">Test Submitted!</h2>
            <p className="text-surface-400 mb-2">Your test has been submitted successfully.</p>
            <p className="text-surface-500 text-sm">{error}</p>
            <button onClick={loadResults} className="btn-outline mt-6">Refresh Results</button>
          </div>
        ) : result?.resultsHidden ? (
          <div className="card text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{e.assessment.name}</h2>
            <p className="text-surface-400">
              Thank you, <span className="text-white font-medium">{e.candidateName}</span>. Your answers have been submitted
              {e.finishedAt && <> on {formatDate(e.finishedAt)}</>}.
            </p>
            <p className="text-surface-500 text-sm mt-4 flex items-center justify-center gap-1.5">
              <EyeOff className="w-4 h-4" /> Scores for this assessment are shared by the hiring team, not shown here.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {/* Headline */}
            <div className="card text-center">
              <p className="text-sm text-surface-400 mb-1">{e.assessment.name}</p>
              <div className="flex items-center justify-center gap-3 mb-4">
                <h2 className="text-2xl font-bold text-white">Your result</h2>
                <PassFailBadge passed={!!e.passed} />
              </div>
              <p className={`text-6xl font-extrabold tabular-nums ${scoreTextClass(e.percentage ?? 0)}`}>
                {(e.percentage ?? 0).toFixed(1)}%
              </p>
              <p className="text-surface-400 text-sm mt-2">
                {e.marksObtained} of {e.totalMarks} marks · passing score {e.assessment.passingScore}%
              </p>

              <div className="grid grid-cols-3 gap-3 mt-6">
                <div className="bg-surface-800 rounded-lg p-3">
                  <Award className="w-4 h-4 text-primary-400 mx-auto mb-1" />
                  <p className="text-sm font-semibold text-white tabular-nums">
                    {e.questions?.filter((q) => q.score === 100).length}/{e.questions?.length}
                  </p>
                  <p className="text-[11px] text-surface-500 uppercase tracking-wider">Fully solved</p>
                </div>
                <div className="bg-surface-800 rounded-lg p-3">
                  <Target className="w-4 h-4 text-primary-400 mx-auto mb-1" />
                  <p className="text-sm font-semibold text-white tabular-nums">
                    {e.questions?.reduce((a, q) => a + q.passedTestCases, 0)}/{e.questions?.reduce((a, q) => a + q.totalTestCases, 0)}
                  </p>
                  <p className="text-[11px] text-surface-500 uppercase tracking-wider">Tests passed</p>
                </div>
                <div className="bg-surface-800 rounded-lg p-3">
                  <Clock className="w-4 h-4 text-primary-400 mx-auto mb-1" />
                  <p className="text-sm font-semibold text-white tabular-nums">{formatDuration(e.timeTakenSeconds)}</p>
                  <p className="text-[11px] text-surface-500 uppercase tracking-wider">of {e.assessment.timeLimitMinutes} min</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Question-wise results</h3>
                <span className="text-xs text-surface-500 flex items-center gap-1">
                  <MinusCircle className="w-3 h-3" /> Hidden test outputs are not shown
                </span>
              </div>
              {e.questions?.map((q, i) => <QuestionResult key={q.questionId} q={q} index={i} />)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
