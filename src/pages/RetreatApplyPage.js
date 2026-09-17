import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3'];

// 배포용 수련회 신청서 — 로그인 없이 접속 (링크 공유)
export default function RetreatApplyPage() {
  const { formId } = useParams();
  const [form, setForm] = useState(null);       // retreat_forms 문서
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const isTeacherForm = form?.audience === 'teacher';

  const [answers, setAnswers] = useState({
    name: '', service: '', grade: '', className: '', teacherName: '',
    role: '', attendType: '', partialWhen: '', expectation: '', prayer: '',
  });
  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'retreat_forms', formId));
        setForm(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch (err) {
        console.error('신청서 로드 오류:', err);
        setForm(null);
      }
      setLoading(false);
    })();
  }, [formId]);

  async function submit() {
    if (!answers.name.trim()) return setError('이름을 입력해주세요.');
    if (!answers.service) return setError('부서를 선택해주세요.');
    if (!answers.attendType) return setError('전체참석/부분참석을 선택해주세요.');
    if (answers.attendType === '부분참석' && !answers.partialWhen.trim())
      return setError('부분참석 시 참석 가능한 시간을 적어주세요.');
    setError('');
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'retreat_applications'), {
        formId,
        retreatId: form.retreatId,
        audience: form.audience,
        name: answers.name.trim(),
        service: answers.service,
        grade: isTeacherForm ? '' : answers.grade,
        className: isTeacherForm ? '' : answers.className.trim(),
        teacherName: isTeacherForm ? '' : answers.teacherName.trim(),
        role: isTeacherForm ? answers.role.trim() : '',
        attendType: answers.attendType,
        partialWhen: answers.attendType === '부분참석' ? answers.partialWhen.trim() : '',
        expectation: answers.expectation.trim(),
        prayer: answers.prayer.trim(),
        createdAt: Date.now(),
      });
      setDone(true);
    } catch (err) {
      console.error('신청 제출 오류:', err);
      setError('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
    setSubmitting(false);
  }

  if (loading) {
    return <PageShell><div className="text-center text-gray-400 py-16 text-sm">신청서를 불러오는 중...</div></PageShell>;
  }
  if (!form) {
    return (
      <PageShell>
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-gray-600 font-medium">신청서를 찾을 수 없습니다.</p>
          <p className="text-sm text-gray-400 mt-1">링크가 정확한지 확인해주세요.</p>
        </div>
      </PageShell>
    );
  }
  if (done) {
    return (
      <PageShell>
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🙏</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">신청이 완료되었습니다!</h2>
          <p className="text-sm text-gray-500">{form.title} 신청서가 잘 제출되었어요.</p>
          {form.paymentInfo && (
            <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-left whitespace-pre-wrap max-w-md mx-auto">
              💰 {form.paymentInfo}
            </div>
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* 헤더 */}
      <div className="text-center mb-5">
        <div className="text-3xl mb-2">⛺</div>
        <h1 className="text-2xl font-bold text-gray-800">{form.title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isTeacherForm ? '교사용 신청서' : '학생용 신청서'} · 송림청소년부
        </p>
      </div>

      {/* 안내 (일정·장소·주제·메모) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
        <div className="space-y-1.5 text-sm">
          {form.schedule && <InfoRow icon="📅" label="일정" value={form.schedule} />}
          {form.place && <InfoRow icon="📍" label="장소" value={form.place} />}
          {form.theme && <InfoRow icon="✨" label="주제" value={form.theme} />}
        </div>
        {form.memo && (
          <p className={`text-sm text-gray-600 whitespace-pre-wrap ${form.schedule || form.place || form.theme ? 'mt-3 pt-3 border-t border-gray-100' : ''}`}>
            {form.memo}
          </p>
        )}
      </div>

      {/* 신청자 정보 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4 space-y-4">
        <h3 className="font-semibold text-gray-800">신청자 정보</h3>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">이름 *</label>
          <input className="input" placeholder="이름을 입력하세요" value={answers.name}
            onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">부서 *</label>
          <div className="flex gap-2">
            {['1부', '2부'].map((s) => (
              <button key={s} type="button" onClick={() => set('service', s)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                  answers.service === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        {!isTeacherForm && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">학년</label>
              <div className="grid grid-cols-6 gap-1.5">
                {GRADES.map((g) => (
                  <button key={g} type="button" onClick={() => set('grade', g)}
                    className={`py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                      answers.grade === g ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
                    }`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">반</label>
                <input className="input" placeholder="예: 김철수 선생님반" value={answers.className}
                  onChange={(e) => set('className', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">선생님 성함</label>
                <input className="input" placeholder="담임 선생님 이름" value={answers.teacherName}
                  onChange={(e) => set('teacherName', e.target.value)} />
              </div>
            </div>
          </>
        )}
        {isTeacherForm && (
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">담당 (반/역할)</label>
            <input className="input" placeholder="예: 중2 여학생반 / 찬양팀" value={answers.role}
              onChange={(e) => set('role', e.target.value)} />
          </div>
        )}
      </div>

      {/* 참석 형태 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4 space-y-4">
        <h3 className="font-semibold text-gray-800">참석 형태 *</h3>
        <div className="flex gap-2">
          {['전체참석', '부분참석'].map((t) => (
            <button key={t} type="button" onClick={() => set('attendType', t)}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                answers.attendType === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
              }`}>
              {t === '전체참석' ? '✅ 전체참석' : '🕐 부분참석'}
            </button>
          ))}
        </div>
        {answers.attendType === '부분참석' && (
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">언제 참석이 가능한가요? *</label>
            <input className="input" placeholder="예: 토요일 오후부터 참석 가능" value={answers.partialWhen}
              onChange={(e) => set('partialWhen', e.target.value)} />
          </div>
        )}
      </div>

      {/* 기대 & 기도제목 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">이번 수련회에서 가장 기대되는 것은 무엇인가요?</label>
          <textarea className="input" rows={3} placeholder="자유롭게 적어주세요"
            value={answers.expectation} onChange={(e) => set('expectation', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">수련회에서 기도응답 받고 싶은 기도제목이 있나요?</label>
          <textarea className="input" rows={3} placeholder="함께 기도하겠습니다 🙏"
            value={answers.prayer} onChange={(e) => set('prayer', e.target.value)} />
        </div>
      </div>

      {/* 회비 안내 */}
      {form.paymentInfo && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-sm text-amber-800 whitespace-pre-wrap">
          💰 <b>회비 안내</b>
          {'\n'}{form.paymentInfo}
        </div>
      )}

      {error && <div className="text-red-500 text-sm mb-3 text-center">{error}</div>}

      <button onClick={submit} disabled={submitting}
        className="w-full py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-md transition-colors disabled:opacity-50 mb-10">
        {submitting ? '제출 중...' : '신청서 제출하기'}
      </button>
    </PageShell>
  );
}

function PageShell({ children }) {
  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-lg mx-auto">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex gap-2">
      <span>{icon}</span>
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-700 font-medium">{value}</span>
    </div>
  );
}
