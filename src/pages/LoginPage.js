import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const DEFAULT_DOMAIN = 'songrim.church';
const SAVED_KEY = 'songrim_saved_login';
const SKIP_KEY = 'songrim_skip_autologin';

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

// 저장된 로그인 정보 (간단한 인코딩 — 기기 브라우저에만 저장됨)
function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return null;
    const obj = JSON.parse(decodeURIComponent(atob(raw)));
    if (!obj?.id || !obj?.pw) return null;
    return obj;
  } catch {
    return null;
  }
}
function storeSaved(id, pw) {
  try { localStorage.setItem(SAVED_KEY, btoa(encodeURIComponent(JSON.stringify({ id, pw })))); } catch { /* 무시 */ }
}
function clearSaved() {
  try { localStorage.removeItem(SAVED_KEY); } catch { /* 무시 */ }
}

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [hasSaved, setHasSaved] = useState(false);
  const [autoTrying, setAutoTrying] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const autoTried = useRef(false);

  async function doLogin(id, pw, saveOnSuccess) {
    const email = await resolveEmail(id);
    await login(email, pw);
    if (saveOnSuccess) storeSaved(id, pw);
    else clearSaved();
    navigate('/');
  }

  function errorMessage(err) {
    if (err.message === 'UNKNOWN_NAME') {
      return '등록된 이름이 아닙니다. 영문 아이디로 로그인하거나 관리자에게 문의해주세요.';
    }
    if (
      err.code === 'auth/user-not-found' ||
      err.code === 'auth/wrong-password' ||
      err.code === 'auth/invalid-credential' ||
      err.code === 'auth/invalid-email'
    ) {
      return '아이디 또는 비밀번호가 올바르지 않습니다.';
    }
    if (err.code === 'auth/too-many-requests') {
      return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.';
    }
    return '로그인 중 오류가 발생했습니다: ' + err.message;
  }

  // 저장된 로그인 정보가 있으면 자동 로그인
  // 단, 방금 로그아웃한 직후에는 자동 실행하지 않고 입력만 채워둠 (로그아웃이 불가능해지는 것 방지)
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    const saved = loadSaved();
    if (!saved) return;
    setHasSaved(true);
    setUserId(saved.id);
    setPassword(saved.pw);

    let skip = false;
    try {
      skip = sessionStorage.getItem(SKIP_KEY) === '1';
      sessionStorage.removeItem(SKIP_KEY);
    } catch { /* 무시 */ }
    if (skip) return;

    (async () => {
      setAutoTrying(true);
      try {
        await doLogin(saved.id, saved.pw, true);
      } catch (err) {
        // 자동 로그인 실패(비밀번호 변경 등) → 저장 정보 삭제하고 수동 로그인 유도
        clearSaved();
        setHasSaved(false);
        setPassword('');
        setError('자동 로그인에 실패했습니다. 다시 로그인해주세요.');
      }
      setAutoTrying(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userId || !password) return setError('아이디와 비밀번호를 입력하세요.');
    setError('');
    setLoading(true);
    try {
      await doLogin(userId, password, remember);
    } catch (err) {
      setError(errorMessage(err));
    }
    setLoading(false);
  }

  function forgetSaved() {
    clearSaved();
    setHasSaved(false);
    setUserId('');
    setPassword('');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white/85 backdrop-blur rounded-3xl shadow-soft border border-white/70 w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-ocean-400 to-ocean-600 text-white text-3xl shadow-soft mb-3">⛪</div>
          <h1 className="text-2xl font-bold text-ink">송림청소년부</h1>
          <p className="text-ink-muted text-sm mt-1">출석 관리 시스템</p>
        </div>

        {autoTrying ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-3">🔑</div>
            <p className="text-sm text-ink-soft font-medium">저장된 정보로 자동 로그인 중...</p>
          </div>
        ) : (
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

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 accent-ocean-500"
              />
              <span className="text-sm text-ink-soft">로그인 정보 저장 (다음부터 자동 로그인)</span>
            </label>

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

            {hasSaved && (
              <button
                type="button"
                onClick={forgetSaved}
                className="w-full text-center text-xs text-gray-400 hover:text-red-500 mt-1"
              >
                저장된 로그인 정보 삭제
              </button>
            )}
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          계정이 없으시면 담당 관리자에게 문의하세요.
        </p>
      </div>
    </div>
  );
}
