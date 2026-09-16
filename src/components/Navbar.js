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
        { to: '/announcements', label: '공지 · 알림', icon: '📢' },
        { to: '/students', label: '사역팀', icon: '🙏' },
      ]
    : isAdmin
    ? [
        { to: '/admin-home', label: '홈', icon: '🏠', menu: '' },
        { to: '/admin-home?m=attendance_view', label: '출석현황', icon: '✅', menu: 'attendance_view' },
        { to: '/admin-home?m=students', label: '학생', icon: '🎓', menu: 'students' },
        { to: '/admin-home?m=teachers', label: '선생님', icon: '👩‍🏫', menu: 'teachers' },
        { to: '/admin-home?m=sunday_report', label: '주일보고', icon: '📋', menu: 'sunday_report' },
        { to: '/admin-home?m=offering', label: '헌금', icon: '💰', menu: 'offering' },
        { to: '/admin-home?m=retreat', label: '수련회', icon: '⛺', menu: 'retreat' },
        { to: '/admin-home?m=settings', label: '설정', icon: '🔐', menu: 'settings' },
        { to: '/announcements', label: '공지·알림', icon: '📢' },
      ]
    : [
        { to: '/teacher-home?tab=attend', label: '출석', icon: '✅', tab: 'attend' },
        { to: '/teacher-home?tab=growth', label: '성장', icon: '🌱', tab: 'growth' },
        { to: '/teacher-home?tab=songcheong', label: '송청', icon: '🙏', tab: 'songcheong' },
        { to: '/my-page', label: '마이페이지', icon: '👤' },
      ];

  const currentTab = new URLSearchParams(location.search).get('tab') || 'attend';
  const currentMenu = new URLSearchParams(location.search).get('m') || '';
  const isActive = (link) => {
    if (link.tab) {
      return location.pathname.startsWith('/teacher-home') && currentTab === link.tab;
    }
    if (link.menu !== undefined) {
      return location.pathname.startsWith('/admin-home') && currentMenu === link.menu;
    }
    return location.pathname.startsWith(link.to);
  };

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
                    isActive(link)
                      ? (isAdmin ? 'bg-teal-600 text-white shadow-sm' : 'bg-ocean-400 text-white shadow-sm')
                      : (isAdmin ? 'text-stone-600 hover:bg-teal-50' : 'text-ink-soft hover:bg-ocean-100')
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
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isAdmin ? 'bg-teal-100 text-teal-700' : 'bg-ocean-100 text-ocean-700'
                }`}>
                  {displayBadge}
                </span>
                <button
                  onClick={handleLogout}
                  className={`ml-2 px-3 py-1 rounded-full text-white text-xs font-medium shadow-sm ${
                    isAdmin ? 'bg-teal-600 hover:bg-teal-700' : 'bg-ocean-400 hover:bg-ocean-500'
                  }`}
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
        <div className={`flex items-stretch ${isAdmin ? 'overflow-x-auto' : 'justify-around'}`}>
          {navLinks.map((link) => {
            const active = isActive(link);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`${isAdmin ? 'flex-none px-3' : 'flex-1'} flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors ${
                  active ? (isAdmin ? 'text-teal-600' : 'text-ocean-600') : 'text-ink-muted'
                }`}
              >
                <span
                  className={`text-lg mb-0.5 leading-none ${
                    active ? 'scale-110' : ''
                  }`}
                >
                  {link.icon || ICONS[link.to] || '•'}
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
