import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Play,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  User,
  Star,
  ExternalLink,
  Award,
  Video,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiData, workflowKeys } from '../../services/workflows';
import { apiError } from '../../services/api';
import { Spinner } from '../../components/ui';
import ResumeDialog from '../../components/interview/ResumeDialog';
import QuestionPreparation from '../../components/interview/QuestionPreparation';
import InterviewFeedbackReportDownload from '../../components/interview/InterviewFeedbackReportDownload';

export interface AssignedInterview {
  id: number;
  title: string;
  description?: string;
  candidateName: string;
  candidateEmail: string;
  candidateResume?: string | null;
  candidateResumeUrl?: string | null;
  status: string;
  timeLimitMinutes: number;
  extendedMinutes: number;
  roomToken: string;
  scheduledAt: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  finalFeedback?: string | null;
  finalRating?: number | null;
  finalRecommendation?: string | null;
  questions?: {
    questionId: number;
    orderIndex: number;
    status: string;
    question: { id: number; title: string; difficulty: string };
  }[];
  _count?: {
    questions: number;
    submissions: number;
    notes: number;
  };
}

export interface GeneratedQuestion {
  title: string;
  statement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  keyDiscussionPoints: string[];
  expectedSolution?: string;
}

export default function InterviewerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();

  // Selected tab: all | live | upcoming | completed
  const [tab, setTab] = useState<'all' | 'live' | 'upcoming' | 'completed'>('all');
  const [search, setSearch] = useState('');

  // Modals state
  const [selectedInterview, setSelectedInterview] = useState<AssignedInterview | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);


  // Fetch interviews assigned to this interviewer
  const interviewsQuery = useQuery({
    queryKey: ['interviewer-interviews', user?.id],
    queryFn: () => apiData<AssignedInterview[]>('/interviews'),
    refetchInterval: 15000,
  });

  const interviews = interviewsQuery.data ?? [];

  // Start interview mutation
  const startMutation = useMutation({
    mutationFn: (id: number) => apiData(`/interviews/${id}/start`, 'post', {}),
    onSuccess: async (_data, id) => {
      await client.invalidateQueries({ queryKey: ['interviewer-interviews', user?.id] });
      await client.invalidateQueries({ queryKey: workflowKeys.interviews });
      navigate(`/admin/interviews/${id}?tab=live`);
    },
  });

  // Assigned interviewers can extend an interview while it is in progress.
  const extendMutation = useMutation({
    mutationFn: (id: number) => apiData(`/interviews/${id}/extend`, 'post', { extensionMinutes: 15 }),
    onSuccess: async (_result, id) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['interviewer-interviews', user?.id] }),
        client.invalidateQueries({ queryKey: workflowKeys.interviews }),
        client.invalidateQueries({ queryKey: ['interview', id] }),
      ]);
    },
  });

  // Calculate schedule timing window helper
  const getStartWindowInfo = (scheduledAt: string | null, durationMinutes: number) => {
    if (!scheduledAt) return { canStart: true, reason: 'Immediate / on-demand interview' };
    const now = Date.now();
    const scheduledTime = new Date(scheduledAt).getTime();
    const earliestStart = scheduledTime - 15 * 60 * 1000;
    const latestStart = scheduledTime + durationMinutes * 60 * 1000;

    if (now < earliestStart) {
      const minsRemaining = Math.ceil((earliestStart - now) / 60000);
      const hours = Math.floor(minsRemaining / 60);
      const mins = minsRemaining % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return {
        canStart: false,
        reason: `Opens 15m before start (in ${timeStr})`,
        isEarly: true,
      };
    }
    if (now >= latestStart) {
      return {
        canStart: false,
                        reason: 'Ended — the interviewer did not start within the scheduled duration.',
        isExpired: true,
      };
    }
    return { canStart: true, reason: 'Ready to start' };
  };

  // Filter interviews
  const liveInterviews = interviews.filter((i) => i.status === 'in_progress');
  const upcomingInterviews = interviews.filter((i) => i.status === 'scheduled');
  const completedInterviews = interviews.filter((i) => i.status === 'completed');

  const visibleInterviews = interviews
    .filter((i) => {
      if (tab === 'live') return i.status === 'in_progress';
      if (tab === 'upcoming') return i.status === 'scheduled';
      if (tab === 'completed') return i.status === 'completed';
      return true;
    })
    .filter((i) =>
      `${i.title} ${i.candidateName} ${i.candidateEmail}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card bg-gradient-to-r from-primary-950/60 via-surface-900 to-surface-900 border-primary-500/30 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge bg-primary-500/20 text-primary-400 border border-primary-500/30 text-xs px-2.5 py-1">
                Interviewer Workspace
              </span>
              <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1">
                Role: Interviewer
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {user?.name || 'Interviewer'}
            </h1>
            <p className="text-surface-400 text-sm mt-1">
              Manage your technical interviews, select available questions, and review live candidate evaluations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin/interviews" className="btn-outline text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              All Assigned Interviews
            </Link>
          </div>
        </div>
      </div>

      {/* Live Notice Banner if any interview is active */}
      {liveInterviews.length > 0 && (
        <div className="card bg-emerald-950/40 border-emerald-500/40 p-4 animate-pulse-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
            </span>
            <div>
              <h2 className="font-semibold text-emerald-300">
                You have {liveInterviews.length} live interview in progress!
              </h2>
              <p className="text-xs text-emerald-400/80">
                Candidate: {liveInterviews[0].candidateName} ({liveInterviews[0].title})
              </p>
            </div>
          </div>
          <Link
            to={`/admin/interviews/${liveInterviews[0].id}?tab=live`}
            className="btn-primary bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-emerald-900/40"
          >
            <Video className="w-4 h-4" />
            Enter Live Room
          </Link>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setTab('all')}
          className={`card p-4 text-left transition-all ${
            tab === 'all' ? 'ring-2 ring-primary-500 bg-surface-800/80' : 'hover:bg-surface-850'
          }`}
        >
          <div className="flex items-center justify-between text-surface-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-medium">All Interviews</span>
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-3xl font-bold text-white">{interviews.length}</span>
        </button>

        <button
          onClick={() => setTab('live')}
          className={`card p-4 text-left transition-all ${
            tab === 'live' ? 'ring-2 ring-emerald-500 bg-emerald-950/30' : 'hover:bg-surface-850'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Now
            </span>
            <Video className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-3xl font-bold text-emerald-400">{liveInterviews.length}</span>
        </button>

        <button
          onClick={() => setTab('upcoming')}
          className={`card p-4 text-left transition-all ${
            tab === 'upcoming' ? 'ring-2 ring-blue-500 bg-blue-950/30' : 'hover:bg-surface-850'
          }`}
        >
          <div className="flex items-center justify-between text-blue-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-medium">Upcoming</span>
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <span className="text-3xl font-bold text-blue-400">{upcomingInterviews.length}</span>
        </button>

        <button
          onClick={() => setTab('completed')}
          className={`card p-4 text-left transition-all ${
            tab === 'completed' ? 'ring-2 ring-purple-500 bg-purple-950/30' : 'hover:bg-surface-850'
          }`}
        >
          <div className="flex items-center justify-between text-purple-400 mb-2">
            <span className="text-xs uppercase tracking-wider font-medium">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-3xl font-bold text-purple-400">{completedInterviews.length}</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <input
          type="search"
          placeholder="Filter by candidate or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-full sm:max-w-md"
        />
        <div className="flex gap-2 self-start sm:self-auto">
          {(['all', 'live', 'upcoming', 'completed'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? 'bg-primary-500 text-white'
                  : 'bg-surface-800 text-surface-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Error alert if start failed */}
      {(startMutation.error || extendMutation.error) && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{apiError(startMutation.error || extendMutation.error)}</span>
        </div>
      )}

      {/* Main Interviews List */}
      {interviewsQuery.isLoading ? (
        <div className="py-12 flex justify-center">
          <Spinner label="Loading your assigned interviews…" />
        </div>
      ) : interviewsQuery.error ? (
        <div className="card text-center py-8 text-red-400">
          <p>{apiError(interviewsQuery.error)}</p>
          <button className="btn-outline mt-3 text-sm" onClick={() => interviewsQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : visibleInterviews.length === 0 ? (
        <div className="card text-center py-12 text-surface-400">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <h2 className="text-base font-medium text-white mb-1">No interviews found</h2>
          <p className="text-sm">
            {search
              ? 'No interviews match your search keyword.'
              : tab === 'live'
                ? 'No interviews are currently live.'
                : tab === 'upcoming'
                  ? 'No upcoming interviews scheduled.'
                  : tab === 'completed'
                    ? 'No completed interviews yet.'
                    : 'You have not been assigned to any interviews yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleInterviews.map((interview) => {
            const timing = getStartWindowInfo(interview.scheduledAt, interview.timeLimitMinutes);
            const isLive = interview.status === 'in_progress';
            const isCompleted = interview.status === 'completed';
            const isScheduled = interview.status === 'scheduled';

            return (
              <div
                key={interview.id}
                className={`card min-w-0 w-full max-w-full p-4 sm:p-5 transition-all border ${
                  isLive
                    ? 'border-emerald-500/40 bg-emerald-950/10'
                    : isCompleted
                      ? 'border-surface-800 bg-surface-900/60'
                      : 'border-surface-700/60 hover:border-surface-600'
                }`}
              >
                <div className="flex min-w-0 flex-col gap-4">
                  {/* Left Column: Info */}
                  <div className="min-w-0 space-y-2">
                    {interview.status === 'expired' && <p className="text-sm text-surface-400">The scheduled duration passed without the interviewer starting this interview.</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="min-w-0 break-words [overflow-wrap:anywhere] text-lg font-semibold text-white">{interview.title}</h2>
                      {isLive && (
                        <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5 flex items-center gap-1 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          LIVE NOW
                        </span>
                      )}
                      {isScheduled && (
                        <span className="badge bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs px-2 py-0.5">
                          Scheduled
                        </span>
                      )}
                      {isCompleted && (
                        <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs px-2 py-0.5">
                          Completed
                        </span>
                      )}
                      {interview.status === 'expired' && <span className="badge bg-surface-800 text-surface-400">Ended — not started</span>}
                      {interview.extendedMinutes > 0 && (
                        <span className="badge bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs px-2 py-0.5">
                          +{interview.extendedMinutes}m Extended
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-surface-400">
                      <span className="flex min-w-0 max-w-full items-start gap-1.5 text-surface-300">
                        <User className="w-3.5 h-3.5 shrink-0 text-primary-400" />
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]"><strong className="text-white">{interview.candidateName}</strong> ({interview.candidateEmail})</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {interview.timeLimitMinutes} mins
                      </span>
                      {interview.scheduledAt && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(interview.scheduledAt).toLocaleString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        {interview.questions?.length ?? interview._count?.questions ?? 0} Questions
                      </span>
                    </div>

                    {/* Timing note for scheduled interviews */}
                    {isScheduled && (
                      <div className="flex items-center gap-2 text-xs mt-1">
                        {timing.canStart ? (
                          <span className="text-emerald-400 flex items-center gap-1 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Proper start window active — Ready to start
                          </span>
                        ) : (
                          <span className="text-amber-400/90 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {timing.reason}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Final feedback summary if completed */}
                    {isCompleted && interview.finalRating && (
                      <div className="flex min-w-0 flex-wrap items-center gap-3 mt-2 text-xs bg-surface-800/80 p-2.5 rounded-lg border border-surface-700/50">
                        <div className="flex items-center text-amber-400 gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-3.5 h-3.5 ${
                                star <= (interview.finalRating || 0)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-surface-600'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="font-semibold text-white">
                          Rating: {interview.finalRating}/5
                        </span>
                        {interview.finalRecommendation && (
                          <span className="badge bg-primary-500/20 text-primary-300 border border-primary-500/30 px-2 py-0.5">
                            {interview.finalRecommendation}
                          </span>
                        )}
                        {interview.finalFeedback && (
                          <span className="text-surface-400 truncate max-w-xs">
                            "{interview.finalFeedback}"
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto border-t border-surface-800 pt-4 pb-2 [&>button]:shrink-0 [&>button]:whitespace-nowrap [&>a]:shrink-0 [&>a]:whitespace-nowrap" role="region" aria-label="Interview actions" tabIndex={0}>
                    {isCompleted && <InterviewFeedbackReportDownload interviewId={interview.id} submitted={!!interview.finalFeedback} completed compact />}
                    {/* View Resume Button */}
                    {(interview.candidateResume || interview.candidateResumeUrl) && (
                      <button
                        onClick={() => {
                          setSelectedInterview(interview);
                          setShowResumeModal(true);
                        }}
                        className="btn-outline text-xs px-3 py-2 flex items-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5 text-primary-400" />
                        View Resume
                      </button>
                    )}

                    {/* AI Resume Questions Generator */}
                    <button
                      disabled={!isScheduled && !isLive}
                      title={!isScheduled && !isLive ? 'Question preparation is disabled after the interview ends.' : 'Prepare interview questions'}
                      onClick={() => {
                        setSelectedInterview(interview);
                        setShowQuestionsModal(true);
                      }}
                      className="btn-outline text-xs px-3 py-2 flex items-center gap-1.5 border-purple-500/30 text-purple-300 hover:bg-purple-950/30"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      Select questions
                    </button>


                    {/* Scheduled: Start Interview */}
                    {isScheduled && (
                      <button
                        onClick={() => startMutation.mutate(interview.id)}
                        disabled={!timing.canStart || startMutation.isPending}
                        title={timing.canStart ? 'Start this interview' : timing.reason}
                        className={`btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 ${
                          !timing.canStart
                            ? 'opacity-50 cursor-not-allowed bg-surface-700 text-surface-400'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {startMutation.isPending ? 'Starting…' : 'Start Interview'}
                      </button>
                    )}

                    {/* Live Room Link */}
                    {isLive && <button className="btn-outline text-xs text-amber-400" disabled={extendMutation.isPending} onClick={() => extendMutation.mutate(interview.id)}>
                      {extendMutation.isPending ? 'Extending…' : '+15m Extend duration'}
                    </button>}
                    {isLive && (
                      <Link
                        to={`/admin/interviews/${interview.id}?tab=live`}
                        className="btn-primary bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3.5 py-2 flex items-center gap-1.5"
                      >
                        <Video className="w-3.5 h-3.5" />
                        Join Live Room
                      </Link>
                    )}

                    {(isLive || isCompleted) && <Link
                      to={`/admin/interviews/${interview.id}?tab=feedback`}
                      className="btn-outline text-xs px-3 py-2 flex items-center gap-1.5"
                    >
                      <Award className="w-3.5 h-3.5 text-amber-400" />
                      {isCompleted ? interview.finalFeedback ? 'Edit Feedback' : 'Submit Feedback' : 'Feedback'}
                    </Link>}

                    {/* Open Full Workspace */}
                    <Link
                      to={`/admin/interviews/${interview.id}`}
                      className="btn-ghost text-xs px-2.5 py-2 text-surface-400 hover:text-white flex items-center gap-1.5"
                      title="Open full workspace"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open workspace
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showQuestionsModal && selectedInterview && <QuestionPreparation
        key={selectedInterview.id}
        interviewId={selectedInterview.id}
        onClose={() => setShowQuestionsModal(false)}
      />}
      {showResumeModal && selectedInterview && <ResumeDialog
        interview={selectedInterview}
        onClose={() => setShowResumeModal(false)}
        backLabel={showQuestionsModal ? 'Back to questions' : 'Back to interviews'}
      />}


    </div>
  );
}
