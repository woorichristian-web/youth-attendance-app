import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3'];
const STATUS_OPTIONS = [
  { value: 'new_believer', label: '새신자' },
  { value: 'from_seohyeon', label: '서현에서 이동' },
  { value: 'from_other_church', label: '타교회 이동' },
  { value: 'existing', label: '재적 학생 등록' },
];
const ENTRY_TYPE_LABEL = {
  new_believer: '새신자',
  from_seohyeon: '서현에서 이동',
  from_other_church: '타교회 이동',
  existing: '재적 학생 등록',
};
const BAPTISM_LEVELS = ['학습', '세례', '유아세례', '입교', '침례', '영세', '잘 모름'];
const EVANGELIST_TYPES = ['부모님', '친구', '스스로', '기타'];
const NEW_FRIEND_TABS = ['기본 정보', '가족 관계', '심방 · 메모'];
const RELATIONS = ['부', '모', '형', '언니', '누나', '오빠', '동생', '조부', '조모', '기타'];

const emptyFamilyMember = () => ({
  name: '', relation: '', birthMonthDay: '', religion: '', church: '',
});

const emptyForm = () => ({
  // 기본
  name: '',
  gender: '',
  birthDate: '',
  grade: '',
  service: '',
  classId: '',
  phone: '',
  parentPhone: '', // UI label: "보호자 연락처"
  school: '',
  address: '',
  status: '',
  baptized: false,
  notes: '',

  // 새친구 전용
  visitDate: new Date().toISOString().slice(0, 10),
  baptismLevel: '',
  evangelistType: '',
  evangelistOther: '',
  registerDate: '', // 등반일
  assignedClassId: '', // 배정반교사
  father: '',
  mother: '',
  familyMembers: [],
  week1Visit: '',
  week2Visit: '',
  churchAcquaintance: '',
  newFriendTeamMemo: '',
  pastorVisit: '',
  registerConfirmed: '',
  additionalNote: '',
  followupNote: '',
  privacyConsent: false,
});

