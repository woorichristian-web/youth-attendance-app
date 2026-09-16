import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// 마이페이지: 선생님이 자신의 정보를 확인·수정 (비밀번호 변경 불가)
export default function TeacherMyPage() {
  const { currentUser, userProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [className, setClassName] = useState('');
  const [form, setForm] = useState({ phone: '', birth: '', address: '', bio: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        const data = snap.exists() ? snap.data() : {};
        setProfile(data);
        setForm({
          phone: data.phone || '',
          birth: data.birth || '',
          address: data.address || '',
          bio: data.bio || '',
        });
        if (data.classId) {
          const clsSnap = await getDocs(collection(db, 'classes'));
          const cls = clsSnap.docs.find((d) => d.id === data.classId);
          if (cls) setClassName(`${cls.data().teacherName} 선생님반`);
        }
      } catch (e) {
        console.error('프로필 로드 오류:', e);
      }
      setLoading(false);
    })();
  }, [currentUser]);

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        phone: form.phone.trim(),
        birth: form.birth.trim(),
        address: form.address.trim(),
        bio: form.bio.trim(),
      });
      setMsg('✅ 저장되었습니다.');
    } catch (e) {
      console.error('저장 오류:', e);
      setMsg('저장 중 오류가 발생했습니다.');
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="max-w-xl mx-auto px-4 py-12 text-center text-ink-muted">불러오는 중...</div>;
  }

  const name = profile?.name || userProfile?.name || '';

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-24 md:pb-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-ink">👤 마이페이지</h1>
        <p className="text-sm text-ink-muted mt-0.5">내 정보를 확인하고 연락처 등을 수정할 수 있어요</p>
      </div>

      {/* 기본 정보 (수정 불가) */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-ocean-400 to-ocean-600 text-white flex items-center justify-center font-bold text-2xl">
            {(name || '?').slice(0, 1)}
          </div>
          <div>
            <div className="font-bold text-ink text-lg">{name} 선생님</div>
            <div className="text-xs text-ink-muted">
              {profile?.service ? `${profile.service} · ` : ''}{className || '반 미배정'}
            </div>
          </div>
        </div>
        <div className="space-y-2 text-sm border-t border-ocean-100 pt-3">
          <div className="flex justify-between">
            <span className="text-ink-muted">이메일</span>
            <span className="text-ink">{profile?.email || currentUser?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">부서</span>
            <span className="text-ink">{profile?.service || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">담당 반</span>
            <span className="text-ink">{className || '-'}</span>
          </div>
        </div>
        <p className="text-[11px] text-ink-muted mt-3">
          이름·이메일·담당 반 변경과 비밀번호 재설정은 관리자에게 문의해주세요.
        </p>
      </div>

      {/* 수정 가능한 정보 */}
      <div className="card space-y-3">
        <div className="font-bold text-ink text-sm mb-1">✏️ 내 정보 수정</div>
        <div>
          <label className="label">연락처</label>
          <input
            className="input"
            type="tel"
            placeholder="010-0000-0000"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="label">생년월일</label>
          <input
            className="input"
            type="date"
            value={form.birth}
            onChange={(e) => setForm({ ...form, birth: e.target.value })}
          />
        </div>
        <div>
          <label className="label">주소</label>
          <input
            className="input"
            placeholder="주소 (선택)"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div>
          <label className="label">메모 · 자기소개</label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="기도제목, 소개 등 (선택)"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </div>
        {msg && (
          <div className={`text-sm p-2 rounded-lg ${msg.startsWith('✅') ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
            {msg}
          </div>
        )}
        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}
