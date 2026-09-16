import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import StudentManagement from '../components/admin/StudentManagement';
import TeacherManagement from '../components/admin/TeacherManagement';
import ExcelExport from '../components/admin/ExcelExport';
import OfficerManagement from '../components/admin/OfficerManagement';
import AdminAttendanceManager from '../components/admin/AdminAttendanceManager';
import GrowthOverview from '../components/admin/GrowthOverview';
import TeacherDirectory from '../components/admin/TeacherDirectory';
import WeeklyReport from '../components/admin/WeeklyReport';
import OfferingManager from '../components/admin/OfferingManager';
import RetreatManager from '../components/admin/RetreatManager';
import RedFlagList from '../components/dashboard/RedFlagList';
import SchoolStats from '../components/dashboard/SchoolStats';
import MissingAttendanceAlert from '../components/MissingAttendanceAlert';
import StudentDashboardPage from './StudentDashboardPage';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { auth } from '../firebase';
import { isRegistered } from '../utils/statusUtils';
import { getThisSunday, formatDateKo } from '../utils/dateUtils';
import { isExcludedDate, getExcludedReason } from '../utils/excludedDates';
import { calcAvgMonthlyRate } from '../utils/redFlag';

const MENUS = [
  { id: 'home', label: '홈', icon: '🏠', desc: '사역 대시보드' },
  {
    id: 'students', label: '학생', icon: '🎓', desc: '학생 사역 전반',
    subs: [
      { id: 'attendance', label: '출석관리' },
      { id: 'redflag', label: '부서·반별 장결자' },
      { id: 'growth', label: '신앙교육' },
      { id: 'ministry', label: '임원·학생 사역' },
      { id: 'ecclesia', label: '에클레시아' },
    ],
  },
  {
    id: 'teachers', label: '선생님', icon: '👩‍🏫', desc: '교사 현황과 계정 관리',
    subs: [
      { id: 'cards', label: '교사 카드' },
      { id: 'manage', label: '반·계정 관리' },
    ],
  },
  {
    id: 'report', label: '주일보고', icon: '📋', desc: '주일별 출석 보고',
    subs: [
      { id: 'weekly', label: '주간 보고' },
      { id: 'export', label: '자료 다운로드' },
    ],
  },
  { id: 'offering', label: '헌금', icon: '💰', desc: '주일 헌금 기록' },
  { id: 'retreat', label: '수련회', icon: '⛺', desc: '수련회 신청·회비 관리' },
  { id: 'settings', label: '설정', icon: '🔐', desc: '관리자 계정·보안 규칙' },
];

