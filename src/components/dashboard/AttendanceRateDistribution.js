import React, { useMemo } from 'react';
import { getSundaysInMonth } from '../../utils/dateUtils';
import { isExcludedDate } from '../../utils/excludedDates';
import { isRegistered } from '../../utils/statusUtils';
import { getEffectiveJoinDate } from '../../utils/redFlag';

// 학생별 출석률 계산 (RegistrationStats와 동일 로직)
function calcStudentRateDetail(student, attendanceList, todayStr) {
  const joinDate = getEffectiveJoinDate(student, attendanceList);
  const allIds = [student.id, ...(student.alternateIds || [])];
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;
  let allSundays = [];
  for (let y = 2026; y <= endYear; y++) {
    const mEnd = y === endYear ? endMonth : 12;
    for (let m = 1; m <= mEnd; m++) allSundays.push(...getSundaysInMonth(y, m));
  }
  allSundays = allSundays.filter((s) => s <= todayStr).filter((s) => !isExcludedDate(s));
  if (joinDate) allSundays = allSundays.filter((s) => s >= joinDate);
  if (allSundays.length === 0) return null;

  const attendedSundays = new Set();
  allSundays.forEach((sunday) => {
    for (const rec of attendanceList) {
      if (rec.date !== sunday) continue;
      const r = rec.records?.find((rr) => allIds.includes(rr.studentId));
      if (r?.present) { attendedSundays.add(sunday); break; }
    }
  });
  return {
    rate: (attendedSundays.size / allSundays.length) * 100,
    absences: allSundays.length - attendedSundays.size,
  };
}

