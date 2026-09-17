import React from 'react';
import { calcRate, getRedFlagThreshold } from '../../utils/attendanceUtils';
import { getSundaysInMonth } from '../../utils/dateUtils';
import { filterExcludedSundays } from '../../utils/excludedDates';

export default function MonthlyStats({ attendanceList, year, month, classes }) {
  const sundays = filterExcludedSundays(getSundaysInMonth(year, month));
  const totalSundays = sundays.length;
  const threshold = getRedFlagThreshold(year, month);

  // 반별 집계
  const classStats = {};

  classes.forEach((cls) => {
    classStats[cls.id] = {
      classId: cls.id,
      className: cls.name ? cls.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : '',
      classGender: cls.classGender || '',
      teacherName: cls.teacherName,
      service: cls.service,
      totalPresent: 0,
      totalPossible: 0,
      submitted: 0,
    };
  });

  attendanceList.forEach((record) => {
    if (!sundays.includes(record.date)) return;
    if (!classStats[record.classId]) return;
    record.records.forEach(({ present }) => {
      classStats[record.classId].totalPossible += 1;
      if (present) classStats[record.classId].totalPresent += 1;
    });
    classStats[record.classId].submitted += 1;
  });

  const sortByName = (a, b) => a.teacherName.localeCompare(b.teacherName, 'ko');
  const all = Object.values(classStats);
  const groups = [
    { label: '1부', items: all.filter(s => s.service === '1부').sort(sortByName) },
    { label: '2부', items: all.filter(s => s.service === '2부').sort(sortByName) },
  ].filter(g => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        이 달에 등록된 반이 없습니다.
      </div>
    );
  }

  const renderStat = (stat) => {
    const rate = calcRate(stat.totalPresent, stat.totalPossible);
    const flag = stat.totalPossible > 0 && rate < threshold;
    return (
      <div
        key={stat.classId}
        className={`p-3 rounded-xl border ${
          flag ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <div>
            <span className="font-medium text-gray-800">{stat.teacherName} 선생님</span>
            <span className="text-xs text-gray-400 ml-2">
              ({stat.className || stat.service}{stat.classGender ? ` · ${stat.classGender}` : ''})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {flag && <span className="text-lg">🚩</span>}
            <span
              className={`font-bold text-lg ${
                flag ? 'text-red-600' : rate >= 75 ? 'text-green-600' : 'text-yellow-600'
              }`}
            >
              {stat.totalPossible === 0 ? '-' : `${rate}%`}
            </span>
          </div>
        </div>
        {stat.totalPossible > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                flag ? 'bg-red-500' : rate >= 75 ? 'bg-green-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${rate}%` }}
            ></div>
          </div>
        )}
        <div className="text-xs text-gray-400 mt-1">
          {stat.totalPresent}/{stat.totalPossible}명 출석 · {stat.submitted}/{totalSundays}주 입력
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-800">반별 월 출석률</h3>
        <span className="text-xs text-gray-400">
          {totalSundays}주 기준 · 적신호 기준 {threshold}%
        </span>
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="text-sm font-semibold text-blue-700 mb-2 px-1">{group.label}</div>
            <div className="space-y-3">
              {group.items.map(renderStat)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
