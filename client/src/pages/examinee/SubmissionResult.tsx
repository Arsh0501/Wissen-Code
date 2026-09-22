import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSubmissionResults } from '../../services/api';
import type { SubmissionResult as SubmissionResultType } from '../../types';
import {
  Code2, CheckCircle, XCircle, Trophy, ArrowLeft, BarChart3
} from 'lucide-react';

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
      const data = await getSubmissionResults(parseInt(assessmentId!), candidateName);
      setResult(data);
    } catch (err: any) {
      setError('Results not found yet. If you just submitted, they may still be processing.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-surface-400">Loading results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">Wissen Code</span>
          </div>
          <button onClick={() => navigate('/exam')} className="btn-outline text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {error ? (
          <div className="card text-center">
            <Trophy className="w-20 h-20 text-primary-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-3">Test Submitted!</h2>
            <p className="text-surface-400 mb-2">
              Your test has been submitted successfully.
            </p>
            <p className="text-surface-500 text-sm">
              {error}
            </p>
            <button onClick={loadResults} className="btn-outline mt-6">
              Refresh Results
            </button>
          </div>
        ) : result ? (
          <div className="space-y-6 animate-fade-in">
            {/* Success header */}
            <div className="card text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Test Submitted Successfully!</h2>
              <p className="text-surface-400">
                Thank you, <span className="text-white font-medium">{result.candidateName}</span>.
                Your assessment has been graded.
              </p>

              {/* Overall score */}
              <div className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-surface-800 border border-surface-700">
                <BarChart3 className="w-5 h-5 text-primary-400" />
                <span className="text-surface-400">Overall Score:</span>
                <span className={`text-2xl font-bold ${
                  result.overallScore >= 70 ? 'text-emerald-400' :
                  result.overallScore >= 40 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {result.overallScore.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Per-question results */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary-400" />
                Question-wise Results
              </h3>
              {result.submissions.map((sub, idx) => (
                <div key={sub.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-white">
                        Q{idx + 1}: {sub.question?.title || `Question ${sub.questionId}`}
                      </h4>
                      <span className="text-xs text-surface-500">{sub.languageName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-surface-400">
                        {sub.testCaseResults?.filter((r) => r.passed).length || 0}/
                        {sub.testCaseResults?.length || 0} test cases
                      </span>
                      <span className={`text-lg font-bold ${
                        sub.score >= 70 ? 'text-emerald-400' :
                        sub.score >= 40 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {sub.score.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Test case breakdown */}
                  {sub.testCaseResults && sub.testCaseResults.length > 0 && (
                    <div className="flex gap-1.5 mt-3">
                      {sub.testCaseResults.map((tcr, tIdx) => (
                        <div
                          key={tcr.id}
                          className={`flex items-center justify-center w-8 h-8 rounded-md text-xs font-medium ${
                            tcr.passed
                              ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25'
                              : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25'
                          }`}
                          title={`${tcr.statusDesc} ${tcr.testCase?.isSample ? '(Sample)' : '(Hidden)'}`}
                        >
                          {tcr.passed ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
