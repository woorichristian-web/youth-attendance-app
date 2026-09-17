import React, { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// ────────────────────────────────────────────────────────
// 교사 → 목사님(admin) 메시지
// 데이터: teacher_messages 컬렉션
//   { fromUid, fromName, service, classId, text,
//     status: 'draft' | 'sent', createdAt, updatedAt, sentAt, read }
// ────────────────────────────────────────────────────────

// 교사용: 메시지 작성 (보내기 / 임시저장)
export function TeacherMessageComposer() {
  const { currentUser, userProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [draftId, setDraftId] = useState(null);
  const [myMessages, setMyMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // 내가 쓴 메시지 (임시저장 불러오기 + 보낸 내역)
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'teacher_messages'), where('fromUid', '==', currentUser.uid));
    const u = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setMyMessages(list);
    });
    return () => u();
  }, [currentUser]);

  const draft = myMessages.find((m) => m.status === 'draft');
  const sent = myMessages.filter((m) => m.status === 'sent').slice(0, 5);

  function openComposer() {
    if (draft) {
      setText(draft.text || '');
      setDraftId(draft.id);
    } else {
      setText('');
      setDraftId(null);
    }
    setNotice('');
    setOpen(true);
  }

  async function saveDraft() {
    if (!text.trim()) { setNotice('내용을 입력해주세요.'); return; }
    setBusy(true);
    try {
      const payload = {
        fromUid: currentUser.uid,
        fromName: userProfile?.name || '',
        service: userProfile?.service || '',
        classId: userProfile?.classId || '',
        text: text.trim(),
        status: 'draft',
        updatedAt: Date.now(),
      };
      if (draftId) {
        await updateDoc(doc(db, 'teacher_messages', draftId), payload);
      } else {
        const ref = await addDoc(collection(db, 'teacher_messages'), { ...payload, createdAt: Date.now() });
        setDraftId(ref.id);
      }
      setNotice('💾 임시저장되었습니다. 나중에 이어서 쓸 수 있어요.');
    } catch (e) {
      console.error('임시저장 오류:', e);
      setNotice('저장 중 오류가 발생했습니다.');
    }
    setBusy(false);
  }

  async function send() {
    if (!text.trim()) { setNotice('내용을 입력해주세요.'); return; }
    setBusy(true);
    try {
      const payload = {
        fromUid: currentUser.uid,
        fromName: userProfile?.name || '',
        service: userProfile?.service || '',
        classId: userProfile?.classId || '',
        text: text.trim(),
        status: 'sent',
        read: false,
        sentAt: Date.now(),
        updatedAt: Date.now(),
      };
      if (draftId) {
        await updateDoc(doc(db, 'teacher_messages', draftId), payload);
      } else {
        await addDoc(collection(db, 'teacher_messages'), { ...payload, createdAt: Date.now() });
      }
      setText('');
      setDraftId(null);
      setOpen(false);
      alert('목사님께 메시지를 보냈습니다. 🙏');
    } catch (e) {
      console.error('전송 오류:', e);
      setNotice('전송 중 오류가 발생했습니다.');
    }
    setBusy(false);
  }

  async function removeDraft() {
    if (!draftId) { setText(''); setOpen(false); return; }
    if (!window.confirm('임시저장된 메시지를 삭제할까요?')) return;
    await deleteDoc(doc(db, 'teacher_messages', draftId));
    setText('');
    setDraftId(null);
    setOpen(false);
  }

  const fmt = (ts) => ts ? new Date(ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="mb-5">
      {!open ? (
        <button
          onClick={openComposer}
          className="w-full card flex items-center justify-between py-3.5 hover:shadow-soft transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">✉️</span>
            <div>
              <div className="font-bold text-ink">목사님께 메시지 보내기</div>
              <div className="text-xs text-ink-muted mt-0.5">
                {draft ? '💾 임시저장된 메시지가 있어요 — 이어서 쓰기' : '심방 요청, 기도제목, 건의사항 등을 전달해요'}
              </div>
            </div>
          </div>
          <span className="text-ocean-400 text-lg">›</span>
        </button>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-ink">✉️ 메시지 쓰기</div>
            <span className="text-xs bg-ocean-100 text-ocean-700 px-2.5 py-1 rounded-full font-semibold">
              받는 사람: 목사님에게 발송
            </span>
          </div>
          <textarea
            className="input resize-none"
            rows={5}
            placeholder="메시지 내용을 적어주세요"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          {notice && (
            <div className="text-sm mt-2 p-2 rounded-lg bg-ocean-50 text-ocean-700">{notice}</div>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={send} disabled={busy} className="btn-primary flex-1">
              {busy ? '처리 중...' : '보내기'}
            </button>
            <button onClick={saveDraft} disabled={busy} className="btn-secondary flex-1">
              저장
            </button>
            <button
              onClick={() => { setOpen(false); setNotice(''); }}
              className="px-4 py-2.5 text-sm text-ink-muted hover:text-ink"
            >
              닫기
            </button>
          </div>
          {draftId && (
            <button onClick={removeDraft} className="text-xs text-rose-400 hover:text-rose-600 mt-2">
              임시저장 삭제
            </button>
          )}
        </div>
      )}

      {/* 최근 보낸 메시지 */}
      {sent.length > 0 && !open && (
        <div className="mt-2 space-y-1.5">
          {sent.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-xs text-ink-muted bg-white/60 rounded-xl px-3 py-2">
              <span className="truncate flex-1 mr-2">📨 {m.text}</span>
              <span className="flex-shrink-0">
                {fmt(m.sentAt)} · {m.read ? <span className="text-emerald-600">읽음</span> : '전송됨'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 관리자용: 선생님들이 보낸 메시지함
export function AdminMessageInbox() {
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const u = onSnapshot(collection(db, 'teacher_messages'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => m.status === 'sent')
        .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
      setMessages(list);
    });
    return () => u();
  }, []);

  const unread = messages.filter((m) => !m.read).length;

  async function markRead(m) {
    await updateDoc(doc(db, 'teacher_messages', m.id), {
      read: true,
      readBy: userProfile?.name || '',
      readAt: Date.now(),
    });
  }

  async function remove(m) {
    if (!window.confirm(`${m.fromName} 선생님의 메시지를 삭제할까요?`)) return;
    await deleteDoc(doc(db, 'teacher_messages', m.id));
  }

  if (messages.length === 0) return null;

  const fmt = (ts) => ts ? new Date(ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="mb-5 bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 font-bold text-stone-800 text-sm">
          📨 선생님 메시지함
          {unread > 0 && (
            <span className="bg-rose-500 text-white text-[11px] px-2 py-0.5 rounded-full font-semibold">
              새 메시지 {unread}
            </span>
          )}
        </div>
        <span className="text-stone-400">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="divide-y divide-stone-100 border-t border-stone-100">
          {messages.map((m) => (
            <div key={m.id} className={`px-4 py-3 ${m.read ? '' : 'bg-teal-50/60'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold text-stone-800">
                  {m.fromName} 선생님
                  {m.service && <span className="text-xs text-stone-400 font-normal ml-1.5">{m.service}</span>}
                  {!m.read && <span className="text-[10px] text-teal-700 bg-teal-100 rounded-full px-1.5 py-0.5 ml-2 font-semibold">NEW</span>}
                </div>
                <div className="text-xs text-stone-400">{fmt(m.sentAt)}</div>
              </div>
              <div className="text-sm text-stone-700 whitespace-pre-wrap">{m.text}</div>
              <div className="flex gap-3 mt-2">
                {!m.read && (
                  <button onClick={() => markRead(m)} className="text-xs text-teal-700 hover:underline font-medium">
                    ✓ 읽음 표시
                  </button>
                )}
                <button onClick={() => remove(m)} className="text-xs text-stone-400 hover:text-rose-500">
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
