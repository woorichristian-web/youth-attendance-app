import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
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
import HomeRedirect from './components/HomeRedirect';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen">
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
            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}