export default function AttendanceRateDistribution({ students = [], attendanceList = [], loading = false }) {
  const attendance = attendanceList;
  const activeStudents = useMemo(() => students.filter(isRegistered), [students]);

  const globalT = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yr = now.getFullYear();
    const endM = now.getMonth() + 1;
    let sundays = [];
    for (let m = 1; m <= endM; m++) sundays.push(...getSundaysInMonth(yr, m));
    return sundays.filter((s) => s <= todayStr).filter((s) => !isExcludedDate(s)).length;
  }, []);

  const lower1Raw = globalT > 0 ? ((globalT - 2) / globalT) * 100 : 90;
  const upper1Raw = globalT > 0 ? ((globalT - 1) / globalT) * 100 : 95;
  const lower1 = Math.round(lower1Raw * 100) / 100;
  const upper1 = Math.round(upper1Raw * 100) / 100;
  const lower2Raw = globalT > 0 ? ((globalT - 5) / globalT) * 100 : 75;
  const upper2Raw = globalT > 0 ? ((globalT - 3) / globalT) * 100 : 85;
  const lower2 = Math.round(lower2Raw * 100) / 100;
  const upper2 = Math.round(upper2Raw * 100) / 100;
  const upperHigh = Math.max(51, Math.floor(lower2Raw) - 1);

  const { distribution, bucketStudents } = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const b = { perfect: 0, fewAbsences: 0, midAbsences: 0, high: 0, mid: 0, low: 0, zero: 0, noData: 0 };
    const lists = { perfect: [], fewAbsences: [], midAbsences: [], high: [], mid: [], low: [], zero: [], noData: [] };
    activeStudents.forEach((s) => {
      const r = calcStudentRateDetail(s, attendance, todayStr);
      if (r === null) { b.noData++; lists.noData.push({ ...s, rate: null }); return; }
      const rate = r.rate;
      const rounded = Math.round(rate * 10) / 10;
      const entry = { ...s, rate: rounded, absences: r.absences };
      const EPS = 0.0001;
      if (rate >= 100 - EPS) { b.perfect++; lists.perfect.push(entry); }
      else if (rate >= lower1Raw - EPS && rate <= upper1Raw + EPS) { b.fewAbsences++; lists.fewAbsences.push(entry); }
      else if (rate >= lower2Raw - EPS && rate <= upper2Raw + EPS) { b.midAbsences++; lists.midAbsences.push(entry); }
      else if (rate >= 51) { b.high++; lists.high.push(entry); }
      else if (rate >= 21) { b.mid++; lists.mid.push(entry); }
      else if (rate >= 1) { b.low++; lists.low.push(entry); }
      else { b.zero++; lists.zero.push(entry); }
    });
    Object.keys(lists).forEach((k) => {
      lists[k].sort((a, b) => {
        if ((b.rate ?? -1) !== (a.rate ?? -1)) return (b.rate ?? -1) - (a.rate ?? -1);
        return (a.name || '').localeCompare(b.name || '', 'ko');
      });
    });
    return { distribution: b, bucketStudents: lists };
  }, [activeStudents, attendance, lower1Raw, upper1Raw, lower2Raw, upper2Raw]);

  const total = distribution.perfect + distribution.fewAbsences + distribution.midAbsences + distribution.high + distribution.mid + distribution.low + distribution.zero;
  const fewAbsLabel = `${lower1}%~${upper1}% (1~2회 결석자들)`;
  const midAbsLabel = `${lower2}%~${upper2}% (3~5회 결석자들)`;
  const highLabel = `51%~${upperHigh}%`;
  const pieSlices = total === 0 ? [] : [
    { key: 'perfect',     label: '100% 출석', value: distribution.perfect,     color: '#059669' },
    { key: 'fewAbsences', label: fewAbsLabel, value: distribution.fewAbsences, color: '#84cc16' },
    { key: 'midAbsences', label: midAbsLabel, value: distribution.midAbsences, color: '#22d3ee' },
    { key: 'high',        label: highLabel,   value: distribution.high,        color: '#34d399' },
    { key: 'mid',         label: '21%~50%',   value: distribution.mid,         color: '#f59e0b' },
    { key: 'low',         label: '1%~20%',    value: distribution.low,         color: '#ea580c' },
    { key: 'zero',        label: '0%',        value: distribution.zero,        color: '#dc2626' },
  ].filter((s) => s.value > 0);

  const cx = 100, cy = 100, r = 90;
  let cumAngle = -Math.PI / 2;
  const piePaths = pieSlices.map((s) => {
    const angle = (s.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = cx + r * Math.cos(cumAngle);
    const y2 = cy + r * Math.sin(cumAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...s, path, percent: Math.round((s.value / total) * 100) };
  });

  if (loading) {
    return <div className="card text-center text-ink-muted py-6 text-sm">불러오는 중...</div>;
  }

  return (
    <div className="card">
      <div className="flex items-end justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-bold text-ink">🥧 출석률 분포</h3>
        <span className="text-xs text-ink-muted">
          2026년 1월~현재 · 1부+2부 통합 (T={globalT})
        </span>
      </div>
      {pieSlices.length === 0 ? (
        <div className="text-center text-ink-muted py-8">데이터가 부족합니다.</div>
      ) : (
        <div className="flex items-center gap-4 flex-wrap">
          <svg viewBox="0 0 200 200" className="w-44 h-44 flex-shrink-0">
            {piePaths.map((p, i) => (
              <path key={i} d={p.path} fill={p.color} stroke="#fff" strokeWidth="2" />
            ))}
          </svg>
          <div className="flex-1 min-w-[150px] space-y-2">
            {piePaths.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: p.color }}></div>
                  <span className="text-sm text-ink-soft">{p.label}</span>
                </div>
                <div className="text-sm font-medium text-ink">
                  {p.value}명 <span className="text-xs text-ink-muted">({p.percent}%)</span>
                </div>
              </div>
            ))}
            {distribution.noData > 0 && (
              <div className="text-xs text-ink-muted pt-2 border-t border-ocean-100 mt-2">
                · 출석 기록 없음: {distribution.noData}명
              </div>
            )}
          </div>
        </div>
      )}

      {/* 구간별 학생 명단 */}
      {pieSlices.length > 0 && (
        <div className="mt-5 pt-4 border-t border-ocean-100 space-y-3">
          {piePaths.map((p) => {
            const list = bucketStudents[p.key] || [];
            if (list.length === 0) return null;
            return (
              <div key={p.key} className="rounded-xl border border-ocean-100 bg-white/60 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: p.color }}></div>
                  <span className="text-sm font-bold" style={{ color: p.color }}>{p.label}</span>
                  <span className="text-xs text-ink-muted">{list.length}명</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((s) => (
                    <span key={s.id}
                      className="text-xs bg-white border border-ocean-100 rounded-lg px-2 py-1"
                      title={`${s.name} · ${s.rate}%`}>
                      <span className="font-medium text-ink">{s.name}</span>
                      <span className="text-ink-muted ml-1">{s.rate}%</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
