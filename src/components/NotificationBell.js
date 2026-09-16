import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, onSnapshot, doc, updateDoc, writeBatch, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDateKo } from '../utils/dateUtils';
import { isActiveForUser, TARGET_OPTIONS } from '../pages/AnnouncementsPage';

export default function NotificationBell() {
  const { isAdmin, userProfile } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const ref = useRef(null);

  // 특이사항/심방요청: 최근 30개 모두 (읽음 여부 무관)
  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(30),
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // 알림: 만료 안 된 것만 (대상 권한 필터)
  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markRead(id) {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  }
  async function markAllRead() {
    const batch = writeBatch(db);
    notifications.filter((n) => !n.read).forEach((n) => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  }

  const visibleAnnouncements = announcements
    .filter((a) => isActiveForUser(a, userProfile, isAdmin));

  const unreadNotifs = notifications.filter((n) => !n.read).length;
  // 특이사항 알림은 관리자에게만 노출
  const totalBadge = (isAdmin ? unreadNotifs : 0) + visibleAnnouncements.length;

  const targetBadge = (target) => {
    const t = TARGET_OPTIONS.find((o) => o.value === target);
    if (!t) return null;
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.color}`}>{t.label}</span>;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-blue-600 transition-colors"
      >
        <span className="text-lg">🔔</span>
        {totalBadge > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {totalBadge > 9 ? '9+' : totalBadge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50">
          {/* 탭 (특이사항은 관리자만) */}
          <div className="flex border-b border-gray-100">
            <button onClick={() => setTab(0)}
              className={`flex-1 py-2.5 text-xs font-medium ${tab === 0 ? 'text-blue-700 border-b-2 border-blue-500' : 'text-gray-400'}`}>
              📢 알림 ({visibleAnnouncements.length})
            </button>
            {isAdmin && (
              <button onClick={() => setTab(1)}
                className={`flex-1 py-2.5 text-xs font-medium ${tab === 1 ? 'text-blue-700 border-b-2 border-blue-500' : 'text-gray-400'}`}>
                📝 특이사항 ({notifications.length})
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {tab === 0 && (
              visibleAnnouncements.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">활성 알림이 없습니다.</div>
              ) : (
                visibleAnnouncements.map((a) => (
                  <div key={a.id} className="px-4 py-3 border-b border-gray-50">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {targetBadge(a.target)}
                      {a.headerTag && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                          [{a.headerTag}]
                        </span>
                      )}
                      <span className="text-sm font-bold text-gray-800">{a.title}</span>
                    </div>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{a.body}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {a.createdBy || '관리자'} ·{' '}
                      {a.createdAt && new Date(a.createdAt.seconds * 1000).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                ))
              )
            )}

            {tab === 1 && isAdmin && (
              <>
                {notifications.length > 0 && unreadNotifs > 0 && (
                  <div className="flex justify-end px-4 py-2 border-b border-gray-50">
                    <button onClick={markAllRead} className="text-xs text-blue-600 underline">
                      모두 읽음
                    </button>
                  </div>
                )}
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">특이사항이 없습니다.</div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id}
                      className={`px-4 py-3 border-b border-gray-50 ${n.read ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">
                            {n.teacherName} 선생님 ({n.service})
                          </p>
                          <p className="text-xs text-gray-400 mb-1">
                            {n.date ? formatDateKo(n.date) : ''}
                          </p>
                          <p className="text-sm text-gray-700 bg-amber-50 rounded-lg p-2 border border-amber-100">
                            {n.notes}
                          </p>
                        </div>
                        {!n.read && (
                          <button onClick={() => markRead(n.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap mt-1">
                            ✓ 확인
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
