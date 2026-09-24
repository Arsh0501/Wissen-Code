import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/admin/AdminDashboard';
import QuestionForm from './pages/admin/QuestionForm';
import AssessmentManager from './pages/admin/AssessmentManager';
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

      {/* Admin feature pages (own header/layout, kept as-is) */}
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/questions/new"
        element={
          <RequireAuth>
            <RequireAdmin>
              <QuestionForm />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/questions/:id/edit"
        element={
          <RequireAuth>
            <RequireAdmin>
              <QuestionForm />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/assessments"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AssessmentManager />
            </RequireAdmin>
          </RequireAuth>
        }
      />

      {/* Examinee feature pages (own header/layout, kept as-is) */}
      <Route
        path="/exam"
        element={
          <RequireAuth>
            <ExamDashboard />
          </RequireAuth>
        }
      />
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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

