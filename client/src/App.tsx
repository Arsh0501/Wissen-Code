import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import AssessmentDashboard from './pages/admin/AssessmentDashboard';
import QuestionBank from './pages/admin/QuestionBank';
import DashboardPage from './pages/DashboardPage';
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
        <Route path="/" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Admin feature pages */}
      <Route path="/admin" element={<RequireAuth><RequireAdmin><AssessmentDashboard /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/questions" element={<RequireAuth><RequireAdmin><QuestionBank /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/questions/new" element={<RequireAuth><RequireAdmin><QuestionForm /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/questions/:id/edit" element={<RequireAuth><RequireAdmin><QuestionForm /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/assessments" element={<RequireAuth><RequireAdmin><AssessmentManager /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/assessments/new" element={<RequireAuth><RequireAdmin><AssessmentForm /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/assessments/:id/edit" element={<RequireAuth><RequireAdmin><AssessmentForm /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/submissions/:assessmentId" element={<RequireAuth><RequireAdmin><SubmissionsViewer /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/reports/:candidateName/:assessmentId" element={<RequireAuth><RequireAdmin><CandidateReport /></RequireAdmin></RequireAuth>} />

      {/* Examinee feature pages */}
      <Route path="/exam" element={<RequireAuth><ExamDashboard /></RequireAuth>} />
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


