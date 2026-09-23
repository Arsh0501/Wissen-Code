import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import QuestionForm from './pages/admin/QuestionForm';
import AssessmentManager from './pages/admin/AssessmentManager';
import SubmissionsViewer from './pages/admin/SubmissionsViewer';
import CandidateReport from './pages/admin/CandidateReport';
import ExamDashboard from './pages/examinee/ExamDashboard';
import AssessmentView from './pages/examinee/AssessmentView';
import SubmissionResult from './pages/examinee/SubmissionResult';

function AppRoutes() {
  const { isLoggedIn, role } = useAuth();

  if (!isLoggedIn) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Admin Routes */}
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/questions/new" element={<QuestionForm />} />
      <Route path="/admin/questions/:id/edit" element={<QuestionForm />} />
      <Route path="/admin/assessments" element={<AssessmentManager />} />
      <Route path="/admin/submissions/:assessmentId" element={<SubmissionsViewer />} />
      <Route path="/admin/reports/:candidateName/:assessmentId" element={<CandidateReport />} />

      {/* Examinee Routes */}
      <Route path="/exam" element={<ExamDashboard />} />
      <Route path="/exam/:assessmentId" element={<AssessmentView />} />
      <Route path="/exam/:assessmentId/result" element={<SubmissionResult />} />

      {/* Default redirect */}
      <Route
        path="*"
        element={<Navigate to={role === 'admin' ? '/admin' : '/exam'} replace />}
      />
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
