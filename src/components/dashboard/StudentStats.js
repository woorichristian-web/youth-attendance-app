import React, { useState, useMemo } from 'react';
import { calcRate } from '../../utils/attendanceUtils';
import { getSundaysInMonth, getRecentMonths } from '../../utils/dateUtils';
import { isExcludedDate } from '../../utils/excludedDates';
import { getEffectiveJoinDate } from '../../utils/redFlag';

// MM/DD 형식 변환
function fmtMD(date) {
  const [, m, d] = date.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export default function StudentStats({ attendanceList, students, classes, isAdmin = true, teacherClassId = null }) {
  const [tab, setTab] = useState(0); // 0: 월간, 1: 연간
  const [service, setService] = useState('1부');
  const [classFilter, setClassFilter] = useState('전체'); // 반 선택

  const now = new Date();
  const currentYear = now.getFullYear();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? currentYear - 1 : currentYear;
  const [year, setYear] = useState(prevYear);
  const [month, setMonth] = useState(prevMonth);

  const recentMonths = useMemo(() => getRecentMonths(24), []);
  const todayStr = now.toISOString().slice(0, 10);

  // 교사: 자기 반만 자동 필터, 관리자: 선택한 반
  const effectiveClassFilter = !isAdmin ? teacherClassId : (classFilter === '전체' ? null : classFilter);

  // 활성 학생만, classFilter가 있으면 추가 필터
  const baseStudents = useMemo(() => {
    return students.filter((s) => {
      if (effectiveClassFilter && s.classId !== effectiveClassFilter) return false;
      if (s.active === false) return false;
      return true;
    });
  }, [students, effectiveClassFilter]);

  const altIdToMainId = useMemo(() => {
    const m = {};
    baseStudents.forEach((s) => {
      [s.id, ...(s.alternateIds || [])].forEach((id) => { m[id] = s.id; });
    });
    return m;
  }, [baseStudents]);

  // 대상 일요일 (월간 vs 연간)
  const targetSundays = useMemo(() => {
    let sundays = [];
    if (tab === 0) {
      sundays = getSundaysInMonth(year, month);
    } else {
      const yr = currentYear;
      for (let m = 1; m <= now.getMonth() + 1; m++) {
        sundays.push(...getSundaysInMonth(yr, m));
      }
    }
    return sundays.filter((s) => s <= todayStr).filter((s) => !isExcludedDate(s));
  }, [tab, year, month, todayStr, currentYear, now]);

  // 학생별 출석 정보 + 결석 날짜
  const studentStats = useMemo(() => {
    // studentId → Set of attended dates
    const attended = {};
    attendanceList.forEach((rec) => {
      if (!targetSundays.includes(rec.date)) return;
      rec.records?.forEach((r) => {
        if (!r.present) return;
        const main = altIdToMainId[r.studentId];
        if (!main) return;
        if (!attended[main]) attended[main] = new Set();
        attended[main].add(rec.date);
      });
    });

    return baseStudents.map((s) => {
      const joinDate = getEffectiveJoinDate(s, attendanceList);
      const applicable = joinDate ? targetSundays.filter((d) => d >= joinDate) : targetSundays;
      const att = attended[s.id] || new Set();
      const attendedDates = applicable.filter((d) => att.has(d));
      const absentDates = applicable.filter((d) => !att.has(d));
      const possible = applicable.length;
      return {
        ...s,
        attended: attendedDates.length,
        possible,
        rate: possible > 0 ? calcRate(attendedDates.length, possible) : null,
        absentDates,
      };
    });
  }, [baseStudents, attendanceList, targetSundays, altIdToMainId]);

  // 부서 필터
  const filteredByService = studentStats.filter((s) => s.service === service);

  // 반별 그룹
  const classesInService = classes.filter((c) => c.service === service);
  const classGroups = classesInService.map((cls) => ({
    cls,
    students: filteredByService
      .filter((s) => s.classId === cls.id)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')),
  })).filter((g) => g.students.length > 0);

  // 미배정
  const unassigned = filteredByService
    .filter((s) => !classes.find((c) => c.id === s.classId))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  if (unassigned.length > 0) {
    classGroups.push({ cls: { id: '_unassigned', teacherName: '반 미정' }, students: unassigned });
  }

  // 전체 평균
  const valid = filteredByService.filter((s) => s.possible > 0);
  const avgRate = valid.length === 0 ? 0 :
    Math.round(valid.reduce((acc, s) => acc + s.rate, 0) / valid.length);

  const periodLabel = tab === 0
    ? `${year}년 ${month}월`
    : `${currentYear}년 1월~${now.getMonth() + 1}월`;

  return (
    <div className="space-y-4">
      {/* 평균 */}
      <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 flex items-center justify-between">
        <div>
          <div className="text-xs text-blue-700 font-medium mb-0.5">{service} 전체 평균 출석률</div>
          <div className="text-xs text-blue-500">{periodLabel} · 대상 {valid.length}명</div>
        </div>
        <div className="text-4xl font-bold text-blue-700">{avgRate}%</div>
      </div>

      {/* 월간/연간 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <button onClick={() => setTab(0)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 0 ? 'bg-white shadow text-blue-700' : 'text-gray-500'
          }`}>
          📅 월간
        </button>
        <button onClick={() => setTab(1)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 1 ? 'bg-white shadow text-blue-700' : 'text-gray-500'
          }`}>
          📆 연간
        </button>
      </div>

      {/* 1부/2부 토글 + 월선택 */}
      <div className="flex gap-2 items-stretch">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-1">
          {['1부', '2부'].map((s) => (
            <button key={s} onClick={() => { setService(s); setClassFilter('전체'); }}
              className={`flex-1 py-2.5 rounded-lg text-base font-semibold transition-all ${
                service === s ? 'bg-white shadow text-blue-700' : 'text-gray-500'
              }`}>
              {s}
            </button>
          ))}
        </div>
        {tab === 0 && (
          <select
            value={`${year}-${month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setYear(y); setMonth(m);
            }}
            className="input w-40 flex-shrink-0"
          >
            {recentMonths.map((rm) => (
              <option key={`${rm.year}-${rm.month}`} value={`${rm.year}-${rm.month}`}>
                {rm.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 반 선택 드롭다운 */}
      {(() => {
        if (!isAdmin) {
          // 교사: 자기 반만 표시 (선택 불가)
          const myClass = classes.find((c) => c.id === teacherClassId);
          if (!myClass) return null;
          return (
            <div className="card text-sm text-gray-600 py-2.5 px-3 flex items-center gap-2">
              <span className="text-xs text-gray-400">반</span>
              <span className="font-medium text-gray-800">{myClass.teacherName} 선생님반</span>
            </div>
          );
        }
        // 관리자: 선택한 부서의 반 드롭다운
        const classOptions = classes.filter((c) => c.service === service);
        return (
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="input w-full"
          >
            <option value="전체">전체 반 보기</option>
            {classOptions
              .sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko'))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.teacherName} 선생님반
                </option>
              ))}
          </select>
        );
      })()}

      {/* 반별 그래프 */}
      {classGroups.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">학생 데이터가 없습니다.</div>
      ) : (
        classGroups.map(({ cls, students: stuList }) => {
          const validStu = stuList.filter((s) => s.possible > 0);
          const classAvg = validStu.length === 0 ? 0 :
            Math.round(validStu.reduce((a, s) => a + s.rate, 0) / validStu.length);

          return (
            <div key={cls.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">
                  {cls.teacherName} {cls.id !== '_unassigned' && '선생님반'}
                </h3>
                <span className="text-xs text-gray-500">
                  반 평균 <span className="font-bold text-blue-700">{classAvg}%</span>
                </span>
              </div>

              {/* 세로 막대 그래프 + X축 이름 (동일 컨테이너로 정렬 보장) */}
              {(() => {
                const isVertical = stuList.length > 5;
                return (
                  <>
                    {/* 막대 영역 */}
                    <div className="relative" style={{ height: '180px' }}>
                      {/* 그리드라인 */}
                      {[0, 25, 50, 75, 100].map((y) => (
                        <div key={y}
                          className="absolute left-0 right-0 border-t border-dashed border-gray-300"
                          style={{ bottom: `${y * 1.5}px` }}
                        ></div>
                      ))}
                      <div className="absolute left-0 right-0 bottom-0 border-b border-gray-300"></div>
                      <div className="absolute inset-0 flex items-end">
                        {stuList.map((s) => {
                          const rate = s.rate;
                          const color = rate === null ? 'bg-gray-200'
                            : rate >= 75 ? 'bg-green-500'
                            : rate >= 50 ? 'bg-yellow-500'
                            : rate >= 25 ? 'bg-orange-500'
                            : 'bg-red-500';
                          return (
                            <div key={s.id} className="flex-1 flex flex-col items-center justify-end h-full"
                              title={`${s.name} ${rate ?? '-'}%`}>
                              <span className="text-[9px] text-gray-600 mb-0.5">{rate ?? '-'}</span>
                              <div
                                className={`${color} rounded-t transition-all`}
                                style={{ width: '8px', height: rate === null ? '0%' : `${Math.max(rate * 1.5, 1)}px` }}
                              ></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* X축 이름 — 막대와 동일한 flex 구조로 정확히 정렬 */}
                    <div className={`flex mt-1 ${isVertical ? 'items-start' : ''}`}>
                      {stuList.map((s) => (
                        <div key={s.id}
                          className={`flex-1 text-[10px] text-gray-600 text-center ${isVertical ? '' : 'truncate'}`}
                          title={s.name}
                          style={isVertical ? { writingMode: 'vertical-rl', textOrientation: 'upright', letterSpacing: '-1px', minHeight: '50px' } : {}}
                        >
                          {s.name}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}

              {/* 결석 날짜 리스트 (연간만) */}
              {tab === 1 && (
                <div className="mt-4 pt-3 border-t border-gray-100 space-y-1">
                  {stuList.map((s) => (
                    <div key={s.id} className="flex items-start gap-2 text-xs">
                      <span className="font-medium text-gray-700 w-16 flex-shrink-0">{s.name}</span>
                      {s.absentDates.length === 0 ? (
                        <span className="text-green-600">✓ 결석 없음</span>
                      ) : (
                        <span className="text-red-600">
                          결석: {s.absentDates.map(fmtMD).join(', ')}{' '}
                          <span className="text-blue-600 font-semibold">({s.absentDates.length}일)</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
