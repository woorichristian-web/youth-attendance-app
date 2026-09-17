import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { isRegistered } from '../utils/statusUtils';
import RegistrationStats from '../components/admin/RegistrationStats';
import StudentManagement from '../components/admin/StudentManagement';
import TeacherManagement from '../components/admin/TeacherManagement';
import ExcelExport from '../components/admin/ExcelExport';
import OfficerManagement from '../components/admin/OfficerManagement';
import DiscipleshipManagement from '../components/admin/DiscipleshipManagement';
import GrowthBoard from '../components/admin/GrowthBoard';
import OfferingManager from '../components/admin/OfferingManager';
import WeeklyReport from '../components/admin/WeeklyReport';
import RetreatManager from '../components/admin/RetreatManager';
import PastAttendance from '../components/dashboard/PastAttendance';
import RedFlagList from '../components/dashboard/RedFlagList';
import AttendanceRateDistribution from '../components/dashboard/AttendanceRateDistribution';
import FloatingQuickBar from '../components/admin/FloatingQuickBar';
import { getSundaysInMonth, getThisSunday } from '../utils/dateUtils';
import { filterExcludedSundays } from '../utils/excludedDates';

const TOP_MENUS = [
  { id: 'attendance_view', label: '출석현황' },
  { id: 'students', label: '학생' },
  { id: 'teachers', label: '선생님' },
  { id: 'archive', label: '자료실' },
  { id: 'retreat', label: '수련회' },
  { id: 'admin_office', label: '목회행정' },
  { id: 'settings', label: '설정' },
];

