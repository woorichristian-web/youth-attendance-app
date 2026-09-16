import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const DEFAULT_AREAS = [
  { id: 'quiet_time', name: '말씀묵상', emoji: '📖', points: 5 },
];

// 학생 > 신앙교육: 반별 성장 스티커(말씀묵상·필사 등) 현황
export default function GrowthOverview({ classes, students }) {
  const [categoriesByClass, setCategoriesByClass] = useState({});
  const [counts, setCounts] = useState({});
  const [logs, setLogs] = useState([]);
  const [service, setService] = useState('1부');
  const [loading, setLoading] = useState(true);

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
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  const serviceClasses = useMemo(
    () => classes
      .filter((c) => c.service === service)
      .sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko')),
    [classes, service]
  );

  const recentLogs = useMemo(
    () => [...logs].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 15),
    [logs]
  );

  if (loading) {
    return <div className="text-center text-slate-400 py-8 text-sm">불러오는 중...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1.5">
          {['1부', '2부'].map((svc) => (
            <button
              key={svc}
              onClick={() => setService(svc)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                service === svc
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {svc}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400">
          선생님이 성장 메뉴에서 준 스티커가 여기에 집계됩니다.
        </div>
      </div>

      <div className="space-y-4">
        {serviceClasses.map((cls) => {
          const areas = categoriesByClass[cls.id]?.length > 0 ? categoriesByClass[cls.id] : DEFAULT_AREAS;
          const classStudents = students
            .filter((s) => s.classId === cls.id)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
          const classTotal = classStudents.reduce((sum, s) => {
            const c = counts[s.id] || {};
            return sum + areas.reduce((x, a) => x + (c[a.id] || 0), 0);
          }, 0);
          return (
            <div key={cls.id} className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="font-semibold text-slate-700 text-sm">
                  {cls.teacherName} 선생님반
                  <span className="text-slate-400 font-normal ml-2">{classStudents.length}명</span>
                </div>
                <div className="text-xs text-slate-500">스티커 합계 <b className="text-slate-700">{classTotal}</b>개</div>
              </div>
              {classStudents.length === 0 ? (
                <div className="px-4 py-4 text-xs text-slate-400">학생이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="text-left font-medium px-4 py-2">학생</th>
                        {areas.map((a) => (
                          <th key={a.id} className="text-center font-medium px-2 py-2 whitespace-nowrap">
                            {a.emoji} {a.name}
                          </th>
                        ))}
                        <th className="text-right font-medium px-4 py-2">포인트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classStudents.map((s) => {
                        const c = counts[s.id] || {};
                        const points = areas.reduce((x, a) => x + (c[a.id] || 0) * (a.points || 0), 0);
                        return (
                          <tr key={s.id} className="border-b border-slate-50 last:border-0">
                            <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap">{s.name}</td>
                            {areas.map((a) => (
                              <td key={a.id} className="text-center px-2 py-2 text-slate-600">
                                {c[a.id] || 0}
                              </td>
                            ))}
                            <td className="text-right px-4 py-2 font-semibold text-slate-700">{points}P</td>
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
        {serviceClasses.length === 0 && (
          <div className="text-center text-slate-400 py-8 text-sm">{service} 반이 없습니다.</div>
        )}
      </div>

      {recentLogs.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-bold text-slate-700 mb-2">최근 스티커 기록</h4>
          <div className="border border-slate-200 rounded-2xl divide-y divide-slate-50">
            {recentLogs.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-4 py-2 text-xs">
                <span className="text-slate-600">
                  <b className="text-slate-700">{l.studentName || l.studentId}</b>
                  {l.teacher ? ` · ${l.teacher} 선생님` : ''}
                </span>
                <span className="text-slate-400">
                  +{l.points || 0}P · {l.ts ? new Date(l.ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
