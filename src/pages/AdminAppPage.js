import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { isRegistered } from '../utils/statusUtils';
import RegistrationStats from '../components/admin/RegistrationStats';
import StudentManagement from '../components/admin/StudentManagement';
import TeacherManagement from '../components/admin/TeacherManagement';
import OfficerManagement from '../components/admin/OfficerManagement';
import TeacherDirectory from '../components/admin/TeacherDirectory';
import GrowthOverview from '../components/admin/GrowthOverview';
import WeeklyReport from '../components/admin/WeeklyReport';
import OfferingManager from '../components/admin/OfferingManager';
import RetreatManager from '../components/admin/RetreatManager';
import ExcelExport from '../components/admin/ExcelExport';
import SystemSettings from '../components/admin/SystemSettings';
import FloatingQuickBar from '../components/admin/FloatingQuickBar';
import PastAttendance from '../components/dashboard/PastAttendance';
import RedFlagList from '../components/dashboard/RedFlagList';
import AttendanceRateDistribution from '../components/dashboard/AttendanceRateDistribution';
import SchoolStats from '../components/dashboard/SchoolStats';
import { getSundaysInMonth } from '../utils/dateUtils';
import { filterExcludedSundays } from '../utils/excludedDates';

const TOP_MENUS = [
  { id: 'attendance_view', label: '출석현황' },
  { id: 'students', label: '학생' },
  { id: 'teachers', label: '선생님' },
  { id: 'sunday_report', label: '주일보고' },
  { id: 'offering', label: '헌금' },
  { id: 'retreat', label: '수련회' },
  { id: 'settings', label: '설정' },
];

// 학생·반·출석 실시간 구독 공용 훅
function useChurchData() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [attendance, setAttendance] = useState([]);
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

  return { students, classes, attendance, loading };
}