export default function AdminAppPage() {
  const { userProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const menu = searchParams.get('m') || '';
  const setMenu = (v) => {
    if (v) setSearchParams({ m: v });
    else setSearchParams({});
  };
  const displayName = userProfile?.name || '관리자';

  // 관리자 화면일 때는 body 배경을 따뜻한 아이보리 뉴트럴로 오버라이드
  useEffect(() => {
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = '#f8f7f4';
    return () => {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-10">
        {/* 헤더 — 홈에서만 표시 */}
        {menu === '' && (
          <div className="mb-5 flex items-end justify-between flex-wrap gap-2 pb-4 border-b border-stone-200">
            <button onClick={() => setMenu('')} className="text-left">
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-medium mb-1">Ministry Dashboard</p>
              <h1 className="text-2xl font-semibold text-stone-900 tracking-tight hover:text-teal-700 transition-colors">사역 대시보드</h1>
            </button>
            <div className="text-sm text-stone-500">{displayName}</div>
          </div>
        )}

        {menu === '' && <HomeMenu onNavigate={setMenu} />}
        {menu === 'attendance_view' && <AttendanceViewMenu />}
        {menu === 'students' && <StudentsMenu />}
        {menu === 'teachers' && <TeachersMenu />}
        {menu === 'archive' && <PlaceholderMenu title="자료실" desc="공지·양식·회의록·설교자료 등 사역 자료를 보관합니다." />}
        {menu === 'retreat' && <PlaceholderMenu title="수련회" desc="수련회 신청자 명단·조편성·재정 관리." />}
        {menu === 'admin_office' && <AdminOfficeMenu />}
        {menu === 'settings' && <PlaceholderMenu title="설정" desc="계정, 알림, 학기 기간 등 시스템 전반의 설정." />}
      </div>

      {/* 우측 하단 세로 플로팅 빠른 실행 바 */}
      <FloatingQuickBar
        items={[
          { id: 'attend', label: '출석 관리', icon: <IconClipboard className="w-5 h-5" />, target: 'students' },
          { id: 'pastoral', label: '목양 · 장결자', icon: <IconUsers className="w-5 h-5" />, target: 'students' },
          { id: 'growth', label: '성장 통계', icon: <IconChart className="w-5 h-5" />, target: 'students' },
          { id: 'finance', label: '재정 센터', icon: <IconWallet className="w-5 h-5" />, target: 'admin_office' },
          { id: 'sunday', label: '주일보고', icon: <IconAlert className="w-5 h-5" />, target: 'admin_office' },
          { id: 'retreat', label: '수련회', icon: <IconArrowRight className="w-5 h-5" />, target: 'retreat' },
        ]}
        onSelect={(it) => setMenu(it.target)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// HOME — 사역 대시보드
// ═══════════════════════════════════════════════════════
function HomeMenu({ onNavigate }) {
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let s = false, a = false, c = false;
    const done = () => { if (s && a && c) setLoading(false); };
    const u1 = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      s = true; done();
    });
    const u2 = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map((d) => d.data()));
      a = true; done();
    });
    const u3 = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      c = true; done();
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const yr = now.getFullYear();
    const mn = now.getMonth() + 1;
    const registeredCount = students.filter(isRegistered).length;
    const c1 = students.filter((s) => isRegistered(s) && s.service === '1부').length;
    const c2 = students.filter((s) => isRegistered(s) && s.service === '2부').length;

    // 주의: toISOString()은 UTC 기준이라 한국 시간과 하루 어긋날 수 있음 → 로컬 기준 계산 사용
    const thisSunStr = getThisSunday();
    const thisMonthSundays = filterExcludedSundays(getSundaysInMonth(yr, mn));

    const thisWeek = attendance.filter((a) => a.date === thisSunStr);
    let present = 0, absent = 0, missing = 0;
    thisWeek.forEach((rec) => {
      rec.records?.forEach((r) => {
        if (r.present === true) present++;
        else if (r.present === false) absent++;
        else missing++;
      });
    });
    const total = present + absent;
    const rate = total > 0 ? Math.round((present / total) * 100) : null;

    const submittedClassIds = new Set(thisWeek.filter((r) => r.submitted !== false).map((r) => r.classId));
    const missingClasses = classes.filter((c) => !submittedClassIds.has(c.id));

    // 전체 누적 출석률 (모든 attendance 레코드 기준)
    let allPresent = 0, allTotal = 0;
    attendance.forEach((rec) => {
      rec.records?.forEach((r) => {
        if (r.present === true) { allPresent++; allTotal++; }
        else if (r.present === false) { allTotal++; }
      });
    });
    const overallRate = allTotal > 0 ? Math.round((allPresent / allTotal) * 100) : null;

    // 확인 필요 = 이번 주 결석 사유 미기입 등 (여기서는 결석자로 대체)
    const needCheck = missingClasses.length;

    return {
      registeredCount, c1, c2,
      thisSunStr, rate, present, absent, missing, total,
      overallRate,
      missingClasses,
      needCheck,
      monthSundayCount: thisMonthSundays.length,
    };
  }, [students, attendance, classes]);

  if (loading) return <div className="card text-center text-ink-muted py-8 text-sm">데이터를 불러오는 중...</div>;

  const dateLabel = stats.thisSunStr.slice(5).replace('-', '/');
  const gaugeProgress = stats.total > 0
    ? Math.round(((stats.present + stats.absent) / (stats.present + stats.absent + stats.missing || 1)) * 100)
    : 0;

  // 바로가기는 상단 메뉴로 대체되어 제거
  const shortcuts = [];

  const cardBase = 'bg-white border border-stone-200 rounded-xl shadow-sm';

  return (
    <div className="space-y-5">
      {/* ── 히어로 카드 (민트 그라디언트) ── */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-600 via-teal-500 to-emerald-500 text-white p-6 md:p-8 shadow-md relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-white/10 blur-2xl" />

        <div className="relative">
          <div className="text-[11px] uppercase tracking-widest text-teal-100 mb-2 font-medium">
            {stats.thisSunStr} · Sunday Overview
          </div>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">주일 사역 개요</h2>
              <p className="text-sm text-teal-50">
                {stats.missingClasses.length > 0
                  ? `출석 미제출 ${stats.missingClasses.length}개 반. 확인이 필요합니다.`
                  : '이번 주 모든 반이 출석을 제출했습니다.'}
              </p>
            </div>

            {/* 원형 게이지 */}
            <div className="relative w-28 h-28 md:w-32 md:h-32 flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="#ffffff"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - (stats.rate || 0) / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl md:text-3xl font-semibold text-white">{stats.rate ?? '-'}</div>
                <div className="text-[10px] text-teal-100 uppercase tracking-wider">Attend</div>
              </div>
            </div>
          </div>

          {/* KPI 4개 */}
          <div className="grid grid-cols-4 gap-2 md:gap-6 mt-6 pt-5 border-t border-white/20">
            <KpiTile label="출석" value={stats.present} />
            <KpiTile label="결석" value={stats.absent} />
            <KpiTile label="미체크" value={stats.missing} />
            <KpiTile label="확인 필요" value={stats.needCheck} />
          </div>
        </div>
      </div>

      {/* ── 이번 주 요약 카드 ── */}
      <div>
        <h3 className="text-xs font-medium text-stone-500 mb-2 uppercase tracking-wider ml-1">Weekly Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MiniStat label="등록 성도" value={stats.registeredCount} suffix="명" />
          <MiniStat label="1부" value={stats.c1} suffix="명" accent="stone" />
          <MiniStat label="2부" value={stats.c2} suffix="명" accent="stone" />
          <MiniStat label={`${dateLabel} 출석률`} value={stats.rate ?? '-'} suffix={stats.rate == null ? '' : '%'} accent="teal" />
          <MiniStat label="전체 출석률" value={stats.overallRate ?? '-'} suffix={stats.overallRate == null ? '' : '%'} accent="teal" />
        </div>
      </div>

      {/* ── 미제출 반 알림 ── */}
      {stats.missingClasses.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center gap-2 font-medium text-stone-900 mb-2 text-sm">
            <IconAlert className="w-4 h-4 text-amber-600" />
            {stats.thisSunStr} 출석 미제출 · {stats.missingClasses.length}개 반
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.missingClasses.map((c) => (
              <span key={c.id} className="text-xs bg-stone-50 border border-stone-200 text-stone-700 rounded-md px-2.5 py-1">
                {c.service} · {c.teacherName}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 출석현황 — PastAttendance + Analytics
// ═══════════════════════════════════════════════════════
function AttendanceViewMenu() {
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let s = false, a = false, c = false;
    const done = () => { if (s && a && c) setLoading(false); };
    const u1 = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      s = true; done();
    });
    const u2 = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map((d) => d.data()));
      a = true; done();
    });
    const u3 = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      c = true; done();
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  if (loading) return <div className="text-center text-stone-500 py-8 text-sm">불러오는 중...</div>;

  return (
    <div className="space-y-5">
      <PastAttendance attendanceList={attendance} students={students} classes={classes} />
      <div>
        <h3 className="text-xs font-medium text-stone-500 mb-2 uppercase tracking-wider ml-1">Analytics</h3>
        <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4">
          <RegistrationStats />
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value }) {
  return (
    <div className="text-center">
      <div className="text-xs text-teal-100 mb-1">{label}</div>
      <div className="text-2xl md:text-3xl font-semibold text-white">{value}</div>
      <div className="text-[10px] text-teal-100">명</div>
    </div>
  );
}

