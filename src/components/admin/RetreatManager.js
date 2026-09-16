import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '../../firebase';

// 수련회: 수련회별 신청/회비 납부 현황 관리
export default function RetreatManager({ students, classes }) {
  const [retreats, setRetreats] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [service, setService] = useState('1부');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    const u = onSnapshot(collection(db, 'retreats'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRetreats(list);
      setSelectedId((cur) => (cur && list.some((r) => r.id === cur) ? cur : list[0]?.id || null));
    });
    return () => u();
  }, []);

  const retreat = retreats.find((r) => r.id === selectedId) || null;

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
    if (!window.confirm(`'${r.title}' 수련회를 삭제할까요? 신청 기록도 함께 삭제됩니다.`)) return;
    await deleteDoc(doc(db, 'retreats', r.id));
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