export default function AdminAppPage() {
  const { userProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const menu = searchParams.get('m') || '';
  const setMenu = (v) => {
    if (v) setSearchParams({ m: v });
    else setSearchParams({});
  };
  const displayName = userProfile?.name || '관리자';
  const { students, classes, attendance, loading } = useChurchData();
  const registered = useMemo(() => students.filter(isRegistered), [students]);

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
        {/* 상단 텍스트 메뉴 */}
        <div className="flex gap-6 md:gap-8 mb-6 overflow-x-auto pb-1">
          {TOP_MENUS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMenu(m.id)}
              className={`flex-shrink-0 text-sm whitespace-nowrap transition-colors ${
                menu === m.id
                  ? 'text-teal-700 font-semibold'
                  : 'text-stone-600 font-medium hover:text-stone-900'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* 헤더 (제목 클릭 시 홈으로) */}
        <div className="mb-6 flex items-end justify-between flex-wrap gap-2">
          <button onClick={() => setMenu('')} className="text-left">
            <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-medium mb-1">Ministry Dashboard</p>
            <h1 className="text-2xl font-semibold text-stone-900 tracking-tight hover:text-teal-700 transition-colors">사역 대시보드</h1>
          </button>
          <div className="text-sm text-stone-500">{displayName}</div>
        </div>

        {loading ? (
          <div className="text-center text-stone-500 py-10 text-sm">데이터를 불러오는 중...</div>
        ) : (
          <>
            {menu === '' && <HomeMenu students={students} attendance={attendance} classes={classes} />}
            {menu === 'attendance_view' && (
              <AttendanceViewMenu students={registered} attendance={attendance} classes={classes} />
            )}
            {menu === 'students' && (
              <StudentsMenu students={registered} attendance={attendance} classes={classes} />
            )}
            {menu === 'teachers' && <TeachersMenu students={registered} classes={classes} />}
            {menu === 'sunday_report' && (
              <SundayReportMenu students={students} registered={registered} attendance={attendance} classes={classes} />
            )}
            {menu === 'offering' && <OfferingManager />}
            {menu === 'retreat' && <RetreatManager students={registered} classes={classes} />}
            {menu === 'settings' && (
              <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5 md:p-6">
                <SystemSettings />
              </div>
            )}
          </>
        )}
      </div>

      {/* 우측 하단 세로 플로팅 빠른 실행 바 */}
      <FloatingQuickBar
        items={[
          { id: 'attend', label: '출석현황', icon: <IconClipboard className="w-5 h-5" />, target: 'attendance_view' },
          { id: 'pastoral', label: '학생 · 장결자', icon: <IconUsers className="w-5 h-5" />, target: 'students' },
          { id: 'growth', label: '신앙교육', icon: <IconChart className="w-5 h-5" />, target: 'students' },
          { id: 'finance', label: '헌금', icon: <IconWallet className="w-5 h-5" />, target: 'offering' },
          { id: 'sunday', label: '주일보고', icon: <IconAlert className="w-5 h-5" />, target: 'sunday_report' },
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
function HomeMenu({ students, attendance, classes }) {
  const stats = useMemo(() => {
    const now = new Date();
    const yr = now.getFullYear();
    const mn = now.getMonth() + 1;
    const registeredCount = students.filter(isRegistered).length;
    const c1 = students.filter((s) => isRegistered(s) && s.service === '1부').length;
    const c2 = students.filter((s) => isRegistered(s) && s.service === '2부').length;

    const day = now.getDay();
    const thisSun = new Date(now);
    thisSun.setDate(now.getDate() - day);
    const thisSunStr = thisSun.toISOString().slice(0, 10);
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

    // 전체 누적 출석률
    let allPresent = 0, allTotal = 0;
    attendance.forEach((rec) => {
      rec.records?.forEach((r) => {
        if (r.present === true) { allPresent++; allTotal++; }
        else if (r.present === false) { allTotal++; }
      });
    });
    const overallRate = allTotal > 0 ? Math.round((allPresent / allTotal) * 100) : null;

    return {
      registeredCount, c1, c2,
      thisSunStr, rate, present, absent, missing, total,
      overallRate,
      missingClasses,
      needCheck: missingClasses.length,
      monthSundayCount: thisMonthSundays.length,
    };
  }, [students, attendance, classes]);

  const dateLabel = stats.thisSunStr.slice(5).replace('-', '/');

  return (
    <div className="space-y-5">
      {/* ── 히어로 카드 (민트 채움) ── */}
      <div className="rounded-2xl bg-teal-600 p-6 md:p-8 shadow-md relative overflow-hidden text-white">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 bg-white rounded-full" />
          <div className="text-[11px] uppercase tracking-widest text-teal-100 font-medium">
            {stats.thisSunStr} · Sunday Overview
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-white mb-1">주일 사역 개요</h2>
            <p className="text-sm text-teal-100">
              {stats.missingClasses.length > 0
                ? `출석 미제출 ${stats.missingClasses.length}개 반. 확인이 필요합니다.`
                : '이번 주 모든 반이 출석을 제출했습니다.'}
            </p>
          </div>

          {/* 원형 게이지 */}
          <div className="relative w-28 h-28 md:w-32 md:h-32 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="6" />
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
        <div className="grid grid-cols-4 gap-2 md:gap-6 mt-6 pt-5 border-t border-teal-400/60">
          <KpiTile label="출석" value={stats.present} />
          <KpiTile label="결석" value={stats.absent} />
          <KpiTile label="미체크" value={stats.missing} />
          <KpiTile label="확인 필요" value={stats.needCheck} />
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
// 출석현황 — 지난 출석 + 통계
// ═══════════════════════════════════════════════════════
function AttendanceViewMenu({ students, attendance, classes }) {
  return (
    <div className="space-y-5">
      <PastAttendance attendanceList={attendance} students={students} classes={classes} />
      <div>
        <h3 className="text-xs font-medium text-stone-500 mb-2 uppercase tracking-wider ml-1">Analytics</h3>
        <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4 space-y-6">
          <RegistrationStats />
          <AttendanceRateDistribution students={students} attendanceList={attendance} loading={false} />
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
      <div className="text-[10px] text-teal-200">명</div>
    </div>
  );
}

function MiniStat({ label, value, suffix, accent = 'stone' }) {
  const dot = {
    stone: 'bg-stone-400',
    teal: 'bg-teal-500',
  }[accent] || 'bg-stone-400';
  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <div className="text-xs font-medium text-stone-500">{label}</div>
      </div>
      <div className="text-2xl font-bold text-stone-900">
        {value}<span className="text-sm font-medium text-stone-500 ml-0.5">{suffix}</span>
      </div>
    </div>
  );
}

// ── SVG 아이콘 ──
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
  { id: 'redflag', label: '부서·반별 장결자' },
  { id: 'discipleship', label: '신앙교육' },
  { id: 'officers', label: '임원 및 학생 사역' },
  { id: 'ecclesia', label: '에클레시아' },
];

function StudentsMenu({ students, attendance, classes }) {
  const [sub, setSub] = useState('attendance');

  return (
    <div>
      <SubTabs tabs={STUDENT_SUBS} active={sub} onSelect={setSub} />
      {sub === 'attendance' && <StudentManagement classes={classes} />}
      {sub === 'redflag' && <RedFlagList attendanceList={attendance} students={students} classes={classes} />}
      {sub === 'discipleship' && <GrowthOverview classes={classes} students={students} />}
      {sub === 'officers' && <OfficerManagement />}
      {sub === 'ecclesia' && <SchoolStats students={students} classes={classes} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 선생님 메뉴 — 부서별 교사 카드 + 반·계정 관리
// ═══════════════════════════════════════════════════════
function TeachersMenu({ students, classes }) {
  const [sub, setSub] = useState('cards');
  return (
    <div>
      <SubTabs
        tabs={[
          { id: 'cards', label: '교사 카드' },
          { id: 'manage', label: '반·계정 관리' },
        ]}
        active={sub}
        onSelect={setSub}
      />
      {sub === 'cards' && <TeacherDirectory classes={classes} students={students} />}
      {sub === 'manage' && <TeacherManagement classes={classes} onClassesChange={() => {}} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 주일보고 메뉴 — 주간 보고 + 자료 다운로드
// ═══════════════════════════════════════════════════════
function SundayReportMenu({ students, registered, attendance, classes }) {
  const [sub, setSub] = useState('weekly');
  return (
    <div>
      <SubTabs
        tabs={[
          { id: 'weekly', label: '주간 보고' },
          { id: 'export', label: '자료 다운로드' },
        ]}
        active={sub}
        onSelect={setSub}
      />
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4 md:p-5">
        {sub === 'weekly' && <WeeklyReport attendanceList={attendance} classes={classes} students={registered} />}
        {sub === 'export' && <ExcelExport classes={classes} students={students} />}
      </div>
    </div>
  );
}

function SubTabs({ tabs, active, onSelect }) {
  return (
    <div className="flex gap-1 mb-4 bg-white/70 border border-stone-200 rounded-xl p-1 overflow-x-auto w-fit max-w-full">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
            active === t.id ? 'bg-teal-600 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