export default function RegisterStudentPage() {
  const { canRegisterStudents } = useAuth();
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [nfTab, setNfTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function load() {
      const snap = await getDocs(query(collection(db, 'classes'), orderBy('service')));
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    load();
  }, []);

  // 상태를 선택한 경우에만 추가정보 펼침
  const isNewFriend = Boolean(form.status);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('이름을 입력하세요.');
    if (!form.status) return setError('상태를 선택해주세요.');
    if (!form.privacyConsent) return setError('개인정보 수집·활용에 동의해주세요.');
    if (!form.assignedClassId && !form.classId) {
      return setError('배정반 교사를 선택해주세요.');
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // 배정반 교사가 있으면 우선, 없으면 form.classId
      const finalClassId = form.assignedClassId || form.classId;
      const selectedClass = classes.find((c) => c.id === finalClassId);

      const entryTypeLabel = ENTRY_TYPE_LABEL[form.status] || form.status;
      const evangelistLabel = form.evangelistType === '기타'
        ? `기타: ${form.evangelistOther}`
        : form.evangelistType;

      const data = {
        // 공통 학생 필드
        name: form.name.trim(),
        gender: form.gender,
        birthDate: form.birthDate,
        grade: form.grade,
        service: selectedClass?.service || form.service || '',
        classId: finalClassId,
        teacherName: selectedClass?.teacherName || '',
        phone: form.phone,
        parentPhone: form.parentPhone,
        school: form.school,
        address: form.address,
        status: 'active',
        entryType: form.status,       // new_believer / from_seohyeon / from_other_church / existing
        entryTypeLabel,
        active: true,
        notes: form.notes,
        joinDate: form.visitDate,

        // 개인정보 동의
        privacyConsent: true,
        privacyConsentAt: serverTimestamp(),

        // 새친구 관리 시트에 표시할 상세 정보
        isNewFriend: true,
        evangelist: evangelistLabel,
        baptismLevel: form.baptismLevel,
        newFriendInfo: {
          entryType: form.status,
          entryTypeLabel,
          visitDate: form.visitDate,
          baptismLevel: form.baptismLevel,
          evangelistType: form.evangelistType,
          evangelistOther: form.evangelistOther,
          evangelist: evangelistLabel,
          registerDate: form.registerDate,
          assignedClassId: form.assignedClassId,
          assignedTeacherName: selectedClass?.teacherName || '',
          father: form.father,
          mother: form.mother,
          familyMembers: form.familyMembers.filter((m) => m.name || m.relation),
          week1Visit: form.week1Visit,
          week2Visit: form.week2Visit,
          churchAcquaintance: form.churchAcquaintance,
          newFriendTeamMemo: form.newFriendTeamMemo,
          pastorVisit: form.pastorVisit,
          registerConfirmed: form.registerConfirmed,
          additionalNote: form.additionalNote,
          followupNote: form.followupNote,
        },
      };

      await addDoc(collection(db, 'students'), data);
      setSuccess(`✅ "${data.name}" 학생이 등록되었습니다. (새친구 관리 시트에 추가됨)`);
      setForm(emptyForm());
      setNfTab(0);
    } catch (err) {
      console.error(err);
      setError('저장 중 오류: ' + err.message);
    }
    setSaving(false);
  }

  const filteredClasses = form.service
    ? classes.filter((c) => c.service === form.service)
    : classes;

  if (!canRegisterStudents) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="card bg-amber-50 border-amber-200 text-amber-700 text-center py-6 text-sm">
          🔒 학생 등록 권한이 없습니다. 관리자 또는 새친구 담당자에게 문의해주세요.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-ink mb-2">✍️ 학생 등록</h1>
      <p className="text-sm text-ink-muted mb-6">새로 등록할 학생 정보를 입력하세요. 상태를 "새친구 등록"으로 선택하면 추가 정보 입력이 나타납니다.</p>

      {success && (
        <div className="card bg-emerald-50/70 border-emerald-200 text-emerald-700 mb-4 text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="card space-y-3">
        <div>
          <label className="label">이름 *</label>
          <input className="input" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">성별</label>
            <select className="input" value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
              <option value="">선택</option>
              <option value="남">남</option>
              <option value="여">여</option>
            </select>
          </div>
          <div>
            <label className="label">생년월일</label>
            <input className="input" type="date" value={form.birthDate} onChange={(e) => setField('birthDate', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">예배</label>
          <select className="input" value={form.service} onChange={(e) => { setField('service', e.target.value); setField('classId', ''); }}>
            <option value="">선택</option>
            <option value="1부">1부</option>
            <option value="2부">2부</option>
          </select>
        </div>

        <div>
          <label className="label">학생 연락처</label>
          <input className="input" type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="010-0000-0000" />
        </div>

        <div>
          <label className="label">보호자 연락처</label>
          <input className="input" type="tel" value={form.parentPhone} onChange={(e) => setField('parentPhone', e.target.value)} placeholder="010-0000-0000" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">학교</label>
            <input className="input" value={form.school} onChange={(e) => setField('school', e.target.value)} placeholder="예: 분당중학교" />
          </div>
          <div>
            <label className="label">학년</label>
            <select className="input" value={form.grade} onChange={(e) => setField('grade', e.target.value)}>
              <option value="">선택</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">주소</label>
          <input className="input" value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="주소" />
        </div>

        <div>
          <label className="label">상태 *</label>
          <select className="input" value={form.status} onChange={(e) => setField('status', e.target.value)}>
            <option value="">-</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!form.status && (
            <p className="text-xs text-ink-muted mt-1">상태를 선택하면 추가 정보 입력 항목이 나타납니다.</p>
          )}
        </div>

        <div>
          <label className="label">특이사항</label>
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
        </div>

        {/* ── 새친구 등록 확장 ─────────────────────────── */}
        {isNewFriend && (
          <div className="mt-2 p-3 rounded-2xl bg-ocean-50/60 border border-ocean-100 space-y-3">
            <div className="font-bold text-ocean-700">추가 정보</div>

            <div className="flex gap-1 bg-white/70 p-1 rounded-xl">
              {NEW_FRIEND_TABS.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNfTab(i)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    nfTab === i ? 'bg-ocean-400 text-white shadow-sm' : 'text-ink-soft hover:bg-ocean-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* 탭 1: 기본 정보 */}
            {nfTab === 0 && (
              <div className="space-y-3">
                <div>
                  <label className="label">방문일</label>
                  <input className="input" type="date" value={form.visitDate} onChange={(e) => setField('visitDate', e.target.value)} />
                  <p className="text-xs text-ocean-600 mt-1">방문일로부터 30일간 "새친구" 뱃지 표시, 출석률도 이 날부터 계산</p>
                </div>

                <div>
                  <label className="label">신급</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {BAPTISM_LEVELS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setField('baptismLevel', b)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                          form.baptismLevel === b
                            ? 'border-ocean-400 bg-ocean-50 text-ocean-700'
                            : 'border-ocean-100 text-ink-muted bg-white'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">인도자</label>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {EVANGELIST_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setField('evangelistType', t)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                          form.evangelistType === t
                            ? 'border-ocean-400 bg-ocean-50 text-ocean-700'
                            : 'border-ocean-100 text-ink-muted bg-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {form.evangelistType === '기타' && (
                    <input
                      className="input"
                      value={form.evangelistOther}
                      onChange={(e) => setField('evangelistOther', e.target.value)}
                      placeholder="인도자를 직접 입력하세요"
                    />
                  )}
                </div>

                <div>
                  <label className="label">등반일</label>
                  <input className="input" type="date" value={form.registerDate} onChange={(e) => setField('registerDate', e.target.value)} />
                </div>

                <div>
                  <label className="label">배정반 교사</label>
                  <select
                    className="input"
                    value={form.assignedClassId}
                    onChange={(e) => {
                      const cls = classes.find((c) => c.id === e.target.value);
                      setField('assignedClassId', e.target.value);
                      if (cls?.service) setField('service', cls.service);
                    }}
                  >
                    <option value="">선택</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.teacherName} 선생님반 ({c.service})</option>
                    ))}
                  </select>
                  <p className="text-xs text-ocean-600 mt-1">선택하면 자동으로 해당 반 명단에 뜹니다.</p>
                </div>
              </div>
            )}

            {/* 탭 2: 가족 관계 */}
            {nfTab === 1 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">부</label>
                    <input className="input" value={form.father} onChange={(e) => setField('father', e.target.value)} placeholder="부 성함" />
                  </div>
                  <div>
                    <label className="label">모</label>
                    <input className="input" value={form.mother} onChange={(e) => setField('mother', e.target.value)} placeholder="모 성함" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-ink-soft">👨‍👩‍👧‍👦 가족 구성원</label>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 bg-ocean-100 text-ocean-700 rounded-lg"
                    onClick={() => setField('familyMembers', [...form.familyMembers, emptyFamilyMember()])}
                  >
                    + 추가
                  </button>
                </div>

                {form.familyMembers.length === 0 && (
                  <p className="text-xs text-ink-muted">가족 구성원을 추가하려면 위의 '+ 추가' 버튼을 누르세요.</p>
                )}

                <div className="space-y-2">
                  {form.familyMembers.map((m, idx) => (
                    <div key={idx} className="rounded-xl bg-white/80 border border-ocean-100 p-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-ink-muted">#{idx + 1}</span>
                        <button
                          type="button"
                          className="text-xs text-red-500"
                          onClick={() => setField('familyMembers', form.familyMembers.filter((_, i) => i !== idx))}
                        >
                          삭제
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="input"
                          placeholder="이름"
                          value={m.name}
                          onChange={(e) => setField('familyMembers', form.familyMembers.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                        />
                        <select
                          className="input"
                          value={m.relation}
                          onChange={(e) => setField('familyMembers', form.familyMembers.map((x, i) => i === idx ? { ...x, relation: e.target.value } : x))}
                        >
                          <option value="">관계</option>
                          {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <input
                          className="input"
                          placeholder="생일 월/일 (예: 05/12)"
                          value={m.birthMonthDay}
                          onChange={(e) => setField('familyMembers', form.familyMembers.map((x, i) => i === idx ? { ...x, birthMonthDay: e.target.value } : x))}
                        />
                        <input
                          className="input"
                          placeholder="종교"
                          value={m.religion}
                          onChange={(e) => setField('familyMembers', form.familyMembers.map((x, i) => i === idx ? { ...x, religion: e.target.value } : x))}
                        />
                      </div>
                      <input
                        className="input"
                        placeholder="출석교회"
                        value={m.church}
                        onChange={(e) => setField('familyMembers', form.familyMembers.map((x, i) => i === idx ? { ...x, church: e.target.value } : x))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 탭 3: 심방·메모 (엑셀 새친구 관리 시트 컬럼) */}
            {nfTab === 2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">1주차 심방</label>
                    <input className="input" value={form.week1Visit} onChange={(e) => setField('week1Visit', e.target.value)} placeholder="1주차 심방 여부/내용" />
                  </div>
                  <div>
                    <label className="label">2주차 심방</label>
                    <input className="input" value={form.week2Visit} onChange={(e) => setField('week2Visit', e.target.value)} placeholder="2주차 심방 여부/내용" />
                  </div>
                </div>
                <div>
                  <label className="label">교회 내 지인</label>
                  <input className="input" value={form.churchAcquaintance} onChange={(e) => setField('churchAcquaintance', e.target.value)} placeholder="교회 안 아는 사람" />
                </div>
                <div>
                  <label className="label">교역자 심방</label>
                  <input className="input" value={form.pastorVisit} onChange={(e) => setField('pastorVisit', e.target.value)} placeholder="교역자 심방 일시/내용" />
                </div>
                <div>
                  <label className="label">등록 가부</label>
                  <select className="input" value={form.registerConfirmed} onChange={(e) => setField('registerConfirmed', e.target.value)}>
                    <option value="">-</option>
                    <option value="O">O (등록)</option>
                    <option value="X">X (미등록)</option>
                    <option value="-">- (보류)</option>
                  </select>
                </div>
                <div>
                  <label className="label">메모 (새친구팀)</label>
                  <textarea className="input" rows={2} value={form.newFriendTeamMemo} onChange={(e) => setField('newFriendTeamMemo', e.target.value)} />
                </div>
                <div>
                  <label className="label">비고</label>
                  <textarea className="input" rows={2} value={form.additionalNote} onChange={(e) => setField('additionalNote', e.target.value)} />
                </div>
                <div>
                  <label className="label">특이사항 및 심방 내용</label>
                  <textarea className="input" rows={3} value={form.followupNote} onChange={(e) => setField('followupNote', e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 개인정보 동의 */}
        <div className="mt-3 p-3 border border-ocean-200 bg-white/70 rounded-xl">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.privacyConsent}
              onChange={(e) => setField('privacyConsent', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-ocean-500 flex-shrink-0"
            />
            <span className="text-xs text-ink-soft leading-relaxed">
              <strong className="text-ocean-700">개인정보 수집·활용 동의</strong> — 새 친구 등록 및 연락을 위해 개인정보를 수집·활용합니다.
              「개인정보보호법」에 따라 개인정보 수집·활용에 <strong>동의합니다</strong>.
            </span>
          </label>
        </div>

        {error && <div className="text-red-500 text-sm">{error}</div>}

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? '저장 중...' : '💾 학생 등록'}
        </button>
      </form>
    </div>
  );
}
