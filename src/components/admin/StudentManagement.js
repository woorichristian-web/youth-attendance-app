import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';
import OfficerManagement from './OfficerManagement';

const SUB_TABS = ['학생 추가 및 검색', '임원 학생'];

const STATUS_OPTIONS = [
  { value: 'active', label: '재적 (출석)' },
  { value: 'long_absent', label: '재적 (장결자)' },
  { value: 'unclassified', label: '재적 (미분류)' },
  { value: 'transferred_seohyeon', label: '서현이동' },
  { value: 'transferred_church', label: '타교회로 이동' },
  { value: 'transferred_dept', label: '부서이동' },
  { value: 'inactive', label: '기타 비활성' },
];

// 4가지 분류 필터 (드롭다운용)
const CATEGORY_FILTERS = [
  { value: '전체', label: '전체' },
  { value: 'cat_active', label: '재적(출석)' },
  { value: 'cat_long_absent', label: '재적(장결자)' },
  { value: 'cat_unclassified', label: '재적(미분류)' },
  { value: 'cat_transferred', label: '타교회이동' },
];

const TRANSFERRED = ['transferred_church', 'transferred_seohyeon', 'transferred_dept', 'inactive'];

const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3'];
const MINISTRY_YEARS = Array.from({ length: 11 }, (_, i) => 2025 + i); // 2025~2035
const MINISTRY_DEPTS = ['예배팀', '찬양팀', '회장', '부회장', '총무'];
const OFFICER_ROLES = ['회장', '부회장', '총무'];

function getOfficerRoles(student, year) {
  if (!student.ministryTeams) return [];
  const roles = new Set();
  student.ministryTeams.forEach((m) => {
    if (Number(m.year) !== Number(year)) return;
    const depts = m.departments || (m.department ? [m.department] : []);
    depts.forEach((d) => {
      if (OFFICER_ROLES.includes(d)) roles.add(d);
    });
  });
  return [...roles];
}

const emptyForm = {
  name: '',
  classId: '',
  service: '',
  phone: '',
  parentPhone: '',
  address: '',
  status: 'active',
  joinDate: '',
  gender: '',
  grade: '',
  school: '',
  ecclesia: false,
  baptized: false,
  ministryTeams: [],
};

