import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const DEFAULT_DOMAIN = 'songrim.church';

// 한글이 포함되어있으면 이름으로 간주
function isKoreanName(v) {
  return /[가-힣]/.test(v);
}

// 사용자가 입력한 값을 이메일로 변환
// 1) '@' 이 있으면 그대로
// 2) 한글이면 usernames/{이름} 조회 → email 매핑
// 3) 그 외(영문/숫자)면 '@songrim.church' 자동 부착
async function resolveEmail(input) {
  const v = String(input || '').trim();
  if (!v) return '';
  if (v.includes('@')) return v.toLowerCase();
  if (isKoreanName(v)) {
    const snap = await getDoc(doc(db, 'usernames', v));
    if (snap.exists()) return snap.data().email;
    // 매핑 없으면 오류
    throw new Error('UNKNOWN_NAME');
  }
  return `${v.toLowerCase()}@${DEFAULT_DOMAIN}`;
}

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userId || !password) return setError('이름과 비밀번호를 입력하세요.');
    setError('');
    setLoading(true);
    try {
      const email = await resolveEmail(userId);
      await login(email, password);
      navigate('/');
    } catch (err) {
      if (err.message === 'UNKNOWN_NAME') {
        setError('등록된 이름이 아닙니다. 영문 아이디로 로그인하거나 관리자에게 문의해주세요.');
      } else if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-email'
      ) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
      } else {
        setError('로그인 중 오류가 발생했습니다: ' + err.message);
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white/85 backdrop-blur rounded-3xl shadow-soft border border-white/70 w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-ocean-400 to-ocean-600 text-white text-3xl shadow-soft mb-3">⛪</div>
          <h1 className="text-2xl font-bold text-ink">송림청소년부</h1>
          <p className="text-ink-muted text-sm mt-1">출석 관리 시스템</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">이름</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="input"
              placeholder="예: 전호진"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>
          <div>
            <label className="label">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="비밀번호"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-base mt-2"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          계정이 없으시면 담당 관리자에게 문의하세요.
        </p>
      </div>
    </div>
  );
}
