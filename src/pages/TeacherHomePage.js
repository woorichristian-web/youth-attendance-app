import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, doc, onSnapshot, setDoc, getDoc, updateDoc, increment, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import AttendanceSheet from '../components/attendance/AttendanceSheet';
import PastAttendance from '../components/dashboard/PastAttendance';
import StudentDashboardPage from './StudentDashboardPage';
import { getThisSunday, formatDateKo, isValidSunday } from '../utils/dateUtils';
import { isRegistered } from '../utils/statusUtils';

// 두 날짜 사이 일요일 개수
function countSundaysBetween(start, end) {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (cur.getDay() === 0) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// 학생 상세 패널 — 월별 출석률 차트, 결석 요약, 장결 여부
function StudentDetailPanel({ s, yearTotalSundays }) {
  const monthly = s.monthly || [];
  const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const maxRate = 100;
  const avgRate = (() => {
    const nums = monthly.map((m) => m.rate).filter((v) => v != null);
    if (nums.length === 0) return null;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  })();

  return (
    <div className="border-t border-ocean-100 bg-white/70 px-4 py-4 space-y-3">
      {/* 요약 라인 */}
      <div className="grid grid-cols-3 gap-2">
        <MetricPill label="누적 출석률" value={s.rate == null ? '-' : `${s.rate}%`} tone="teal" />
        <MetricPill label="월평균" value={avgRate == null ? '-' : `${avgRate}%`} tone="ocean" />
        <MetricPill label="결석 (올해)" value={s.absentLabel} tone="rose" />
      </div>

      {/* 월별 출석률 막대 차트 */}
      <div>
        <div className="text-xs text-ink-muted mb-1.5">월별 출석률</div>
        <div className="flex items-end gap-1 h-24 pt-1">
          {monthly.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center justify-end">
              <div className="text-[9px] text-ink-muted mb-0.5">{m.rate == null ? '-' : m.rate}</div>
              <div
                className={`w-full rounded-t-md ${m.rate == null ? 'bg-stone-200' : m.rate >= 75 ? 'bg-emerald-500' : m.rate >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
                style={{ height: `${((m.rate ?? 0) / maxRate) * 100}%`, minHeight: m.rate != null ? '4px' : '2px' }}
              />
              <div className="text-[9px] text-ink-muted mt-1">{MONTH_LABELS[m.month - 1]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 개인 정보 라인 */}
      {(s.phone || s.parentPhone) && (
        <div className="text-xs text-ink-muted flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {s.phone && <span>📱 {s.phone}</span>}
          {s.parentPhone && <span>👨‍👩‍👧 {s.parentPhone}</span>}
        </div>
      )}
    </div>
  );
}

function MetricPill({ label, value, tone }) {
  const bg = tone === 'teal' ? 'bg-teal-50 text-teal-700' :
             tone === 'rose' ? 'bg-rose-50 text-rose-700' :
             'bg-ocean-50 text-ocean-700';
  return (
    <div className={`rounded-xl px-3 py-2 ${bg}`}>
      <div className="text-[10px] font-medium opacity-80">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

export default function TeacherHomePage() {
  const { userProfile, currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'attend';
  // 제자성장(실천 카드)은 임시 숨김 — 주소로 직접 접근해도 홈(출석)으로 대체
  const tab = rawTab === 'growth' ? 'attend' : rawTab;

  const myClassId = userProfile?.classId;
  const myService = userProfile?.service;
  const myName = userProfile?.name || currentUser?.email;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">👋 {myName} 선생님</h1>
        <p className="text-sm text-ocean-700 mt-1">
          {myName} 선생님, 오늘도 섬겨주셔서 감사합니다.
        </p>
        <p className="text-xs text-ink-muted mt-0.5">
          {myService ? `${myService} · ` : ''}{myClassId ? `${myClassId.replace(/^\d+부_/, '')} 선생님반` : '반 미배정'}
        </p>
      </div>

      {tab === 'attend' && <AttendSection classId={myClassId} service={myService} teacherName={userProfile?.name} />}
      {tab === 'growth' && <GrowthSection classId={myClassId} teacherName={userProfile?.name} />}
      {tab === 'songcheong' && <StudentDashboardPage embedded />}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 출석 섹션 (하위 탭: 출석체크 / 연간출석율 / 주일별 출석기록)
// ────────────────────────────────────────────────────────
const ATTEND_SUB_TABS = [
  { id: 'check', label: '출석체크' },
  { id: 'summary', label: '연간출석율' },
  { id: 'weekly', label: '주일별 출석기록' },
];

function AttendSection({ classId, service, teacherName }) {
  const [sub, setSub] = useState('check');
  const [date, setDate] = useState(getThisSunday());

  if (!classId) {
    return (
      <div className="card bg-amber-50 border-amber-200 text-amber-700 text-center py-6 text-sm">
        담당 반이 배정되지 않았습니다. 관리자에게 문의해주세요.
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1 mb-3 bg-white/60 rounded-xl p-1 w-fit max-w-full overflow-x-auto">
        {ATTEND_SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              sub === t.id ? 'bg-white text-ocean-600 shadow-sm' : 'text-ink-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'check' && (
        <div>
          <div className="card mb-3">
            <label className="label">📅 예배일</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-xs text-ink-muted mt-1">{formatDateKo(date)}</p>
          </div>
          {isValidSunday(date) ? (
            <AttendanceSheet
              date={date}
              service={service}
              teacher={{ id: `teacher_${classId}`, name: teacherName, classId }}
              classId={classId}
            />
          ) : (
            <div className="card text-center text-ink-muted py-6 text-sm">
              일요일을 선택해주세요.
            </div>
          )}
        </div>
      )}

      {sub === 'summary' && <ClassAttendanceSummary classId={classId} />}
      {sub === 'weekly' && <WeeklyAttendanceSection classId={classId} />}
    </div>
  );
}

// 주일별 출석기록 — 주별 달력 뷰
// 반 선생님은 자기 반 기록만 볼 수 있다 (전체 현황은 어드민 전용)
function WeeklyAttendanceSection({ classId }) {
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let s = false, a = false, c = false;
    const done = () => { if (s && a && c) setLoading(false); };
    const u1 = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((st) => st.classId === classId));
      s = true; done();
    });
    const u2 = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map((d) => d.data()).filter((a2) => a2.classId === classId));
      a = true; done();
    });
    const u3 = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c2) => c2.id === classId));
      c = true; done();
    });
    return () => { u1(); u2(); u3(); };
  }, [classId]);

  if (loading) {
    return <div className="card text-center text-ink-muted py-8 text-sm">불러오는 중...</div>;
  }
  return (
    <div>
      <div className="card bg-white/70 text-xs text-ink-muted mb-3">
        우리 반 기준의 주일별 기록입니다. (부서 전체 현황은 관리자 화면에서 볼 수 있어요)
      </div>
      <PastAttendance attendanceList={attendance} students={students} classes={classes} />
    </div>
  );
}

function ClassAttendanceSummary({ classId }) {
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let s = false, a = false;
    const done = () => { if (s && a) setLoading(false); };
    const u1 = onSnapshot(collection(db, 'students'), (snap) => {
      // 타교회 이동 등 비재적 학생은 우리반 출석현황에서 제외
      setStudents(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((x) => x.classId === classId)
          .filter(isRegistered)
      );
      s = true; done();
    });
    const u2 = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map((d) => d.data()).filter((x) => x.classId === classId));
      a = true; done();
    });
    return () => { u1(); u2(); };
  }, [classId]);

  if (loading) return <div className="card text-center text-ink-muted py-6 text-sm">불러오는 중...</div>;

  // 전체 예배(일요일) 수 — 올해 1월 1일부터 현재까지의 일요일 개수
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const yearTotalSundays = countSundaysBetween(jan1, now);

  // 학생별 통계 + 월별 데이터
  const stats = students.map((st) => {
    let present = 0, absent = 0, missing = 0;
    const attendedDates = new Set();
    const absentDates = new Set();
    attendance.forEach((rec) => {
      const r = rec.records?.find((rr) => rr.studentId === st.id);
      if (!r) return;
      if (r.present === true) { present++; attendedDates.add(rec.date); }
      else if (r.present === false) { absent++; absentDates.add(rec.date); }
      else missing++;
    });
    const total = present + absent;
    const rate = total > 0 ? Math.round((present / total) * 100) : null;

    // 월별 출석률
    const monthly = [];
    for (let m = 0; m <= now.getMonth(); m++) {
      const monStart = new Date(now.getFullYear(), m, 1);
      const monEnd = new Date(now.getFullYear(), m + 1, 0);
      const monKey = String(m + 1).padStart(2, '0');
      let mP = 0, mA = 0;
      attendedDates.forEach((d) => { if (d.startsWith(`${now.getFullYear()}-${monKey}`)) mP++; });
      absentDates.forEach((d) => { if (d.startsWith(`${now.getFullYear()}-${monKey}`)) mA++; });
      const mT = mP + mA;
      monthly.push({ month: m + 1, rate: mT > 0 ? Math.round((mP / mT) * 100) : null });
    }

    // 결석 표기: 01월~현재 결석수 / 올해 총 일요일 수
    const absentLabel = `${String(absent).padStart(2, '0')}/${String(yearTotalSundays).padStart(2, '0')}`;

    const isLongAbsent = st.status === 'long_absent';

    return { ...st, present, absent, missing, rate, monthly, absentLabel, isLongAbsent };
  }).sort((a, b) => {
    // 장결자를 하단, 나머지는 출석률 내림차순
    if (a.isLongAbsent !== b.isLongAbsent) return a.isLongAbsent ? 1 : -1;
    return (b.rate ?? -1) - (a.rate ?? -1) || (a.name || '').localeCompare(b.name || '', 'ko');
  });

  return (
    <div>
      <div className="text-sm text-ink-muted mb-2">우리 반 · {stats.length}명 · 최근 예배 기준 누적</div>
      <div className="space-y-2">
        {stats.map((s) => {
          const open = expandedId === s.id;
          return (
            <div key={s.id} className={`card p-0 overflow-hidden ${s.isLongAbsent ? 'border-red-200 bg-red-50/40' : ''}`}>
              <button
                onClick={() => setExpandedId(open ? null : s.id)}
                className="w-full flex items-center justify-between py-3 px-4 text-left hover:bg-ocean-50/40 transition-colors"
              >
                <div>
                  <div className="font-medium text-ink flex items-center gap-1.5 flex-wrap">
                    {s.name}
                    {s.isLongAbsent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-semibold flex items-center gap-0.5">
                        🚩 장결자
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">
                    {s.grade || '학년 미정'}{s.gender ? ` · ${s.gender}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm">
                      <span className="text-emerald-600 font-semibold">{s.present}</span>
                      <span className="text-ink-muted"> / </span>
                      <span className="text-rose-500">{s.absent}</span>
                    </div>
                    <div className="text-xs text-ink-muted">
                      {s.rate == null ? '기록없음' : `${s.rate}%`}
                    </div>
                  </div>
                  <span className={`text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                </div>
              </button>

              {open && <StudentDetailPanel s={s} yearTotalSundays={yearTotalSundays} />}
            </div>
          );
        })}
        {stats.length === 0 && (
          <div className="card text-center text-ink-muted py-6 text-sm">우리 반 학생이 없습니다.</div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 성장 섹션 (스티커)
// ────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: 'quiet_time', name: '말씀 묵상', emoji: '📖', points: 5 },
  { id: 'writing', name: '필사', emoji: '✍️', points: 5 },
  { id: 'personal_goal', name: '개인 목표 달성', emoji: '🎯', points: 5 },
];

function GrowthSection({ classId, teacherName }) {
  const [students, setStudents] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [counts, setCounts] = useState({}); // {studentId: {catId: count}}
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', emoji: '⭐', points: 5, desc: '' });
  const [editCat, setEditCat] = useState(null); // 수정 중인 카드 {id, name, emoji, points, desc}
  const [selectedCat, setSelectedCat] = useState(null);

  useEffect(() => {
    if (!classId) return;
    let s = false, c = false;
    const done = () => { if (s && c) setLoading(false); };

    const u1 = onSnapshot(collection(db, 'students'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.classId === classId)
        .filter(isRegistered) // 타교회 이동 등 비재적 학생 제외
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      setStudents(list);
      s = true; done();
    });

    // 카테고리 설정 (반별)
    const catRef = doc(db, 'class_growth_categories', classId);
    const u2 = onSnapshot(catRef, (snap) => {
      if (snap.exists() && Array.isArray(snap.data().categories)) {
        setCategories(snap.data().categories);
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
      c = true; done();
    });

    // 학생별 스티커 카운트
    const u3 = onSnapshot(collection(db, 'student_growth'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data() || {}; });
      setCounts(map);
    });

    return () => { u1(); u2(); u3(); };
  }, [classId]);

  async function giveSticker(studentId, catId) {
    const ref = doc(db, 'student_growth', studentId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { [catId]: increment(1) });
    } else {
      await setDoc(ref, { [catId]: 1 });
    }
    // 지급 기록 (어드민 실천 카드 현황의 기간 집계용)
    try {
      const st = students.find((s) => s.id === studentId);
      await addDoc(collection(db, 'growth_logs'), {
        studentId,
        studentName: st?.name || '',
        classId,
        catId,
        ts: Date.now(),
        teacher: teacherName || '',
      });
    } catch (e) {
      console.error('스티커 기록 저장 오류:', e);
    }
  }

  async function resetSticker(studentId, catId) {
    if (!window.confirm('이 학생의 이 카테고리 스티커 개수를 0으로 초기화할까요?')) return;
    const ref = doc(db, 'student_growth', studentId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { [catId]: 0 });
    } else {
      await setDoc(ref, { [catId]: 0 });
    }
  }

  async function removeCategory(catId) {
    if (!window.confirm('이 카테고리를 삭제할까요? (기록은 유지)')) return;
    const next = categories.filter((c) => c.id !== catId);
    await setDoc(doc(db, 'class_growth_categories', classId), { categories: next }, { merge: true });
  }

  async function addCategory() {
    if (!newCat.name.trim()) return;
    const id = `cat_${Date.now()}`;
    const nextList = [...categories, {
      id,
      name: newCat.name.trim(),
      emoji: newCat.emoji,
      points: Number(newCat.points) || 5,
      desc: (newCat.desc || '').trim(),
      createdAt: Date.now(),
    }];
    const ref = doc(db, 'class_growth_categories', classId);
    await setDoc(ref, { categories: nextList, updatedBy: teacherName || '' }, { merge: true });
    setNewCat({ name: '', emoji: '⭐', points: 5, desc: '' });
    setAddOpen(false);
  }

  async function saveEditCat() {
    if (!editCat || !editCat.name.trim()) return;
    const nextList = categories.map((c) => c.id === editCat.id
      ? {
          ...c,
          name: editCat.name.trim(),
          emoji: editCat.emoji || '⭐',
          points: Number(editCat.points) || 5,
          desc: (editCat.desc || '').trim(),
        }
      : c);
    await setDoc(doc(db, 'class_growth_categories', classId), {
      categories: nextList,
      updatedBy: teacherName || '',
    }, { merge: true });
    setEditCat(null);
  }

  if (!classId) {
    return (
      <div className="card bg-amber-50 border-amber-200 text-amber-700 text-center py-6 text-sm">
        담당 반이 배정되지 않았습니다.
      </div>
    );
  }
  if (loading) return <div className="card text-center text-ink-muted py-6 text-sm">불러오는 중...</div>;

  // 선택된 카테고리 화면 (학생 리스트 + 개별 +/리셋)
  if (selectedCat) {
    const cat = categories.find((c) => c.id === selectedCat);
    if (!cat) { setSelectedCat(null); return null; }
    return (
      <div>
        <button
          onClick={() => setSelectedCat(null)}
          className="text-sm text-ink-muted hover:text-ink mb-3 flex items-center gap-1"
        >
          ← 실천 카드 목록으로
        </button>
        <div className="card mb-4 bg-white/80">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{cat.emoji}</div>
            <div className="flex-1">
              <div className="font-bold text-ink">{cat.name}</div>
              {cat.desc && <div className="text-xs text-ink-soft mt-0.5">🎯 {cat.desc}</div>}
              <div className="text-xs text-ink-muted">스티커 한 번당 +{cat.points}P</div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {students.map((s) => {
            const cnt = (counts[s.id] || {})[cat.id] || 0;
            return (
              <div key={s.id} className="card flex items-center justify-between py-3">
                <div>
                  <div className="font-medium text-ink">{s.name}</div>
                  <div className="text-xs text-ink-muted">
                    {s.grade || ''}{s.gender ? ` · ${s.gender}` : ''} · <span className="text-ocean-600 font-semibold">{cnt}회 · {cnt * cat.points}P</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => resetSticker(s.id, cat.id)}
                    className="text-xs px-3 py-1.5 border border-stone-200 text-stone-500 rounded-full hover:bg-stone-100"
                    title="리셋"
                  >
                    ↺ 리셋
                  </button>
                  <button
                    onClick={() => giveSticker(s.id, cat.id)}
                    className="text-sm px-4 py-2 bg-ocean-400 text-white font-semibold rounded-full hover:bg-ocean-500 shadow-sm"
                  >
                    +1 스티커
                  </button>
                </div>
              </div>
            );
          })}
          {students.length === 0 && (
            <div className="card text-center text-ink-muted py-6 text-sm">우리 반 학생이 없습니다.</div>
          )}
        </div>
      </div>
    );
  }

  // 카테고리 카드 그리드
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-ink">🌱 신앙 성장 실천 카드</div>
        <button onClick={() => setAddOpen(true)} className="text-xs px-3 py-1.5 bg-ocean-400 text-white rounded-full font-medium shadow-sm">
          + 카드 추가
        </button>
      </div>

      {addOpen && (
        <div className="card mb-3">
          <div className="font-semibold mb-2 text-sm">새 카드 추가</div>
          <div className="grid grid-cols-6 gap-2 items-center mb-2">
            <input className="input col-span-1 text-center" maxLength={2} value={newCat.emoji} onChange={(e) => setNewCat({ ...newCat, emoji: e.target.value })} />
            <input className="input col-span-3" placeholder="이름 (예: 필사)" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
            <input className="input col-span-2" type="number" min="1" max="100" value={newCat.points} onChange={(e) => setNewCat({ ...newCat, points: e.target.value })} />
          </div>
          <input
            className="input mb-2"
            placeholder="목표·내용 (예: 매일 말씀 한 장 읽기)"
            value={newCat.desc}
            onChange={(e) => setNewCat({ ...newCat, desc: e.target.value })}
          />
          <div className="flex gap-2">
            <button onClick={addCategory} className="btn-primary flex-1">추가</button>
            <button onClick={() => setAddOpen(false)} className="btn-secondary flex-1">취소</button>
          </div>
        </div>
      )}

      {/* 가로형 카드 세로 리스트 */}
      <div className="space-y-2.5">
        {categories.map((cat) => {
          const totalGiven = students.reduce((sum, s) => sum + ((counts[s.id] || {})[cat.id] || 0), 0);

          // 수정 모드 카드
          if (editCat?.id === cat.id) {
            return (
              <div key={cat.id} className="card py-3.5 border-ocean-200">
                <div className="font-semibold text-sm text-ink mb-2">✏️ 카드 수정</div>
                <div className="grid grid-cols-6 gap-2 items-center mb-2">
                  <input className="input col-span-1 text-center" maxLength={2} value={editCat.emoji} onChange={(e) => setEditCat({ ...editCat, emoji: e.target.value })} />
                  <input className="input col-span-3" placeholder="이름" value={editCat.name} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} />
                  <input className="input col-span-2" type="number" min="1" max="100" value={editCat.points} onChange={(e) => setEditCat({ ...editCat, points: e.target.value })} />
                </div>
                <input
                  className="input mb-2"
                  placeholder="목표·내용 (예: 매일 말씀 한 장 읽기)"
                  value={editCat.desc}
                  onChange={(e) => setEditCat({ ...editCat, desc: e.target.value })}
                />
                <div className="flex gap-2">
                  <button onClick={saveEditCat} className="btn-primary flex-1">저장</button>
                  <button onClick={() => setEditCat(null)} className="btn-secondary flex-1">취소</button>
                </div>
              </div>
            );
          }

          return (
            <div key={cat.id} className="card flex items-center gap-4 py-3.5 hover:shadow-soft transition-all">
              <button
                onClick={() => setSelectedCat(cat.id)}
                className="flex-1 flex items-center gap-4 text-left min-w-0"
              >
                <div className="text-4xl flex-shrink-0">{cat.emoji}</div>
                <div className="min-w-0">
                  <div className="font-bold text-ink truncate">{cat.name}</div>
                  {cat.desc && (
                    <div className="text-xs text-ink-soft mt-0.5 truncate">🎯 {cat.desc}</div>
                  )}
                  <div className="text-xs text-ink-muted mt-0.5">한 번당 +{cat.points}P</div>
                </div>
                <div className="ml-auto text-right flex-shrink-0 pr-1">
                  <div className="text-sm font-bold text-ocean-600">{totalGiven}회</div>
                  <div className="text-[10px] text-ink-muted">이번 학기 부여</div>
                </div>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0 border-l border-ocean-100 pl-3">
                <button
                  onClick={() => setSelectedCat(cat.id)}
                  className="text-xs px-3 py-1.5 bg-ocean-100 text-ocean-700 rounded-full font-medium hover:bg-ocean-200/70"
                >
                  주기
                </button>
                <button
                  onClick={() => setEditCat({ id: cat.id, name: cat.name, emoji: cat.emoji || '⭐', points: cat.points || 5, desc: cat.desc || '' })}
                  className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-ocean-600 hover:bg-ocean-50 rounded-full transition-colors"
                  title="카드 수정"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  onClick={() => removeCategory(cat.id)}
                  className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
                  title="카드 삭제"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
        {categories.length === 0 && (
          <div className="card text-center text-ink-muted py-6 text-sm">
            실천 카드가 없습니다. '+ 카드 추가'로 만들어주세요.
          </div>
        )}
      </div>
    </div>
  );
}

// 송청 섹션은 StudentDashboardPage(embedded)를 사용
// — 임원 / 찬양팀·예배팀 / 에클레시아 / 교사 명단 카드형 탭
