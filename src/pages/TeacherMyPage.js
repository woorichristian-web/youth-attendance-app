import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function TeacherMyPage() {
  const { userProfile, currentUser } = useAuth();
  const [form, setForm] = useState({ phone: '', gender: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!userProfile) return;
    setForm({
      phone: userProfile.phone || '',
      gender: userProfile.gender || '',
      address: userProfile.address || '',
      notes: userProfile.notes || '',
    });
  }, [userProfile]);

  async function save() {
    if (!currentUser) return;
    setSaving(true);
    setMsg('');
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        phone: form.phone,
        gender: form.gender,
        address: form.address,
        notes: form.notes,
      });
      setMsg('✅ 저장되었습니다.');
    } catch (err) {
      setMsg('❌ 저장 오류: ' + err.message);
    }
    setSaving(false);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 md:pb-6">
      <h1 className="text-2xl font-bold text-ink mb-1">👤 마이페이지</h1>
      <p className="text-sm text-ink-muted mb-4">개인 정보를 관리합니다. 비밀번호 변경은 관리자에게 문의해주세요.</p>

      <div className="card space-y-3">
        <ReadOnlyField label="이름" value={userProfile?.name || '-'} />
        <ReadOnlyField label="아이디 · 이메일" value={currentUser?.email || '-'} />
        <ReadOnlyField label="소속" value={`${userProfile?.service || '-'} · ${userProfile?.ministrySub || userProfile?.ministryMain || '-'}`} />

        <hr className="border-ocean-100 my-2" />

        <div>
          <label className="label">성별</label>
          <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">선택</option>
            <option value="남">남</option>
            <option value="여">여</option>
          </select>
        </div>

        <div>
          <label className="label">연락처</label>
          <input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
        </div>

        <div>
          <label className="label">주소</label>
          <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="주소" />
        </div>

        <div>
          <label className="label">특이사항</label>
          <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="추가로 남기고 싶은 내용" />
        </div>

        {msg && <div className="text-sm text-ink-soft">{msg}</div>}

        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? '저장 중...' : '💾 저장'}
        </button>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="input bg-ocean-50/40 text-ink-soft cursor-default select-text">{value}</div>
    </div>
  );
}