export default function AdminPage() {
  const [menuId, setMenuId] = useState('home');
  const [subId, setSubId] = useState(null);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendanceList, setAttendanceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attLoading, setAttLoading] = useState(true);

  async function loadClasses() {
    const snap = await getDocs(query(collection(db, 'classes'), orderBy('service')));
    setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadStudents() {
    const snap = await getDocs(collection(db, 'students'));
    setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadClasses(), loadStudents()]);
      setLoading(false);
    })();
    (async () => {
      setAttLoading(true);
      try {
        const snap = await getDocs(collection(db, 'attendance'));
        setAttendanceList(snap.docs.map((d) => d.data()));
      } catch (e) {
        console.error('출석 데이터 로드 오류:', e);
      }
      setAttLoading(false);
    })();
  }, []);

  const registeredStudents = useMemo(() => students.filter(isRegistered), [students]);

  const menu = MENUS.find((m) => m.id === menuId) || MENUS[0];
  const activeSub = menu.subs ? (menu.subs.find((s) => s.id === subId) || menu.subs[0]) : null;

  function goMenu(id) {
    setMenuId(id);
    setSubId(null);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-400">
        데이터를 불러오는 중...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-8">
      {/* 헤더 */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">사역 관리</h1>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 border border-slate-200 bg-white rounded-full px-2 py-0.5">
            Admin
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">송림청소년부 통합 관리 콘솔</p>
      </div>

      <div className="md:grid md:grid-cols-[210px_1fr] md:gap-6 md:items-start">
        {/* 사이드바 (데스크탑) */}
        <aside className="hidden md:block sticky top-20">
          <nav className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
            {MENUS.map((item) => (
              <button
                key={item.id}
                onClick={() => goMenu(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
                  menuId === item.id
                    ? 'bg-slate-800 text-white font-semibold shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* 모바일: 가로 스크롤 메뉴 */}
        <div className="md:hidden flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
          {MENUS.map((item) => (
            <button
              key={item.id}
              onClick={() => goMenu(item.id)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors border ${
                menuId === item.id
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        {/* 콘텐츠 */}
        <main>
          {menuId === 'home' ? (
            <HomeDashboard
              classes={classes}
              students={students}
              registeredStudents={registeredStudents}
              attendanceList={attendanceList}
              attLoading={attLoading}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="px-5 md:px-6 pt-5 pb-0 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800">{menu.icon} {menu.label}</h2>
                <p className="text-xs text-slate-400 mt-0.5 mb-3">{menu.desc}</p>
                {menu.subs && (
                  <div className="flex gap-5 overflow-x-auto -mb-px">
                    {menu.subs.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSubId(s.id)}
                        className={`pb-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                          activeSub?.id === s.id
                            ? 'border-slate-800 text-slate-800'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-5 md:px-6 py-5">
                <AdminContent
                  menuId={menuId}
                  subId={activeSub?.id}
                  classes={classes}
                  students={students}
                  registeredStudents={registeredStudents}
                  attendanceList={attendanceList}
                  attLoading={attLoading}
                  onClassesChange={loadClasses}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function AdminContent({ menuId, subId, classes, students, registeredStudents, attendanceList, attLoading, onClassesChange }) {
  if (menuId === 'students') {
    if (subId === 'attendance') {
      return (
        <AdminAttendanceManager
          classes={classes}
          students={students}
          registeredStudents={registeredStudents}
          attendanceList={attendanceList}
          attLoading={attLoading}
        />
      );
    }
    if (subId === 'redflag') {
      return attLoading
        ? <LoadingNote />
        : <RedFlagList attendanceList={attendanceList} students={registeredStudents} classes={classes} />;
    }
    if (subId === 'growth') {
      return <GrowthOverview classes={classes} students={registeredStudents} />;
    }
    if (subId === 'ministry') {
      return <MinistrySection />;
    }
    if (subId === 'ecclesia') {
      return <SchoolStats students={registeredStudents} classes={classes} />;
    }
  }
  if (menuId === 'teachers') {
    if (subId === 'cards') return <TeacherDirectory classes={classes} students={registeredStudents} />;
    if (subId === 'manage') return <TeacherManagement classes={classes} onClassesChange={onClassesChange} />;
  }
  if (menuId === 'report') {
    if (subId === 'weekly') {
      return attLoading
        ? <LoadingNote />
        : <WeeklyReport attendanceList={attendanceList} classes={classes} students={registeredStudents} />;
    }
    if (subId === 'export') return <ExcelExport classes={classes} students={students} />;
  }
  if (menuId === 'offering') return <OfferingManager />;
  if (menuId === 'retreat') return <RetreatManager students={registeredStudents} classes={classes} />;
  if (menuId === 'settings') return <SystemSettings />;
  return null;
}

function LoadingNote() {
  return <div className="text-center text-slate-400 py-8 text-sm">📡 출석 데이터 불러오는 중...</div>;
}

// ────────────────────────────────────────────────────────
// 홈: 사역 대시보드
// ────────────────────────────────────────────────────────
function HomeDashboard({ classes, students, registeredStudents, attendanceList, attLoading }) {
  const thisSunday = getThisSunday();
  const excluded = isExcludedDate(thisSunday);

  const week = useMemo(() => {
    const recs = attendanceList.filter((a) => a.date === thisSunday && a.submitted !== false);
    let present = 0, absent = 0, unchecked = 0;
    const submittedIds = new Set();
    recs.forEach((rec) => {
      submittedIds.add(rec.classId);
      (rec.records || []).forEach((r) => {
        if (r.present === true) present++;
        else if (r.present === false) absent++;
        else unchecked++;
      });
    });
    const missingClasses = classes.filter((c) => !submittedIds.has(c.id));
    const checked = present + absent;
    const rate = checked > 0 ? Math.round((present / checked) * 100) : null;
    return { present, absent, unchecked, rate, submitted: submittedIds.size, missingClasses };
  }, [attendanceList, classes, thisSunday]);

  const monthRate = useMemo(() => {
    const ym = thisSunday.slice(0, 7);
    let present = 0, possible = 0;
    attendanceList.forEach((rec) => {
      if (!rec.date?.startsWith(ym) || rec.submitted === false || isExcludedDate(rec.date)) return;
      (rec.records || []).forEach((r) => {
        if (r.present === true) { present++; possible++; }
        else if (r.present === false) possible++;
      });
    });
    return possible > 0 ? Math.round((present / possible) * 100) : null;
  }, [attendanceList, thisSunday]);

  const redFlagCount = useMemo(() => {
    if (attLoading) return null;
    return registeredStudents.filter((s) => {
      const r = calcAvgMonthlyRate(s, attendanceList);
      return r !== null && r <= 25;
    }).length;
  }, [registeredStudents, attendanceList, attLoading]);

  return (
    <div>
      {/* 금주의 출석 히어로 */}
      <div className="rounded-2xl bg-slate-800 text-white p-5 md:p-6 shadow-sm mb-4">
        <div className="text-xs text-slate-300">{formatDateKo(thisSunday)}</div>
        {excluded ? (
          <div className="mt-2">
            <div className="text-xl font-bold">이번 주일은 {getExcludedReason(thisSunday)}입니다</div>
            <div className="text-sm text-slate-300 mt-1">출석 체크가 필요 없는 주간입니다.</div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 mt-2 flex-wrap">
            <div>
              <div className="text-xl md:text-2xl font-bold">
                {attLoading
                  ? '출석 데이터 불러오는 중...'
                  : week.submitted === 0
                  ? '아직 제출된 출석이 없습니다'
                  : week.missingClasses.length === 0
                  ? '모든 반이 출석을 제출했어요'
                  : `${week.missingClasses.length}개 반이 아직 미제출입니다`}
              </div>
              {!attLoading && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Chip label="출석" value={week.present} />
                  <Chip label="결석" value={week.absent} />
                  <Chip label="미체크" value={week.unchecked} />
                  <Chip label="제출 반" value={`${week.submitted}/${classes.length}`} />
                </div>
              )}
            </div>
            {!attLoading && week.rate != null && (
              <div className="flex-shrink-0 w-24 h-24 rounded-full border-4 border-emerald-400 flex flex-col items-center justify-center">
                <div className="text-3xl font-bold leading-none">{week.rate}</div>
                <div className="text-[10px] text-slate-300 mt-1">% 금주 출석률</div>
              </div>
            )}
          </div>
        )}
        {!attLoading && !excluded && week.missingClasses.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700">
            <div className="text-xs text-slate-400 mb-1.5">금주 출석 미제출 반</div>
            <div className="flex flex-wrap gap-1.5">
              {week.missingClasses.map((c) => (
                <span key={c.id} className="text-xs bg-slate-700 text-slate-200 px-2.5 py-1 rounded-full">
                  {c.service} {c.teacherName} 선생님반
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 주요 지표 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="등록 학생" value={`${registeredStudents.length}명`} sub={`전체 ${students.length}명`} />
        <StatCard label="운영 반" value={`${classes.length}개`} sub="1·2부 합계" />
        <StatCard
          label="이번 달 출석률"
          value={attLoading ? '…' : monthRate == null ? '-' : `${monthRate}%`}
          sub="제출된 출석 기준"
        />
        <StatCard
          label="장결(적신호) 학생"
          value={redFlagCount == null ? '…' : `${redFlagCount}명`}
          sub="월평균 출석률 25% 이하"
          alert={redFlagCount > 0}
        />
      </div>

      {/* 누적 미제출 알림 */}
      <MissingAttendanceAlert />
    </div>
  );
}

function Chip({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate-700/70 rounded-full px-3 py-1.5 text-xs">
      <span className="text-slate-300">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

function StatCard({ label, value, sub, alert = false }) {
  return (
    <div className={`bg-white border rounded-2xl px-4 py-3.5 shadow-sm ${alert ? 'border-rose-200' : 'border-slate-200'}`}>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className={`text-xl font-bold mt-0.5 tracking-tight ${alert ? 'text-rose-500' : 'text-slate-800'}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 학생 > 임원·학생 사역: 명단 보기 + 배정 관리
// ────────────────────────────────────────────────────────
function MinistrySection() {
  const [mode, setMode] = useState('view');
  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        <button
          onClick={() => setMode('view')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            mode === 'view' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'
          }`}
        >
          명단 보기
        </button>
        <button
          onClick={() => setMode('manage')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            mode === 'manage' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'
          }`}
        >
          배정 관리
        </button>
      </div>
      {mode === 'view' ? <StudentDashboardPage /> : <OfficerManagement />}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 설정: 관리자 계정 생성 + 보안 규칙 안내
// ────────────────────────────────────────────────────────
function SystemSettings() {
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMsg, setAdminMsg] = useState('');

  async function handleCreateAdmin(e) {
    e.preventDefault();
    if (!adminEmail || !adminPassword || !adminName) {
      setAdminMsg('모든 필드를 입력하세요.');
      return;
    }
    if (adminPassword.length < 6) {
      setAdminMsg('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    setAdminSaving(true);
    setAdminMsg('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, adminEmail.trim(), adminPassword);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: adminName.trim(),
        role: 'admin',
        service: null,
        classId: null,
        email: adminEmail.trim(),
      });
      setAdminMsg('✅ 관리자 계정이 생성되었습니다.');
      setAdminEmail('');
      setAdminPassword('');
      setAdminName('');
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setAdminMsg('이미 사용 중인 이메일입니다.');
      } else {
        setAdminMsg('오류: ' + err.message);
      }
    }
    setAdminSaving(false);
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-3">관리자 계정 추가</h3>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700">
        ⚠️ 관리자 계정은 모든 기능에 접근할 수 있습니다. 신중하게 사용하세요.
      </div>
      <form onSubmit={handleCreateAdmin} className="space-y-3 max-w-md">
        <div>
          <label className="label">이름</label>
          <input
            className="input"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="관리자 이름"
          />
        </div>
        <div>
          <label className="label">이메일</label>
          <input
            className="input"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            type="email"
            placeholder="admin@example.com"
          />
        </div>
        <div>
          <label className="label">비밀번호 (6자 이상)</label>
          <input
            className="input"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            type="password"
            placeholder="비밀번호"
          />
        </div>
        {adminMsg && (
          <div className={`text-sm p-2 rounded-lg ${adminMsg.startsWith('✅') ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
            {adminMsg}
          </div>
        )}
        <button type="submit" disabled={adminSaving} className="btn-primary w-full">
          {adminSaving ? '생성 중...' : '관리자 계정 생성'}
        </button>
      </form>

      <div className="mt-8 border-t border-slate-100 pt-6">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Firestore 보안 규칙 설정</h3>
        <div className="bg-slate-800 text-slate-100 rounded-xl p-4 text-xs overflow-x-auto">
          <pre>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    function isTeacher() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'teacher';
    }
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /classes/{classId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /students/{studentId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /attendance/{attendanceId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /class_growth_categories/{classId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /student_growth/{studentId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /growth_logs/{logId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /offerings/{offeringId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /retreats/{retreatId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
  }
}`}</pre>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Firebase 콘솔 → Firestore → 규칙 탭에 위 규칙을 붙여넣으세요.
          (성장 스티커·헌금·수련회 기능을 위한 규칙이 추가되었습니다)
        </p>
      </div>
    </div>
  );
}