function MiniStat({ label, value, suffix, accent = 'slate' }) {
  const dot = {
    slate: 'bg-slate-400',
    blue: 'bg-blue-500',
    violet: 'bg-violet-500',
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
  }[accent] || 'bg-slate-400';
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <div className="text-xs font-medium text-slate-500">{label}</div>
      </div>
      <div className="text-2xl font-bold text-slate-900">
        {value}<span className="text-sm font-medium text-slate-500 ml-0.5">{suffix}</span>
      </div>
    </div>
  );
}

// ── SVG 아이콘 (비즈니스 스타일 stroke) ──
function IconArrowRight(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
}
function IconAlert(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>;
}
function IconClipboard(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4"/></svg>;
}
function IconUsers(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function IconChart(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18M7 14l4-4 4 4 5-5"/></svg>;
}
function IconWallet(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><circle cx="17" cy="14" r="2"/></svg>;
}

// ═══════════════════════════════════════════════════════
// 학생 메뉴 — 하위 탭: 출석관리 / 장결자 / 신앙교육 / 임원&사역 / 에클레시아
// ═══════════════════════════════════════════════════════
const STUDENT_SUBS = [
  { id: 'attendance', label: '학생 관리' },
  { id: 'redflag', label: '장결자' },
  { id: 'discipleship', label: '신앙교육' },
  { id: 'growth_cards', label: '실천 카드' },
  { id: 'officers', label: '임원 및 학생 사역' },
  { id: 'ecclesia', label: '에클레시아' },
];

function StudentsMenu() {
  const [sub, setSub] = useState('attendance');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let s = false, c = false, a = false;
    const done = () => { if (s && c && a) setLoading(false); };
    const u1 = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      s = true; done();
    });
    const u2 = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      c = true; done();
    });
    const u3 = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map((d) => d.data()));
      a = true; done();
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  return (
    <div>
      <div className="flex gap-1 mb-4 bg-white/60 rounded-xl p-1 overflow-x-auto">
        {STUDENT_SUBS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              sub === t.id ? 'bg-white text-ocean-600 shadow-sm' : 'text-ink-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card text-center text-ink-muted py-6 text-sm">불러오는 중...</div>
      ) : (
        <>
          {sub === 'attendance' && <StudentManagement classes={classes} hideSubTabs={true} />}
          {sub === 'redflag' && <RedFlagList attendanceList={attendance} students={students} classes={classes} />}
          {sub === 'discipleship' && <DiscipleshipManagement students={students} classes={classes} />}
          {sub === 'growth_cards' && <GrowthBoard students={students} classes={classes} />}
          {sub === 'officers' && <OfficerManagement />}
          {sub === 'ecclesia' && <AttendanceRateDistribution students={students} attendanceList={attendance} loading={false} />}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 선생님 메뉴 — 부서별 탭 + 카드
// ═══════════════════════════════════════════════════════
const TEACHER_SUBS = [
  { id: 'cards', label: '반사 목록' },
  { id: 'manage', label: '교사관리' },
];

function TeachersMenu() {
  const [sub, setSub] = useState('cards');
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let t = false, c = false;
    const done = () => { if (t && c) setLoading(false); };
    const u1 = onSnapshot(collection(db, 'users'), (snap) => {
      setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.role === 'teacher' || u.role === 'admin'));
      t = true; done();
    });
    const u2 = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      c = true; done();
    });
    return () => { u1(); u2(); };
  }, []);

  return (
    <div>
      <div className="flex gap-1 mb-4 bg-white/60 rounded-xl p-1 w-fit">
        {TEACHER_SUBS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              sub === t.id ? 'bg-white text-teal-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-center text-stone-500 py-8 text-sm">불러오는 중...</div>
      ) : sub === 'cards' ? (
        <TeacherCardsList teachers={teachers} classes={classes} />
      ) : (
        <TeacherManagement />
      )}
    </div>
  );
}

