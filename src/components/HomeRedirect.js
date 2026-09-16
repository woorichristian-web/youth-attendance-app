import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// 로그인 후 기본 경로:
// - 제한 계정: /announcements
// - 관리자: /attendance (기존 워크플로 유지)
// - 반사 교사: /teacher-home (새 통합 홈)
export default function HomeRedirect() {
  const { currentUser, userProfile, isAdmin, isLimited, isTeacher } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (isLimited) return <Navigate to="/announcements" replace />;
  if (isTeacher && !isAdmin) return <Navigate to="/teacher-home" replace />;
  return <Navigate to="/attendance" replace />;
}
