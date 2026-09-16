import React, { useState, useEffect } from 'react';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../../firebase';

// ────────────────────────────────────────────────────────
// 설정: 관리자 계정 생성 + 권한 관리 + 보안 규칙 안내
// ────────────────────────────────────────────────────────
export default function SystemSettings() {
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
      // 이름으로 로그인할 수 있도록 매핑 등록
      await setDoc(doc(db, 'usernames', adminName.trim()), { email: adminEmail.trim().toLowerCase() });
      setAdminMsg('✅ 관리자 계정이 생성되었습니다. (이름 로그인 매핑 포함)');
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
            placeholder="관리자 이름 (예: 김정나)"
          />
        </div>
        <div>
          <label className="label">이메일</label>
          <input
            className="input"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            type="email"
            placeholder="admin2@songrim.church"
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
        <RoleManager />
      </div>

      <div className="mt-8 border-t border-slate-100 pt-6">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Firestore 보안 규칙 (현재 적용 중)</h3>
        <div className="bg-slate-800 text-slate-100 rounded-xl p-4 text-xs overflow-x-auto">
          <pre>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 로그인 전 이름→이메일 조회용 (이 규칙을 지우면 이름 로그인이 깨집니다)
    match /usernames/{name} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    // 나머지 컬렉션은 인증된 사용자만
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`}</pre>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          현재 이 규칙이 적용되어 있어 출석·성장 스티커·헌금·수련회 기능이 모두 작동합니다.
          ⚠️ usernames 규칙은 이름 로그인에 필요하므로 절대 삭제하지 마세요.
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 권한 관리: 계정별 역할(관리자/교사) 변경
// ────────────────────────────────────────────────────────
function RoleManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  async function load() {
    const snap = await getDocs(collection(db, 'users'));
    setUsers(
      snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .sort((a, b) => (a.role === 'admin' ? -1 : 1) - (b.role === 'admin' ? -1 : 1) || (a.name || '').localeCompare(b.name || '', 'ko'))
    );
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setRole(u, role) {
    if (!window.confirm(`${u.name || u.email} 계정을 '${role === 'admin' ? '관리자' : '교사'}'로 변경할까요?`)) return;
    setBusy(u.uid);
    try {
      await setDoc(doc(db, 'users', u.uid), { role }, { merge: true });
      await load();
    } catch (e) {
      console.error('권한 변경 오류:', e);
      alert('권한 변경 중 오류가 발생했습니다.');
    }
    setBusy(null);
  }

  if (loading) return <div className="text-sm text-slate-400">계정 목록 불러오는 중...</div>;

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-3">권한 관리</h3>
      <p className="text-xs text-slate-400 mb-3">
        관리자는 관리 콘솔 전체를, 교사는 출석·성장·송청 화면을 사용합니다.
      </p>
      <div className="border border-slate-200 rounded-2xl divide-y divide-slate-50 max-h-96 overflow-y-auto">
        {users.map((u) => (
          <div key={u.uid} className="flex items-center justify-between px-4 py-2.5 gap-2">
            <div className="min-w-0">
              <span className="text-sm font-medium text-slate-700">{u.name || '(이름없음)'}</span>
              <span className="text-xs text-slate-400 ml-2 break-all">{u.email}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                u.role === 'admin' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {u.role === 'admin' ? '관리자' : u.role === 'teacher' ? '교사' : u.role || '기타'}
              </span>
              {u.role !== 'admin' ? (
                <button
                  onClick={() => setRole(u, 'admin')}
                  disabled={busy === u.uid}
                  className="text-xs text-slate-400 hover:text-slate-700 underline disabled:opacity-40"
                >
                  관리자로
                </button>
              ) : (
                <button
                  onClick={() => setRole(u, 'teacher')}
                  disabled={busy === u.uid}
                  className="text-xs text-slate-400 hover:text-slate-700 underline disabled:opacity-40"
                >
                  교사로
                </button>
              )}
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="px-4 py-5 text-center text-xs text-slate-400">계정이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
