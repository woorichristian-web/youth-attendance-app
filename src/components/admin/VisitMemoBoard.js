import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { isRegistered } from '../../utils/statusUtils';

// 오늘 날짜 (로컬 기준 — toISOString은 UTC라 하루 어긋날 수 있음)
function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const emptyForm = { studentId: '', date: todayLocal(), memo: '' };

// 심방 메모: 학생 검색 → 학년/반/담임 자동 표시, 날짜 자동 입력, 메모 작성/수정/삭제
export default function VisitMemoBoard({ students, classes }) {
  const { userProfile } = useAuth();
  const [memos, setMemos] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = onSnapshot(collection(db, 'visit_memos'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
      setMemos(list);
    });
    return () => u();
  }, []);

  const activeStudents = useMemo(() => students.filter(isRegistered), [students]);

  // 검색어에 맞는 학생 (이름 포함 검색, 가나다순)
  const matches = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return activeStudents
      .filter((s) => (s.name || '').includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
      .slice(0, 8);
  }, [activeStudents, search]);

  const selectedStudent = activeStudents.find((s) => s.id === form.studentId) || null;
  const selectedClass = selectedStudent ? classes.find((c) => c.id === selectedStudent.classId) : null;

  function openAdd() {
    setForm({ ...emptyForm, date: todayLocal() });
    setSearch('');
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(m) {
    setForm({ studentId: m.studentId, date: m.date || todayLocal(), memo: m.memo || '' });
    setSearch('');
    setEditId(m.id);
    setShowForm(true);
  }

  function pickStudent(s) {
    setForm((f) => ({ ...f, studentId: s.id }));
    setSearch('');
  }

  async function save() {
    if (!selectedStudent) { alert('학생을 검색해서 선택해주세요.'); return; }
    if (!form.memo.trim()) { alert('심방 내용을 입력해주세요.'); return; }
    setSaving(true);
    try {
      const data = {
        studentId: selectedStudent.id,
        studentName: selectedStudent.name || '',
        grade: selectedStudent.grade || '',
        service: selectedStudent.service || selectedClass?.service || '',
        classId: selectedClass?.id || '',
        className: selectedClass ? (selectedClass.name || `${selectedClass.teacherName}반`) : '',
        teacherName: selectedClass?.teacherName || '',
        date: form.date,
        memo: form.memo.trim(),
        author: userProfile?.name || '',
      };
      if (editId) {
        await updateDoc(doc(db, 'visit_memos', editId), { ...data, updatedAt: Date.now() });
      } else {
        await addDoc(collection(db, 'visit_memos'), { ...data, createdAt: Date.now() });
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
    } catch (err) {
      console.error('심방 메모 저장 오류:', err);
      alert('저장 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
    setSaving(false);
  }

  async function remove(m) {
    if (!window.confirm(`${m.studentName} 학생의 ${m.date} 심방 메모를 삭제할까요?`)) return;
    await deleteDoc(doc(db, 'visit_memos', m.id));
  }

  return (
    <div>
      {/* 상단: 제목 + 추가 버튼 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-stone-900">🏠 심방 메모</h3>
          <p className="text-xs text-stone-500 mt-0.5">학생 심방 기록을 남기고 관리합니다. · 총 {memos.length}건</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-sm transition-colors"
        >
          + 메모 추가
        </button>
      </div>

      {/* 작성/수정 폼 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-stone-900">{editId ? '심방 메모 수정' : '심방 메모 추가'}</h3>
              <button onClick={() => setShowForm(false)} className="text-stone-500 hover:text-stone-900">✕</button>
            </div>

            <div className="space-y-3">
              {/* 학생 검색 */}
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">학생 이름</label>
                {selectedStudent ? (
                  <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
                    <span className="font-semibold text-teal-800">{selectedStudent.name}</span>
                    <button
                      onClick={() => setForm((f) => ({ ...f, studentId: '' }))}
                      className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                    >
                      변경
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      placeholder="이름을 입력해 검색하세요"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      autoFocus
                    />
                    {matches.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-10 overflow-hidden">
                        {matches.map((s) => {
                          const c = classes.find((cc) => cc.id === s.classId);
                          return (
                            <button
                              key={s.id}
                              onClick={() => pickStudent(s)}
                              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-teal-50 transition-colors border-b border-stone-50 last:border-0"
                            >
                              <span className="font-medium text-stone-800 text-sm">{s.name}</span>
                              <span className="text-xs text-stone-400">
                                {[s.grade, c ? `${c.teacherName}반` : ''].filter(Boolean).join(' · ')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {search.trim() && matches.length === 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-10 px-3 py-2.5 text-xs text-stone-400">
                        일치하는 학생이 없습니다.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 선택한 학생 정보 자동 표시 */}
              {selectedStudent && (
                <div className="grid grid-cols-3 gap-2">
                  <InfoBox label="학년" value={selectedStudent.grade || '-'} />
                  <InfoBox
                    label="반"
                    value={selectedClass ? (selectedClass.name || `${selectedClass.teacherName}반`) : '-'}
                    sub={selectedClass?.service}
                  />
                  <InfoBox label="담임" value={selectedClass?.teacherName ? `${selectedClass.teacherName} 선생님` : '-'} />
                </div>
              )}

              {/* 날짜 (오늘 자동 입력) */}
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">날짜</label>
                <input
                  type="date"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>

              {/* 심방 내용 */}
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">심방 내용</label>
                <textarea
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  rows={5}
                  placeholder="심방 내용, 기도제목, 나눈 이야기 등을 기록하세요."
                  value={form.memo}
                  onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {saving ? '저장 중...' : editId ? '수정 저장' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메모 리스트 */}
      {memos.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl text-center text-stone-400 py-10 text-sm">
          아직 심방 메모가 없습니다. '+ 메모 추가'로 첫 기록을 남겨보세요.
        </div>
      ) : (
        <div className="space-y-2.5">
          {memos.map((m) => (
            <div key={m.id} className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-stone-900">{m.studentName}</span>
                    <span className="text-xs text-stone-500">
                      {[m.grade, m.className, m.teacherName ? `담임 ${m.teacherName}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5">
                    {m.date}{m.author ? ` · 작성 ${m.author}` : ''}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(m)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 text-stone-500 hover:text-teal-700 hover:border-teal-300 transition-colors"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => remove(m)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 text-stone-500 hover:text-red-500 hover:border-red-200 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <p className="text-sm text-stone-700 whitespace-pre-wrap">{m.memo}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoBox({ label, value, sub }) {
  return (
    <div className="bg-stone-50 border border-stone-100 rounded-xl px-2.5 py-2 text-center">
      <div className="text-[10px] text-stone-400">{label}</div>
      <div className="text-sm font-semibold text-stone-800 truncate">{value}</div>
      {sub && <div className="text-[10px] text-stone-400">{sub}</div>}
    </div>
  );
}
