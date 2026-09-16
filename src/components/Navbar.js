import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';
import useAnnouncementPush from '../hooks/useAnnouncementPush';

const ICONS = {
  '/teacher-home': '🏠',
  '/announcements': '📢',
  '/attendance': '✅',
  '/dashboard': '📊',
  '/students': '🙏',
  '/admin': '⚙️',
};

export default function Navbar() {
  const { currentUser, userProfile, logout, isAdmin, isLimited, isTeacher } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { permission, requestPermission } = useAnnouncementPush(userProfile, isAdmin);

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  }

  if (!currentUser) return null;

  // 부장 계정 특별 처리
  const LEADER_OVERRIDES = {
    'leader1@songrim.church': { name: '강현미', badge: '부장' },
    'leader2@songrim.church': { name: '전성배', badge: '부장' },
  };
  const override = LEADER_OVERRIDES[currentUser.email];
  const displayName = override?.name || userProfile?.name || currentUser.email;
  const displayBadge = override?.badge || (isAdmin ? '관리자' : '교사');

  const navLinks = isLimited
    ? [
        { to: '/announcements', label: '공지 · 알림' },
        { to: '/students', label: '사역팀' },
      ]
    : (isTeacher && !isAdmin)
    ? [
        { to: '/teacher-home', label: '홈' },
        { to: '/announcements', label: '공지·알림' },
        { to: '/students', label: '사역팀' },
      ]
    : [
        { to: '/announcements', label: '공지·알림' },
        { to: '/attendance', label: '출석 체크' },
        { to: '/dashboard', label: '출석 현황' },
        { to: '/students', label: '사역팀' },
        ...(isAdmin ? [{ to: '/admin', label: '관리자' }] : []),
      ];

  const isActive = (to) => location.pathname.startsWith(to);

  return (
    <>
      {/* 상단 바 */}
      <nav className="bg-white/70 backdrop-blur-lg border-b border-white/60 text-ink sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="font-bold text-lg tracking-tight">
              송림청소년부
            </Link>

            {/* 데스크탑 nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(link.to)
                      ? 'bg-ocean-400 text-white shadow-sm'
                      : 'text-ink-soft hover:bg-ocean-100'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="ml-4 flex items-center gap-2 text-sm text-ink-soft">
                <NotificationBell />
                {permission !== 'granted' && permission !== 'unsupported' && permission !== 'denied' && (
                  <button
                    onClick={requestPermission}
                    className="text-xs px-2 py-1 bg-yellow-400 text-yellow-900 rounded-lg hover:bg-yellow-500 font-medium"
                    title="새 알림을 푸시로 받기"
                  >
                    알림 켜기
                  </button>
                )}
                <span>{displayName}</span>
                <span className="bg-ocean-100 text-ocean-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {displayBadge}
                </span>
                <button
                  onClick={handleLogout}
                  className="ml-2 px-3 py-1 bg-ocean-400 rounded-full hover:bg-ocean-500 text-white text-xs font-medium shadow-sm"
                >
                  로그아웃
                </button>
              </div>
            </div>

            {/* 모바일: 알림 벨 + 사용자 배지 */}
            <div className="md:hidden flex items-center gap-2">
              <NotificationBell />
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ocean-100 text-ocean-700 text-xs font-semibold"
                onClick={() => setUserMenuOpen((o) => !o)}
              >
                {displayName}
                <span className="opacity-70">▾</span>
              </button>
            </div>
          </div>

          {/* 모바일 사용자 드롭다운 */}
          {userMenuOpen && (
            <div className="md:hidden pb-3 border-t border-ocean-100 mt-1 pt-2 space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-sm text-ink-soft">
                  {displayName}{' '}
                  <span className="bg-ocean-100 text-ocean-700 px-2 py-0.5 rounded-full text-xs font-semibold ml-1">
                    {displayBadge}
                  </span>
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 bg-ocean-400 rounded-full hover:bg-ocean-500 text-white text-xs font-medium shadow-sm"
                >
                  로그아웃
                </button>
              </div>
              {permission !== 'granted' && permission !== 'unsupported' && permission !== 'denied' && (
                <button
                  onClick={requestPermission}
                  className="w-full px-3 py-2 bg-yellow-400 text-yellow-900 rounded-lg text-sm font-medium"
                >
                  푸시 알림 켜기
                </button>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* 모바일 하단 고정 탭바 */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-lg border-t border-white/60 shadow-[0_-4px_16px_-8px_rgba(15,79,181,0.15)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch justify-around">
          {navLinks.map((link) => {
            const active = isActive(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex-1 flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors ${
                  active ? 'text-ocean-600' : 'text-ink-muted'
                }`}
              >
                <span
                  className={`text-lg mb-0.5 leading-none ${
                    active ? 'scale-110' : ''
                  }`}
                >
                  {ICONS[link.to] || '•'}
                </span>
                <span className="truncate max-w-[64px]">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 하단 탭바에 가려지지 않도록 모바일에서 페이지 하단 여백 */}
      <div className="md:hidden h-16" aria-hidden="true" />
    </>
  );
}
