import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { getThisSunday, formatDateKo, isValidSunday } from '../../utils/dateUtils';

const CATEGORIES = [
  { id: 'sunday', name: '주일헌금' },
  { id: 'tithe', name: '십일조' },
  { id: 'thanks', name: '감사헌금' },
  { id: 'mission', name: '선교헌금' },
  { id: 'etc', name: '기타' },
];

const fmt = (n) => (Number(n) || 0).toLocaleString('ko-KR');

// 헌금: 주일·부서별 헌금 기록 및 월별 집계
export default function OfferingManager() {
  const { userProfile } = useAuth();
  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(getThisSunday());
  const [service, setService] = useState('1부');
  const [amounts, setAmounts] = useState({});
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const u = onSnapshot(collection(db, 'offerings'), (snap) => {
      setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => u();
  }, []);

  // 선택한 날짜/부서의 기존 기록 불러오기
  useEffect(() => {
    const existing = records.find((r) => r.date === date && r.service === service);
    setAmounts(existing?.amounts || {});
    setMemo(existing?.memo || '');
  }, [date, service, records]);

  const total = CATEGORIES.reduce((s, c) => s + (Number(amounts[c.id]) || 0), 0);

  async function save() {
    if (!isValidSunday(date)) { setMsg('일요일을 선택해주세요.'); return; }
    setSaving(true);
    setMsg('');
    try {
      const clean = {};
      CATEGORIES.forEach((c) => { clean[c.id] = Number(amounts[c.id]) || 0; });
      await setDoc(doc(db, 'offerings', `${date}_${service}`), {
        date,
        service,
        amounts: clean,
        total: CATEGORIES.reduce((s, c) => s + clean[c.id], 0),
        memo: memo.trim(),
        updatedBy: userProfile?.name || '',
        updatedAt: Date.now(),
      });
      setMsg('✅ 저장되었습니다.');
    } catch (e) {
      console.error('헌금 저장 오류:', e);
      setMsg('저장 중 오류가 발생했습니다.');
    }
    setSaving(false);
  }

  async function remove(rec) {
    if (!window.confirm(`${formatDateKo(rec.date)} ${rec.service} 헌금 기록을 삭제할까요?`)) return;
    await deleteDoc(doc(db, 'offerings', rec.id));
  }

  // 월별 집계
  const monthly = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      const key = (r.date || '').slice(0, 7);
      if (!key) return;
      map[key] = (map[key] || 0) + (Number(r.total) || 0);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  }, [records]);

  const recent = useMemo(
    () => [...records].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.service || '').localeCompare(b.service || '')).slice(0, 12),
    [records]
  );

  return (
    <div className="md:grid md:grid-cols-2 md:gap-6">
      {/* 입력 */}
      <div>
        <h4 className="text-sm font-bold text-slate-700 mb-3">헌금 입력</h4>
        <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">주일</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">부서</label>
              <div className="flex gap-1.5 pt-1">
                {['1부', '2부'].map((svc) => (
                  <button
                    key={svc}
                    onClick={() => setService(svc)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                      service === svc
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    {svc}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {CATEGORIES.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="text-sm text-slate-600 w-16 flex-shrink-0">{c.name}</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                className="input text-right"
                placeholder="0"
                value={amounts[c.id] ?? ''}
                onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value })}
              />
              <span className="text-xs text-slate-400 flex-shrink-0">원</span>
            </div>
          ))}

          <div>
            <label className="label">메모</label>
            <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="특이사항 (선택)" />
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">합계</span>
            <span className="text-lg font-bold text-slate-800">{fmt(total)}원</span>
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

      {/* 집계 / 최근 기록 */}
      <div className="mt-6 md:mt-0">
        <h4 className="text-sm font-bold text-slate-700 mb-3">월별 합계</h4>
        <div className="border border-slate-200 rounded-2xl divide-y divide-slate-50 mb-5">
          {monthly.length === 0 && (
            <div className="px-4 py-5 text-center text-xs text-slate-400">아직 기록이 없습니다.</div>
          )}
          {monthly.map(([month, sum]) => (
            <div key={month} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-slate-600">{month.replace('-', '년 ')}월</span>
              <span className="font-semibold text-slate-800">{fmt(sum)}원</span>
            </div>
          ))}
        </div>

        <h4 className="text-sm font-bold text-slate-700 mb-3">최근 기록</h4>
        <div className="border border-slate-200 rounded-2xl divide-y divide-slate-50">
          {recent.length === 0 && (
            <div className="px-4 py-5 text-center text-xs text-slate-400">아직 기록이 없습니다.</div>
          )}
          {recent.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm gap-2">
              <div className="min-w-0">
                <span className="text-slate-700">{(r.date || '').slice(5).replace('-', '/')} · {r.service}</span>
                {r.memo && <span className="text-xs text-slate-400 ml-2 truncate">{r.memo}</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-semibold text-slate-800">{fmt(r.total)}원</span>
                <button
                  onClick={() => remove(r)}
                  className="text-slate-300 hover:text-red-500 text-xs"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
