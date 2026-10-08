import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import {
  validateInterviewToken,
  getAvailableQuestions,
  getInterviewQuestion,
  getInterviewDraft,
  getInterviewSnapshots,
  endInterviewSession,
  updateInterviewSession,
  type InterviewSessionData,
  type InterviewSnapshotData,
} from '../../services/api';
import InterviewChat, { type ChatMessage } from '../../components/interview/InterviewChat';
import type { Question } from '../../types';
import {
  Code2, Video, MessageSquare, Clock, Search, Send, Link2, ExternalLink,
  CheckCircle2, AlertCircle, Sparkles, Terminal, FileCode, Check, RefreshCw,
  LogOut, ShieldAlert, Wifi, WifiOff, Eye, ChevronRight, X, Filter, BookOpen,
  Mail, Copy, Edit2, Monitor,
} from 'lucide-react';

interface AvailableQuestionItem {
  id: number;
  title: string;
  difficulty: string;
  tags: string;
  statement: string;
}

export default function InterviewerRoom() {
  const { token } = useParams<{ token: string }>();

  // Session State
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<InterviewSessionData | null>(null);

  // Candidate Online Status
  const [isCandidateConnected, setIsCandidateConnected] = useState(false);

  // Active Question & Question Bank
  const [availableQuestions, setAvailableQuestions] = useState<AvailableQuestionItem[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [pastedInput, setPastedInput] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [isQuestionDropdownOpen, setIsQuestionDropdownOpen] = useState(false);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [pushedSuccessNotice, setPushedSuccessNotice] = useState<string | null>(null);

  // Live Candidate Code Mirror
  const [liveCode, setLiveCode] = useState<string>('// Waiting for candidate to type code...');
  const [liveLanguage, setLiveLanguage] = useState<string>('cpp');
  const [lastCodeUpdate, setLastCodeUpdate] = useState<string | null>(null);
  const [isCandidateTyping, setIsCandidateTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live Execution Results
  const [lastExecution, setLastExecution] = useState<{
    status: string;
    isError: boolean;
    executionTime?: string;
    timestamp: string;
  } | null>(null);

  // Snapshots History
  const [snapshots, setSnapshots] = useState<InterviewSnapshotData[]>([]);
  const [activeSnapshotView, setActiveSnapshotView] = useState<InterviewSnapshotData | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Socket.IO
  const [socket, setSocket] = useState<Socket | null>(null);

  // Layout View Tabs: 'split' | 'code' | 'video'
  const [activeTab, setActiveTab] = useState<'split' | 'code' | 'video'>('split');
  const [showSnapshotsDrawer, setShowSnapshotsDrawer] = useState(false);

  // Timer State
  const [timeLeft, setTimeLeft] = useState<number>(3600);

  // Meeting Link State
  const [meetingUrlInput, setMeetingUrlInput] = useState('');
  const [isEditingMeetingUrl, setIsEditingMeetingUrl] = useState(false);
  const [copiedMeetingUrl, setCopiedMeetingUrl] = useState(false);

  const handleSaveMeetingUrl = async () => {
    if (!session) return;
    try {
      const res = await updateInterviewSession(session.id, { meetingUrl: meetingUrlInput.trim() });
      if (res.session) {
        setSession((prev) => (prev ? { ...prev, meetingUrl: res.session.meetingUrl } : res.session));
      }
      setIsEditingMeetingUrl(false);
    } catch (e) {
      console.error('Failed to update meeting URL:', e);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch Full Question Details
  // ─────────────────────────────────────────────────────────────────────────
  const loadQuestionDetails = useCallback(async (sessionId: number, questionId: number) => {
    try {
      const q = await getInterviewQuestion(sessionId, questionId);
      setSelectedQuestion(q);

      // Also fetch candidate's draft if existing
      const draftRes = await getInterviewDraft(sessionId, questionId);
      if (draftRes?.draft?.code) {
        setLiveCode(draftRes.draft.code);
        if (draftRes.draft.languageName) {
          setLiveLanguage(draftRes.draft.languageName.toLowerCase());
        }
      }
    } catch (err) {
      console.error('[InterviewerRoom] Failed to load question:', err);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Initialization & Socket Connection
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setSessionError('No interview token provided.');
      setLoading(false);
      return;
    }

    async function init() {
      try {
        setLoading(true);
        const data = await validateInterviewToken(token!);
        if (!data.valid || !data.session) {
          setSessionError('Interview session not found or invalid token.');
          setLoading(false);
          return;
        }

        const sess = data.session;
        setSession(sess);

        // Fetch question bank
        try {
          const qList = await getAvailableQuestions();
          setAvailableQuestions(qList.questions || []);
        } catch (e) {
          console.error('[InterviewerRoom] Failed to load questions:', e);
        }

        // Fetch any existing snapshots
        try {
          const snapRes = await getInterviewSnapshots(sess.id);
          setSnapshots(snapRes.snapshots || []);
        } catch (e) {
          console.error('[InterviewerRoom] Failed to load snapshots:', e);
        }

        // Load active question if set
        if (sess.currentQuestionId) {
          await loadQuestionDetails(sess.id, sess.currentQuestionId);
        }

        // Timer
        const durationSecs = (sess.durationMinutes || 60) * 60;
        if (sess.startedAt) {
          const elapsed = Math.floor((Date.now() - new Date(sess.startedAt).getTime()) / 1000);
          setTimeLeft(Math.max(0, durationSecs - elapsed));
        } else {
          setTimeLeft(durationSecs);
        }

        // Connect Socket.IO as Interviewer
        const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin;
        const newSocket = io(socketUrl, {
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
        });

        setSocket(newSocket);

        newSocket.on('connect', () => {
          console.log('[InterviewerRoom] Connected with id:', newSocket.id);
          newSocket.emit('JOIN_INTERVIEW', {
            sessionId: sess.id,
            role: 'interviewer',
            name: sess.interviewerName,
          });
        });

        // Participant joined/reconnected
        newSocket.on('PARTICIPANT_JOINED', (data: { role: string }) => {
          if (data.role === 'candidate') {
            setIsCandidateConnected(true);
          }
        });

        newSocket.on('CANDIDATE_RECONNECTED', () => {
          setIsCandidateConnected(true);
        });

        newSocket.on('PARTICIPANT_DISCONNECTED', (data: { role: string }) => {
          if (data.role === 'candidate') {
            setIsCandidateConnected(false);
          }
        });

        // Real-time Candidate Code Typing
        newSocket.on('CODE_CHANGED', (data: { questionId: number; sourceCode: string }) => {
          setLiveCode(data.sourceCode);
          setLastCodeUpdate(new Date().toLocaleTimeString());
          setIsCandidateTyping(true);

          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsCandidateTyping(false);
          }, 1500);
        });

        // Real-time Candidate Code Execution
        newSocket.on('CODE_EXECUTED', (data: {
          questionId: number;
          languageId: number;
          status: string;
          isError: boolean;
          executionTime?: string;
        }) => {
          setLastExecution({
            status: data.status,
            isError: data.isError,
            executionTime: data.executionTime,
            timestamp: new Date().toLocaleTimeString(),
          });
        });

        // Real-time Candidate Code Submission Snapshot
        newSocket.on('CODE_SUBMITTED', (data: {
          questionId: number;
          language: string;
          sourceCode: string;
          submittedAt: string;
        }) => {
          setSnapshots((prev) => [
            {
              id: Date.now(),
              sessionId: sess.id,
              questionId: data.questionId,
              language: data.language,
              sourceCode: data.sourceCode,
              submittedAt: data.submittedAt,
            },
            ...prev,
          ]);
        });

        // Chat message
        newSocket.on('CHAT_MESSAGE', (msg: ChatMessage) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        });

        setLoading(false);
      } catch (err: any) {
        console.error('[InterviewerRoom] Init error:', err);
        setSessionError('Failed to initialize interviewer room.');
        setLoading(false);
      }
    }

    init();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [token, loadQuestionDetails]);

  // Timer interval
  useEffect(() => {
    if (loading || sessionError) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, sessionError]);

  // ─────────────────────────────────────────────────────────────────────────
  // Handle Pasting Question Link / ID or Selecting from Bank
  // ─────────────────────────────────────────────────────────────────────────
  const handleSelectQuestion = async (qItem: AvailableQuestionItem) => {
    if (!session) return;
    setIsQuestionDropdownOpen(false);
    setPastedInput(qItem.title);
    await loadQuestionDetails(session.id, qItem.id);
  };

  const handlePasteOrSearchInput = async (val: string) => {
    setPastedInput(val);
    if (!session || !val.trim()) return;

    // 1. Check if input is a direct Question ID (e.g., "1" or "#1")
    const numericMatch = val.trim().replace(/^#/, '').match(/^\d+$/);
    if (numericMatch) {
      const qId = parseInt(numericMatch[0]);
      const found = availableQuestions.find((q) => q.id === qId);
      if (found) {
        await loadQuestionDetails(session.id, found.id);
        return;
      }
    }

    // 2. Check if input is a URL (e.g., /admin/questions/1 or http://.../questions/1)
    const urlMatch = val.match(/\/questions\/(\d+)/);
    if (urlMatch) {
      const qId = parseInt(urlMatch[1]);
      const found = availableQuestions.find((q) => q.id === qId);
      if (found) {
        await loadQuestionDetails(session.id, found.id);
        return;
      }
    }

    // 3. Match by exact title (case-insensitive)
    const titleMatch = availableQuestions.find(
      (q) => q.title.toLowerCase() === val.trim().toLowerCase()
    );
    if (titleMatch) {
      await loadQuestionDetails(session.id, titleMatch.id);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Actions: Push Question to Candidate
  // ─────────────────────────────────────────────────────────────────────────
  // Action A: Push to candidate screen (emits QUESTION_OPENED)
  const handlePushQuestionToCandidate = () => {
    if (!session || !selectedQuestion || !socket) return;

    socket.emit('QUESTION_OPENED', {
      sessionId: session.id,
      questionId: selectedQuestion.id,
      title: selectedQuestion.title,
      difficulty: selectedQuestion.difficulty,
    });

    setPushedSuccessNotice(`"${selectedQuestion.title}" opened on candidate's screen!`);
    setTimeout(() => setPushedSuccessNotice(null), 4000);
  };

  // Action B: Share structured Question Card in Chat
  const handleShareQuestionInChat = () => {
    if (!session || !selectedQuestion || !socket) return;

    socket.emit('CHAT_MESSAGE', {
      id: `msg-qc-${Date.now()}`,
      sessionId: session.id,
      sender: session.interviewerName,
      senderRole: 'interviewer',
      text: `Problem: ${selectedQuestion.title}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'question_card',
      questionId: selectedQuestion.id,
      title: selectedQuestion.title,
      difficulty: selectedQuestion.difficulty,
    });

    setPushedSuccessNotice(`Shared "${selectedQuestion.title}" in chat!`);
    setTimeout(() => setPushedSuccessNotice(null), 4000);
  };

  // Send regular chat message
  const handleSendMessage = (text: string) => {
    if (!session || !socket || !text.trim()) return;

    socket.emit('CHAT_MESSAGE', {
      id: `msg-${Date.now()}`,
      sessionId: session.id,
      sender: session.interviewerName,
      senderRole: 'interviewer',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
    });
  };

  // Format Timer
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Filtered Questions for Dropdown Search
  const filteredQuestions = availableQuestions.filter((q) =>
    q.title.toLowerCase().includes(questionSearch.toLowerCase()) ||
    q.id.toString().includes(questionSearch) ||
    q.difficulty.toLowerCase().includes(questionSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center text-white">
        <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mb-4" />
        <p className="text-surface-400 text-sm">Connecting to Interviewer Room...</p>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface-900 border border-surface-800 rounded-2xl p-6 text-center">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Interviewer Room Unavailable</h2>
          <p className="text-surface-400 text-sm mb-6">{sessionError}</p>
          <Link
            to="/"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-surface-950 text-white flex flex-col overflow-hidden font-sans">
      {/* ─── TOP HEADER ─── */}
      <header className="flex-none h-14 bg-surface-900 border-b border-surface-800 px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight text-white">WissenCode Interview</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  Interviewer Portal
                </span>
              </div>
            </div>
          </div>

          <div className="h-4 w-px bg-surface-700 hidden sm:block" />

          {/* Candidate Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 text-xs bg-surface-800/80 px-3 py-1 rounded-full border border-surface-700">
            <span className="text-surface-400">Candidate:</span>
            <span className="font-semibold text-white">{session.candidateName}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isCandidateConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'
              }`}
              title={isCandidateConnected ? 'Candidate is online' : 'Candidate connected'}
            />
          </div>
        </div>

        {/* Center: Success Toast Notice */}
        {pushedSuccessNotice && (
          <div className="hidden md:flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs px-3 py-1 rounded-lg animate-fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{pushedSuccessNotice}</span>
          </div>
        )}

        {/* Right: Actions, Timer & Link to Candidate View */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-surface-800/90 text-surface-200 border border-surface-700 px-3 py-1 rounded-lg text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-primary-400" />
            <span>{formatTime(timeLeft)}</span>
          </div>

          {/* Open Candidate Room in New Tab */}
          <a
            href={`/interview/${session.token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1 bg-surface-800 hover:bg-surface-700 text-surface-200 hover:text-white rounded-lg text-xs font-medium border border-surface-700 transition-all"
            title="Open Candidate Room in a separate tab to test both sides side-by-side"
          >
            <span>Candidate View</span>
            <ExternalLink className="w-3 h-3 text-surface-400" />
          </a>

          {/* Snapshots History Toggle */}
          <button
            onClick={() => setShowSnapshotsDrawer(!showSnapshotsDrawer)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
              showSnapshotsDrawer
                ? 'bg-primary-600 border-primary-500 text-white'
                : 'bg-surface-800 hover:bg-surface-700 border-surface-700 text-surface-300'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Snapshots ({snapshots.length})</span>
          </button>
        </div>
      </header>

      {/* ─── MAIN WORKSPACE ─── */}
      <main className="flex-1 overflow-hidden flex flex-col md:flex-row p-3 gap-3 relative">
        {/* LEFT COLUMN: Video Call & Chat (~40%) */}
        <div className="w-full md:w-[40%] flex flex-col gap-3 h-full overflow-hidden">
          {/* Top Half: Candidate & Video Call Hub */}
          <div className="rounded-2xl border border-surface-800 bg-surface-900 p-4 flex flex-col gap-3.5 shadow-lg">
            {/* Candidate Identity & Online Pill */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold text-sm">
                  {session.candidateName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">{session.candidateName}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        isCandidateConnected
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isCandidateConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                      {isCandidateConnected ? 'Connected' : 'Waiting'}
                    </span>
                  </div>
                  {session.candidateEmail ? (
                    <div className="flex items-center gap-1 text-xs text-surface-400 mt-0.5">
                      <Mail className="w-3 h-3 text-surface-500" />
                      <span>{session.candidateEmail}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Video Meeting Call Section (Teams / Meet) */}
            <div className="bg-surface-950/80 rounded-xl border border-surface-800 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-surface-300 flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Call Platform (Teams / Meet)</span>
                </span>
                <button
                  onClick={() => {
                    setMeetingUrlInput(session.meetingUrl || '');
                    setIsEditingMeetingUrl(!isEditingMeetingUrl);
                  }}
                  className="text-[11px] text-surface-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{session.meetingUrl ? 'Change' : 'Set Link'}</span>
                </button>
              </div>

              {isEditingMeetingUrl ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="url"
                    placeholder="https://teams.microsoft.com/... or https://meet.google.com/..."
                    value={meetingUrlInput}
                    onChange={(e) => setMeetingUrlInput(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-surface-900 border border-surface-700 rounded-lg text-xs text-white placeholder-surface-500 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleSaveMeetingUrl}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Save
                  </button>
                </div>
              ) : session.meetingUrl ? (
                <div className="flex items-center gap-2 mt-1">
                  <a
                    href={session.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all hover:scale-[1.01]"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Join Video Call</span>
                    <ExternalLink className="w-3 h-3 opacity-80" />
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(session.meetingUrl!);
                      setCopiedMeetingUrl(true);
                      setTimeout(() => setCopiedMeetingUrl(false), 2000);
                    }}
                    className="p-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white border border-surface-700 transition-colors"
                    title="Copy Meeting Link"
                  >
                    {copiedMeetingUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ) : (
                <div className="text-xs text-surface-500 italic py-1 flex items-center justify-between">
                  <span>No external video link set yet.</span>
                  <button
                    onClick={() => setIsEditingMeetingUrl(true)}
                    className="text-purple-400 hover:underline not-italic text-[11px]"
                  >
                    + Add Link
                  </button>
                </div>
              )}
            </div>

            {/* Quick Screen Share Tips */}
            <div className="bg-surface-850/60 rounded-xl p-2.5 border border-surface-800/80 text-[11px] text-surface-400 flex items-start gap-2">
              <Monitor className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>Ask candidate to share screen in Teams/Meet. Their code will mirror live on the right as they type.</span>
            </div>
          </div>

          {/* Bottom Half: Live Chat */}
          <div className="flex-1 rounded-2xl overflow-hidden border border-surface-800 bg-surface-900 flex flex-col shadow-lg">
            <InterviewChat
              messages={messages}
              currentUserName={session.interviewerName}
              onSendMessage={handleSendMessage}
              onOpenQuestionCard={(qId) => loadQuestionDetails(session.id, qId)}
              isDrawer={false}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: Question Dispatcher & Live Candidate Code Mirror (~60%) */}
        <div className="flex-1 flex flex-col rounded-2xl border border-surface-800 bg-surface-900 overflow-hidden shadow-xl">
          {/* ─── QUESTION DISPATCHER (Positioned safely in Right Column, away from video feed) ─── */}
          <div className="flex-none bg-surface-850/95 border-b border-surface-800 p-2.5 flex flex-col gap-2 relative z-30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Question Search / Paste Input */}
              <div className="flex-1 min-w-[240px] relative">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-400">
                    <Link2 className="w-4 h-4 text-purple-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Paste question URL, Question ID (#1), or search title..."
                    value={pastedInput}
                    onChange={(e) => handlePasteOrSearchInput(e.target.value)}
                    onFocus={() => setIsQuestionDropdownOpen(true)}
                    className="w-full pl-9 pr-24 py-1.5 bg-surface-950 border border-surface-700 focus:border-purple-500 rounded-xl text-xs text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
                  />
                  <button
                    onClick={() => setIsBankModalOpen(true)}
                    className="absolute inset-y-1 right-1 px-2.5 bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white rounded-lg text-[11px] font-medium border border-surface-700 flex items-center gap-1 transition-colors"
                  >
                    <BookOpen className="w-3 h-3 text-purple-400" />
                    <span>Browse Bank</span>
                  </button>
                </div>

                {/* Inline Quick Search Dropdown with backdrop */}
                {isQuestionDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsQuestionDropdownOpen(false)}
                    />
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-900 border border-surface-750 rounded-xl shadow-2xl overflow-hidden z-50 max-h-64 flex flex-col">
                      <div className="p-2 border-b border-surface-800 bg-surface-950">
                        <input
                          type="text"
                          placeholder="Filter questions..."
                          value={questionSearch}
                          onChange={(e) => setQuestionSearch(e.target.value)}
                          className="w-full px-2.5 py-1 bg-surface-900 border border-surface-700 rounded-lg text-xs text-white placeholder-surface-500 focus:outline-none"
                          autoFocus
                        />
                      </div>
                      <div className="overflow-y-auto divide-y divide-surface-800">
                        {filteredQuestions.length > 0 ? (
                          filteredQuestions.map((q) => (
                            <div
                              key={q.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectQuestion(q);
                              }}
                              onClick={() => handleSelectQuestion(q)}
                              className="p-2.5 hover:bg-surface-800/80 cursor-pointer flex items-center justify-between group transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-surface-400">#{q.id}</span>
                                <span className="text-xs font-medium text-white group-hover:text-purple-300">
                                  {q.title}
                                </span>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${
                                  q.difficulty === 'easy'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : q.difficulty === 'medium'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}
                              >
                                {q.difficulty}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-center text-xs text-surface-500">
                            No questions match your search.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons for Selected Question */}
              {selectedQuestion ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-surface-950 border border-surface-800 px-2 py-1 rounded-xl">
                    <span className="text-[11px] text-surface-400">Selected:</span>
                    <span className="text-xs font-semibold text-white truncate max-w-[140px]">{selectedQuestion.title}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded capitalize ${
                        selectedQuestion.difficulty === 'easy'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : selectedQuestion.difficulty === 'medium'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {selectedQuestion.difficulty}
                    </span>
                  </div>

                  <button
                    onClick={handleShareQuestionInChat}
                    className="flex items-center gap-1 px-2.5 py-1 bg-surface-800 hover:bg-surface-750 text-surface-200 hover:text-white rounded-xl text-xs font-medium border border-surface-700 transition-colors"
                    title="Share as an interactive question card in the candidate chat"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                    <span>Share in Chat</span>
                  </button>

                  <button
                    onClick={handlePushQuestionToCandidate}
                    className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-500/20 transition-all"
                    title="Instantly opens this problem in candidate's Monaco editor and enters coding mode"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                    <span>Push to Candidate Screen</span>
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-surface-500 italic flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span>Paste a link/ID or browse bank to assign.</span>
                </div>
              )}
            </div>
          </div>

          {/* Code Mirror Toolbar */}
          <div className="flex-none px-4 py-1.5 bg-surface-850 border-b border-surface-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-white">Live Candidate Code Mirror</span>
              </div>

              {isCandidateTyping ? (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Candidate is typing...</span>
                </div>
              ) : (
                lastCodeUpdate && (
                  <span className="text-[11px] text-surface-400">
                    Last keystroke: {lastCodeUpdate}
                  </span>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-surface-400 bg-surface-950 px-2.5 py-0.5 rounded border border-surface-800 font-mono">
                Read-Only Mirror
              </span>
            </div>
          </div>

          {/* Monaco Editor (Candidate's code live) */}
          <div className="flex-1 relative overflow-hidden bg-[#1e1e1e]">
            <Editor
              height="100%"
              language={liveLanguage}
              theme="vs-dark"
              value={liveCode}
              options={{
                readOnly: true,
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                renderLineHighlight: 'all',
              }}
            />
          </div>

          {/* Bottom Pane: Live Execution Notification Stream */}
          <div className="flex-none bg-surface-950 border-t border-surface-800 p-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-surface-400" />
                <span className="font-semibold text-surface-300">Live Execution Status</span>
              </div>
              {lastExecution && (
                <span className="text-[11px] text-surface-500">
                  Last run at {lastExecution.timestamp}
                </span>
              )}
            </div>

            {lastExecution ? (
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                  lastExecution.isError
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {lastExecution.isError ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>Candidate ran code: <strong>{lastExecution.status}</strong></span>
                </div>
                {lastExecution.executionTime && (
                  <span className="text-[11px] font-mono text-surface-400">
                    {lastExecution.executionTime}s
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs text-surface-500 italic">
                Execution status will appear here when the candidate clicks "Run Code".
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ─── SNAPSHOTS INSPECTOR DRAWER ─── */}
      {showSnapshotsDrawer && (
        <div className="absolute inset-y-0 right-0 w-full sm:w-[480px] bg-surface-900 border-l border-surface-750 shadow-2xl flex flex-col z-50 animate-slide-in-right">
          <div className="p-4 border-b border-surface-800 flex items-center justify-between bg-surface-950">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-primary-400" />
              <h3 className="font-semibold text-sm text-white">Submitted Code Snapshots</h3>
            </div>
            <button
              onClick={() => {
                setShowSnapshotsDrawer(false);
                setActiveSnapshotView(null);
              }}
              className="text-surface-400 hover:text-white text-xs px-2 py-1 rounded bg-surface-800"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {snapshots.length === 0 ? (
              <div className="text-center py-12 text-surface-500 text-xs">
                No snapshots submitted yet. When candidate clicks "Submit Code", snapshots will appear here.
              </div>
            ) : (
              snapshots.map((snap) => (
                <div
                  key={snap.id}
                  onClick={() => setActiveSnapshotView(snap)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeSnapshotView?.id === snap.id
                      ? 'bg-surface-800 border-purple-500'
                      : 'bg-surface-950 border-surface-800 hover:border-surface-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-white">Snapshot #{snap.id}</span>
                    <span className="text-surface-400 font-mono text-[11px]">
                      {new Date(snap.submittedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-surface-400">
                    <span className="bg-surface-800 px-1.5 py-0.5 rounded text-surface-300">
                      {snap.language}
                    </span>
                    <span>Question #{snap.questionId}</span>
                  </div>
                </div>
              ))
            )}

            {/* Snapshot Code Preview */}
            {activeSnapshotView && (
              <div className="mt-4 p-3 bg-surface-950 rounded-xl border border-surface-800 flex flex-col">
                <div className="text-xs font-semibold text-surface-300 mb-2 flex items-center justify-between">
                  <span>Code Preview (#{activeSnapshotView.id})</span>
                  <span className="text-[11px] text-surface-500">{activeSnapshotView.language}</span>
                </div>
                <pre className="text-xs font-mono text-surface-200 bg-surface-900 p-3 rounded-lg overflow-x-auto max-h-64 whitespace-pre">
                  {activeSnapshotView.sourceCode}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── QUESTION BANK MODAL ─── */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-900 border border-surface-750 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-surface-800 flex items-center justify-between bg-surface-950">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white">Select Question from Bank</h3>
                  <p className="text-[11px] text-surface-400">Pick a problem to load and push to candidate</p>
                </div>
              </div>
              <button
                onClick={() => setIsBankModalOpen(false)}
                className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search & Difficulty Filter Bar */}
            <div className="p-3 border-b border-surface-800 bg-surface-850 flex flex-wrap items-center justify-between gap-2">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="w-3.5 h-3.5 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search questions by title or tag..."
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-surface-950 border border-surface-700 rounded-xl text-xs text-white placeholder-surface-500 focus:outline-none focus:border-purple-500"
                  autoFocus
                />
              </div>

              {/* Difficulty Filters */}
              <div className="flex items-center gap-1 bg-surface-950 p-1 rounded-xl border border-surface-750 text-xs">
                {(['all', 'easy', 'medium', 'hard'] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setDifficultyFilter(diff)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium capitalize transition-colors ${
                      difficultyFilter === diff
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-surface-400 hover:text-white hover:bg-surface-800'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            {/* Questions List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredQuestions.length === 0 ? (
                <div className="text-center py-12 text-surface-500 text-xs">
                  No questions found matching your filter.
                </div>
              ) : (
                filteredQuestions.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => handleSelectQuestion(q)}
                    className="p-3 rounded-xl bg-surface-950/60 hover:bg-surface-800 border border-surface-800/60 hover:border-surface-700 cursor-pointer transition-all flex items-start justify-between gap-4 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-surface-400">#{q.id}</span>
                        <h4 className="text-xs font-semibold text-white group-hover:text-purple-300 truncate">
                          {q.title}
                        </h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${
                            q.difficulty === 'easy'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : q.difficulty === 'medium'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                      </div>
                      <p className="text-[11px] text-surface-400 line-clamp-2 leading-relaxed">
                        {q.statement.replace(/[#*`_]/g, '')}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="shrink-0 px-3 py-1 bg-surface-800 group-hover:bg-purple-600 text-surface-300 group-hover:text-white rounded-lg text-xs font-medium border border-surface-700 group-hover:border-purple-500 transition-colors"
                    >
                      Select
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
