import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import {
  getAllInterviewSessions,
  createInterviewSession,
  deleteInterviewSession,
  endInterviewSession,
  getCandidateUsers,
  getAvailableQuestions,
  type InterviewSessionData,
  type CreateInterviewSessionInput,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Plus, Video, Users, Search, Copy, Check, ExternalLink, Trash2,
  Clock, Mail, Sparkles, AlertCircle, CheckCircle2, X, Share2,
  Calendar, Monitor, CheckSquare, MessageSquare, Play, RefreshCw
} from 'lucide-react';

export default function InterviewManager() {
  const { candidateName: currentAdminName } = useAuth();

  // Sessions state
  const [sessions, setSessions] = useState<InterviewSessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and status filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'active' | 'ended'>('all');

  // Candidate users for autocomplete/selection
  const [candidateOptions, setCandidateOptions] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [availableQuestions, setAvailableQuestions] = useState<Array<{ id: number; title: string; difficulty: string }>>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [candidateMode, setCandidateMode] = useState<'registered' | 'custom'>('registered');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [interviewerName, setInterviewerName] = useState(currentAdminName || 'Interviewer');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [initialQuestionId, setInitialQuestionId] = useState<string>('');

  // Post-Creation Success Modal
  const [createdSession, setCreatedSession] = useState<InterviewSessionData | null>(null);

  // Copy feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
    loadCandidateOptions();
    loadQuestions();
  }, []);

  async function loadSessions() {
    try {
      setLoading(true);
      setError(null);
      const res = await getAllInterviewSessions();
      setSessions(res.sessions || []);
    } catch (err: any) {
      console.error('Failed to load interview sessions:', err);
      setError(err?.response?.data?.error || 'Failed to load interview sessions');
    } finally {
      setLoading(false);
    }
  }

  async function loadCandidateOptions() {
    try {
      const res = await getCandidateUsers();
      setCandidateOptions(res.candidates || []);
      if (res.candidates && res.candidates.length > 0) {
        setSelectedCandidateId(res.candidates[0].id.toString());
        setCandidateName(res.candidates[0].name);
        setCandidateEmail(res.candidates[0].email);
      }
    } catch (err) {
      console.warn('Could not load candidate list:', err);
    }
  }

  async function loadQuestions() {
    try {
      const res = await getAvailableQuestions();
      setAvailableQuestions(res.questions || []);
    } catch (err) {
      console.warn('Could not load questions list:', err);
    }
  }

  function handleSelectRegisteredCandidate(idStr: string) {
    setSelectedCandidateId(idStr);
    const found = candidateOptions.find((c) => c.id.toString() === idStr);
    if (found) {
      setCandidateName(found.name);
      setCandidateEmail(found.email);
    }
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!candidateName.trim() || !candidateEmail.trim()) {
      alert('Please provide both candidate name and candidate email.');
      return;
    }

    try {
      setSubmitting(true);
      const input: CreateInterviewSessionInput = {
        candidateName: candidateName.trim(),
        candidateEmail: candidateEmail.trim(),
        interviewerName: interviewerName.trim() || currentAdminName || 'Interviewer',
        meetingUrl: meetingUrl.trim() || undefined,
        durationMinutes: Number(durationMinutes) || 60,
        currentQuestionId: initialQuestionId ? Number(initialQuestionId) : undefined,
      };

      const res = await createInterviewSession(input);
      if (res.success && res.session) {
        setCreatedSession(res.session);
        setIsModalOpen(false);
        // Refresh table
        await loadSessions();
        // Reset form for next time
        if (candidateMode === 'custom') {
          setCandidateName('');
          setCandidateEmail('');
        }
        setMeetingUrl('');
      }
    } catch (err: any) {
      console.error('Failed to create interview session:', err);
      alert(err?.response?.data?.error || 'Failed to create interview session');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Are you sure you want to delete the interview session for "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteInterviewSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete interview session');
    }
  }

  async function handleEnd(id: number) {
    if (!confirm('Conclude this interview session now?')) return;
    try {
      await endInterviewSession(id);
      await loadSessions();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to conclude interview session');
    }
  }

  function copyToClipboard(text: string, idTag: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(idTag);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function getCandidateLink(token: string) {
    return `${window.location.origin}/interview/${token}`;
  }

  function getInterviewerLink(token: string) {
    return `${window.location.origin}/interview/${token}/interviewer`;
  }

  function generateEmailInviteText(session: InterviewSessionData) {
    const candidateLink = getCandidateLink(session.token);
    return `Hi ${session.candidateName},

You are invited to a 1-on-1 technical coding interview with ${session.interviewerName}.

Session Details:
• Duration: ${session.durationMinutes} minutes
${session.meetingUrl ? `• Video Call Link (Teams / Google Meet): ${session.meetingUrl}\n` : ''}• Live Coding Workspace: ${candidateLink}

Instructions:
1. Join the video meeting link at your scheduled time.
2. Open your Live Coding Workspace link in Google Chrome or Microsoft Edge.
3. Share your screen during the call so your interviewer can follow your thought process.

Best regards,
Technical Recruiting Team`;
  }

  // Filtered Sessions
  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      s.candidateName.toLowerCase().includes(search.toLowerCase()) ||
      (s.candidateEmail && s.candidateEmail.toLowerCase().includes(search.toLowerCase())) ||
      s.interviewerName.toLowerCase().includes(search.toLowerCase()) ||
      s.token.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const waitingCount = sessions.filter((s) => s.status === 'waiting').length;
  const activeCount = sessions.filter((s) => s.status === 'active').length;
  const endedCount = sessions.filter((s) => s.status === 'ended').length;

  return (
    <AdminLayout
      title="1-on-1 Technical Interviews"
      subtitle="Set up live technical coding interviews, invite candidates with email, and link Teams/Google Meet calls."
      actions={
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Set Up Interview</span>
        </button>
      }
    >
      {/* ─── METRIC STATS CARDS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-surface-400 text-xs font-medium">Total Interviews</div>
            <div className="text-2xl font-bold text-white mt-1">{sessions.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-surface-400 text-xs font-medium">Waiting / Scheduled</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{waitingCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-surface-400 text-xs font-medium">Active (Live Now)</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{activeCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Play className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-surface-400 text-xs font-medium">Completed / Ended</div>
            <div className="text-2xl font-bold text-surface-300 mt-1">{endedCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-800 text-surface-400 border border-surface-700 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ─── SEARCH & FILTER CONTROLS ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search candidate name, email, or token..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-900 border border-surface-800 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-surface-900 border border-surface-800 p-1 rounded-xl self-start sm:self-auto">
          {(['all', 'waiting', 'active', 'ended'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-surface-400 hover:text-white hover:bg-surface-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ─── INTERVIEWS TABLE ─── */}
      {loading ? (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-12 text-center text-surface-400 flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mb-3" />
          <p className="text-sm">Loading interview sessions...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/25 rounded-2xl p-6 text-center text-rose-400">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
          <p className="font-semibold text-sm">{error}</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mb-4">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No Interview Sessions Found</h3>
          <p className="text-surface-400 text-sm max-w-sm mb-6">
            {search || statusFilter !== 'all'
              ? 'No interviews match your current search and filter criteria.'
              : 'Set up your first 1-on-1 technical interview for any candidate with their email.'}
          </p>
          <button onClick={() => setIsModalOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span>Set Up Interview</span>
          </button>
        </div>
      ) : (
        <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-950/60 border-b border-surface-800 text-surface-400 text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Candidate</th>
                  <th className="py-3.5 px-4">Interviewer</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Video Platform</th>
                  <th className="py-3.5 px-4">Duration</th>
                  <th className="py-3.5 px-4">Snapshots</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/80">
                {filteredSessions.map((sess) => {
                  const candidateUrl = getCandidateLink(sess.token);
                  const interviewerUrl = getInterviewerLink(sess.token);

                  return (
                    <tr key={sess.id} className="hover:bg-surface-850/50 transition-colors">
                      {/* Candidate info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                            {sess.candidateName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white">{sess.candidateName}</div>
                            {sess.candidateEmail && (
                              <div className="text-xs text-surface-400 flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3 text-surface-500" />
                                <span>{sess.candidateEmail}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Interviewer */}
                      <td className="py-3.5 px-4 text-surface-300 font-medium">
                        {sess.interviewerName}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                            sess.status === 'active'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : sess.status === 'waiting'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-surface-800 text-surface-400 border border-surface-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sess.status === 'active'
                                ? 'bg-emerald-400 animate-pulse'
                                : sess.status === 'waiting'
                                ? 'bg-amber-400'
                                : 'bg-surface-500'
                            }`}
                          />
                          {sess.status}
                        </span>
                      </td>

                      {/* Video Call Meeting URL */}
                      <td className="py-3.5 px-4">
                        {sess.meetingUrl ? (
                          <a
                            href={sess.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:underline bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            <Video className="w-3 h-3" />
                            <span>Teams/Meet</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                          </a>
                        ) : (
                          <span className="text-xs text-surface-500 italic">None set</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-3.5 px-4 text-xs font-mono text-surface-400">
                        {sess.durationMinutes} mins
                      </td>

                      {/* Snapshots count */}
                      <td className="py-3.5 px-4 text-xs text-surface-400">
                        <span className="bg-surface-800 px-2 py-0.5 rounded font-mono text-surface-300">
                          {sess._count?.snapshots ?? 0} saved
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Copy Candidate Link */}
                          <button
                            onClick={() => copyToClipboard(candidateUrl, `cand-${sess.id}`)}
                            className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-750 text-surface-300 hover:text-white border border-surface-700 transition-colors"
                            title="Copy Candidate Link"
                          >
                            {copiedId === `cand-${sess.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Open Interviewer Portal */}
                          <a
                            href={interviewerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-colors"
                            title="Open Interviewer Portal"
                          >
                            <span>Interviewer</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>

                          {/* End session */}
                          {sess.status !== 'ended' && (
                            <button
                              onClick={() => handleEnd(sess.id)}
                              className="px-2 py-1 rounded-lg bg-surface-800 hover:bg-surface-750 text-surface-300 hover:text-amber-300 text-xs transition-colors"
                              title="End Interview"
                            >
                              End
                            </button>
                          )}

                          {/* Delete session */}
                          <button
                            onClick={() => handleDelete(sess.id, sess.candidateName)}
                            className="p-1.5 rounded-lg bg-surface-800 hover:bg-rose-500/20 text-surface-400 hover:text-rose-400 transition-colors"
                            title="Delete Interview"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── SCHEDULE INTERVIEW MODAL ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-surface-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-750 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-surface-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Set Up 1-on-1 Interview</h2>
                  <p className="text-xs text-surface-400">Configure candidate details, duration, and video link</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleCreateSession} className="p-6 space-y-4">
              {/* Candidate Selection Mode Toggle */}
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-2">
                  Candidate Selection
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-surface-950 rounded-xl border border-surface-800">
                  <button
                    type="button"
                    onClick={() => setCandidateMode('registered')}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      candidateMode === 'registered'
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-surface-400 hover:text-white'
                    }`}
                  >
                    Select Registered Candidate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCandidateMode('custom');
                      setCandidateName('');
                      setCandidateEmail('');
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      candidateMode === 'custom'
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-surface-400 hover:text-white'
                    }`}
                  >
                    Enter Any Candidate Details
                  </button>
                </div>
              </div>

              {/* Mode A: Select from Database Candidates */}
              {candidateMode === 'registered' ? (
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                    Candidate Profile
                  </label>
                  {candidateOptions.length > 0 ? (
                    <select
                      value={selectedCandidateId}
                      onChange={(e) => handleSelectRegisteredCandidate(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-950 border border-surface-750 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                    >
                      {candidateOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-xs text-surface-400 p-3 bg-surface-950 rounded-xl border border-surface-800">
                      No candidate users registered yet. Switch to "Enter Any Candidate Details" tab above.
                    </div>
                  )}
                </div>
              ) : (
                /* Mode B: Custom Candidate Inputs */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                      Candidate Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      required
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-950 border border-surface-750 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                      Candidate Email <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. rahul@example.com"
                      required
                      value={candidateEmail}
                      onChange={(e) => setCandidateEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-950 border border-surface-750 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              )}

              {/* Interviewer Name */}
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                  Interviewer Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins"
                  value={interviewerName}
                  onChange={(e) => setInterviewerName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-950 border border-surface-750 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* External Video Meeting Call Link */}
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                  Microsoft Teams / Google Meet Link (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://teams.microsoft.com/... or https://meet.google.com/..."
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-950 border border-surface-750 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:border-purple-500"
                />
                <p className="text-[11px] text-surface-400 mt-1">
                  Paste the Teams or Meet invite URL. A direct "Join Call" button will be presented to both you and the candidate.
                </p>
              </div>

              {/* Duration & Initial Question */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                    Duration (Minutes)
                  </label>
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-surface-950 border border-surface-750 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes (Standard)</option>
                    <option value={90}>90 Minutes</option>
                    <option value={120}>120 Minutes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                    Pre-assign Question (Optional)
                  </label>
                  <select
                    value={initialQuestionId}
                    onChange={(e) => setInitialQuestionId(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-950 border border-surface-750 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">None (Pick live in room)</option>
                    {availableQuestions.map((q) => (
                      <option key={q.id} value={q.id}>
                        #{q.id} {q.title} ({q.difficulty})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-surface-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-surface-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex items-center gap-2"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>Create Interview Room</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── SUCCESS / SHARE INVITE MODAL ─── */}
      {createdSession && (
        <div className="fixed inset-0 bg-surface-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-750 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <h2 className="text-xl font-bold text-white mb-1">Interview Room Created!</h2>
              <p className="text-surface-400 text-xs mb-6">
                Interview for <strong className="text-white">{createdSession.candidateName}</strong> ({createdSession.candidateEmail}) is ready.
              </p>

              {/* Candidate Link Box */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-surface-300 mb-1.5 flex items-center justify-between">
                  <span>Candidate Workspace Link</span>
                  <span className="text-[11px] text-purple-400">Send this to candidate</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getCandidateLink(createdSession.token)}
                    className="flex-1 px-3 py-2 bg-surface-950 border border-surface-750 rounded-xl text-xs text-white font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(getCandidateLink(createdSession.token), 'modal-cand')}
                    className="px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    {copiedId === 'modal-cand' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === 'modal-cand' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Interviewer Link Box */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-surface-300 mb-1.5 flex items-center justify-between">
                  <span>Interviewer Portal Link</span>
                  <span className="text-[11px] text-surface-400">Your portal for problem dispatch</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getInterviewerLink(createdSession.token)}
                    className="flex-1 px-3 py-2 bg-surface-950 border border-surface-750 rounded-xl text-xs text-white font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(getInterviewerLink(createdSession.token), 'modal-int')}
                    className="px-3 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-white text-xs font-semibold flex items-center gap-1.5 border border-surface-700 transition-colors"
                  >
                    {copiedId === 'modal-int' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === 'modal-int' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Copy Full Email Template */}
              <div className="p-3 bg-surface-950/60 rounded-xl border border-surface-800 mb-6 flex items-center justify-between">
                <div className="text-xs text-surface-300 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary-400" />
                  <span>Ready-to-send invitation email template</span>
                </div>
                <button
                  onClick={() => copyToClipboard(generateEmailInviteText(createdSession), 'modal-email')}
                  className="px-3 py-1 bg-surface-800 hover:bg-surface-700 text-surface-200 hover:text-white rounded-lg text-xs font-medium border border-surface-700 transition-colors flex items-center gap-1"
                >
                  {copiedId === 'modal-email' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId === 'modal-email' ? 'Copied Template' : 'Copy Template'}</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setCreatedSession(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-surface-400 hover:text-white transition-colors"
                >
                  Done
                </button>
                <a
                  href={getInterviewerLink(createdSession.token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary flex items-center gap-1.5"
                >
                  <span>Open Interviewer Room</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
