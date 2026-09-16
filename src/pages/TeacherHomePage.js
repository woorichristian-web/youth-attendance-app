import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection, getDocs, doc, onSnapshot, setDoc, getDoc, updateDoc, increment,
  addDoc, deleteDoc, query, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import AttendanceSheet from '../components/attendance/AttendanceSheet';
import { getThisSunday, formatDateKo, isValidSunday } from '../utils/dateUtils';

const VALID_TABS = ['attend', 'growth', 'songcheong'];

export default function TeacherHomePage() {
  const { userProfile, currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = VALID_TABS.includes(tabParam) ? tabParam : 'attend';

  const myClassId = userProfile?.classId;
  const myService = userProfile?.service;
  const myName = userProfile?.name || currentUser?.email;

  const TAB_TITLES = {
    attend: { icon: '✅', title: '출석', desc: '주일 출석을 체크하고 우리 반 현황을 확인해요' },
    growth: { icon: '🌱', title: '성장', desc: '학생별로 스티커를 주며 신앙 성장을 응원해요' },
    songcheong: { icon: '🙏', title: '송청', desc: '송림청소년부 임원과 사역팀을 소개해요' },
  };
  const head = TAB_TITLES[tab];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-6">
      <div className="mb-5 flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">{head.icon} {head.title}</h1>
          <p className="text-sm text-ink-muted mt-0.5">{head.desc}</p>
        </div>
        <div className="text-xs text-ink-muted bg-white/70 border border-white/60 rounded-full px-3 py-1.5 backdrop-blur">
          {myName} 선생님{myService ? ` · ${myService}` : ''}
          {myClassId ? ` · ${myClassId.replace(/^\d+부_/, '')}반` : ''}
        </div>
      </div>

      {tab === 'attend' && <AttendSection classId={myClassId} service={myService} teacherName={userProfile?.name} />}
      {tab === 'growth' && <GrowthSection classId={myClassId} teacherName={userProfile?.name} />}
      {tab === 'songcheong' && <SongCheongSection />}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 출석 섹션 (하위 탭: 출석 체크 / 우리반 출석현황)
// ────────────────────────────────────────────────────────
const ATTEND_SUB_TABS = [
  { id: 'check', label: '출석 체크' },
  { id: 'summary', label: '우리반 출석현황' },
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
      <div className="flex gap-1 mb-3 bg-white/60 rounded-xl p-1 w-fit">
        {ATTEND_SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
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
    </div>
  );
}

function ClassAttendanceSummary({ classId }) {
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let s = false, a = false;
    const done = () => { if (s && a) setLoading(false); };
    const u1 = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.classId === classId));
      s = true; done();
    });
    const u2 = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map((d) => d.data()).filter((x) => x.classId === classId));
      a = true; done();
    });
    return () => { u1(); u2(); };
  }, [classId]);

  if (loading) return <div className="card text-center text-ink-muted py-6 text-sm">불러오는 중...</div>;

  // 학생별 출석/결석/미체크 카운트
  const stats = students.map((st) => {
    let present = 0, absent = 0, missing = 0;
    attendance.forEach((rec) => {
      const r = rec.records?.find((rr) => rr.studentId === st.id);
      if (!r) return;
      if (r.present === true) present++;
      else if (r.present === false) absent++;
      else missing++;
    });
    const total = present + absent;
    const rate = total > 0 ? Math.round((present / total) * 100) : null;
    return { ...st, present, absent, missing, rate };
  }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || (a.name || '').localeCompare(b.name || '', 'ko'));

  return (
    <div>
      <div className="text-sm text-ink-muted mb-2">우리 반 · {stats.length}명 · 최근 예배 기준 누적</div>
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={s.id} className="card flex items-center justify-between py-3">
            <div>
              <div className="font-medium text-ink">{s.name}</div>
              <div className="text-xs text-ink-muted mt-0.5">
                {s.grade || '학년 미정'}{s.gender ? ` · ${s.gender}` : ''}
              </div>
            </div>
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
          </div>
        ))}
        {stats.length === 0 && (
          <div className="card text-center text-ink-muted py-6 text-sm">우리 반 학생이 없습니다.</div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 성장 섹션 — 스티커 영역(기본: 말씀묵상)별로 학생에게 스티커 주기
// 데이터:
//  - class_growth_categories/{classId} : { categories: [{id,name,emoji,points}] } (영역 목록)
//  - student_growth/{studentId}        : { [areaId]: 누적개수 }
//  - growth_logs (컬렉션)               : { studentId, classId, catId, points, ts, teacher } (개별 기록)
// ────────────────────────────────────────────────────────
const DEFAULT_AREAS = [
  { id: 'quiet_time', name: '말씀묵상', emoji: '📖', points: 5 },
];

const EMOJI_CHOICES = ['📖', '✍️', '🙌', '🤝', '💬', '⭐', '🔥', '🎵', '❤️', '🕊️'];

function getWeekStart() {
  // 주일(일요일) 시작 기준 이번 주
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function GrowthSection({ classId, teacherName }) {
  const [students, setStudents] = useState([]);
  const [areas, setAreas] = useState(DEFAULT_AREAS);
  const [activeAreaId, setActiveAreaId] = useState(DEFAULT_AREAS[0].id);
  const [counts, setCounts] = useState({}); // {studentId: {areaId: count}}
  const [logs, setLogs] = useState([]); // 우리 반 스티커 기록
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newArea, setNewArea] = useState({ name: '', emoji: '✍️', points: 5 });
  const [busy, setBusy] = useState(null); // `${studentId}` 처리 중 표시

  useEffect(() => {
    if (!classId) return;
    let s = false, c = false;
    const done = () => { if (s && c) setLoading(false); };

    const u1 = onSnapshot(collection(db, 'students'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.classId === classId)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      setStudents(list);
      s = true; done();
    });

    // 스티커 영역 목록 (반별 설정)
    const catRef = doc(db, 'class_growth_categories', classId);
    const u2 = onSnapshot(catRef, (snap) => {
      if (snap.exists() && Array.isArray(snap.data().categories) && snap.data().categories.length > 0) {
        setAreas(snap.data().categories);
      } else {
        setAreas(DEFAULT_AREAS);
      }
      c = true; done();
    });

    // 학생별 누적 카운트
    const u3 = onSnapshot(collection(db, 'student_growth'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data() || {}; });
      setCounts(map);
    });

    // 우리 반 스티커 기록 (이번 주 카운트/취소용)
    const u4 = onSnapshot(query(collection(db, 'growth_logs'), where('classId', '==', classId)), (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => { u1(); u2(); u3(); u4(); };
  }, [classId]);

  // 활성 영역이 목록에서 사라졌으면 첫 영역으로
  useEffect(() => {
    if (!areas.find((a) => a.id === activeAreaId)) {
      setActiveAreaId(areas[0]?.id);
    }
  }, [areas, activeAreaId]);

  const activeArea = areas.find((a) => a.id === activeAreaId) || areas[0];
  const weekStart = getWeekStart();

  const weeklyByStudent = useMemo(() => {
    const map = {};
    logs.forEach((l) => {
      if (l.catId !== activeArea?.id) return;
      if ((l.ts || 0) < weekStart) return;
      map[l.studentId] = (map[l.studentId] || 0) + 1;
    });
    return map;
  }, [logs, activeArea, weekStart]);

  async function giveSticker(student) {
    if (!activeArea || busy) return;
    setBusy(student.id);
    try {
      const ref = doc(db, 'student_growth', student.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, { [activeArea.id]: increment(1) });
      } else {
        await setDoc(ref, { [activeArea.id]: 1 });
      }
      await addDoc(collection(db, 'growth_logs'), {
        studentId: student.id,
        studentName: student.name || '',
        classId,
        catId: activeArea.id,
        points: activeArea.points || 0,
        ts: Date.now(),
        teacher: teacherName || '',
      });
    } catch (e) {
      console.error('스티커 저장 오류:', e);
      alert('스티커 저장 중 오류가 발생했습니다.');
    }
    setBusy(null);
  }

  async function undoSticker(student) {
    if (!activeArea || busy) return;
    const mine = logs
      .filter((l) => l.studentId === student.id && l.catId === activeArea.id)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const cur = (counts[student.id] || {})[activeArea.id] || 0;
    if (cur <= 0) return;
    if (!window.confirm(`${student.name} 학생의 ${activeArea.name} 스티커 1개를 취소할까요?`)) return;
    setBusy(student.id);
    try {
      const ref = doc(db, 'student_growth', student.id);
      await updateDoc(ref, { [activeArea.id]: increment(-1) });
      if (mine[0]) await deleteDoc(doc(db, 'growth_logs', mine[0].id));
    } catch (e) {
      console.error('스티커 취소 오류:', e);
    }
    setBusy(null);
  }

  async function addArea() {
    if (!newArea.name.trim()) return;
    const id = `cat_${Date.now()}`;
    const nextList = [...areas, {
      id,
      name: newArea.name.trim(),
      emoji: newArea.emoji || '⭐',
      points: Number(newArea.points) || 5,
    }];
    await setDoc(doc(db, 'class_growth_categories', classId), {
      categories: nextList,
      updatedBy: teacherName || '',
    }, { merge: true });
    setNewArea({ name: '', emoji: '✍️', points: 5 });
    setAddOpen(false);
    setActiveAreaId(id);
  }

  async function removeArea(area) {
    if (area.id === 'quiet_time') return; // 기본 영역은 삭제 불가
    if (!window.confirm(`'${area.name}' 영역을 삭제할까요?\n(이미 준 스티커 기록은 남아있지만 화면에는 보이지 않게 됩니다)`)) return;
    const nextList = areas.filter((a) => a.id !== area.id);
    await setDoc(doc(db, 'class_growth_categories', classId), {
      categories: nextList,
      updatedBy: teacherName || '',
    }, { merge: true });
  }

  if (!classId) {
    return (
      <div className="card bg-amber-50 border-amber-200 text-amber-700 text-center py-6 text-sm">
        담당 반이 배정되지 않았습니다.
      </div>
    );
  }
  if (loading) return <div className="card text-center text-ink-muted py-6 text-sm">불러오는 중...</div>;

  return (
    <div>
      {/* 영역(스티커 종류) 하위 탭 */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        <div className="flex gap-1 bg-white/60 rounded-xl p-1 flex-wrap">
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAreaId(a.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeAreaId === a.id ? 'bg-white text-ocean-600 shadow-sm' : 'text-ink-muted'
              }`}
            >
              {a.emoji} {a.name}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAddOpen((o) => !o)}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-ocean-600 bg-ocean-100 hover:bg-ocean-200/70 transition-all"
          title="스티커 영역 추가 (예: 필사)"
        >
          + 영역 추가
        </button>
      </div>

      {/* 영역 추가 폼 */}
      {addOpen && (
        <div className="card mb-3">
          <div className="font-semibold mb-2 text-sm">새 스티커 영역 추가</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                onClick={() => setNewArea({ ...newArea, emoji: e })}
                className={`w-10 h-10 rounded-xl text-xl border transition-all ${
                  newArea.emoji === e ? 'border-ocean-400 bg-ocean-50 ring-2 ring-blue-400' : 'border-ocean-100 bg-white'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-2 items-center mb-2">
            <input
              className="input col-span-4"
              placeholder="영역 이름 (예: 필사)"
              value={newArea.name}
              onChange={(e) => setNewArea({ ...newArea, name: e.target.value })}
            />
            <div className="col-span-2 flex items-center gap-1">
              <input
                className="input"
                type="number" min="1" max="100"
                value={newArea.points}
                onChange={(e) => setNewArea({ ...newArea, points: e.target.value })}
              />
              <span className="text-xs text-ink-muted whitespace-nowrap">P</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addArea} className="btn-primary flex-1">추가</button>
            <button onClick={() => setAddOpen(false)} className="btn-secondary flex-1">취소</button>
          </div>
        </div>
      )}

      {/* 현재 영역 안내 */}
      {activeArea && (
        <div className="card mb-3 flex items-center justify-between bg-white/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ocean-100 flex items-center justify-center text-xl">
              {activeArea.emoji}
            </div>
            <div>
              <div className="font-bold text-ink">{activeArea.name}</div>
              <div className="text-xs text-ink-muted">
                스티커 1개 = <span className="text-ocean-600 font-semibold">+{activeArea.points}P</span> · 학생 이름 옆 버튼을 눌러 주세요
              </div>
            </div>
          </div>
          {activeArea.id !== 'quiet_time' && (
            <button
              onClick={() => removeArea(activeArea)}
              className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
            >
              영역 삭제
            </button>
          )}
        </div>
      )}

      {/* 학생별 스티커 카드 */}
      <div className="space-y-3">
        {students.map((s) => {
          const c = counts[s.id] || {};
          const areaCount = c[activeArea?.id] || 0;
          const weekly = weeklyByStudent[s.id] || 0;
          const totalPoints = areas.reduce((sum, a) => sum + ((c[a.id] || 0) * (a.points || 0)), 0);
          return (
            <div key={s.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink">{s.name}</span>
                  <span className="text-xs font-semibold text-ocean-600 bg-ocean-50 border border-ocean-100 rounded-full px-2 py-0.5">
                    {totalPoints}P
                  </span>
                  <span className="text-xs text-ink-muted">이번 주 {weekly}개</span>
                </div>
                <div className="text-xs text-ink-muted">{s.grade || ''}{s.gender ? ` · ${s.gender}` : ''}</div>
              </div>

              {/* 모은 스티커 시각화 */}
              <div className="flex flex-wrap gap-1 mb-3 min-h-[1.75rem]">
                {Array.from({ length: Math.min(areaCount, 40) }).map((_, i) => (
                  <span key={i} className="text-lg leading-none" title={`${i + 1}번째 스티커`}>
                    {activeArea?.emoji}
                  </span>
                ))}
                {areaCount > 40 && (
                  <span className="text-xs text-ink-muted self-center">+{areaCount - 40}</span>
                )}
                {areaCount === 0 && (
                  <span className="text-xs text-ink-muted self-center">아직 스티커가 없어요</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => giveSticker(s)}
                  disabled={busy === s.id}
                  className="flex-1 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 transition-all py-2.5 text-center disabled:opacity-40"
                >
                  <span className="text-lg mr-1.5 align-middle">{activeArea?.emoji}</span>
                  <span className="text-sm font-bold text-amber-700 align-middle">
                    스티커 주기 <span className="text-amber-600">+{activeArea?.points}P</span>
                  </span>
                </button>
                <button
                  onClick={() => undoSticker(s)}
                  disabled={busy === s.id || areaCount === 0}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-ink-muted text-sm hover:bg-gray-50 disabled:opacity-40"
                  title="실수로 준 스티커 1개 취소"
                >
                  취소
                </button>
              </div>
              <div className="text-right text-[11px] text-ink-muted mt-1.5">
                {activeArea?.name} 누적 <span className="font-semibold text-ink-soft">{areaCount}개</span>
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

// ────────────────────────────────────────────────────────
// 송청 섹션 (임원 / 사역팀 소개)
// ────────────────────────────────────────────────────────
function SongCheongSection() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    getDocs(collection(db, 'students')).then((snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="card text-center text-ink-muted py-6 text-sm">불러오는 중...</div>;

  const officerRoles = ['회장', '부회장', '총무'];
  const teamRoles = ['찬양팀', '예배팀'];

  const hasRole = (s, role) => (s.ministryTeams || []).some((m) =>
    Number(m.year) === currentYear &&
    (m.departments || (m.department ? [m.department] : [])).includes(role)
  );

  return (
    <div className="space-y-4">
      {['1부', '2부'].map((svc) => (
        <div key={svc} className="card">
          <div className="font-bold text-ink mb-3">🎗 {svc} 임원</div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {officerRoles.map((role) => {
              const members = students.filter((s) => s.service === svc && hasRole(s, role));
              return (
                <div key={role} className="rounded-xl border border-ocean-100 bg-white/70 p-3 text-center">
                  <div className="text-xs text-ocean-600 font-semibold mb-1">{role}</div>
                  <div className="text-sm text-ink">
                    {members.length > 0 ? members.map((m) => m.name).join(', ') : <span className="text-ink-muted">-</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {teamRoles.map((team) => {
            const members = students.filter((s) => s.service === svc && hasRole(s, team));
            return (
              <div key={team} className="border-t border-ocean-100 pt-3 mt-3">
                <div className="text-sm font-bold text-ocean-700 mb-1.5">🎵 {team} ({members.length})</div>
                <div className="text-sm text-ink-soft">
                  {members.length > 0 ? members.map((m) => m.name).join(', ') : <span className="text-ink-muted">-</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
