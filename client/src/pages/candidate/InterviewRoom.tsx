import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  validateInterviewToken,
  startInterviewSession,
  submitInterviewCode,
  saveInterviewDraft,
  getInterviewDraft,
  getQuestion,
  getInterviewQuestion,
  type InterviewSessionData,
} from '../../services/api';
import CodingWorkspace from '../../components/CodingWorkspace';
import InterviewChat, { type ChatMessage } from '../../components/interview/InterviewChat';
import type { Question } from '../../types';
import type { RunCodeResponse } from '../../services/api';
import {
  Code2, MessageSquare, Clock, Video, AlertTriangle, CheckCircle, WifiOff,
  Sparkles, ExternalLink, Eye, Monitor, CheckCircle2, ChevronRight
} from 'lucide-react';

export default function InterviewRoom() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  // Session State
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<InterviewSessionData | null>(null);

  // Chat State
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Coding State
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [savedCode, setSavedCode] = useState<string>('');
  const activeQuestionIdRef = useRef<number | null>(null);

  // Socket.IO State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [interviewerDisconnected, setInterviewerDisconnected] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);

  // Timer State (Soft Countdown — Never Auto-Submits)
  const [timeLeft, setTimeLeft] = useState<number>(3600);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Unified State Resync Path (used on initial load and upon socket reconnect)
  // ─────────────────────────────────────────────────────────────────────────
  const resyncSessionState = useCallback(
    async (sessionId: number, currentQuestionId: number | null) => {
      if (!currentQuestionId) return;

      try {
        let questionData: Question;
        try {
          questionData = await getInterviewQuestion(sessionId, currentQuestionId);
        } catch {
          questionData = await getQuestion(currentQuestionId);
        }
        setActiveQuestion(questionData);
        activeQuestionIdRef.current = currentQuestionId;

        // Fetch candidate's saved draft for this question if any
        const draftRes = await getInterviewDraft(sessionId, currentQuestionId);
        if (draftRes?.draft?.code) {
          setSavedCode(draftRes.draft.code);
        } else {
          setSavedCode('');
        }
      } catch (err) {
        console.error('[InterviewRoom] Failed to resync question state:', err);
      }
    },
    []
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Token Validation & Initialization
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setSessionError('No interview token provided.');
      setLoading(false);
      return;
    }

    async function initInterview() {
      try {
        setLoading(true);
        const data = await validateInterviewToken(token!);
        if (!data.valid || !data.session) {
          setSessionError('This interview link is invalid or has expired.');
          setLoading(false);
          return;
        }

        // Persist session JWT authToken for judge/code-execution API calls
        if (data.authToken) {
          localStorage.setItem('wissen-token', data.authToken);
        }

        const sess = data.session;
        setSession(sess);

        // Mark active if waiting
        if (sess.status === 'waiting') {
          startInterviewSession(sess.id).catch(console.error);
        }

        // Initialize soft timer based on duration
        const durationSecs = (sess.durationMinutes || 60) * 60;
        if (sess.startedAt) {
          const elapsedSecs = Math.floor((Date.now() - new Date(sess.startedAt).getTime()) / 1000);
          setTimeLeft(Math.max(0, durationSecs - elapsedSecs));
        } else {
          setTimeLeft(durationSecs);
        }

        // If an active question was already set in session, resync it
        if (sess.currentQuestionId) {
          await resyncSessionState(sess.id, sess.currentQuestionId);
        }

        // Connect Socket.IO
        const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin;
        const newSocket = io(socketUrl, {
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
        });

        setSocket(newSocket);

        // Socket lifecycle
        newSocket.on('connect', () => {
          console.log('[InterviewRoom] Socket connected:', newSocket.id);
          setIsReconnecting(false);

          newSocket.emit('JOIN_INTERVIEW', {
            sessionId: sess.id,
            role: 'candidate',
            name: sess.candidateName,
          });

          newSocket.emit('INTERVIEW_STARTED', {
            sessionId: sess.id,
            candidateName: sess.candidateName,
          });
        });

        newSocket.on('disconnect', (reason) => {
          console.warn('[InterviewRoom] Socket disconnected:', reason);
          setIsReconnecting(true);
        });

        newSocket.on('reconnect', () => {
          console.log('[InterviewRoom] Socket reconnected!');
          setIsReconnecting(false);

          newSocket.emit('JOIN_INTERVIEW', {
            sessionId: sess.id,
            role: 'candidate',
            name: sess.candidateName,
          });

          newSocket.emit('CANDIDATE_RECONNECTED', {
            sessionId: sess.id,
            candidateName: sess.candidateName,
          });

          resyncSessionState(sess.id, activeQuestionIdRef.current);
        });

        // Authoritative trigger: QUESTION_OPENED by interviewer
        newSocket.on('QUESTION_OPENED', async (payload: { questionId: number; title: string; difficulty: string }) => {
          console.log('[InterviewRoom] QUESTION_OPENED received:', payload);
          await resyncSessionState(sess.id, payload.questionId);
        });

        // Chat messages
        newSocket.on('CHAT_MESSAGE', (msg: ChatMessage) => {
          setMessages((prev) => [...prev, msg]);
          if (msg.senderRole === 'interviewer' && !isChatDrawerOpen) {
            setUnreadChatCount((c) => c + 1);
          }
        });

        // Interview ended by interviewer
        newSocket.on('INTERVIEW_ENDED', () => {
          setInterviewEnded(true);
        });

        // Interviewer disconnect notification
        newSocket.on('PARTICIPANT_DISCONNECTED', (data: { role: string }) => {
          if (data.role === 'interviewer') {
            setInterviewerDisconnected(true);
          }
        });

        newSocket.on('PARTICIPANT_JOINED', (data: { role: string }) => {
          if (data.role === 'interviewer') {
            setInterviewerDisconnected(false);
          }
        });

        setLoading(false);
      } catch (err: any) {
        console.error('Failed to initialize interview session:', err);
        setSessionError('Could not load interview session. Please check your link.');
        setLoading(false);
      }
    }

    initInterview();

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [token, resyncSessionState]);

  // Clean up socket on unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  // Soft Timer countdown
  useEffect(() => {
    if (loading || sessionError || interviewEnded) return;

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [loading, sessionError, interviewEnded]);

  // ─────────────────────────────────────────────────────────────────────────
  // Candidate Actions & Event Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleCodeChange = (newCode: string) => {
    if (!session || !activeQuestion) return;

    saveInterviewDraft(session.id, {
      questionId: activeQuestion.id,
      code: newCode,
    }).catch(console.error);

    socket?.emit('CODE_CHANGED', {
      sessionId: session.id,
      questionId: activeQuestion.id,
      sourceCode: newCode,
    });
  };

  const handleRunExecuted = (result: RunCodeResponse, languageId: number) => {
    if (!session || !activeQuestion) return;

    socket?.emit('CODE_EXECUTED', {
      sessionId: session.id,
      questionId: activeQuestion.id,
      languageId,
      status: result.statusDescription,
      isError: result.isError,
      executionTime: result.executionTime,
    });
  };

  const handleSubmitSnapshot = async (sourceCode: string, languageId: number, languageName: string) => {
    if (!session || !activeQuestion) return;

    const res = await submitInterviewCode(session.id, {
      questionId: activeQuestion.id,
      language: languageName,
      sourceCode,
    });

    socket?.emit('CODE_SUBMITTED', {
      sessionId: session.id,
      questionId: activeQuestion.id,
      language: languageName,
      sourceCode,
      submittedAt: res.savedAt,
    });
  };

  const handleSendMessage = (text: string) => {
    if (!session || !socket) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId: session.id,
      sender: session.candidateName,
      senderRole: 'candidate',
      text,
      timestamp: timeStr,
      type: 'text',
    };

    socket.emit('CHAT_MESSAGE', msg);
  };

  const handleOpenQuestionCard = async (questionId: number) => {
    if (!session) return;
    await resyncSessionState(session.id, questionId);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold text-white">Entering Interview Room...</h2>
        <p className="text-xs text-surface-400 mt-1">Verifying your invitation token</p>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center py-10">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-500">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Unable to Join Interview</h2>
          <p className="text-sm text-surface-400 mb-6">{sessionError}</p>
          <button onClick={() => navigate('/')} className="btn-outline">
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (interviewEnded) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center py-10 animate-fade-in">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <CheckCircle className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Interview Completed</h2>
          <p className="text-sm text-surface-400 mb-6">
            Thank you, <span className="text-white font-medium">{session.candidateName}</span>. The interview session has concluded.
            Your code snapshots have been saved for review.
          </p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isTimeLow = timeLeft <= 300 && timeLeft > 0;

  return (
    <div className="h-screen flex flex-col bg-surface-950 overflow-hidden text-surface-100 select-none font-sans">
      {/* ─── TOP BAR ─── */}
      <header className="flex-none h-14 bg-surface-900 border-b border-surface-800 px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-md shadow-primary-600/20">
            <Code2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">WissenCode Interview</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-400 bg-purple-500/15 border border-purple-500/25 px-2 py-0.5 rounded-full">
                1-on-1 Live
              </span>
            </div>
          </div>
        </div>

        {/* Center: Interviewer Status & Question Title */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="text-surface-400">Interviewer:</span>
          <span className="font-semibold text-white">{session.interviewerName}</span>
          {activeQuestion && (
            <>
              <span className="text-surface-600">•</span>
              <span className="text-surface-300 font-medium truncate max-w-[200px]">{activeQuestion.title}</span>
            </>
          )}
        </div>

        {/* Right: Meeting Call Link, Timer, Test Link & Chat Drawer Toggle */}
        <div className="flex items-center gap-2.5">
          {/* External Teams / Meet Video Call Button */}
          {session.meetingUrl && (
            <a
              href={session.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20 transition-all hover:scale-[1.02]"
              title="Open the scheduled video call in a new tab"
            >
              <Video className="w-3.5 h-3.5 text-white" />
              <span>Join Teams/Meet Call</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
          )}

          {/* Soft Timer */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors ${
              isTimeLow ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30' : 'bg-surface-800 text-surface-300'
            }`}
            title="Interview time remaining"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTimer(timeLeft)}</span>
            {isTimeLow && <span className="text-[10px] uppercase font-sans text-amber-400 font-normal">Remaining</span>}
          </div>

          {/* Quick link to Interviewer View */}
          <a
            href={`/interview/${session.token}/interviewer`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-colors"
            title="Open Interviewer View in a new tab"
          >
            <span>Interviewer View</span>
            <ExternalLink className="w-3 h-3 text-purple-400" />
          </a>

          {/* Chat Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setIsChatDrawerOpen(!isChatDrawerOpen);
              if (!isChatDrawerOpen) setUnreadChatCount(0);
            }}
            className="relative p-2 rounded-lg bg-surface-800 hover:bg-surface-750 text-surface-300 hover:text-white border border-surface-700 transition-colors"
            title="Toggle Live Chat Drawer"
          >
            <MessageSquare className="w-4 h-4" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadChatCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ─── ALERT BANNERS ─── */}
      {isReconnecting && (
        <div className="flex-none bg-amber-500/90 text-surface-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-md animate-fade-in">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Connection lost. Reconnecting to interview session...</span>
        </div>
      )}

      {interviewerDisconnected && !isReconnecting && (
        <div className="flex-none bg-blue-500/20 border-b border-blue-500/30 text-blue-300 px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2">
          <Eye className="w-3.5 h-3.5 text-blue-400" />
          <span>Your interviewer disconnected. Waiting for them to rejoin...</span>
        </div>
      )}

      {/* ─── MAIN CONTENT AREA ─── */}
      <main className="flex-1 overflow-hidden relative">
        {activeQuestion ? (
          /* Fullscreen Coding Workspace */
          <div className="h-full relative overflow-hidden flex flex-col">
            <CodingWorkspace
              mode="interview"
              question={activeQuestion}
              initialCode={savedCode}
              onCodeChange={handleCodeChange}
              onSubmitSnapshot={handleSubmitSnapshot}
              onRunExecuted={handleRunExecuted}
            />

            {/* Collapsible Chat Side Drawer */}
            <InterviewChat
              messages={messages}
              currentUserName={session.candidateName}
              onSendMessage={handleSendMessage}
              onOpenQuestionCard={handleOpenQuestionCard}
              isDrawer={true}
              isOpen={isChatDrawerOpen}
              onCloseDrawer={() => setIsChatDrawerOpen(false)}
            />
          </div>
        ) : (
          /* Waiting / Pre-Problem Screen */
          <div className="h-full flex flex-col items-center justify-center p-6 max-w-2xl mx-auto">
            <div className="w-full bg-surface-900 border border-surface-800 rounded-3xl p-8 shadow-2xl text-center flex flex-col items-center animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white mb-5 shadow-lg shadow-purple-500/20">
                <Monitor className="w-8 h-8" />
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">
                Welcome to your Technical Interview
              </h1>
              <p className="text-surface-400 text-sm max-w-md mb-6">
                You are paired with <strong className="text-white">{session.interviewerName}</strong> for a {session.durationMinutes}-minute live technical session.
              </p>

              {/* External Video Meeting Card */}
              {session.meetingUrl ? (
                <div className="w-full p-4 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-left flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">External Video Call Ready</div>
                      <div className="text-xs text-surface-400">Join via Microsoft Teams or Google Meet</div>
                    </div>
                  </div>
                  <a
                    href={session.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all hover:scale-[1.02]"
                  >
                    <span>Open Video Call</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : null}

              {/* Instructions Steps */}
              <div className="w-full text-left bg-surface-950/60 border border-surface-800 rounded-2xl p-4 mb-6 space-y-3 text-xs text-surface-300">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-surface-800 border border-surface-700 text-primary-400 flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                  <span>Join the video meeting with your interviewer and share your screen when prompted.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-surface-800 border border-surface-700 text-primary-400 flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                  <span>Keep this browser tab open. As soon as your interviewer assigns a coding problem, your Monaco code editor will automatically appear here.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-surface-800 border border-surface-700 text-primary-400 flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                  <span>You can write and execute code in multiple languages with custom test inputs.</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-surface-400">
                  <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                  <span>Waiting for interviewer to share a problem...</span>
                </div>
                <button
                  onClick={() => setIsChatDrawerOpen(true)}
                  className="px-3 py-1.5 bg-surface-800 hover:bg-surface-750 text-surface-300 hover:text-white rounded-xl text-xs font-medium border border-surface-700 transition-colors flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-primary-400" />
                  <span>Open Chat</span>
                </button>
              </div>
            </div>

            {/* Collapsible Chat Side Drawer */}
            <InterviewChat
              messages={messages}
              currentUserName={session.candidateName}
              onSendMessage={handleSendMessage}
              onOpenQuestionCard={handleOpenQuestionCard}
              isDrawer={true}
              isOpen={isChatDrawerOpen}
              onCloseDrawer={() => setIsChatDrawerOpen(false)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
