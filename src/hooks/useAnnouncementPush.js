import { useEffect, useState, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { isActiveForUser } from '../pages/AnnouncementsPage';

// 관리자 게시판 알림을 받아 브라우저 푸시로 표시
export default function useAnnouncementPush(userProfile, isAdmin) {
  const navigate = useNavigate();
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  // 권한 요청 (버튼 클릭 등 사용자 제스처로 호출)
  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  useEffect(() => {
    if (!userProfile) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    // 페이지 로드 이후 생성된 알림만 푸시 (이전 것은 무시)
    const startMs = Date.now();
    const seenIds = new Set();

    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const a = { id: change.doc.id, ...change.doc.data() };
        // 시작 시점 이후에 생성된 것만
        const createdMs = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
        if (createdMs < startMs) return;
        if (seenIds.has(a.id)) return;
        seenIds.add(a.id);
        // 이 사용자 대상인지 확인 (target / 만료 / publishAt 체크)
        if (!isActiveForUser(a, userProfile, isAdmin)) return;

        const headerTag = a.headerTag ? `[${a.headerTag}] ` : '';
        const title = headerTag + (a.title || '새 알림');
        try {
          const notif = new Notification(title, {
            body: a.body || '',
            icon: '/logo192.png',
            badge: '/logo192.png',
            tag: a.id,
            requireInteraction: false,
          });
          notif.onclick = () => {
            window.focus();
            navigate('/announcements');
            notif.close();
          };
        } catch (err) {
          console.error('Notification error:', err);
        }
      });
    });
    return () => unsub();
  }, [userProfile, isAdmin, permission, navigate]);

  return { permission, requestPermission };
}
