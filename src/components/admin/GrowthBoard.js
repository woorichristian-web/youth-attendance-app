import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { isRegistered } from '../../utils/statusUtils';

// 기본 카드 (반별 설정이 없을 때)
const DEFAULT_CATEGORIES = [
  { id: 'quiet_time', name: '말씀 묵상', emoji: '📖', points: 5 },
  { id: 'writing', name: '필사', emoji: '✍️', points: 5 },
  { id: 'personal_goal', name: '개인 목표 달성', emoji: '🎯', points: 5 },
];

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }) : '-');

// 카드 생성일: createdAt 필드 우선, 없으면 id의 타임스탬프(cat_...)에서 추출
function cardCreatedAt(cat) {
  if (cat.createdAt) return cat.createdAt;
  const m = /^cat_(\d{10,})$/.exec(cat.id || '');
  return m ? Number(m[1]) : null;
}

// 학생 > 실천 카드: 반별 신앙 성장 실천 카드 전체 현황
export default function GrowthBoard({ students, classes }) {
  const [categoriesByClass, setCategoriesByClass] = useState({});
  const [counts, setCounts] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState('전체');

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'class_growth_categories'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        if (Array.isArray(d.data().categories)) map[d.id] = d.data().categories;
      });
      setCategoriesByClass(map);
    });
    const u2 = onSnapshot(collection(db, 'student_growth'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data() || {}; });
      setCounts(map);
      setLoading(false);
    });
    const u3 = onSnapshot(collection(db, 'growth_logs'), (snap) => {
      setLogs(snap.docs.map((d) => d.data()));
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  const registered = useMemo(() => students.filter(isRegistered), [students]);

  // 학생별 총 스티커 개수 (전체 카드 합산)
  const totalByStudent = useMemo(() => {
    const map = {};
    registered.forEach((s) => {
      const c = counts[s.id] || {};
      map[s.id] = Object.values(c).reduce((sum, v) => sum + (Number(v) > 0 ? Number(v) : 0), 0);
    });
    return map;
  }, [registered, counts]);

  // 전체 송청 랭킹 TOP 10
  const ranking = useMemo(() => {
    return registered
      .map((s) => ({ ...s, total: totalByStudent[s.id] || 0 }))
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total || (a.name || '').localeCompare(b.name || '', 'ko'))
      .slice(0, 10);
  }, [registered, totalByStudent]);

  // 카드별 기간 (반+카드 기준 첫 지급 ~ 마지막 지급)
  const periodOf = (classId, catId) => {
    let min = null, max = null;
    logs.forEach((l) => {
      if (l.classId !== classId || l.catId !== catId || !l.ts) return;
      if (min === null || l.ts < min) min = l.ts;
      if (max === null || l.ts > max) max = l.ts;
    });
    return min ? `${fmtDate(min)} ~ ${fmtDate(max)}` : '-';
  };

  const teacherOf = (cls) => cls.teacherName || '-';

  const visibleClasses = useMemo(() => {
    return classes
      .filter((c) => service === '전체' || c.service === service)
      .sort((a, b) =>
        (a.service || '').localeCompare(b.service || '', 'ko') ||
        (a.teacherName || '').localeCompare(b.teacherName || '', 'ko'));
  }, [classes, service]);

  const classNameOf = (s) => {
    const c = classes.find((x) => x.id === s.classId);
    return c ? `${c.service} ${c.teacherName}반` : '-';
  };

  if (loading) return <div className="card text-center text-ink-muted py-6 text-sm">불러오는 중...</div>;

  return (
    <div>
      {/* 부서 필터 */}
      <div className="flex gap-1.5 mb-4">
        {['전체', '1부', '2부'].map((svc) => (
          <button
            key={svc}
            onClick={() => setService(svc)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              service === svc
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
            }`}
          >
            {svc}
          </button>
        ))}
      </div>

      {/* 전체 송청 랭킹 */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4 mb-5">
        <div className="font-bold text-stone-800 text-sm mb-3">🏆 송청 전체 실천왕 TOP 10 <span className="text-stone-400 font-normal">(가장 많이 받은 학생)</span></div>
        {ranking.length === 0 ? (
          <div className="text-sm text-stone-400 text-center py-3">아직 지급된 스티커가 없습니다.</div>
        ) : (
          <div className="space-y-1">
            {ranking.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 text-sm py-1">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-stone-300 text-white' : i === 2 ? 'bg-orange-300 text-white' : 'bg-stone-100 text-stone-500'
                }`}>
                  {i + 1}
                </span>
                <span className="font-medium text-stone-800">{s.name}</span>
                <span className="text-xs text-stone-400">{classNameOf(s)}</span>
                <span className="ml-auto font-bold text-teal-700">{s.total}개</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 반별 현황 */}
      <div className="space-y-4">
        {visibleClasses.map((cls) => {
          const cats = (categoriesByClass[cls.id]?.length > 0 ? categoriesByClass[cls.id] : DEFAULT_CATEGORIES)
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')); // 카드 종류 우선 정렬
          const members = registered
            .filter((s) => s.classId === cls.id)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
          const classTotal = members.reduce((sum, s) => sum + (totalByStudent[s.id] || 0), 0);

          return (
            <div key={cls.id} className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-stone-50 border-b border-stone-200">
                <div className="font-semibold text-stone-800 text-sm">
                  {cls.service} · {teacherOf(cls)} 선생님반
                  <span className="text-stone-400 font-normal ml-2">{members.length}명</span>
                </div>
                <div className="text-xs text-stone-500">반 전체 <b className="text-stone-800">{classTotal}</b>개</div>
              </div>

              {members.length === 0 ? (
                <div className="px-4 py-4 text-xs text-stone-400">학생이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-stone-400 border-b border-stone-100">
                        <th className="text-left font-medium px-4 py-2 whitespace-nowrap">학생</th>
                        {cats.map((cat) => (
                          <th key={cat.id} className="text-center font-medium px-2 py-2 whitespace-nowrap">
                            <div>{cat.emoji} {cat.name}</div>
                            <div className="text-[10px] font-normal text-stone-400 mt-0.5">
                              생성 {fmtDate(cardCreatedAt(cat))}
                            </div>
                            <div className="text-[10px] font-normal text-stone-400">
                              {periodOf(cls.id, cat.id)}
                            </div>
                          </th>
                        ))}
                        <th className="text-right font-medium px-4 py-2 whitespace-nowrap">총 개수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((s) => {
                        const c = counts[s.id] || {};
                        return (
                          <tr key={s.id} className="border-b border-stone-50 last:border-0">
                            <td className="px-4 py-2 text-stone-700 font-medium whitespace-nowrap">{s.name}</td>
                            {cats.map((cat) => (
                              <td key={cat.id} className="text-center px-2 py-2 text-stone-600">
                                {c[cat.id] > 0 ? c[cat.id] : <span className="text-stone-300">0</span>}
                              </td>
                            ))}
                            <td className="text-right px-4 py-2 font-bold text-teal-700">{totalByStudent[s.id] || 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {visibleClasses.length === 0 && (
          <div className="text-center text-stone-400 py-8 text-sm">해당 부서에 반이 없습니다.</div>
        )}
      </div>

      <p className="text-[11px] text-stone-400 mt-3 px-1">
        · 기간은 해당 카드로 스티커를 처음 준 날 ~ 마지막으로 준 날입니다 (기록 기능 도입 이후의 지급부터 집계).
        · 카드는 이름(가나다) 순으로 정렬됩니다.
      </p>
    </div>
  );
}