// 반사(교사) 카드 리스트 — 부서별 그룹핑
function TeacherCardsList({ teachers, classes }) {
  const SERVICE_ORDER = ['1부', '2부', '사역팀'];
  const groups = useMemo(() => {
    const g = { '1부': [], '2부': [], '사역팀': [], '기타': [] };
    teachers.forEach((t) => {
      if (t.teacherStatus === 'resigned') return;
      if (t.service === '1부') g['1부'].push(t);
      else if (t.service === '2부') g['2부'].push(t);
      else if (['찬양팀', '예배팀', '행정팀'].includes(t.ministryMain)) g['사역팀'].push(t);
      else g['기타'].push(t);
    });
    Object.keys(g).forEach((k) => {
      g[k].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    });
    return g;
  }, [teachers]);

  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-5">
      {SERVICE_ORDER.map((svc) => {
        const list = groups[svc] || [];
        if (list.length === 0) return null;
        return (
          <div key={svc}>
            <h3 className="text-xs font-medium text-stone-500 mb-2 uppercase tracking-wider ml-1">{svc} · {list.length}명</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {list.map((t) => {
                const cls = classes.find((c) => c.id === t.classId);
                const roleLabel = t.ministrySub || t.ministryMain || '';
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className="bg-white border border-stone-200 rounded-xl p-4 text-left hover:border-teal-400 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-semibold">
                        {(t.name || '?').slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-stone-900 truncate">{t.name || '(이름없음)'}</div>
                        <div className="text-xs text-stone-500 truncate">{roleLabel}{cls ? ` · ${cls.teacherName}반` : ''}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {selected && <TeacherInfoModal teacher={selected} classes={classes} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 목회행정 — 서브탭: 주일보고 · 헌금 · 데이터다운로드
// ═══════════════════════════════════════════════════════
const ADMIN_OFFICE_SUBS = [
  { id: 'sunday_report', label: '주일보고' },
  { id: 'offering', label: '헌금' },
  { id: 'retreat', label: '수련회' },
  { id: 'data_download', label: '데이터다운로드' },
];

function AdminOfficeMenu() {
  const [sub, setSub] = useState('sunday_report');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let s = false, c = false, a = false;
    const done = () => { if (s && c && a) setLoading(false); };
    const u1 = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      s = true; done();
    });
    const u2 = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      c = true; done();
    });
    const u3 = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map((d) => d.data()));
      a = true; done();
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  const registered = students.filter(isRegistered);

  return (
    <div>
      <div className="flex gap-1 mb-4 bg-white/60 rounded-xl p-1 w-fit overflow-x-auto">
        {ADMIN_OFFICE_SUBS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              sub === t.id ? 'bg-white text-teal-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'sunday_report' && (
        loading
          ? <div className="text-center text-stone-500 py-8 text-sm">불러오는 중...</div>
          : <WeeklyReport attendanceList={attendance} classes={classes} students={registered} />
      )}
      {sub === 'offering' && <OfferingManager />}
      {sub === 'retreat' && (
        loading
          ? <div className="text-center text-stone-500 py-8 text-sm">불러오는 중...</div>
          : <RetreatManager students={registered} classes={classes} />
      )}
      {sub === 'data_download' && (
        loading ? (
          <div className="text-center text-stone-500 py-8 text-sm">불러오는 중...</div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <ExcelExport classes={classes} students={students} />
          </div>
        )
      )}
    </div>
  );
}

function TeacherInfoModal({ teacher, classes, onClose }) {
  const cls = classes.find((c) => c.id === teacher.classId);
  const Field = ({ label, value }) => (
    <div>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-sm text-stone-900">{value || '-'}</div>
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-stone-900">{teacher.name} 선생님</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="부서" value={teacher.service} />
          <Field label="역할" value={teacher.ministrySub || teacher.ministryMain} />
          <Field label="담당반" value={cls?.teacherName ? `${cls.teacherName} 선생님반` : '-'} />
          <Field label="연차" value={teacher.tenure} />
          <Field label="성별" value={teacher.gender} />
          <Field label="연락처" value={teacher.phone} />
          <Field label="이메일" value={teacher.email} />
          <Field label="청년부 소속" value={teacher.youngAdultGroup} />
          <div className="col-span-2"><Field label="주소" value={teacher.address} /></div>
          {teacher.notes && <div className="col-span-2"><Field label="특이사항" value={teacher.notes} /></div>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 임시 컴포넌트 (주일보고 · 헌금 · 수련회)
// ═══════════════════════════════════════════════════════
function PlaceholderMenu({ title, desc }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
      <p className="text-sm text-slate-500 mb-4">{desc}</p>
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
        준비 중입니다. 어떤 정보·기능이 필요한지 알려주시면 세부 화면을 만들어드립니다.
      </div>
    </div>
  );
}

// 전체 다운로드는 그대로 유지하고 싶다면 별도 노출 필요 — 우선 홈에 요약만 추가
// eslint-disable-next-line no-unused-vars
const _reservedForExport = { ExcelExport };