export default function StudentManagement({ classes, restrictClassId = null, hideSubTabs = false, canAdd = true, canDelete = true }) {
  const navigate = useNavigate();
  const [subTab, setSubTab] = useState(0);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterService, setFilterService] = useState('전체');
  const [filterClass, setFilterClass] = useState('전체');
  const [filterStatus, setFilterStatus] = useState('전체');
  const [search, setSearch] = useState('');

  async function loadStudents() {
    setLoading(true);
    try {
      const q = query(collection(db, 'students'), orderBy('name'));
      const snap = await getDocs(q);
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadStudents();
  }, []);

  function openAdd() {
    setForm(emptyForm);
    setEditId(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(student) {
    // 기존 active 필드 → status 마이그레이션
    const status = student.status || (student.active === false ? 'inactive' : 'active');
    setForm({
      name: student.name || '',
      classId: student.classId || '',
      service: student.service || '',
      phone: student.phone || '',
      parentPhone: student.parentPhone || '',
      address: student.address || '',
      status,
      joinDate: student.joinDate || '',
      gender: student.gender || '',
      grade: student.grade || '',
      school: student.school || '',
      ecclesia: student.ecclesia || false,
      baptized: student.baptized || false,
      ministryTeams: (student.ministryTeams || []).map((m) => ({
        year: m.year,
        departments: m.departments || (m.department ? [m.department] : []),
      })),
    });
    setEditId(student.id);
    setError('');
    setShowForm(true);
  }

  async function handleDelete(student) {
    const confirmed = window.confirm(
      `"${student.name}" 학생을 정말 삭제하시겠습니까?\n\n` +
      `⚠️ 이 작업은 되돌릴 수 없으며, 학생 정보가 영구 삭제됩니다.\n` +
      `(과거 출석 기록은 그대로 남습니다.)\n\n` +
      `타교회 이동/부서이동 등은 "상태 변경"을 사용하세요.`
    );
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'students', student.id));
      loadStudents();
    } catch (err) {
      alert('삭제 중 오류: ' + err.message);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return setError('이름을 입력하세요.');
    setSaving(true);
    setError('');
    try {
      const selectedClass = classes.find((c) => c.id === form.classId);
      const data = {
        ...form,
        name: form.name.trim(),
        service: selectedClass?.service || form.service || '',
        active: !TRANSFERRED.includes(form.status),
      };
      if (editId) {
        await updateDoc(doc(db, 'students', editId), data);
      } else {
        await addDoc(collection(db, 'students'), data);
      }
      setShowForm(false);
      loadStudents();
    } catch (err) {
      setError('저장 중 오류가 발생했습니다.');
      console.error(err);
    }
    setSaving(false);
  }

  const STATUS_BADGE = {
    active: null,
    long_absent: { label: '장결자', color: 'bg-amber-100 text-amber-700' },
    unclassified: { label: '미분류', color: 'bg-slate-100 text-slate-700' },
    transferred_seohyeon: { label: '서현이동', color: 'bg-pink-100 text-pink-700' },
    transferred_church: { label: '타교회 이동', color: 'bg-purple-100 text-purple-700' },
    transferred_dept: { label: '부서이동', color: 'bg-blue-100 text-blue-700' },
    inactive: { label: '비활성', color: 'bg-gray-100 text-gray-500' },
  };

  // 카테고리 필터링 매처
  const matchesCategory = (s, cat) => {
    const st = s.status || 'active';
    if (cat === 'cat_active') return st === 'active';
    if (cat === 'cat_long_absent') return st === 'long_absent';
    if (cat === 'cat_unclassified') return st === 'unclassified';
    if (cat === 'cat_transferred') return TRANSFERRED.includes(st);
    return st === cat; // 개별 status 값 매칭 (하위 호환)
  };

  let filtered = students;
  if (restrictClassId) filtered = filtered.filter((s) => s.classId === restrictClassId);
  if (filterService !== '전체') filtered = filtered.filter((s) => s.service === filterService);
  if (filterClass !== '전체') filtered = filtered.filter((s) => s.classId === filterClass);
  if (filterStatus !== '전체') filtered = filtered.filter((s) => matchesCategory(s, filterStatus));
  if (search) filtered = filtered.filter((s) => s.name.includes(search));

  const filteredClasses = filterService !== '전체'
    ? classes.filter((c) => c.service === filterService)
    : classes;

  return (
    <div>
      {/* 서브탭 (교사용에서는 숨김) */}
      {!hideSubTabs && (
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {SUB_TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setSubTab(i)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              subTab === i ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      )}

      {!hideSubTabs && subTab === 1 ? (
        <OfficerManagement />
      ) : (
      <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">학생 관리</h2>
        {canAdd && (
          <button onClick={() => navigate('/register-student')} className="btn-primary">
            + 새 학생 등록
          </button>
        )}
      </div>

      {/* 필터 */}
      <div className="card mb-4 flex flex-wrap gap-2">
        <div>
          <label className="label">예배</label>
          <select
            value={filterService}
            onChange={(e) => { setFilterService(e.target.value); setFilterClass('전체'); }}
            className="input"
          >
            <option>전체</option>
            <option>1부</option>
            <option>2부</option>
          </select>
        </div>
        <div>
          <label className="label">반</label>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="input"
          >
            <option value="전체">전체</option>
            {filteredClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.teacherName} 선생님반</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">분류</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input"
          >
            {CATEGORY_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">이름 검색</label>
          <input
            type="text"
            placeholder="이름..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
      </div>

      {/* 추가/수정 폼 */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editId ? '학생 수정' : '학생 추가'}</h3>
            <div className="space-y-3">
              <div>
                <label className="label">이름 *</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="학생 이름"
                />
              </div>
              <div>
                <label className="label">성별</label>
                <select
                  className="input"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">선택 안 함</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
              </div>
              <div>
                <label className="label">반 (미정 가능)</label>
                <select
                  className="input"
                  value={form.classId}
                  onChange={(e) => {
                    const cls = classes.find((c) => c.id === e.target.value);
                    setForm({ ...form, classId: e.target.value, service: cls?.service || '' });
                  }}
                >
                  <option value="">반 미정</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.teacherName} 선생님반 ({c.service})
                    </option>
                  ))}
                </select>
                {!form.classId && (
                  <p className="text-xs text-amber-500 mt-1">반이 미정인 학생은 출석체크 목록에 표시되지 않습니다.</p>
                )}
              </div>
              <div>
                <label className="label">학생 연락처</label>
                <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="010-0000-0000"
                  type="tel"
                />
              </div>
              <div>
                <label className="label">보호자 연락처</label>
                <input
                  className="input"
                  value={form.parentPhone}
                  onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
                  placeholder="010-0000-0000"
                  type="tel"
                />
              </div>
              <div>
                <label className="label">주소</label>
                <input
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="주소"
                />
              </div>
              <div>
                <label className="label">출석 학교</label>
                <input
                  className="input"
                  value={form.school}
                  onChange={(e) => setForm({ ...form, school: e.target.value })}
                  placeholder="예: 분당중학교"
                  list="school-list"
                />
              </div>
              <div>
                <label className="label">학년</label>
                <select
                  className="input"
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                >
                  <option value="">선택 안 함</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                <input
                  type="checkbox"
                  id="ecclesia-check"
                  checked={form.ecclesia}
                  onChange={(e) => setForm({ ...form, ecclesia: e.target.checked })}
                  className="w-5 h-5 accent-purple-600"
                />
                <label htmlFor="ecclesia-check" className="text-sm font-medium text-gray-700 cursor-pointer">
                  ✝ 에클레시아 참석
                </label>
              </div>
              <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                <input
                  type="checkbox"
                  id="baptized-check"
                  checked={form.baptized}
                  onChange={(e) => setForm({ ...form, baptized: e.target.checked })}
                  className="w-5 h-5 accent-blue-600"
                />
                <label htmlFor="baptized-check" className="text-sm font-medium text-gray-700 cursor-pointer">
                  ⛪ 입교 여부
                </label>
              </div>
              <div className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">🎶 사역</label>
                  <button
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      ministryTeams: [...form.ministryTeams, { year: new Date().getFullYear(), departments: [] }],
                    })}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-lg"
                  >
                    + 연차 추가
                  </button>
                </div>
                {form.ministryTeams.length === 0 && (
                  <p className="text-xs text-gray-400">사역 이력이 없습니다.</p>
                )}
                <div className="space-y-3">
                  {form.ministryTeams.map((item, idx) => (
                    <div key={idx} className="border border-gray-100 rounded-lg p-2 bg-gray-50">
                      <div className="flex items-center gap-2 mb-2">
                        <select
                          className="input flex-1"
                          value={item.year}
                          onChange={(e) => {
                            const updated = form.ministryTeams.map((it, i) =>
                              i === idx ? { ...it, year: Number(e.target.value) } : it
                            );
                            setForm({ ...form, ministryTeams: updated });
                          }}
                        >
                          {MINISTRY_YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => setForm({
                            ...form,
                            ministryTeams: form.ministryTeams.filter((_, i) => i !== idx),
                          })}
                          className="text-red-400 text-lg leading-none px-1"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {MINISTRY_DEPTS.map((d) => {
                          const checked = (item.departments || []).includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => {
                                const current = item.departments || [];
                                const next = checked ? current.filter((x) => x !== d) : [...current, d];
                                const updated = form.ministryTeams.map((it, i) =>
                                  i === idx ? { ...it, departments: next } : it
                                );
                                setForm({ ...form, ministryTeams: updated });
                              }}
                              className={`px-2.5 py-1 rounded-lg border-2 text-xs font-medium transition-all ${
                                checked
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-gray-200 text-gray-500 bg-white'
                              }`}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">새친구 등록일</label>
                <input
                  className="input"
                  type="date"
                  value={form.joinDate}
                  onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
                />
                {form.joinDate && (
                  <p className="text-xs text-green-600 mt-1">
                    ✅ 등록일로부터 30일간 "새친구" 마크가 표시됩니다. 출석률도 이 날부터 계산됩니다.
                  </p>
                )}
              </div>
              <div>
                <label className="label">상태</label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {TRANSFERRED.includes(form.status) && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ 이 상태는 출석체크 목록 및 등록 성도 카운트에서 제외됩니다.
                  </p>
                )}
                {form.status === 'long_absent' && (
                  <p className="text-xs text-amber-600 mt-1">
                    🙋 장결자도 등록 성도이며 출석체크 목록에 표시됩니다.
                  </p>
                )}
                {form.status === 'unclassified' && (
                  <p className="text-xs text-slate-600 mt-1">
                    📝 미분류 학생도 등록 성도이며, 추후 출석/장결자로 분류해주세요.
                  </p>
                )}
              </div>
            </div>
            {error && <div className="mt-3 text-red-500 text-sm">{error}</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? '저장 중...' : '저장'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 학생 목록 */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">불러오는 중...</div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-gray-500 mb-2">{filtered.length}명</div>
          {filtered.map((student) => {
            const cls = classes.find((c) => c.id === student.classId);
            return (
              <div
                key={student.id}
                className={`card flex items-center justify-between ${student.status && student.status !== 'active' ? 'opacity-60' : ''}`}
              >
                <div>
                  <div className="font-medium text-gray-800 flex items-center gap-2 flex-wrap">
                    {student.name}
                    {student.joinDate &&
                      (new Date() - new Date(student.joinDate)) / (1000 * 60 * 60 * 24) <= 30 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          새친구
                        </span>
                      )}
                    {STATUS_BADGE[student.status || 'active'] && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[student.status].color}`}>
                        {STATUS_BADGE[student.status].label}
                      </span>
                    )}
                    {student.baptized && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        입교
                      </span>
                    )}
                    {getOfficerRoles(student, new Date().getFullYear()).map((role) => {
                      const color = role === '회장'
                        ? 'bg-yellow-300 text-yellow-900'
                        : role === '부회장'
                        ? 'bg-gray-300 text-gray-700'
                        : 'bg-orange-300 text-orange-900';
                      return (
                        <span key={role} className={`text-xs px-2 py-0.5 rounded-full font-semibold ${color}`}>
                          👑 {role}
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-xs text-gray-400">
                    {cls?.teacherName ? `${cls.teacherName} 선생님반` : '반 미정'}{student.service ? ` · ${student.service}` : ''}{student.gender ? ` · ${student.gender}` : ''}
                  </div>
                  {(student.school || student.grade) && (
                    <div className="text-xs text-gray-400">
                      🏫 {student.school || '학교 미입력'}{student.grade ? ` · ${student.grade}` : ''}
                      {student.ecclesia && <span className="ml-1 text-purple-600">✝ 에클레시아</span>}
                    </div>
                  )}
                  {student.joinDate && (
                    <div className="text-xs text-green-600">📅 등록일: {student.joinDate.slice(5).replace('-', '/')}</div>
                  )}
                  {student.phone && <div className="text-xs text-gray-400">📱 {student.phone}</div>}
                  {student.parentPhone && <div className="text-xs text-gray-400">👨‍👩‍👧 {student.parentPhone}</div>}
                  {student.ministryTeams?.length > 0 && (
                    <div className="text-xs text-gray-400">
                      🎶 {student.ministryTeams.map((m) => {
                        const depts = m.departments || (m.department ? [m.department] : []);
                        return `${m.year}-${depts.join('/')}`;
                      }).filter((s) => !s.endsWith('-')).join(', ')}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => openEdit(student)}
                    className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded-lg"
                  >
                    수정
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(student)}
                      className="text-xs px-3 py-1 bg-red-100 text-red-700 rounded-lg"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}
