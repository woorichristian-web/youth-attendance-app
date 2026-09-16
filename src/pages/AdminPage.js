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

const TABS = ['등록자 현황', '학생 관리', '교사 관리', '전체 다운로드', '관리자 설정'];

export default function AdminPage() {
  const [tab, setTab] = useState(0);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // 관리자 계정 생성 상태
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMsg, setAdminMsg] = useState('');

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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">
        데이터를 불러오는 중...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">⚙️ 관리자 패널</h1>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === i ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <RegistrationStats />
      )}
      {tab === 1 && (
        <StudentManagement classes={classes} />
      )}
      {tab === 2 && (
        <TeacherManagement
          classes={classes}
          onClassesChange={loadClasses}
        />
      )}
      {tab === 3 && (
        <ExcelExport classes={classes} students={students} />
      )}
      {tab === 4 && (
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4">관리자 계정 추가</h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-sm text-yellow-700">
            ⚠️ 관리자 계정은 모든 기능에 접근할 수 있습니다. 신중하게 사용하세요.
          </div>
          <form onSubmit={handleCreateAdmin} className="card space-y-3">
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

          <div className="mt-6">
            <h3 className="font-bold text-gray-700 mb-3">Firestore 보안 규칙 설정</h3>
            <div className="bg-gray-800 text-gray-100 rounded-xl p-4 text-xs overflow-x-auto">
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
  }
}`}</pre>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Firebase 콘솔 → Firestore → 규칙 탭에 위 규칙을 붙여넣으세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
