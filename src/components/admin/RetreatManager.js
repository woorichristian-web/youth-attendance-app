import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';

// 수련회: 수련회별 신청/회비 납부 현황 관리
export default function RetreatManager({ students, classes }) {
  const [retreats, setRetreats] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [service, setService] = useState('1부');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [forms, setForms] = useState([]);
  const [applications, setApplications] = useState([]);
  const [info, setInfo] = useState({ schedule: '', place: '', theme: '', memo: '', paymentInfo: '' });
  const [infoSaving, setInfoSaving] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const u = onSnapshot(collection(db, 'retreats'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRetreats(list);
      setSelectedId((cur) => (cur && list.some((r) => r.id === cur) ? cur : list[0]?.id || null));
    });
    const u2 = onSnapshot(collection(db, 'retreat_forms'), (snap) => {
      setForms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const u3 = onSnapshot(collection(db, 'retreat_applications'), (snap) => {
      setApplications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { u(); u2(); u3(); };
  }, []);

  const retreat = retreats.find((r) => r.id === selectedId) || null;

  // 수련회를 바꾸면 기본 정보 입력란을 해당 수련회 값으로 채움
  useEffect(() => {
    const r = retreats.find((x) => x.id === selectedId);
    setInfo({
      schedule: r?.schedule || '',
      place: r?.place || '',
      theme: r?.theme || '',
      memo: r?.memo || '',
      paymentInfo: r?.paymentInfo || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const myForms = forms.filter((f) => f.retreatId === selectedId);
  const myApps = applications
    .filter((a) => a.retreatId === selectedId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  // 기본 정보 저장 (이미 만든 신청서에도 최신 정보 반영)
  async function saveInfo() {
    if (!retreat) return;
    setInfoSaving(true);
    try {
      await updateDoc(doc(db, 'retreats', retreat.id), { ...info });
      for (const f of myForms) {
        await updateDoc(doc(db, 'retreat_forms', f.id), { ...info, title: retreat.title });
      }
    } catch (err) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다.');
    }
    setInfoSaving(false);
  }

  // 배포용 신청서 생성 (학생용/교사용)
  async function createForm(audience) {
    if (!retreat) return;
    const id = `${retreat.id}_${audience}`;
    await updateDoc(doc(db, 'retreats', retreat.id), { ...info });
    await setDoc(doc(db, 'retreat_forms', id), {
      retreatId: retreat.id,
      audience,
      title: retreat.title,
      ...info,
      open: true,
      createdAt: Date.now(),
    });
  }

  function formUrl(audience) {
    return `${window.location.origin}/retreat-apply/${selectedId}_${audience}`;
  }

  async function copyLink(audience) {
    const url = formUrl(audience);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(audience);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      window.prompt('아래 링크를 복사하세요:', url);
    }
  }


  async function createRetreat() {
    const title = newTitle.trim();
    if (!title) return;
    const ref = await addDoc(collection(db, 'retreats'), {
      title,
      createdAt: Date.now(),
      participants: {},
    });
    setNewTitle('');
    setCreating(false);
    setSelectedId(ref.id);
  }

  async function removeRetreat(r) {
    if (!window.confirm(`'${r.title}' 수련회를 삭제할까요? 신청서와 신청 기록도 함께 삭제됩니다.`)) return;
    await deleteDoc(doc(db, 'retreats', r.id));
    // 연결된 배포용 신청서와 신청 기록도 정리
    for (const f of forms.filter((x) => x.retreatId === r.id)) {
      await deleteDoc(doc(db, 'retreat_forms', f.id));
    }
    for (const a of applications.filter((x) => x.retreatId === r.id)) {
      await deleteDoc(doc(db, 'retreat_applications', a.id));
    }
  }

  async function toggle(studentId, field) {
    if (!retreat) return;
    const cur = retreat.participants?.[studentId] || {};
    const next = { ...cur, [field]: !cur[field] };
    if (!next.applied && !next.paid) {
      await updateDoc(doc(db, 'retreats', retreat.id), { [`participants.${studentId}`]: deleteField() });
    } else {
      await updateDoc(doc(db, 'retreats', retreat.id), { [`participants.${studentId}`]: next });
    }
  }

  const serviceStudents = useMemo(() => {
    const classOrder = classes
      .filter((c) => c.service === service)
      .sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko'));
    return classOrder.map((cls) => ({
      cls,
      students: students
        .filter((s) => s.classId === cls.id)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')),
    }));
  }, [students, classes, service]);

  const stats = useMemo(() => {
    const p = retreat?.participants || {};
    const ids = Object.keys(p);
    return {
      applied: ids.filter((id) => p[id]?.applied).length,
      paid: ids.filter((id) => p[id]?.paid).length,
    };
  }, [retreat]);

  return (
    <div>
      {/* 수련회 선택 / 생성 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {retreats.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedId(r.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              selectedId === r.id
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            ⛺ {r.title}
          </button>
        ))}
        <button
          onClick={() => setCreating((o) => !o)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          + 수련회 추가
        </button>
      </div>

      {creating && (
        <div className="border border-slate-200 rounded-2xl p-4 mb-4 flex gap-2 max-w-md">
          <input
            className="input"
            placeholder="예: 2026 여름수련회"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createRetreat()}
          />
          <button onClick={createRetreat} className="btn-primary flex-shrink-0">추가</button>
        </div>
      )}

      {!retreat ? (
        <div className="text-center text-slate-400 py-10 text-sm">
          아직 등록된 수련회가 없습니다. '+ 수련회 추가'로 시작하세요.
        </div>
      ) : (
        <>
          {/* 기본 정보 */}
          <div className="border border-slate-200 rounded-2xl p-4 mb-4 bg-white">
            <h4 className="font-semibold text-slate-800 text-sm mb-3">📌 {retreat.title} — 기본 정보</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="label">일정</label>
                <input className="input" placeholder="예: 2026.8.7(금)~8.9(주일)" value={info.schedule}
                  onChange={(e) => setInfo({ ...info, schedule: e.target.value })} />
              </div>
              <div>
                <label className="label">장소</label>
                <input className="input" placeholder="예: OO수양관" value={info.place}
                  onChange={(e) => setInfo({ ...info, place: e.target.value })} />
              </div>
              <div>
                <label className="label">주제</label>
                <input className="input" placeholder="예: 주님과 동행" value={info.theme}
                  onChange={(e) => setInfo({ ...info, theme: e.target.value })} />
              </div>
            </div>
            <div className="mb-3">
              <label className="label">신청서 안내 메모 (신청서 맨 위에 표시됩니다)</label>
              <textarea className="input" rows={3}
                placeholder="일정·장소·주제·준비물 등 신청자에게 안내할 내용을 자유롭게 적어주세요."
                value={info.memo} onChange={(e) => setInfo({ ...info, memo: e.target.value })} />
            </div>
            <div className="mb-3">
              <label className="label">회비 입금 정보 (신청서 제출 버튼 위에 표시됩니다)</label>
              <textarea className="input" rows={2}
                placeholder="예: 회비 50,000원 · 국민은행 000-000-000000 (송림교회) · 입금자명은 학생 이름으로"
                value={info.paymentInfo} onChange={(e) => setInfo({ ...info, paymentInfo: e.target.value })} />
            </div>
            <button onClick={saveInfo} disabled={infoSaving} className="btn-primary text-sm">
              {infoSaving ? '저장 중...' : '기본 정보 저장'}
            </button>
          </div>

          {/* 배포용 신청서 */}
          <div className="border border-slate-200 rounded-2xl p-4 mb-4 bg-white">
            <h4 className="font-semibold text-slate-800 text-sm mb-1">📝 배포용 신청서</h4>
            <p className="text-xs text-slate-400 mb-3">
              신청서를 만들면 공유용 URL이 생성됩니다. 링크를 카카오톡 등으로 보내면 로그인 없이 누구나 신청할 수 있어요.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { aud: 'student', label: '학생용 신청서' },
                { aud: 'teacher', label: '교사용 신청서' },
              ].map(({ aud, label }) => {
                const form = myForms.find((f) => f.audience === aud);
                const count = myApps.filter((a) => a.audience === aud).length;
                return (
                  <div key={aud} className="border border-slate-100 rounded-xl p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-slate-700">{label}</span>
                      {form && <span className="text-xs text-emerald-600 font-medium">응답 {count}건</span>}
                    </div>
                    {!form ? (
                      <button onClick={() => createForm(aud)} className="btn-primary text-sm w-full">
                        {label} 만들기
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <input readOnly className="input text-xs flex-1" value={formUrl(aud)}
                            onFocus={(e) => e.target.select()} />
                          <button onClick={() => copyLink(aud)}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold">
                            {copied === aud ? '✓ 복사됨' : 'URL 복사'}
                          </button>
                        </div>
                        <a href={formUrl(aud)} target="_blank" rel="noreferrer"
                          className="inline-block text-xs text-blue-600 hover:underline">신청서 미리보기 ↗</a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {myForms.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-slate-500">
                  총 신청 <b className="text-slate-800">{myApps.length}건</b> (학생 {myApps.filter((a) => a.audience === 'student').length} · 교사 {myApps.filter((a) => a.audience === 'teacher').length})
                </span>
                <Link to={`/retreat-results/${selectedId}`}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">
                  📊 신청 결과 페이지 열기
                </Link>
              </div>
            )}
          </div>

          {/* 요약 */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5">
                <span className="text-xs text-slate-400 mr-2">신청</span>
                <span className="font-bold text-slate-800">{stats.applied}명</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5">
                <span className="text-xs text-slate-400 mr-2">회비 납부</span>
                <span className="font-bold text-slate-800">{stats.paid}명</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                {['1부', '2부'].map((svc) => (
                  <button
                    key={svc}
                    onClick={() => setService(svc)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                      service === svc
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    {svc}
                  </button>
                ))}
              </div>
              <button
                onClick={() => removeRetreat(retreat)}
                className="text-xs text-slate-300 hover:text-red-500 px-2"
              >
                수련회 삭제
              </button>
            </div>
          </div>

          {/* 반별 명단 */}
          <div className="space-y-4">
            {serviceStudents.map(({ cls, students: list }) => {
              const p = retreat.participants || {};
              const appliedCount = list.filter((s) => p[s.id]?.applied).length;
              return (
                <div key={cls.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <span className="font-semibold text-slate-700 text-sm">{cls.teacherName} 선생님반</span>
                    <span className="text-xs text-slate-400">신청 {appliedCount}/{list.length}명</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {list.map((s) => {
                      const st = p[s.id] || {};
                      return (
                        <div key={s.id} className="flex items-center justify-between px-4 py-2 gap-2">
                          <span className="text-sm text-slate-700 min-w-0 truncate">
                            {s.name}
                            {s.grade && <span className="text-xs text-slate-400 ml-1.5">{s.grade}</span>}
                          </span>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <ToggleChip
                              on={!!st.applied}
                              label="신청"
                              onClick={() => toggle(s.id, 'applied')}
                            />
                            <ToggleChip
                              on={!!st.paid}
                              label="회비"
                              tone="emerald"
                              onClick={() => toggle(s.id, 'paid')}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {list.length === 0 && (
                      <div className="px-4 py-3 text-xs text-slate-400">학생이 없습니다.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ToggleChip({ on, label, onClick, tone = 'blue' }) {
  const onCls = tone === 'emerald'
    ? 'bg-emerald-500 text-white border-emerald-500'
    : 'bg-blue-500 text-white border-blue-500';
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
        on ? onCls : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
      }`}
    >
      {on ? '✓ ' : ''}{label}
    </button>
  );
}
