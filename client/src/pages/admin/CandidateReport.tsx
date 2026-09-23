import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getReportData, getReportDownloadUrl } from '../../services/api';
import {
  ArrowLeft, Code2, Download, CheckCircle, XCircle,
  BarChart3, AlertTriangle, Shield, Copy, Camera,
  Search, Bot, Clock
} from 'lucide-react';

interface FailedCase {
  testcase_id: number;
  expected_output: string;
  actual_output: string;
  status: string;
}

interface ReportQuestion {
  question_id: number;
  title: string;
  language: string;
  testcases_passed: number;
  testcases_total: number;
  score: number;
  failed_cases: FailedCase[];
}

interface ReportDataType {
  candidate: { id: string; name: string; email: string };
  assessment: { id: number; title: string; duration_minutes: number; submitted_at: string };
  overall_score: { passed: number; total: number; percentage: number };
  questions: ReportQuestion[];
  integrity_placeholder: {
    is_placeholder: boolean;
    tab_switches: any;
    copy_paste: any;
    screenshots: any;
    plagiarism: any;
    ai_code_detection: any;
  };
}

export default function CandidateReport() {
  const { candidateName, assessmentId } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();

  const [report, setReport] = useState<ReportDataType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Route guard: admin only
  useEffect(() => {
    if (role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [role, navigate]);

  useEffect(() => {
    if (!candidateName || !assessmentId || role !== 'admin') return;
    loadReport();
  }, [candidateName, assessmentId, role]);

  async function loadReport() {
    try {
      setLoading(true);
      setError('');
      const data = await getReportData(candidateName!, parseInt(assessmentId!));
      setReport(data);
    } catch (err: any) {
      console.error('Failed to load report:', err);
      setError(
        err?.response?.status === 403
          ? 'Access denied. Admin role required.'
          : err?.response?.status === 404
          ? 'No submissions found for this candidate.'
          : 'Failed to load report data.'
      );
    } finally {
      setLoading(false);
    }
  }

  const handleDownload = useCallback(async () => {
    if (!candidateName || !assessmentId) return;
    setDownloading(true);
    try {
      const url = getReportDownloadUrl(candidateName, parseInt(assessmentId));
      // Fetch as blob with admin headers
      const response = await fetch(url, {
        headers: {
          'x-role': 'admin',
          'x-candidate-name': localStorage.getItem('wissen-name') || 'Admin',
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `report-${candidateName}-assessment-${assessmentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download report. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [candidateName, assessmentId]);

  if (role !== 'admin') return null;

  function scoreColor(pct: number): string {
    if (pct >= 70) return 'text-emerald-400';
    if (pct >= 40) return 'text-amber-400';
    return 'text-red-400';
  }

  function scoreBg(pct: number): string {
    if (pct >= 70) return 'bg-emerald-500/10 ring-emerald-500/20';
    if (pct >= 40) return 'bg-amber-500/10 ring-amber-500/20';
    return 'bg-red-500/10 ring-red-500/20';
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to={`/admin/submissions/${assessmentId}`}
              className="btn-ghost p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary-400" />
              <div>
                <h1 className="text-lg font-bold text-white">
                  Candidate Report
                </h1>
                {report && (
                  <p className="text-xs text-surface-500">
                    {report.candidate.name} — {report.assessment.title}
                  </p>
                )}
              </div>
            </div>
          </div>

          {report && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-primary"
              id="download-report-btn"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Generating PDF...' : 'Download Report'}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-surface-400">Loading report...</p>
          </div>
        ) : error ? (
          <div className="card text-center py-12">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={loadReport} className="btn-outline">Retry</button>
          </div>
        ) : report ? (
          <div className="space-y-6 animate-fade-in">
            {/* ═══ OVERVIEW CARD ═══ */}
            <div className="card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold text-primary-400 uppercase tracking-wider mb-2">
                    Assessment Report
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-1">
                    {report.candidate.name}
                  </h2>
                  <p className="text-surface-400 text-sm">{report.assessment.title}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-surface-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Duration: {report.assessment.duration_minutes} min
                    </span>
                    <span>Submitted: {formatDate(report.assessment.submitted_at)}</span>
                  </div>
                </div>

                <div className={`px-5 py-3 rounded-xl ring-1 text-center ${scoreBg(report.overall_score.percentage)}`}>
                  <div className="text-xs text-surface-500 uppercase tracking-wider mb-1">Overall</div>
                  <div className={`text-3xl font-extrabold ${scoreColor(report.overall_score.percentage)}`}>
                    {report.overall_score.percentage.toFixed(1)}%
                  </div>
                  <div className="text-xs text-surface-500 mt-1">
                    {report.overall_score.passed}/{report.overall_score.total} passed
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ QUESTION RESULTS ═══ */}
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-primary-400" />
                Question-wise Results
              </h3>

              <div className="space-y-3">
                {report.questions.map((q, idx) => (
                  <div key={q.question_id} className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium text-white">
                          Q{idx + 1}: {q.title}
                        </h4>
                        <span className="text-xs text-surface-500">{q.language}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-surface-400">
                          {q.testcases_passed}/{q.testcases_total} test cases
                        </span>
                        <span className={`text-lg font-bold ${scoreColor(q.score)}`}>
                          {q.score.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Test case dots */}
                    <div className="flex gap-1.5 mb-3">
                      {Array.from({ length: q.testcases_total }, (_, i) => {
                        const passed = i < q.testcases_passed;
                        return (
                          <div
                            key={i}
                            className={`flex items-center justify-center w-8 h-8 rounded-md text-xs font-medium ${
                              passed
                                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25'
                                : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25'
                            }`}
                          >
                            {passed ? (
                              <CheckCircle className="w-3.5 h-3.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Failed cases details */}
                    {q.failed_cases.length > 0 && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-surface-800">
                        <div className="text-xs font-medium text-surface-500 uppercase tracking-wider">
                          Failed Test Cases
                        </div>
                        {q.failed_cases.map((fc) => (
                          <div
                            key={fc.testcase_id}
                            className="bg-surface-900 rounded-lg p-3 border border-surface-800"
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs text-surface-500">
                                Test Case #{fc.testcase_id}
                              </span>
                              <span className="text-xs font-semibold text-red-400">
                                {fc.status.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-[10px] text-surface-600 uppercase tracking-wider mb-1">
                                  Expected
                                </div>
                                <pre className="text-xs text-emerald-400 bg-emerald-500/5 p-2 rounded border border-emerald-500/10 whitespace-pre-wrap break-all">
                                  {fc.expected_output || '(empty)'}
                                </pre>
                              </div>
                              <div>
                                <div className="text-[10px] text-surface-600 uppercase tracking-wider mb-1">
                                  Actual
                                </div>
                                <pre className="text-xs text-red-400 bg-red-500/5 p-2 rounded border border-red-500/10 whitespace-pre-wrap break-all">
                                  {fc.actual_output || '(no output)'}
                                </pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ PLACEHOLDER INTEGRITY SECTION ═══ */}
            <div className="mt-8">
              {/* Prominent banner */}
              <div className="bg-gradient-to-r from-amber-900/60 to-orange-900/60 border-2 border-amber-500/40 rounded-xl p-5 text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <span className="text-lg font-bold text-amber-200 uppercase tracking-wider">
                    Integrity & Proctoring Signals
                  </span>
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-amber-300 text-sm">
                  Sample Data for Demonstration Purposes
                </p>
                <p className="text-amber-400/70 text-xs mt-1">
                  The data below is hardcoded placeholder content. These modules are not yet connected to live capture mechanisms.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tab Switches */}
                <div className="card p-4 relative">
                  <div className="absolute top-2 right-3 bg-amber-900/60 text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    Placeholder
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <h4 className="font-medium text-white text-sm">Tab Switch Detection</h4>
                  </div>
                  <div className="flex gap-6 mb-3">
                    <div>
                      <div className="text-[10px] text-surface-600 uppercase">Switches</div>
                      <div className="text-xl font-bold text-amber-400">
                        {report.integrity_placeholder.tab_switches.count}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-surface-600 uppercase">Away Time</div>
                      <div className="text-xl font-bold text-amber-400">
                        {(report.integrity_placeholder.tab_switches.total_duration_ms / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {report.integrity_placeholder.tab_switches.events.map((e: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs text-surface-500 bg-surface-900 rounded px-2 py-1">
                        <span>{(e.duration_ms / 1000).toFixed(1)}s</span>
                        <span>{formatDate(e.occurred_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Copy-Paste */}
                <div className="card p-4 relative">
                  <div className="absolute top-2 right-3 bg-amber-900/60 text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    Placeholder
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <Copy className="w-4 h-4 text-amber-400" />
                    <h4 className="font-medium text-white text-sm">Copy-Paste Detection</h4>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] text-surface-600 uppercase">Total Events</div>
                    <div className="text-xl font-bold text-amber-400">
                      {report.integrity_placeholder.copy_paste.count}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {report.integrity_placeholder.copy_paste.events.map((e: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs text-surface-500 bg-surface-900 rounded px-2 py-1">
                        <span>{e.action} — {e.char_count} chars</span>
                        <span>Q{e.question_id}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Screenshots */}
                <div className="card p-4 relative">
                  <div className="absolute top-2 right-3 bg-amber-900/60 text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    Placeholder
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-medium text-white text-sm">Screenshot Monitoring</h4>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <div className="text-[10px] text-surface-600 uppercase">Snapshots</div>
                      <div className="text-xl font-bold text-emerald-400">
                        {report.integrity_placeholder.screenshots.snapshot_count}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-surface-600 uppercase">Avg Confidence</div>
                      <div className="text-xl font-bold text-emerald-400">
                        {(report.integrity_placeholder.screenshots.average_confidence_score * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-surface-600 uppercase">Flagged</div>
                      <div className="text-xl font-bold text-emerald-400">
                        {report.integrity_placeholder.screenshots.flagged_snapshots.length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Plagiarism */}
                <div className="card p-4 relative">
                  <div className="absolute top-2 right-3 bg-amber-900/60 text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    Placeholder
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <Search className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-medium text-white text-sm">Plagiarism Detection</h4>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <div className="text-[10px] text-surface-600 uppercase">Status</div>
                      <div className="text-sm font-semibold text-emerald-400">
                        {report.integrity_placeholder.plagiarism.status}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-surface-600 uppercase">Matches</div>
                      <div className="text-sm font-semibold text-emerald-400">
                        {report.integrity_placeholder.plagiarism.matches.length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Code Detection */}
                <div className="card p-4 relative md:col-span-2">
                  <div className="absolute top-2 right-3 bg-amber-900/60 text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    Placeholder
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-medium text-white text-sm">AI-Generated Code Detection</h4>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <div className="text-[10px] text-surface-600 uppercase">Status</div>
                      <div className="text-sm font-semibold text-emerald-400">
                        {report.integrity_placeholder.ai_code_detection.status}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-surface-600 uppercase">Flags Raised</div>
                      <div className="text-sm font-semibold text-emerald-400">
                        {report.integrity_placeholder.ai_code_detection.flags.length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
