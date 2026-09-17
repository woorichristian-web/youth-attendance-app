import React, { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// ────────────────────────────────────────────────────────
// 교사 ↔ 목사님(admin) 메시지
// 데이터: teacher_messages 컬렉션
//   { fromUid, fromName, service, classId, text,
//     status: 'draft' | 'sent', createdAt, updatedAt, sentAt, read,
//     replies: [{ text, by, at }] }
// ────────────────────────────────────────────────────────

const fmt = (ts) =>
  ts ? new Date(ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

// 교사의 내 메시지 실시간 구독
function useMyMessages() {
  const { currentUser } = useAuth();
  const [myMessages, setMyMessages] = useState([]);
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'teacher_messages'), where('fromUid', '==', currentUser.uid));
    const u = onSnapshot(q, (snap) => {
      setMyMessages(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      );
    });
    return () => u();
  }, [currentUser]);
  return myMessages;
}

// ────────────────────────────────────────────────────────
// 교사용: 메시지 작성 (보내기 / 임시저장) — 페이지 상단
// ────────────────────────────────────────────────────────
export function TeacherMessageComposer() {
  const { currentUser, userProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [draftId, setDraftId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const myMessages = useMyMessages();

  const draft = myMessages.find((m) => m.status === 'draft');

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

  const basePayload = () => ({
    fromUid: currentUser.uid,
    fromName: userProfile?.name || '',
    service: userProfile?.service || '',
    classId: userProfile?.classId || '',
    text: text.trim(),
    updatedAt: Date.now(),
  });

  async function saveDraft() {
    if (!text.trim()) { setNotice('내용을 입력해주세요.'); return; }
    setBusy(true);
    try {
      const payload = { ...basePayload(), status: 'draft' };
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
      const payload = { ...basePayload(), status: 'sent', read: false, sentAt: Date.now() };
      if (draftId) {
        await updateDoc(doc(db, 'teacher_messages', draftId), payload);
      } else {
        await addDoc(collection(db, 'teacher_messages'), { ...payload, createdAt: Date.now(), replies: [] });
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
            <button onClick={saveDraft} disabled={busy} className="btn-secondary flex-1">
              저장
            </button>
            <button onClick={send} disabled={busy} className="btn-primary flex-1">
              {busy ? '처리 중...' : '보내기'}
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
    </div>
  );
}

// 페이지네이션 (5개씩)
const PAGE_SIZE = 5;

function Pager({ page, setPage, total }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-3">
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
  );
}

// 탭 버튼 공통
function TabButtons({ tabs, active, onSelect, accent = 'ocean' }) {
  const on = accent === 'teal' ? 'bg-teal-600 text-white' : 'bg-ocean-400 text-white';
  return (
    <div className="flex gap-1 bg-white/70 border border-stone-200 rounded-xl p-1 w-fit mb-3">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            active === t.id ? on : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 교사용: 주고받은 메시지 기록 — 페이지 하단 (탭 분리, 카드 5개씩, 터치로 펼침)
// ────────────────────────────────────────────────────────
export function TeacherMessageHistory({ mode }) {
  const myMessages = useMyMessages();
  const [innerTab, setInnerTab] = useState('sent'); // sent | received (mode 미지정 시)
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const tab = mode || innerTab;

  useEffect(() => {
    setPage(0);
    setExpandedId(null);
  }, [mode]);

  const sent = myMessages.filter((m) => m.status === 'sent');
  const received = sent.filter((m) => (m.replies || []).length > 0);

  if (sent.length === 0) return null;

  const list = tab === 'sent' ? sent : received;
  const pageItems = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="mt-8">
      <h3 className="text-sm font-bold text-ink mb-2 px-1">
        {mode
          ? (tab === 'sent' ? '📤 내가 목사님께 보낸 메시지' : '📥 목사님 답장')
          : '💬 목사님과 주고받은 메시지'}
      </h3>
      {!mode && (
        <TabButtons
          tabs={[
            { id: 'sent', label: `보낸 메시지 (${sent.length})` },
            { id: 'received', label: `받은 메시지 (${received.length})` },
          ]}
          active={tab}
          onSelect={(t) => { setInnerTab(t); setPage(0); setExpandedId(null); }}
        />
      )}
      {list.length === 0 && (
        <div className="card text-center text-ink-muted py-6 text-sm">
          {tab === 'received' ? '아직 목사님 답장이 없습니다.' : '아직 보낸 메시지가 없습니다.'}
        </div>
      )}
      <div className="space-y-2">
        {pageItems.map((m) => {
          const open = expandedId === m.id;
          const replies = m.replies || [];
          const latestReply = replies[replies.length - 1];
          const isReceivedView = tab === 'received';
          const previewText = isReceivedView && latestReply ? latestReply.text : m.text;
          return (
            <button
              key={m.id}
              onClick={() => setExpandedId(open ? null : m.id)}
              className="w-full text-left card py-3 hover:shadow-soft active:bg-ocean-50/40 transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-xs font-semibold ${isReceivedView ? 'text-emerald-700' : 'text-ocean-700'}`}>
                      {isReceivedView ? '목사님 → 나' : '나 → 목사님'}
                    </span>
                    {!isReceivedView && replies.length > 0 && (
                      <span className="text-[10px] bg-ocean-100 text-ocean-700 rounded-full px-1.5 py-0.5 font-semibold">
                        답장 {replies.length}
                      </span>
                    )}
                  </div>
                  <div className={`text-sm text-ink ${open ? 'whitespace-pre-wrap' : 'truncate'}`}>
                    {previewText}
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 gap-1">
                  <span className="text-[11px] text-ink-muted">
                    {fmt(isReceivedView && latestReply ? latestReply.at : m.sentAt)}
                  </span>
                  <span className="text-[11px] flex items-center gap-1">
                    {!isReceivedView && (m.read
                      ? <span className="text-emerald-600">읽음</span>
                      : <span className="text-ink-muted">전송됨</span>)}
                    <span className="text-ocean-400">{open ? '▲' : '▼'}</span>
                  </span>
                </div>
              </div>
              {open && (
                <div className="mt-2 pt-2 border-t border-ocean-100">
                  <div className="text-[11px] font-semibold text-ocean-700 mb-0.5">나 → 목사님 · {fmt(m.sentAt)}</div>
                  <div className="text-sm text-ink whitespace-pre-wrap">{m.text}</div>
                  {replies.map((r, i) => (
                    <div key={i} className="mt-2 ml-3 pl-3 border-l-2 border-emerald-200 bg-emerald-50/60 rounded-r-xl py-2 pr-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-semibold text-emerald-700">↩ 목사님</span>
                        <span className="text-[11px] text-ink-muted">{fmt(r.at)}</span>
                      </div>
                      <div className="text-sm text-ink whitespace-pre-wrap">{r.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <Pager page={page} setPage={setPage} total={list.length} />
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 관리자용: 선생님 메시지함 (기록 + 답장) — 페이지 하단
// ────────────────────────────────────────────────────────
export function AdminMessageInbox() {
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [replyFor, setReplyFor] = useState(null); // 답장 작성 중인 메시지 id
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('received'); // received | sent
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

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

  async function sendReply(m) {
    if (!replyText.trim()) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'teacher_messages', m.id), {
        replies: arrayUnion({ text: replyText.trim(), by: userProfile?.name || '목사님', at: Date.now() }),
        read: true,
        readBy: userProfile?.name || '',
      });
      setReplyText('');
      setReplyFor(null);
    } catch (e) {
      console.error('답장 오류:', e);
      alert('답장 전송 중 오류가 발생했습니다.');
    }
    setBusy(false);
  }

  async function remove(m) {
    if (!window.confirm(`${m.fromName} 선생님과의 메시지를 삭제할까요?`)) return;
    await deleteDoc(doc(db, 'teacher_messages', m.id));
  }

  if (messages.length === 0) return null;

  // 보낸 메시지 = 내가 보낸 답장들 (최신순)
  const sentReplies = messages
    .flatMap((m) => (m.replies || []).map((r, i) => ({ key: `${m.id}_${i}`, parent: m, reply: r })))
    .sort((a, b) => (b.reply.at || 0) - (a.reply.at || 0));

  const list = tab === 'received' ? messages : sentReplies;
  const pageItems = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 px-1 mb-2 font-bold text-stone-800 text-sm">
        📨 선생님 메시지함
        {unread > 0 && (
          <span className="bg-rose-500 text-white text-[11px] px-2 py-0.5 rounded-full font-semibold">
            새 메시지 {unread}
          </span>
        )}
      </div>
      <TabButtons
        accent="teal"
        tabs={[
          { id: 'received', label: `받은 메시지 (${messages.length})` },
          { id: 'sent', label: `보낸 메시지 (${sentReplies.length})` },
        ]}
        active={tab}
        onSelect={(t) => { setTab(t); setPage(0); setExpandedId(null); }}
      />

      {tab === 'sent' && (
        <div className="space-y-2">
          {sentReplies.length === 0 && (
            <div className="bg-white border border-stone-200 rounded-xl shadow-sm px-4 py-6 text-center text-sm text-stone-400">
              아직 보낸 답장이 없습니다.
            </div>
          )}
          {tab === 'sent' && pageItems.map((it) => {
            const open = expandedId === it.key;
            return (
              <button
                key={it.key}
                onClick={() => setExpandedId(open ? null : it.key)}
                className="w-full text-left bg-white border border-stone-200 rounded-xl shadow-sm px-4 py-3 hover:border-teal-300 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-teal-700 mb-0.5">
                      나 → {it.parent.fromName} 선생님
                    </div>
                    <div className={`text-sm text-stone-700 ${open ? 'whitespace-pre-wrap' : 'truncate'}`}>
                      {it.reply.text}
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 gap-1">
                    <span className="text-xs text-stone-400">{fmt(it.reply.at)}</span>
                    <span className="text-teal-500 text-[11px]">{open ? '▲' : '▼'}</span>
                  </div>
                </div>
                {open && (
                  <div className="mt-2 pt-2 border-t border-stone-100">
                    <div className="text-[11px] font-semibold text-stone-500 mb-0.5">
                      원본 메시지 · {it.parent.fromName} 선생님 · {fmt(it.parent.sentAt)}
                    </div>
                    <div className="text-sm text-stone-600 whitespace-pre-wrap">{it.parent.text}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {tab === 'received' && (
      <div className="space-y-2">
        {pageItems.map((m) => {
          const open = expandedId === m.id;
          const replyCount = (m.replies || []).length;
          return (
            <div
              key={m.id}
              className={`bg-white border rounded-xl shadow-sm px-4 py-3 cursor-pointer transition-all ${
                m.read ? 'border-stone-200' : 'border-teal-300 bg-teal-50/50'
              }`}
              onClick={() => {
                setExpandedId(open ? null : m.id);
                if (!open && !m.read) markRead(m);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-semibold text-stone-800">{m.fromName} 선생님</span>
                    {m.service && <span className="text-xs text-stone-400">{m.service}</span>}
                    {!m.read && <span className="text-[10px] text-teal-700 bg-teal-100 rounded-full px-1.5 py-0.5 font-semibold">NEW</span>}
                    {replyCount > 0 && (
                      <span className="text-[10px] bg-stone-100 text-stone-500 rounded-full px-1.5 py-0.5 font-semibold">
                        답장 {replyCount}
                      </span>
                    )}
                  </div>
                  <div className={`text-sm text-stone-700 ${open ? 'whitespace-pre-wrap' : 'truncate'}`}>
                    {m.text}
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 gap-1">
                  <span className="text-xs text-stone-400">{fmt(m.sentAt)}</span>
                  <span className="text-teal-500 text-[11px]">{open ? '▲' : '▼'}</span>
                </div>
              </div>

              {open && (
                <div onClick={(e) => e.stopPropagation()}>
                  {/* 주고받은 답장 기록 */}
                  {(m.replies || []).map((r, i) => (
                    <div key={i} className="mt-2 ml-3 pl-3 border-l-2 border-teal-200 bg-teal-50/50 rounded-r-lg py-1.5 pr-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-semibold text-teal-800">↩ {r.by || '목사님'}</span>
                        <span className="text-[11px] text-stone-400">{fmt(r.at)}</span>
                      </div>
                      <div className="text-sm text-stone-700 whitespace-pre-wrap">{r.text}</div>
                    </div>
                  ))}

                  {/* 답장 입력 */}
                  {replyFor === m.id ? (
                    <div className="mt-2">
                      <textarea
                        className="input resize-none"
                        rows={2}
                        placeholder={`${m.fromName} 선생님에게 답장`}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2 mt-1.5">
                        <button
                          onClick={() => sendReply(m)}
                          disabled={busy}
                          className="text-xs px-4 py-1.5 bg-teal-600 text-white rounded-full font-semibold hover:bg-teal-700 disabled:opacity-40"
                        >
                          답장 보내기
                        </button>
                        <button
                          onClick={() => { setReplyFor(null); setReplyText(''); }}
                          className="text-xs px-3 py-1.5 text-stone-400 hover:text-stone-600"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => { setReplyFor(m.id); setReplyText(''); }}
                        className="text-xs text-teal-700 hover:underline font-medium"
                      >
                        ↩ 답장
                      </button>
                      <button onClick={() => remove(m)} className="text-xs text-stone-400 hover:text-rose-500">
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
      <Pager page={page} setPage={setPage} total={list.length} />
    </div>
  );
}
