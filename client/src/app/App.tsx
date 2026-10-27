import { lazy, Suspense } from 'react';
const TeamPage = lazy(() => import('../pages/admin/TeamPage'));
const AccountAction = lazy(() => import('../pages/auth/AccountAction'));
import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import AppShell from '../components/layout/AppShell';
const LandingPage = lazy(() => import('../pages/landing/LandingPage'));
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const InvitePage = lazy(() => import('../pages/auth/InvitePage'));
const AssessmentDashboard = lazy(() => import('../pages/admin/AssessmentDashboard'));
const QuestionBank = lazy(() => import('../pages/admin/QuestionBank'));

const AIQuestions = lazy(() => import('../pages/admin/AIQuestions'));
const InterviewQuestionSets = lazy(() => import('../pages/admin/InterviewQuestionSets'));
const InterviewsPage = lazy(() => import('../pages/admin/InterviewsPage'));
const InterviewWorkspace = lazy(() => import('../pages/admin/InterviewWorkspace'));
const CandidateInterview = lazy(() => import('../pages/candidate/CandidateInterview'));
const ProfilePage = lazy(() => import('../pages/account/ProfilePage'));
const QuestionForm = lazy(() => import('../pages/admin/QuestionForm'));
const AssessmentManager = lazy(() => import('../pages/admin/AssessmentManager'));
const AssessmentForm = lazy(() => import('../pages/admin/AssessmentForm'));
const SubmissionsViewer = lazy(() => import('../pages/admin/SubmissionsViewer'));
const CandidateReport = lazy(() => import('../pages/admin/CandidateReport'));
const ExamDashboard = lazy(() => import('../pages/candidate/ExamDashboard'));
const AssessmentView = lazy(() => import('../pages/candidate/AssessmentView'));
const SubmissionResult = lazy(() => import('../pages/candidate/SubmissionResult'));
const InterviewerDashboard = lazy(() => import('../pages/interviewer/InterviewerDashboard'));

function RequireAuth({ children }: { children: ReactElement }) {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: ReactElement }) {
  const { role } = useAuth();
  return role === 'admin' ? children : <Navigate to="/" replace />;
}

function RequireAdminOrInterviewer({ children }: { children: ReactElement }) {
  const { role, user } = useAuth();
  const isAllowed =
    role === 'admin' || role === 'interviewer' || user?.accessRole === 'interviewer';
  return isAllowed ? children : <Navigate to="/" replace />;
}

function RootDashboard() {
  const { role, user } = useAuth();
  if (role === 'interviewer' || user?.accessRole === 'interviewer') {
    return <InterviewerDashboard />;
  }
  return role === 'admin' ? <AssessmentDashboard /> : <ExamDashboard />;
}

function AppRoutes() {
  const { isLoggedIn } = useAuth();

  return (
    <Routes>
      <Route path="/" element={isLoggedIn ? <AppShell /> : <LandingPage />}>
        <Route index element={<RootDashboard />} />
      </Route>
      <Route path="/account/:action" element={<AccountAction />} />
      <Route path="/login" element={<LoginPage />} />
      {/* Public: anyone with a shared link can open it */}
      <Route path="/invite/:token" element={<InvitePage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route
          path="/admin/team"
          element={
            <RequireAdmin>
              <TeamPage />
            </RequireAdmin>
          }
        />
        {/* Admin feature pages */}
        <Route
          path="/admin/interview-question-sets"
          element={
            <RequireAdmin>
              <Navigate to="/admin/interviews/question-sets" replace />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/interviews/question-sets"
          element={
            <RequireAdmin>
              <InterviewQuestionSets />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/ai-questions"
          element={
            <RequireAdmin>
              <AIQuestions />
            </RequireAdmin>
          }
        />
        <Route
          path="/interviewer/dashboard"
          element={
            <RequireAdminOrInterviewer>
              <InterviewerDashboard />
            </RequireAdminOrInterviewer>
          }
        />
        <Route
          path="/admin/interviews"
          element={
            <RequireAdminOrInterviewer>
              <InterviewsPage />
            </RequireAdminOrInterviewer>
          }
        />
        <Route
          path="/admin/interviews/:id"
          element={
            <RequireAdminOrInterviewer>
              <InterviewWorkspace />
            </RequireAdminOrInterviewer>
          }
        />
        <Route
          path="/admin/questions"
          element={
            <RequireAdmin>
              <QuestionBank />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/questions/new"
          element={
            <RequireAdmin>
              <QuestionForm />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/questions/:id/edit"
          element={
            <RequireAdmin>
              <QuestionForm />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/assessments"
          element={
            <RequireAdmin>
              <AssessmentManager />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/assessments/new"
          element={
            <RequireAdmin>
              <AssessmentForm />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/assessments/:id/edit"
          element={
            <RequireAdmin>
              <AssessmentForm />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/submissions/:assessmentId"
          element={
            <RequireAdmin>
              <SubmissionsViewer />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/reports/:candidateName/:assessmentId"
          element={
            <RequireAdmin>
              <CandidateReport />
            </RequireAdmin>
          }
        />
      </Route>

      <Route path="/interview/:token" element={<CandidateInterview />} />
      {/* Candidate full-screen feature pages */}
      <Route
        path="/exam/:assessmentId"
        element={
          <RequireAuth>
            <AssessmentView />
          </RequireAuth>
        }
      />
      <Route
        path="/exam/:assessmentId/result"
        element={
          <RequireAuth>
            <SubmissionResult />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense
          fallback={
            <p role="status" className="p-8">
              Loading workspace…
            </p>
          }
        >
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
