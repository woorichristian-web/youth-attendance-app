import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, query, orderBy,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../../firebase';

// ── 상수 ────────────────────────────────────────────────────────────────
const YEARS = Array.from({ length: 11 }, (_, i) => 2025 + i); // 2025~2035
const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3'];
const TENURE_OPTIONS = [
  ...Array.from({ length: 19 }, (_, i) => `${i + 1}년차`),
  '20년차이상',
];
const MINISTRY_MAP = {
  교사:   ['부장', '반교사', '반사팀장', '보조교사', '새가족'],
  찬양팀: ['찬양팀장', '찬양부팀장', '찬양팀원'],
  예배팀: ['예배팀장', '예배팀원'],
  행정팀: ['행정팀장', '행정팀원'],
};
const TEACHER_STATUS = [
  { value: 'active',   label: '현교사',   color: 'bg-green-100 text-green-700' },
  { value: 'resigned', label: '사임교사', color: 'bg-red-100 text-red-700' },
  { value: 'leave',    label: '휴직교사', color: 'bg-yellow-100 text-yellow-700' },
];

const emptyForm = {
  name: '', service: '1부', className: '', email: '', password: '',
  gender: '', tenure: '', phone: '', address: '',
  ministryMain: '', ministrySub: '',
  teacherStatus: 'active', statusReason: '',
  notes: '',
  songchungYears: [], // [{year, grade}]
};

const CATEGORY_TABS = [
  { key: '교사',   label: '교사',   match: (t) => !t.ministryMain || t.ministryMain === '교사' },
  { key: '스텝',   label: '스텝',   match: (t) => t.ministryMain === '예배팀' },
  { key: '찬양팀', label: '찬양팀', match: (t) => t.ministryMain === '찬양팀' },
  { key: '행정팀', label: '행정팀', match: (t) => t.ministryMain === '행정팀' },
];

