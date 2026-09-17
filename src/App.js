import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import AttendancePage from './pages/AttendancePage';
import DashboardPage from './pages/DashboardPage';
import StudentDashboardPage from './pages/StudentDashboardPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import AdminPage from './pages/AdminPage';
import RegisterStudentPage from './pages/RegisterStudentPage';
import MyClassStudentsPage from './pages/MyClassStudentsPage';
import TeacherHomePage from './pages/TeacherHomePage';
import TeacherMyPage from './pages/TeacherMyPage';
import AdminAppPage from './pages/AdminAppPage';
import RetreatApplyPage from './pages/RetreatApplyPage';
import RetreatResultsPage from './pages/RetreatResultsPage';
import HomeRedirect from './components/HomeRedirect';

// 관리자 로그인 상태에서는 페이지 전환 중에도 body 배경을 항상 아이보리로 유지
// (페이지별 useEffect로 처리하면 라우트 전환 순간 교사용 파란 배경이 잠깐 보이는 문제가 있음)
function AdminBodyTheme() {
  const { currentUser, isAdmin } = useAuth();
  useEffect(() => {
    if (currentUser && isAdmin) {
      document.body.style.backgroundImage = 'none';
      document.body.style.backgroundColor = '#f8f7f4';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundColor = '';
    }
  }, [currentUser, isAdmin]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen">
          <AdminBodyTheme />
          <Navbar />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/attendance"
              element={
                <ProtectedRoute path="/attendance">
                  <AttendancePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute path="/dashboard">
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/students"
              element={
                <ProtectedRoute path="/students">
                  <StudentDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/announcements"
              element={
                <ProtectedRoute path="/announcements">
                  <AnnouncementsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/register-student"
              element={
                <ProtectedRoute path="/register-student">
                  <RegisterStudentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-class"
              element={
                <ProtectedRoute path="/my-class">
                  <MyClassStudentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly={true}>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher-home"
              element={
                <ProtectedRoute path="/teacher-home">
                  <TeacherHomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-page"
              element={
                <ProtectedRoute path="/my-page">
                  <TeacherMyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin-home"
              element={
                <ProtectedRoute adminOnly={true}>
                  <AdminAppPage />
                </ProtectedRoute>
              }
            />
            {/* 배포용 수련회 신청서 — 로그인 없이 접속 (링크 공유용) */}
            <Route path="/retreat-apply/:formId" element={<RetreatApplyPage />} />
            <Route
              path="/retreat-results/:retreatId"
              element={
                <ProtectedRoute adminOnly={true}>
                  <RetreatResultsPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}
