import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import InvitePage from './pages/InvitePage';
import AssessmentDashboard from './pages/admin/AssessmentDashboard';
import QuestionBank from './pages/admin/QuestionBank';

import ProfilePage from './pages/ProfilePage';
import QuestionForm from './pages/admin/QuestionForm';
import AssessmentManager from './pages/admin/AssessmentManager';
import AssessmentForm from './pages/admin/AssessmentForm';
import AIQuestionStudio from './pages/admin/AIQuestionStudio';
import InterviewList from './pages/interviews/InterviewList';
import InterviewPlanner from './pages/interviews/InterviewPlanner';
import InterviewWorkspace from './pages/interviews/InterviewWorkspace';
import SubmissionsViewer from './pages/admin/SubmissionsViewer';
import CandidateReport from './pages/admin/CandidateReport';
import ExamDashboard from './pages/candidate/ExamDashboard';
import AssessmentView from './pages/candidate/AssessmentView';
import SubmissionResult from './pages/candidate/SubmissionResult';

function RequireAuth({ children }: { children: ReactElement }) {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: ReactElement }) {
  const { role } = useAuth();
  return role === 'admin' ? children : <Navigate to="/" replace />;
}

function RootDashboard() {
  const { role } = useAuth();
  return role === 'admin' ? <AssessmentDashboard /> : <ExamDashboard />;
}

function AppRoutes() {
  const { isLoggedIn } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isLoggedIn ? <Navigate to="/" replace /> : <LoginPage />} />
      {/* Public: anyone with a shared link can open it */}
      <Route path="/invite/:token" element={<InvitePage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<RootDashboard />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* Admin feature pages */}
        <Route path="/admin/questions" element={<RequireAdmin><QuestionBank /></RequireAdmin>} />
        <Route path="/admin/questions/new" element={<RequireAdmin><QuestionForm /></RequireAdmin>} />
        <Route path="/admin/questions/ai" element={<RequireAdmin><AIQuestionStudio /></RequireAdmin>} />
        <Route path="/admin/questions/:id/edit" element={<RequireAdmin><QuestionForm /></RequireAdmin>} />
        <Route path="/admin/assessments" element={<RequireAdmin><AssessmentManager /></RequireAdmin>} />
        <Route path="/admin/assessments/new" element={<RequireAdmin><AssessmentForm /></RequireAdmin>} />
        <Route path="/admin/assessments/:id/edit" element={<RequireAdmin><AssessmentForm /></RequireAdmin>} />
        <Route path="/admin/submissions/:assessmentId" element={<RequireAdmin><SubmissionsViewer /></RequireAdmin>} />
        <Route path="/admin/reports/:candidateName/:assessmentId" element={<RequireAdmin><CandidateReport /></RequireAdmin>} />
        <Route path="/admin/interviews" element={<RequireAdmin><InterviewList /></RequireAdmin>} />
        <Route path="/admin/interviews/new" element={<RequireAdmin><InterviewPlanner /></RequireAdmin>} />
        <Route path="/admin/interviews/:id" element={<RequireAdmin><InterviewWorkspace /></RequireAdmin>} />
      </Route>

      {/* Candidate full-screen feature pages */}
      <Route path="/exam/:assessmentId" element={<RequireAuth><AssessmentView /></RequireAuth>} />
      <Route path="/exam/:assessmentId/result" element={<RequireAuth><SubmissionResult /></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}


