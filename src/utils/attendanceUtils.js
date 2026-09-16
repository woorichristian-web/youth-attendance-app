import { countSundaysInMonth, getSundaysInMonth } from './dateUtils';
import { filterExcludedSundays, isExcludedDate } from './excludedDates';

// 제외 날짜(수련회·명절·교사방학 등)를 뺀 월별 일요일 수
function effectiveSundayCount(year, month) {
  return filterExcludedSundays(getSundaysInMonth(year, month)).length;
}

// 출석률 계산
export function calcRate(attended, total) {
  if (total === 0) return 0;
  return Math.round((attended / total) * 100);
}

// 적신호 임계값 계산 (교사방학·수련회 등 제외 날짜 뺀 유효 일요일 기준)
export function getRedFlagThreshold(year, month) {
  const sundays = effectiveSundayCount(year, month);
  if (sundays <= 4) return 25;
  return 20;
}

// 해당 월 기준 적신호 여부 판단
export function isRedFlag(attendedCount, year, month) {
  const sundays = effectiveSundayCount(year, month);
  const threshold = getRedFlagThreshold(year, month);
  const rate = calcRate(attendedCount, sundays);
  return rate < threshold;
}

// 출석 레코드에서 학생별 출석 집계
// attendanceList: [{date, records: [{studentId, studentName, present}]}]
export function aggregateStudentAttendance(attendanceList, year, month) {
  const sundays = filterExcludedSundays(getSundaysInMonth(year, month));
  const studentMap = {};

  attendanceList.forEach((record) => {
    if (!sundays.includes(record.date)) return;
    record.records.forEach(({ studentId, studentName, present }) => {
      if (!studentMap[studentId]) {
        studentMap[studentId] = {
          studentId,
          studentName,
          attended: 0,
          total: sundays.length,
        };
      }
      if (present) studentMap[studentId].attended += 1;
    });
  });

  return Object.values(studentMap).map((s) => ({
    ...s,
    rate: calcRate(s.attended, s.total),
    redFlag: isRedFlag(s.attended, year, month),
  }));
}

// 반별 출석 집계
export function aggregateClassAttendance(attendanceList, year, month) {
  const sundays = filterExcludedSundays(getSundaysInMonth(year, month));
  const classMap = {};

  attendanceList.forEach((record) => {
    if (!sundays.includes(record.date)) return;
    const { classId, teacherName } = record;
    if (!classMap[classId]) {
      classMap[classId] = {
        classId,
        teacherName: teacherName || '',
        totalPresent: 0,
        totalPossible: 0,
        weeks: {},
      };
    }
    record.records.forEach(({ present }) => {
      classMap[classId].totalPossible += 1;
      if (present) classMap[classId].totalPresent += 1;
    });
  });

  return Object.values(classMap).map((c) => ({
    ...c,
    rate: calcRate(c.totalPresent, c.totalPossible),
  }));
}

// 연간 출석 집계 (학생별) — 제외 날짜(수련회·교사방학 등) 스킵
export function aggregateAnnualStudentAttendance(attendanceList, year) {
  const studentMap = {};

  attendanceList.forEach((record) => {
    if (!record.date.startsWith(String(year))) return;
    if (isExcludedDate(record.date)) return;
    record.records.forEach(({ studentId, studentName, present }) => {
      if (!studentMap[studentId]) {
        studentMap[studentId] = {
          studentId,
          studentName,
          attended: 0,
          total: 0,
        };
      }
      studentMap[studentId].total += 1;
      if (present) studentMap[studentId].attended += 1;
    });
  });

  return Object.values(studentMap).map((s) => ({
    ...s,
    rate: calcRate(s.attended, s.total),
  }));
}
