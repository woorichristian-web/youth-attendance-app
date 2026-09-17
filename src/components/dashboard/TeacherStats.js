import React from 'react';
import { calcRate } from '../../utils/attendanceUtils';
import { getSundaysInMonth } from '../../utils/dateUtils';
import { isExcludedDate } from '../../utils/excludedDates';

// 1월부터 현재까지 월별 평균 출석율 계산 (월별 rate 평균)
export default function TeacherStats({ attendanceList, year, classes }) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentYear = now.getFullYear();
  const endMonth = year === currentYear ? now.getMonth() + 1 : 12;

  const classMap = {};
  classes.forEach((cls) => {
    classMap[cls.id] = {
      classId: cls.id,
      className: cls.name ? cls.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : '',
      classGender: cls.classGender || '',
      teacherName: cls.teacherName,
      service: cls.service,
      monthlyRates: [],
      totalPresent: 0,
      totalPossible: 0,
    };
  });

  for (let m = 1; m <= endMonth; m++) {
    const sundays = getSundaysInMonth(year, m)
      .filter((s) => s <= todayStr)
      .filter((s) => !isExcludedDate(s));
    if (sundays.length === 0) continue;

    Object.values(classMap).forEach((stat) => {
      let monthPresent = 0, monthTotal = 0;
      attendanceList.forEach((rec) => {
        if (rec.classId !== stat.classId) return;
        if (!sundays.includes(rec.date)) return;
        rec.records?.forEach(({ present }) => {
          monthTotal++;
          if (present) monthPresent++;
        });
      });
      if (monthTotal > 0) {
        stat.monthlyRates.push((monthPresent / monthTotal) * 100);
        stat.totalPresent += monthPresent;
        stat.totalPossible += monthTotal;
      }
    });
  }

  const statsArr = Object.values(classMap)
    .filter((s) => s.monthlyRates.length > 0)
    .map((s) => ({
      ...s,
      avgRate: Math.round(
        (s.monthlyRates.reduce((a, b) => a + b, 0) / s.monthlyRates.length) * 10
      ) / 10,
    }))
    .sort((a, b) =>
      a.service.localeCompare(b.service) ||
      a.teacherName.localeCompare(b.teacherName, 'ko')
    );

  // 1부 / 2부 그룹
  const groups = [
    { label: '1부', items: statsArr.filter((s) => s.service === '1부') },
    { label: '2부', items: statsArr.filter((s) => s.service === '2부') },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-800">{year}년 반별 연간 출석률</h3>
        <span className="text-xs text-gray-400">
          1월~{endMonth}월 월평균
        </span>
      </div>

      {statsArr.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">연간 데이터가 없습니다.</div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="text-sm font-semibold text-blue-700 mb-2 px-1">{group.label}</div>
              <div className="space-y-3">
                {group.items.map((stat) => {
                  const rate = stat.avgRate;
                  return (
                    <div key={stat.classId} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="font-medium text-gray-800">{stat.teacherName} 선생님</span>
                          <span className="text-xs text-gray-400 ml-2">
                            ({stat.className || stat.service}{stat.classGender ? ` · ${stat.classGender}` : ''})
                          </span>
                        </div>
                        <span
                          className={`font-bold text-lg ${
                            rate >= 75 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                          }`}
                        >
                          {rate}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            rate >= 75 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${rate}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        월평균 {stat.monthlyRates.length}개월 · {stat.totalPresent}/{stat.totalPossible}명·회 출석
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