export default function TeacherManagement({ classes, onClassesChange }) {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('교사');

  async function loadTeachers() {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('name'));
      const snap = await getDocs(q);
      setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.role === 'teacher'));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  useEffect(() => { loadTeachers(); }, []);

  function openAdd() {
    setForm(emptyForm);
    setEditId(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(teacher) {
    setForm({
      name: teacher.name || '',
      service: teacher.service || '1부',
      className: '',
      email: teacher.email || '',
      password: '',
      gender: teacher.gender || '',
      tenure: teacher.tenure || '',
      phone: teacher.phone || '',
      address: teacher.address || '',
      ministryMain: teacher.ministryMain || '',
      ministrySub: teacher.ministrySub || '',
      teacherStatus: teacher.teacherStatus || 'active',
      statusReason: teacher.statusReason || '',
      notes: teacher.notes || '',
      songchungYears: teacher.songchungYears || [],
    });
    setEditId(teacher.id);
    setError('');
    setShowForm(true);
  }

  // 송청년차 항목 추가/삭제/수정
  function addSongchungYear() {
    setForm((f) => ({
      ...f,
      songchungYears: [...f.songchungYears, { year: new Date().getFullYear(), grade: '중1', classGender: '' }],
    }));
  }
  function updateSongchungYear(idx, field, value) {
    setForm((f) => {
      const updated = f.songchungYears.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      );
      return { ...f, songchungYears: updated };
    });
  }
  function removeSongchungYear(idx) {
    setForm((f) => ({ ...f, songchungYears: f.songchungYears.filter((_, i) => i !== idx) }));
  }

  async function handleDeleteTeacher(teacher) {
    const ok = window.confirm(
      `"${teacher.name}" 교사를 정말 삭제하시겠습니까?\n\n` +
      `⚠️ Firestore 프로필만 삭제되며, Firebase Auth 계정은 남습니다 (Auth는 콘솔에서 별도 삭제).\n` +
      `과거 출석 기록은 유지됩니다.\n\n` +
      `사임/휴직은 "교사 상태"를 사용하는 게 권장됩니다.`
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'users', teacher.id));
      loadTeachers();
    } catch (err) {
      alert('삭제 중 오류: ' + err.message);
    }
  }

  async function handleSaveTeacher() {
    if (!form.name.trim()) return setError('이름을 입력하세요.');
    if (!editId && !form.email.trim()) return setError('이메일을 입력하세요.');
    if (!editId && form.password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.');
    setSaving(true);
    setError('');
    try {
      const isInactive = form.teacherStatus !== 'active';
      const profileData = {
        name: form.name.trim(),
        service: form.service,
        gender: form.gender,
        tenure: form.tenure,
        phone: form.phone.trim(),
        address: form.address.trim(),
        ministryMain: form.ministryMain,
        ministrySub: form.ministrySub,
        teacherStatus: form.teacherStatus,
        statusReason: isInactive ? form.statusReason.trim() : '',
        notes: form.notes.trim(),
        songchungYears: form.songchungYears,
        active: !isInactive,
      };

      if (editId) {
        const cls = classes.find((c) => c.teacherId === editId);
        await updateDoc(doc(db, 'users', editId), {
          ...profileData,
          classId: cls?.id || null,
        });
        if (cls) {
          const currentYear = new Date().getFullYear();
          const currentEntry = form.songchungYears.find((e) => e.year === currentYear);
          await updateDoc(doc(db, 'classes', cls.id), {
            teacherName: form.name.trim(),
            service: form.service,
            classGender: currentEntry?.classGender || '',
          });
        }
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
        const uid = userCred.user.uid;
        const classRef = await addDoc(collection(db, 'classes'), {
          name: form.className.trim() || `${form.name.trim()} 선생님반`,
          service: form.service,
          teacherId: uid,
          teacherName: form.name.trim(),
        });
        await setDoc(doc(db, 'users', uid), {
          ...profileData,
          role: 'teacher',
          email: form.email.trim(),
          classId: classRef.id,
        });
      }
      setShowForm(false);
      loadTeachers();
      if (onClassesChange) onClassesChange();
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') setError('이미 사용 중인 이메일입니다.');
      else setError('저장 중 오류: ' + err.message);
    }
    setSaving(false);
  }

  const statusBadge = (status) => {
    const s = TEACHER_STATUS.find((t) => t.value === status);
    return s ? <span className={`text-xs px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span> : null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">교사 관리</h2>
        <button onClick={openAdd} className="btn-primary">+ 교사 추가</button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-sm text-blue-700">
        💡 교사를 추가하면 자동으로 Firebase 계정이 생성됩니다.
      </div>

      {/* 교사 추가/수정 폼 */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editId ? '교사 정보 수정' : '교사 추가'}</h3>
            <div className="space-y-4">

              {/* ── 기본 정보 ── */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">기본 정보</p>
                <div className="space-y-3">
                  <div>
                    <label className="label">교사 이름 *</label>
                    <input className="input" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="교사 이름" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">성별</label>
                      <select className="input" value={form.gender}
                        onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                        <option value="">선택 안 함</option>
                        <option value="남">남</option>
                        <option value="여">여</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">교사 년차</label>
                      <select className="input" value={form.tenure}
                        onChange={(e) => setForm({ ...form, tenure: e.target.value })}>
                        <option value="">선택</option>
                        {TENURE_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">전화번호</label>
                    <input className="input" value={form.phone} type="tel"
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="010-0000-0000" />
                  </div>
                  <div>
                    <label className="label">주소</label>
                    <input className="input" value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="주소" />
                  </div>
                </div>
              </section>

              {/* ── 상태 ── */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">교사 상태</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {TEACHER_STATUS.map((s) => (
                      <button key={s.value} type="button"
                        onClick={() => setForm({ ...form, teacherStatus: s.value })}
                        className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                          form.teacherStatus === s.value
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500'
                        }`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {form.teacherStatus !== 'active' && (
                    <div>
                      <label className="label">
                        {form.teacherStatus === 'resigned' ? '사임' : '휴직'} 사유
                      </label>
                      <input className="input" value={form.statusReason}
                        onChange={(e) => setForm({ ...form, statusReason: e.target.value })}
                        placeholder="사유를 입력하세요" />
                      <p className="text-xs text-amber-600 mt-1">⚠️ 비활성 처리됩니다.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* ── 담당 예배 ── */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">담당 예배</p>
                <div className="flex gap-2">
                  {['1부', '2부'].map((s) => (
                    <button key={s} type="button"
                      onClick={() => setForm({ ...form, service: s })}
                      className={`flex-1 py-2 rounded-lg border-2 font-medium transition-all ${
                        form.service === s
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}>
                      {s} 예배
                    </button>
                  ))}
                </div>
              </section>

              {/* ── 담당사역 ── */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">담당사역</p>
                <div className="space-y-2">
                  <div>
                    <label className="label">1단계 — 사역 분류</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(MINISTRY_MAP).map((m) => (
                        <button key={m} type="button"
                          onClick={() => setForm({ ...form, ministryMain: m, ministrySub: '' })}
                          className={`py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                            form.ministryMain === m
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-500'
                          }`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.ministryMain && (
                    <div>
                      <label className="label">2단계 — 세부 역할</label>
                      <div className="flex flex-wrap gap-2">
                        {MINISTRY_MAP[form.ministryMain].map((sub) => (
                          <button key={sub} type="button"
                            onClick={() => setForm({ ...form, ministrySub: sub })}
                            className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all ${
                              form.ministrySub === sub
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 text-gray-500'
                            }`}>
                            {sub}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ── 송청년차 ── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">송청년차</p>
                  <button type="button" onClick={addSongchungYear}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-lg">
                    + 연차 추가
                  </button>
                </div>
                {form.songchungYears.length === 0 && (
                  <p className="text-xs text-gray-400">연차를 추가하세요. 예: 2026 - 중2</p>
                )}
                <div className="space-y-2">
                  {form.songchungYears.map((item, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <select className="input flex-1"
                          value={item.year}
                          onChange={(e) => updateSongchungYear(idx, 'year', Number(e.target.value))}>
                          {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
                        </select>
                        <span className="text-gray-400">—</span>
                        <select className="input flex-1"
                          value={item.grade}
                          onChange={(e) => updateSongchungYear(idx, 'grade', e.target.value)}>
                          {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <button type="button" onClick={() => removeSongchungYear(idx)}
                          className="text-red-400 text-lg leading-none px-1">×</button>
                      </div>
                      <div className="flex gap-2 pl-1">
                        {['남학생반', '여학생반'].map((opt) => (
                          <button key={opt} type="button"
                            onClick={() => updateSongchungYear(idx, 'classGender', item.classGender === opt ? '' : opt)}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                              item.classGender === opt
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 text-gray-400'
                            }`}>
                            {opt}
                          </button>
                        ))}
                        <div className="flex-1" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── 특이사항/심방내용 ── */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">특이사항 / 심방내용</p>
                <textarea className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
                  rows={3} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="특이사항이나 심방 내용을 입력하세요." />
              </section>

              {/* ── 계정 정보 (신규만) ── */}
              {!editId && (
                <section>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">계정 정보</p>
                  <div className="space-y-3">
                    <div>
                      <label className="label">반 이름 (선택)</label>
                      <input className="input" value={form.className}
                        onChange={(e) => setForm({ ...form, className: e.target.value })}
                        placeholder="비우면 자동 생성" />
                    </div>
                    <div>
                      <label className="label">로그인 이메일 *</label>
                      <input className="input" value={form.email} type="email"
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="teacher@example.com" />
                    </div>
                    <div>
                      <label className="label">비밀번호 * (6자 이상)</label>
                      <input className="input" value={form.password} type="password"
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="비밀번호" />
                    </div>
                  </div>
                </section>
              )}
              {editId && (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                  📧 {form.email} (이메일 변경 불가)
                </div>
              )}

            </div>
            {error && <div className="mt-3 text-red-500 text-sm">{error}</div>}
            <div className="flex gap-2 mt-5">
              <button onClick={handleSaveTeacher} disabled={saving} className="btn-primary flex-1">
                {saving ? '저장 중...' : '저장'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 카테고리 탭 */}
      <div className="flex gap-1 mb-3 bg-gray-100 rounded-xl p-1">
        {CATEGORY_TABS.map((tab) => {
          const count = teachers.filter(tab.match).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {tab.label} <span className="text-xs text-gray-400">({count})</span>
            </button>
          );
        })}
      </div>

      {/* 교사 목록 */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">불러오는 중...</div>
      ) : (
        <div className="space-y-2">
          {(() => {
            const matchFn = CATEGORY_TABS.find((t) => t.key === activeTab)?.match || (() => true);
            const filteredTeachers = teachers.filter(matchFn);
            if (filteredTeachers.length === 0) {
              return <div className="text-center py-8 text-gray-400">등록된 {activeTab}가 없습니다.</div>;
            }
            return filteredTeachers.map((teacher) => {
            const cls = classes.find((c) => c.teacherId === teacher.id);
            const isInactive = teacher.teacherStatus && teacher.teacherStatus !== 'active';
            return (
              <div key={teacher.id}
                className={`card flex items-center justify-between ${isInactive ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800">{teacher.name}</span>
                    {teacher.gender && (
                      <span className="text-xs text-gray-500">{teacher.gender}</span>
                    )}
                    {teacher.tenure && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {teacher.tenure}
                      </span>
                    )}
                    {statusBadge(teacher.teacherStatus || 'active')}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {teacher.service} · {cls?.name || '반 없음'}
                    {teacher.ministryMain && ` · ${teacher.ministryMain}${teacher.ministrySub ? ' / ' + teacher.ministrySub : ''}`}
                  </div>
                  {teacher.phone && (
                    <div className="text-xs text-gray-400">📱 {teacher.phone}</div>
                  )}
                  {teacher.songchungYears?.length > 0 && (
                    <div className="text-xs text-gray-400">
                      송청년차: {teacher.songchungYears.map((s) => `${s.year}년-${s.grade}${s.classGender ? `(${s.classGender})` : ''}`).join(', ')}
                    </div>
                  )}
                  {isInactive && teacher.statusReason && (
                    <div className="text-xs text-amber-600">사유: {teacher.statusReason}</div>
                  )}
                  {teacher.notes && (
                    <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap bg-yellow-50 border border-yellow-100 rounded-lg px-2 py-1">
                      📝 {teacher.notes}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 ml-2 flex-shrink-0">
                  <button onClick={() => openEdit(teacher)}
                    className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded-lg">
                    수정
                  </button>
                  <button onClick={() => handleDeleteTeacher(teacher)}
                    className="text-xs px-3 py-1 bg-red-100 text-red-700 rounded-lg">
                    삭제
                  </button>
                </div>
              </div>
            );
            });
          })()}
        </div>
      )}
    </div>
  );
}
