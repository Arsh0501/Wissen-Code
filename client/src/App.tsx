import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import AssessmentDashboard from './pages/admin/AssessmentDashboard';
import QuestionBank from './pages/admin/QuestionBank';

import ProfilePage from './pages/ProfilePage';
import QuestionForm from './pages/admin/QuestionForm';
import AssessmentManager from './pages/admin/AssessmentManager';
import AssessmentForm from './pages/admin/AssessmentForm';
import SubmissionsViewer from './pages/admin/SubmissionsViewer';
import CandidateReport from './pages/admin/CandidateReport';
import ExamDashboard from './pages/examinee/ExamDashboard';
import AssessmentView from './pages/examinee/AssessmentView';
import SubmissionResult from './pages/examinee/SubmissionResult';

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
        <Route path="/admin/questions/:id/edit" element={<RequireAdmin><QuestionForm /></RequireAdmin>} />
        <Route path="/admin/assessments" element={<RequireAdmin><AssessmentManager /></RequireAdmin>} />
        <Route path="/admin/assessments/new" element={<RequireAdmin><AssessmentForm /></RequireAdmin>} />
        <Route path="/admin/assessments/:id/edit" element={<RequireAdmin><AssessmentForm /></RequireAdmin>} />
        <Route path="/admin/submissions/:assessmentId" element={<RequireAdmin><SubmissionsViewer /></RequireAdmin>} />
        <Route path="/admin/reports/:candidateName/:assessmentId" element={<RequireAdmin><CandidateReport /></RequireAdmin>} />
      </Route>

      {/* Examinee full-screen feature pages */}
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


