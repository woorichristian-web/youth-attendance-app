import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, onSnapshot, setDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import AttendanceSheet from '../components/attendance/AttendanceSheet';
import { getThisSunday, formatDateKo, isValidSunday } from '../utils/dateUtils';

const TABS = [
  { id: 'attend', label: '출석', icon: '✅' },
  { id: 'growth', label: '성장', icon: '🌱' },
  { id: 'songcheong', label: '송청', icon: '🙏' },
];

export default function TeacherHomePage() {
  const { userProfile, currentUser } = useAuth();
  const [tab, setTab] = useState('attend');

  const myClassId = userProfile?.classId;
  const myService = userProfile?.service;
  const myName = userProfile?.name || currentUser?.email;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-ink">👋 {myName} 선생님</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {myService ? `${myService} · ` : ''}{myClassId ? `${myClassId.replace(/^\d+부_/, '')} 선생님반` : '반 미배정'}
        </p>
      </div>

      {/* 상위 탭 */}
      <div className="flex gap-1 mb-5 bg-white/60 backdrop-blur rounded-2xl p-1 border border-white/60 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id
                ? 'bg-ocean-400 text-white shadow-sm'
                : 'text-ink-soft hover:bg-ocean-100'
            }`}
          >
            <span className="mr-1">{t.icon}</span>{t.label}
          </button>
        ))}
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
// 성장 섹션 (스티커)
// ────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: 'quiet_time', name: '말씀 묵상', emoji: '📖', points: 5 },
  { id: 'praise', name: '찬양 열심히', emoji: '🙌', points: 5 },
  { id: 'help_friend', name: '친구 도움', emoji: '🤝', points: 5 },
  { id: 'help_teacher', name: '선생님 도움', emoji: '🛡', points: 5 },
  { id: 'kind_words', name: '예쁜말', emoji: '💬', points: 5 },
];

function GrowthSection({ classId, teacherName }) {
  const [students, setStudents] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [counts, setCounts] = useState({}); // {studentId: {catId: count}}
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', emoji: '⭐', points: 5 });

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
  }

  async function addCategory() {
    if (!newCat.name.trim()) return;
    const id = `cat_${Date.now()}`;
    const nextList = [...categories, { id, name: newCat.name.trim(), emoji: newCat.emoji, points: Number(newCat.points) || 5 }];
    const ref = doc(db, 'class_growth_categories', classId);
    await setDoc(ref, { categories: nextList, updatedBy: teacherName || '' }, { merge: true });
    setNewCat({ name: '', emoji: '⭐', points: 5 });
    setAddOpen(false);
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
      <div className="card mb-3 bg-white/70">
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-ink">✨ 스티커 카테고리</div>
          <button onClick={() => setAddOpen(true)} className="text-xs px-3 py-1 bg-ocean-100 text-ocean-700 rounded-full font-medium">
            + 추가
          </button>
        </div>
        <div className="text-xs text-ink-muted">아래 학생 카드에서 카테고리를 눌러 스티커를 주세요.</div>
      </div>

      {addOpen && (
        <div className="card mb-3">
          <div className="font-semibold mb-2 text-sm">새 카테고리 추가</div>
          <div className="grid grid-cols-6 gap-2 items-center mb-2">
            <input className="input col-span-1 text-center" maxLength={2} value={newCat.emoji} onChange={(e) => setNewCat({ ...newCat, emoji: e.target.value })} />
            <input className="input col-span-3" placeholder="이름 (예: 필사)" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
            <input className="input col-span-2" type="number" min="1" max="100" value={newCat.points} onChange={(e) => setNewCat({ ...newCat, points: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={addCategory} className="btn-primary flex-1">추가</button>
            <button onClick={() => setAddOpen(false)} className="btn-secondary flex-1">취소</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {students.map((s) => {
          const c = counts[s.id] || {};
          const totalPoints = categories.reduce((sum, cat) => sum + ((c[cat.id] || 0) * (cat.points || 0)), 0);
          return (
            <div key={s.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-bold text-ink">{s.name}</span>
                  <span className="text-xs text-ocean-600 ml-2 font-semibold">{totalPoints}P</span>
                </div>
                <div className="text-xs text-ink-muted">{s.grade || ''}{s.gender ? ` · ${s.gender}` : ''}</div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => giveSticker(s.id, cat.id)}
                    className="rounded-xl border border-ocean-100 bg-white hover:bg-ocean-50 transition-all py-2 text-center"
                  >
                    <div className="text-xl leading-none">{cat.emoji}</div>
                    <div className="text-[11px] mt-1 text-ink-soft font-medium">{cat.name}</div>
                    <div className="text-[10px] text-ocean-600 mt-0.5">
                      +{cat.points}P · {c[cat.id] || 0}회
                    </div>
                  </button>
                ))}
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
