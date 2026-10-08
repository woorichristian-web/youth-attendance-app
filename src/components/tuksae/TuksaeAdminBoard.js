import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  getTuksaePeriod, tuksaeDateLabel, tuksaeYears, defaultTuksaeYear, isTuksaeYear,
} from '../../utils/tuksaeConfig';

// 관리자용 특새 출석부
// - 상단: 반별 × 날짜 참석 인원 요약 매트릭스 (전체 한눈에)
// - 하단: 날짜/셀 클릭 시 1부·2부 반별 참석자 이름
// props: showYearPicker(기본 true)
export default function TuksaeAdminBoard({ showYearPicker = true }) {
  const [year, setYear] = useState(defaultTuksaeYear());
  const [docs, setDocs] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sel, setSel] = useState(null); // { type:'day', date } | { type:'cell', classId, date, teacherName }

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'tuksae_attendance'), (snap) => {
      setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const u2 = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { u1(); u2(); };
  }, []);

  const period = getTuksaePeriod(year);
  const dates = period?.dates || [];
  const yearDocs = useMemo(() => docs.filter((d) => Number(d.year) === Number(year)), [docs, year]);

  // 서비스별 반 행 (counts/total)
  const svcRows = useMemo(() => {
    const rows = { '1부': [], '2부': [], '기타': [] };
    yearDocs.forEach((doc) => {
      const cls = classes.find((c) => c.id === doc.classId);
      const service = doc.service || cls?.service || '기타';
      const key = service === '1부' || service === '2부' ? service : '기타';
      const counts = {}; let total = 0;
      dates.forEach((d) => { const n = (doc.attendance?.[d] || []).length; counts[d] = n; total += n; });
      if (total === 0) return; // 참석 기록이 전혀 없는 반은 요약에서 제외
      rows[key].push({
        classId: doc.classId,
        teacherName: doc.teacherName || cls?.teacherName || '(반 미상)',
        counts, total,
      });
    });
    Object.values(rows).forEach((r) => r.sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko')));
    return rows;
  }, [yearDocs, classes, dates]);

  const dayTotal = (date, keys) => keys.reduce((n, k) => n + svcRows[k].reduce((m, r) => m + (r.counts[date] || 0), 0), 0);
  const grandTotal = (keys) => keys.reduce((n, k) => n + svcRows[k].reduce((m, r) => m + r.total, 0), 0);

  // 상세(이름)
  const detail = useMemo(() => {
    if (!sel) return null;
    if (sel.type === 'cell') {
      const doc = yearDocs.find((d) => d.classId === sel.classId);
      const names = (doc?.attendance?.[sel.date] || []).map((p) => p.studentName);
      return { title: `${tuksaeDateLabel(sel.date)} · ${sel.teacherName} 선생님반`, single: names };
    }
    // day
    const svc = { '1부': [], '2부': [], 기타: [] };
    yearDocs.forEach((doc) => {
      const present = doc.attendance?.[sel.date] || [];
      if (present.length === 0) return;
      const cls = classes.find((c) => c.id === doc.classId);
      const service = doc.service || cls?.service || '기타';
      const teacherName = doc.teacherName || cls?.teacherName || '(반 미상)';
      const key = service === '1부' || service === '2부' ? service : '기타';
      svc[key].push({ teacherName, names: present.map((p) => p.studentName) });
    });
    ['1부', '2부', '기타'].forEach((k) => svc[k].sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko')));
    return { title: `${tuksaeDateLabel(sel.date)} 참석자`, byService: svc };
  }, [sel, yearDocs, classes]);

  const SERVICES = ['1부', '2부', '기타'].filter((k) => svcRows[k].length > 0);

  // 요약 매트릭스 (한 서비스 블록)
  const MatrixBlock = ({ label, rows }) => (
    <div className="mb-3">
      <div className="text-xs font-semibold text-stone-600 mb-1">{label}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-stone-50">
              <th className="text-left py-1.5 px-2 font-medium text-stone-600 border border-stone-100 whitespace-nowrap">반(담임)</th>
              {dates.map((d) => (
                <th key={d} className="py-1.5 px-1 text-center text-[11px] font-medium text-stone-600 border border-stone-100 whitespace-nowrap">
                  {tuksaeDateLabel(d)}
                </th>
              ))}
              <th className="py-1.5 px-1 text-center text-[11px] font-medium text-stone-600 border border-stone-100">합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.classId}>
                <td className="py-1.5 px-2 text-stone-800 border border-stone-100 whitespace-nowrap">{r.teacherName}</td>
                {dates.map((d) => (
                  <td key={d} className="py-1 px-1 text-center border border-stone-100">
                    {r.counts[d] > 0 ? (
                      <button
                        onClick={() => setSel({ type: 'cell', classId: r.classId, date: d, teacherName: r.teacherName })}
                        className="min-w-[24px] px-1 rounded text-teal-700 font-semibold hover:bg-teal-50"
                        title="명단 보기"
                      >
                        {r.counts[d]}
                      </button>
                    ) : (
                      <span className="text-stone-300">·</span>
                    )}
                  </td>
                ))}
                <td className="py-1.5 px-1 text-center font-bold text-teal-700 border border-stone-100">{r.total}</td>
              </tr>
            ))}
            {/* 소계 */}
            <tr className="bg-stone-50/60">
              <td className="py-1.5 px-2 text-stone-500 text-xs font-medium border border-stone-100">소계</td>
              {dates.map((d) => (
                <td key={d} className="py-1.5 px-1 text-center text-xs font-semibold text-stone-600 border border-stone-100">
                  {dayTotal(d, [label])}
                </td>
              ))}
              <td className="py-1.5 px-1 text-center text-xs font-bold text-stone-700 border border-stone-100">{grandTotal([label])}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-stone-900">🌅 특새 출석부</span>
          {period && <span className="text-[11px] text-teal-700">{period.label}</span>}
        </div>
        {showYearPicker && (
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setSel(null); }}
            className="border border-stone-300 rounded-lg px-2 py-1 text-sm"
          >
            {tuksaeYears().map((y) => (<option key={y} value={y}>{y}년</option>))}
          </select>
        )}
      </div>

      {!isTuksaeYear(year) ? (
        <div className="text-center py-6 text-sm text-stone-400">{year}년은 특새 사용 기간이 아닙니다.</div>
      ) : SERVICES.length === 0 ? (
        <div className="text-center py-6 text-sm text-stone-400">아직 입력된 특새 출석이 없습니다.</div>
      ) : (
        <>
          {/* 요약 매트릭스 */}
          {SERVICES.map((k) => <MatrixBlock key={k} label={k} rows={svcRows[k]} />)}

          {/* 전체 합계 */}
          <div className="flex items-center justify-between text-sm border-t border-stone-100 pt-2 mb-3">
            <span className="text-stone-500 text-xs">전체 연인원(참석 체크 총합)</span>
            <span className="font-bold text-teal-700">{grandTotal(SERVICES)}명</span>
          </div>

          {/* 날짜별 전체 명단 보기 */}
          <div className="border-t border-stone-100 pt-3">
            <div className="text-[11px] text-stone-500 mb-1.5">날짜를 누르면 그날 전체 참석자(1부·2부)가 보입니다. 표의 숫자를 누르면 그 반 명단만 보여요.</div>
            <div className="flex flex-wrap gap-1.5">
              {dates.map((d) => (
                <button
                  key={d}
                  onClick={() => setSel(sel?.type === 'day' && sel.date === d ? null : { type: 'day', date: d })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    sel?.type === 'day' && sel.date === d
                      ? 'bg-teal-600 text-white border-teal-700 shadow-sm'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-teal-50'
                  }`}
                >
                  {tuksaeDateLabel(d)}
                  <span className={`ml-1 text-[10px] ${sel?.type === 'day' && sel.date === d ? 'text-teal-100' : 'text-teal-600'}`}>
                    {dayTotal(d, SERVICES)}명
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 상세 */}
          {detail && (
            <div className="mt-3 border-t border-stone-100 pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-sm font-semibold text-stone-800">{detail.title}</div>
                <button onClick={() => setSel(null)} className="text-xs text-stone-400 hover:text-stone-600">닫기 ✕</button>
              </div>
              {detail.single ? (
                detail.single.length === 0
                  ? <p className="text-[11px] text-stone-400">참석 기록 없음</p>
                  : <p className="text-sm text-stone-800">{detail.single.join(', ')}</p>
              ) : (
                <div className="space-y-2">
                  {['1부', '2부', '기타'].map((k) => {
                    const groups = detail.byService[k];
                    if (!groups || groups.length === 0) return null;
                    return (
                      <div key={k}>
                        <div className="text-xs font-semibold text-stone-600 mb-1">
                          {k} · {groups.reduce((n, g) => n + g.names.length, 0)}명
                        </div>
                        <div className="space-y-1.5 mb-1">
                          {groups.map((g) => (
                            <div key={g.teacherName} className="flex items-start gap-2 text-xs">
                              <span className="flex-shrink-0 bg-stone-100 text-stone-600 rounded-md px-2 py-0.5 font-medium">{g.teacherName}</span>
                              <span className="pt-0.5 text-stone-800">{g.names.join(', ')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
