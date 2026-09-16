import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import StudentManagement from '../components/admin/StudentManagement';
import TeacherManagement from '../components/admin/TeacherManagement';
import ExcelExport from '../components/admin/ExcelExport';
import RegistrationStats from '../components/admin/RegistrationStats';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { auth } from '../firebase';

const NAV = [
  { id: 0, label: '등록자 현황', icon: '📊', desc: '등록 및 출석 현황 요약을 확인합니다.' },
  { id: 1, label: '학생 관리', icon: '🎓', desc: '학생 정보를 등록·수정하고 반을 배정합니다.' },
  { id: 2, label: '교사 관리', icon: '👩‍🏫', desc: '반과 교사 계정을 관리합니다.' },
  { id: 3, label: '데이터 다운로드', icon: '📥', desc: '출석·학생 데이터를 엑셀로 내보냅니다.' },
  { id: 4, label: '시스템 설정', icon: '🔐', desc: '관리자 계정과 보안 규칙을 관리합니다.' },
];

export default function AdminPage() {
  const [tab, setTab] = useState(0);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadClasses() {
    const snap = await getDocs(query(collection(db, 'classes'), orderBy('service')));
    setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadStudents() {
    const snap = await getDocs(collection(db, 'students'));
    setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadClasses(), loadStudents()]);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-400">
        데이터를 불러오는 중...
      </div>
    );
  }

  const current = NAV[tab];
  const svc1 = students.filter((s) => s.service === '1부').length;
  const svc2 = students.filter((s) => s.service === '2부').length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-8">
      {/* 헤더 */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">관리자 콘솔</h1>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 border border-slate-200 bg-white rounded-full px-2 py-0.5">
            Admin
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">송림청소년부 출석 관리 시스템 운영 도구</p>
      </div>

      {/* 요약 지표 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="전체 학생" value={`${students.length}명`} sub="등록 기준" />
        <StatCard label="운영 반" value={`${classes.length}개`} sub="1·2부 합계" />
        <StatCard label="1부 학생" value={`${svc1}명`} sub="1부 예배" />
        <StatCard label="2부 학생" value={`${svc2}명`} sub="2부 예배" />
      </div>

      <div className="md:grid md:grid-cols-[220px_1fr] md:gap-6 md:items-start">
        {/* 사이드바 (데스크탑) */}
        <aside className="hidden md:block sticky top-20">
          <nav className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
                  tab === item.id
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

        {/* 모바일: 가로 스크롤 탭 */}
        <div className="md:hidden flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors border ${
                tab === item.id
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        {/* 콘텐츠 */}
        <main className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="px-5 md:px-6 pt-5 pb-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">{current.icon} {current.label}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{current.desc}</p>
          </div>
          <div className="px-5 md:px-6 py-5">
            {tab === 0 && <RegistrationStats />}
            {tab === 1 && <StudentManagement classes={classes} />}
            {tab === 2 && (
              <TeacherManagement classes={classes} onClassesChange={loadClasses} />
            )}
            {tab === 3 && <ExcelExport classes={classes} students={students} />}
            {tab === 4 && <SystemSettings />}
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-sm">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="text-xl font-bold text-slate-800 mt-0.5 tracking-tight">{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 시스템 설정: 관리자 계정 생성 + 보안 규칙 안내
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
  }
}`}</pre>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Firebase 콘솔 → Firestore → 규칙 탭에 위 규칙을 붙여넣으세요.
          (성장 스티커 기능을 위해 class_growth_categories · student_growth · growth_logs 규칙이 추가되었습니다)
        </p>
      </div>
    </div>
  );
}
