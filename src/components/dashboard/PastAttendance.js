import React, { useState, useMemo } from 'react';
import { isExcludedDate, getExcludedReason } from '../../utils/excludedDates';
import { getSundaysInMonth } from '../../utils/dateUtils';
import { getEffectiveJoinDate } from '../../utils/redFlag';

export default function PastAttendance({ attendanceList, students, classes }) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [year, setYear] = useState(today.getFullYear());
  const [openDate, setOpenDate] = useState(null);

  // 월별 일요일 모음 (1월~12월, 각 칼럼)
  const monthsCols = [];
  let maxRows = 0;
  for (let m = 1; m <= 12; m++) {
    const sundays = getSundaysInMonth(year, m);
    monthsCols.push({ month: m, sundays });
    if (sundays.length > maxRows) maxRows = sundays.length;
  }

  // 학생별 등록일(joinDate 또는 첫 출석일) 사전 계산
  const studentJoinMap = useMemo(() => {
    const m = {};
    (students || []).forEach((s) => {
      m[s.id] = getEffectiveJoinDate(s, attendanceList);
    });
    return m;
  }, [students, attendanceList]);

  const getAttendanceForDate = (date) => attendanceList.filter((a) => a.date === date);
  const getStatusForDate = (date) => {
    const recs = getAttendanceForDate(date);
    // 분자: 그날 출석 체크된 학생 중 present
    let present = 0;
    recs.forEach((r) => {
      r.records?.forEach((rr) => { if (rr.present) present++; });
    });
    // 분모: 그 날짜 기준 등록된(joinDate ≤ date) 학생 총수 (현재 재적 명단 기준)
    let total = 0;
    (students || []).forEach((s) => {
      const jd = studentJoinMap[s.id];
      if (!jd || jd <= date) total++;
    });
    return { submitted: recs.length > 0, present, total };
  };

  return (
    <div className="space-y-4">
      <div className="card bg-blue-50 border-blue-200 text-sm text-blue-700">
        💡 일요일만 표시되는 달력입니다. 날짜를 누르면 그 날의 출석 명단이 보여요.
      </div>

      {/* 연도 선택 */}
      <div className="card flex items-center justify-between">
        <button onClick={() => setYear(year - 1)} className="px-3 py-1 rounded-lg hover:bg-gray-100 text-gray-600">◀</button>
        <div className="font-bold text-gray-800">{year}년</div>
        <button onClick={() => setYear(year + 1)} className="px-3 py-1 rounded-lg hover:bg-gray-100 text-gray-600">▶</button>
      </div>

      {/* 월별 가로행 — 모바일 친화 */}
      <div className="card">
        <div className="space-y-1.5">
          {monthsCols.map(({ month, sundays }) => (
            <div key={`row-${month}`} className="flex items-stretch gap-1.5">
              {/* 월 라벨 */}
              <div className="w-10 flex-shrink-0 flex items-center justify-center text-sm font-bold text-gray-700">
                {month}월
              </div>
              {/* 해당 월 일요일들 */}
              <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${maxRows}, minmax(0, 1fr))` }}>
                {Array.from({ length: maxRows }).map((_, idx) => {
                  const date = sundays[idx];
                  if (!date) return <div key={idx}></div>;

                  const day = parseInt(date.split('-')[2], 10);
                  const isFuture = date > todayStr;
                  const excluded = isExcludedDate(date);
                  const isToday = date === todayStr;
                  const selected = openDate === date;
                  const { submitted, present, total } = !excluded && !isFuture
                    ? getStatusForDate(date) : { submitted: false, present: 0, total: 0 };
                  const clickable = !isFuture && !excluded;

                  return (
                    <button
                      key={idx}
                      onClick={() => clickable && setOpenDate(selected ? null : date)}
                      disabled={!clickable}
                      className={`h-10 rounded-lg border text-[11px] flex flex-col items-center justify-center transition-all ${
                        selected
                          ? 'bg-blue-500 text-white border-blue-600 shadow-md'
                          : excluded
                          ? 'bg-gray-50 border-gray-100 text-gray-300 line-through cursor-not-allowed'
                          : isFuture
                          ? 'bg-white border-gray-100 text-gray-300 cursor-not-allowed'
                          : submitted
                          ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100 cursor-pointer'
                          : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 cursor-pointer'
                      } ${isToday && !selected ? 'ring-2 ring-blue-400' : ''}`}
                    >
                      <span className="font-semibold leading-tight">{day}일</span>
                      {clickable && submitted && (
                        <span className="text-[10px] leading-tight">{present}/{total}</span>
                      )}
                      {excluded && (
                        <span className="text-[9px] leading-tight text-gray-500 mt-0.5 no-underline" style={{ textDecoration: 'none' }}>
                          ({getExcludedReason(date)})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 범례 */}
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-50 border border-green-300"></div>
            <span>입력완료</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-50 border border-red-200"></div>
            <span>미입력</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-gray-50 border border-gray-100"></div>
            <span>제외일</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-500 border border-blue-600"></div>
            <span>선택됨</span>
          </div>
        </div>
      </div>

      {/* 선택한 날짜 상세 */}
      {openDate && (() => {
        const recs = getAttendanceForDate(openDate);
        return (
          <div className="card">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">📅 {openDate} 출석 상세</h3>
              <button onClick={() => setOpenDate(null)} className="text-xs text-gray-400 hover:text-gray-600">
                닫기 ✕
              </button>
            </div>
            {recs.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">출석 기록이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {recs.map((rec, i) => {
                  const cls = classes.find((c) => c.id === rec.classId);
                  const presentList = (rec.records || []).filter((r) => r.present);
                  const absentList = (rec.records || []).filter((r) => !r.present);
                  return (
                    <div key={i}>
                      <div className="font-medium text-sm text-gray-700 mb-1">
                        {cls?.teacherName || rec.teacherName} 선생님반 ({rec.service})
                        <span className="text-xs text-gray-400 ml-2">
                          출석 {presentList.length} / 결석 {absentList.length}
                        </span>
                      </div>
                      {presentList.length > 0 && (
                        <div className="bg-green-50 border border-green-100 rounded-lg p-2 mb-1">
                          <div className="text-xs font-medium text-green-700 mb-1">✅ 출석</div>
                          <div className="text-sm text-gray-700">
                            {presentList.map((r) => r.studentName).join(', ')}
                          </div>
                        </div>
                      )}
                      {absentList.length > 0 && (
                        <div className="bg-red-50 border border-red-100 rounded-lg p-2">
                          <div className="text-xs font-medium text-red-700 mb-1">❌ 결석</div>
                          <div className="text-sm text-gray-600">
                            {absentList.map((r) => r.studentName).join(', ')}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
