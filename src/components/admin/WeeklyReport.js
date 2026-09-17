import React, { useState, useMemo } from 'react';
import { getThisSunday, formatDateKo, isValidSunday } from '../../utils/dateUtils';
import { isExcludedDate, getExcludedReason } from '../../utils/excludedDates';

// 주일보고: 선택한 주일의 부서·반별 출석 보고
export default function WeeklyReport({ attendanceList, classes, students }) {
  const [date, setDate] = useState(getThisSunday());

  const report = useMemo(() => {
    const dayRecords = attendanceList.filter((a) => a.date === date && a.submitted !== false);
    const byClass = {};
    dayRecords.forEach((rec) => { byClass[rec.classId] = rec; });

    const services = ['1부', '2부'].map((svc) => {
      const svcClasses = classes
        .filter((c) => c.service === svc)
        .sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko'));
      const rows = svcClasses.map((cls) => {
        const rec = byClass[cls.id];
        let present = 0, absent = 0, unchecked = 0;
        if (rec) {
          (rec.records || []).forEach((r) => {
            if (r.present === true) present++;
            else if (r.present === false) absent++;
            else unchecked++;
          });
        }
        const roster = students.filter((s) => s.classId === cls.id).length;
        return { cls, submitted: !!rec, present, absent, unchecked, roster };
      });
      const t = rows.reduce(
        (acc, r) => ({
          present: acc.present + r.present,
          absent: acc.absent + r.absent,
          unchecked: acc.unchecked + r.unchecked,
          submitted: acc.submitted + (r.submitted ? 1 : 0),
        }),
        { present: 0, absent: 0, unchecked: 0, submitted: 0 }
      );
      return { service: svc, rows, totals: t };
    });

    const grand = services.reduce(
      (acc, s) => ({
        present: acc.present + s.totals.present,
        absent: acc.absent + s.totals.absent,
        unchecked: acc.unchecked + s.totals.unchecked,
      }),
      { present: 0, absent: 0, unchecked: 0 }
    );
    const checked = grand.present + grand.absent;
    const rate = checked > 0 ? Math.round((grand.present / checked) * 100) : null;
    return { services, grand, rate };
  }, [attendanceList, classes, students, date]);

  return (
    <div>
      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div>
          <label className="label">보고 주일</label>
          <input type="date" className="input w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="text-xs text-slate-400 pb-2">{formatDateKo(date)}</div>
      </div>

      {!isValidSunday(date) && (
        <div className="text-center text-slate-400 py-8 text-sm">일요일을 선택해주세요.</div>
      )}
      {isValidSunday(date) && isExcludedDate(date) && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl text-center py-6 text-slate-500 text-sm">
          🚫 {getExcludedReason(date)} — 이 주일은 예배가 없습니다.
        </div>
      )}

      {isValidSunday(date) && !isExcludedDate(date) && (
        <>
          {/* 전체 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <SummaryCard label="전체 출석" value={`${report.grand.present}명`} tone="emerald" />
            <SummaryCard label="결석" value={`${report.grand.absent}명`} tone="rose" />
            <SummaryCard label="미체크" value={`${report.grand.unchecked}명`} tone="amber" />
            <SummaryCard label="출석률" value={report.rate == null ? '-' : `${report.rate}%`} tone="slate" />
          </div>

          {report.services.map(({ service, rows, totals }) => (
            <div key={service} className="mb-5 border border-slate-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="font-semibold text-slate-700 text-sm">{service}</div>
                <div className="text-xs text-slate-500">
                  제출 {totals.submitted}/{rows.length}반 · 출석 <b className="text-emerald-600">{totals.present}</b> · 결석 <b className="text-rose-500">{totals.absent}</b>
                  {totals.unchecked > 0 && <> · 미체크 <b className="text-amber-600">{totals.unchecked}</b></>}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-100">
                      <th className="text-left font-medium px-4 py-2">반</th>
                      <th className="text-center font-medium px-2 py-2">재적</th>
                      <th className="text-center font-medium px-2 py-2">출석</th>
                      <th className="text-center font-medium px-2 py-2">결석</th>
                      <th className="text-center font-medium px-2 py-2">미체크</th>
                      <th className="text-right font-medium px-4 py-2">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.cls.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap">
                          {r.cls.teacherName} 선생님반
                        </td>
                        <td className="text-center px-2 py-2 text-slate-500">{r.roster}</td>
                        <td className="text-center px-2 py-2 text-emerald-600 font-semibold">{r.submitted ? r.present : '-'}</td>
                        <td className="text-center px-2 py-2 text-rose-500">{r.submitted ? r.absent : '-'}</td>
                        <td className="text-center px-2 py-2 text-amber-600">{r.submitted ? r.unchecked : '-'}</td>
                        <td className="text-right px-4 py-2">
                          {r.submitted ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">제출</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">미제출</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }) {
  const tones = {
    emerald: 'text-emerald-600',
    rose: 'text-rose-500',
    amber: 'text-amber-600',
    slate: 'text-slate-800',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className={`text-xl font-bold mt-0.5 tracking-tight ${tones[tone] || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
