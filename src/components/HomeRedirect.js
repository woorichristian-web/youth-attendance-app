import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// 로그인 후 기본 경로:
// - 제한 계정: /announcements
// - 관리자: /admin-home
// - 반사 교사: /teacher-home
export default function HomeRedirect() {
  const { currentUser, userProfile, isAdmin, isLimited, isTeacher } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  // 프로필이 아직 로드 안 됐으면 대기 (기본 /announcements 로 튕기지 않도록)
  if (!userProfile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-ink-muted text-sm">
        불러오는 중...
      </div>
    );
  }
  if (isLimited) return <Navigate to="/announcements" replace />;
  if (isAdmin) return <Navigate to="/admin-home" replace />;
  if (isTeacher) return <Navigate to="/teacher-home" replace />;
  return <Navigate to="/announcements" replace />;
}
