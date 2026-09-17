import React, { useState, useEffect } from 'react';
import {
  collection, query, orderBy, addDoc, updateDoc, deleteDoc, doc, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { TeacherMessageComposer, TeacherMessageHistory, AdminMessageInbox } from '../components/TeacherMessages';

export const TARGET_OPTIONS = [
  { value: '전체',   label: '전체',     color: 'bg-stone-100 text-stone-700' },
  { value: '교사',   label: '교사알림', color: 'bg-teal-100 text-teal-700' },
  { value: '스텝',   label: '스텝알림', color: 'bg-green-100 text-green-700' },
  { value: '찬양팀', label: '찬양팀알림', color: 'bg-purple-100 text-purple-700' },
  { value: '행정',   label: '행정알림', color: 'bg-amber-100 text-amber-700' },
];

const TARGET_TO_MINISTRY = {
  교사:   '교사',
  스텝:   '예배팀',
  찬양팀: '찬양팀',
  행정:   '행정팀',
};

const RECURRENCE_OPTIONS = [
  { value: 'none',    label: '반복 없음' },
  { value: 'hourly',  label: '매시간' },
  { value: 'weekly',  label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly',  label: '매년' },
];

// 사용자가 알림을 볼 수 있는지 확인 (대상 필터)
export function canViewAnnouncement(announcement, userProfile, isAdmin) {
  if (isAdmin) return true;
  if (announcement.target === '전체') return true;
  const required = TARGET_TO_MINISTRY[announcement.target];
  return userProfile?.ministryMain === required;
}

// 시작 시점 (publishAt 또는 createdAt 폴백)
function getStartMs(a) {
  if (a.publishAt?.seconds) return a.publishAt.seconds * 1000;
  if (a.createdAt?.seconds) return a.createdAt.seconds * 1000;
  return null;
}

// 현재 반복 주기의 시작 시간 계산
export function getCurrentOccurrenceStart(a) {
  const startMs = getStartMs(a);
  if (!startMs) return null;
  const now = Date.now();
  if (now < startMs) return null; // 예약 시점이 아직 안 옴

  const rec = a.recurrence || 'none';
  if (rec === 'none') return startMs;

  if (rec === 'hourly') {
    const hoursSince = Math.floor((now - startMs) / 3600000);
    return startMs + hoursSince * 3600000;
  }
  if (rec === 'weekly') {
    const weeksSince = Math.floor((now - startMs) / (7 * 86400000));
    return startMs + weeksSince * 7 * 86400000;
  }
  if (rec === 'monthly') {
    let n = new Date(startMs);
    while (true) {
      const next = new Date(n);
      next.setMonth(next.getMonth() + 1);
      if (next.getTime() > now) break;
      n = next;
    }
    return n.getTime();
  }
  if (rec === 'yearly') {
    let n = new Date(startMs);
    while (true) {
      const next = new Date(n);
      next.setFullYear(next.getFullYear() + 1);
      if (next.getTime() > now) break;
      n = next;
    }
    return n.getTime();
  }
  return startMs;
}

// 발행 전(예약 대기 중)인지
export function isPending(a) {
  const startMs = getStartMs(a);
  if (!startMs) return false;
  return Date.now() < startMs;
}

// 만료 여부 (반복 고려)
export function isExpired(a) {
  if (isPending(a)) return false;
  const occurStart = getCurrentOccurrenceStart(a);
  if (occurStart === null) return false;
  const days = a.durationDays || 7;
  const occurEnd = occurStart + days * 86400000;
  return Date.now() > occurEnd;
}

// 현재 노출 가능한지 (대상 + 시점)
export function isActiveForUser(a, userProfile, isAdmin) {
  if (!canViewAnnouncement(a, userProfile, isAdmin)) return false;
  if (isPending(a)) return false;
  if (isExpired(a)) return false;
  return true;
}

const PAGE_SIZE = 20;

// Date → datetime-local input 값
function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = () => ({
  title: '',
  body: '',
  target: '전체',
  durationDays: 7,
  headerTag: '',
  scheduleMode: 'now', // 'now' or 'scheduled'
  publishAt: toLocalInput(new Date()),
  recurrence: 'none',
});

export default function AnnouncementsPage() {
  const { isAdmin, isTeacher, userProfile, currentUser } = useAuth();
  // 메시지 전송·수정·삭제는 관리자(전호진·강현미·전성배·김정나) 모두 가능
  const canSend = isAdmin;
  const [teacherTab, setTeacherTab] = useState('received'); // 교사 화면: received | sent
  const [announcements, setAnnouncements] = useState([]);
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // 관리자: 다른 어드민 화면과 동일한 아이보리 배경 적용
  useEffect(() => {
    if (!isAdmin) return;
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = '#f8f7f4';
    return () => {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundColor = '';
    };
  }, [isAdmin]);

  const visible = announcements.filter((a) => canViewAnnouncement(a, userProfile, isAdmin));
  // 교사 화면: '받은 메시지' 탭에서만 알림 리스트 표시
  const showAnnouncements = !isTeacher || isAdmin || teacherTab === 'received';
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    const days = Math.max(1, Number(form.durationDays) || 7);
    const publishMs = form.scheduleMode === 'scheduled'
      ? new Date(form.publishAt).getTime()
      : Date.now();
    const publishAt = Timestamp.fromMillis(publishMs);
    const expiresAt = Timestamp.fromMillis(publishMs + days * 86400000);

    const data = {
      title: form.title.trim(),
      body: form.body.trim(),
      target: form.target,
      durationDays: days,
      headerTag: form.headerTag || '',
      recurrence: form.recurrence || 'none',
      publishAt,
      expiresAt,
    };

    if (editId) {
      await updateDoc(doc(db, 'announcements', editId), {
        ...data,
        updatedAt: Timestamp.now(),
        updatedBy: userProfile?.name || '관리자',
      });
    } else {
      await addDoc(collection(db, 'announcements'), {
        ...data,
        createdAt: Timestamp.now(),
        createdBy: userProfile?.name || '관리자',
      });
    }
    setForm(emptyForm());
    setEditId(null);
    setShowForm(false);
    setSaving(false);
  }

  function openEdit(a) {
    const publishMs = a.publishAt?.seconds ? a.publishAt.seconds * 1000 : Date.now();
    const now = Date.now();
    setForm({
      title: a.title || '',
      body: a.body || '',
      target: a.target || '전체',
      durationDays: a.durationDays || 7,
      headerTag: a.headerTag || '',
      scheduleMode: publishMs > now ? 'scheduled' : 'now',
      publishAt: toLocalInput(new Date(publishMs)),
      recurrence: a.recurrence || 'none',
    });
    setEditId(a.id);
    setShowForm(true);
  }

  function openAdd() {
    setForm(emptyForm());
    setEditId(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm());
  }

  async function handleDelete(id) {
    if (!window.confirm('이 알림을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'announcements', id));
  }

  const targetBadge = (target) => {
    const t = TARGET_OPTIONS.find((o) => o.value === target);
    if (!t) return null;
    return <span className={`text-xs px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>;
  };

  const recurrenceLabel = (rec) =>
    RECURRENCE_OPTIONS.find((r) => r.value === rec)?.label || '';

  return (
    <div className={`max-w-3xl mx-auto px-4 py-6 ${isAdmin ? 'admin-theme' : ''}`}>
      {/* 교사: 목사님께 메시지 보내기 */}
      {isTeacher && !isAdmin && <TeacherMessageComposer />}

      {/* 교사: 받은/보낸 메시지 탭 */}
      {isTeacher && !isAdmin && (
        <div className="flex gap-1 mb-4 bg-white/60 rounded-xl p-1 w-fit">
          {[
            { id: 'received', label: '받은 메시지' },
            { id: 'sent', label: '보낸 메시지' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTeacherTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                teacherTab === t.id ? 'bg-ocean-400 text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className={`flex items-center mb-4 ${isAdmin ? 'justify-between' : 'justify-end'}`}>
        {isAdmin && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-medium mb-1">Messages</p>
            <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">메시지</h1>
          </div>
        )}
        {canSend && (
          <button onClick={openAdd} className="btn-primary">+ 메시지 전송하기</button>
        )}
      </div>

      {/* 게시글 작성 폼 */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editId ? '알림 수정' : '새 알림 작성'}</h3>
            <div className="space-y-3">
              <div>
                <label className="label">머릿글</label>
                <div className="flex gap-2">
                  {[
                    { value: '', label: '없음' },
                    { value: '중요!', label: '[중요!]' },
                  ].map((o) => (
                    <button key={o.value} type="button"
                      onClick={() => setForm({ ...form, headerTag: o.value })}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        form.headerTag === o.value
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-stone-200 text-stone-500'
                      }`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">제목 *</label>
                <input className="input" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="알림 제목" />
              </div>
              <div>
                <label className="label">대상</label>
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_OPTIONS.map((o) => (
                    <button key={o.value} type="button"
                      onClick={() => setForm({ ...form, target: o.value })}
                      className={`py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        form.target === o.value
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-stone-200 text-stone-500'
                      }`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 발송 시점 */}
              <div>
                <label className="label">발송 시점</label>
                <div className="flex gap-2 mb-2">
                  <button type="button"
                    onClick={() => setForm({ ...form, scheduleMode: 'now' })}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      form.scheduleMode === 'now'
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-stone-200 text-stone-500'
                    }`}>
                    즉시 발송
                  </button>
                  <button type="button"
                    onClick={() => setForm({ ...form, scheduleMode: 'scheduled' })}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      form.scheduleMode === 'scheduled'
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-stone-200 text-stone-500'
                    }`}>
                    예약 발송
                  </button>
                </div>
                {form.scheduleMode === 'scheduled' && (
                  <input type="datetime-local" className="input"
                    value={form.publishAt}
                    onChange={(e) => setForm({ ...form, publishAt: e.target.value })} />
                )}
              </div>

              {/* 반복 설정 */}
              <div>
                <label className="label">반복 설정</label>
                <select className="input" value={form.recurrence}
                  onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {form.recurrence !== 'none' && (
                  <p className="text-xs text-teal-600 mt-1">
                    🔁 {recurrenceLabel(form.recurrence)} 반복 — 시작 시점 기준으로 자동 재게시됩니다.
                  </p>
                )}
              </div>

              <div>
                <label className="label">노출 기간 (일)</label>
                <input type="number" className="input" min="1" max="365"
                  value={form.durationDays}
                  onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
                  placeholder="7" />
                <p className="text-xs text-stone-400 mt-1">
                  한 번 노출되는 기간. 반복 설정 시 매 주기마다 이 기간만큼 표시됩니다.
                </p>
              </div>

              <div>
                <label className="label">내용 *</label>
                <textarea className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-500 resize-none"
                  rows={6} value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="알림 내용을 입력하세요." />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? '저장 중...' : (editId ? '수정 완료' : (form.scheduleMode === 'scheduled' ? '예약' : '발송'))}
              </button>
              <button onClick={closeForm} className="btn-secondary flex-1">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 알림 리스트 */}
      {showAnnouncements && (pageItems.length === 0 ? (
        <div className="card text-center text-stone-400 py-10">알림이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {pageItems.map((a) => {
            const expired = isExpired(a);
            const pending = isPending(a);
            return (
              <div key={a.id}
                className={`card ${expired || pending ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {targetBadge(a.target)}
                    {pending && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">예약</span>}
                    {expired && <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 text-stone-500">만료</span>}
                    {a.recurrence && a.recurrence !== 'none' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                        🔁 {recurrenceLabel(a.recurrence)}
                      </span>
                    )}
                    {a.headerTag && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                        [{a.headerTag}]
                      </span>
                    )}
                    <span className="font-bold text-stone-900">{a.title}</span>
                  </div>
                  {canSend && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => openEdit(a)}
                        className="text-xs text-teal-600 hover:text-teal-800">수정</button>
                      <button onClick={() => handleDelete(a.id)}
                        className="text-xs text-red-400 hover:text-red-600">삭제</button>
                    </div>
                  )}
                </div>
                <p className="text-sm text-stone-700 whitespace-pre-wrap mb-2">{a.body}</p>
                <div className="text-xs text-stone-400 flex items-center gap-3 flex-wrap">
                  <span>👤 {a.createdBy || '관리자'}</span>
                  {a.publishAt && (
                    <span>
                      {pending ? '⏰ 예약: ' : '📅 발송: '}
                      {new Date(a.publishAt.seconds * 1000).toLocaleString('ko-KR', {
                        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  )}
                  {!a.publishAt && a.createdAt && (
                    <span>📅 {new Date(a.createdAt.seconds * 1000).toLocaleString('ko-KR', {
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}</span>
                  )}
                  {a.durationDays && <span>· {a.durationDays}일 노출</span>}
                  {a.updatedAt && (
                    <span className="text-stone-400">
                      ✏️ {new Date(a.updatedAt.seconds * 1000).toLocaleString('ko-KR', {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                      })} 수정
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* 페이지네이션 */}
      {showAnnouncements && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-sm disabled:opacity-40"
          >이전</button>
          <span className="text-sm text-stone-500">{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-sm disabled:opacity-40"
          >다음</button>
        </div>
      )}

      {/* 하단: 주고받은 메시지 기록 */}
      {isAdmin && <AdminMessageInbox />}
      {isTeacher && !isAdmin && <TeacherMessageHistory mode={teacherTab} />}
    </div>
  );
}
