import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const LIMITED_ALLOWED = new Set(['/announcements', '/students']);

export default function ProtectedRoute({ children, adminOnly = false, path = null }) {
  const { currentUser, userProfile, isLimited } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && userProfile?.role !== 'admin') {
    return <Navigate to={isLimited ? '/announcements' : '/'} replace />;
  }

  // 제한 계정 (praise/staff)은 허용된 경로만
  if (isLimited && path && !LIMITED_ALLOWED.has(path)) {
    return <Navigate to="/announcements" replace />;
  }

  return children;
}
