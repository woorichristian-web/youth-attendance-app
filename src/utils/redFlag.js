// 적신호 학생 판별 유틸 — 대시보드 / 엑셀 다운로드 공통
import { getSundaysInMonth } from './dateUtils';
import { isExcludedDate } from './excludedDates';

// 적신호 임계값: 월평균 출석율 이 값 미만 → 적신호
export const RED_FLAG_THRESHOLD = 20;

// 비교 헬퍼: 적신호인지 판별 (rate < threshold)
export function isRedFlagRate(rate) {
  if (rate === null || rate === undefined) return false;
  return rate < RED_FLAG_THRESHOLD;
}

// 주어진 일요일 목록에 대해 학생의 출석률 계산 (등록일 이후만, alternateIds 중복 제거)
// 모든 화면에서 동일한 계산 결과를 보장하기 위한 공통 함수
export function calcRateForSundays(student, attendanceList, sundays) {
  const joinDate = getEffectiveJoinDate(student, attendanceList);
  const allIds = [student.id, ...(student.alternateIds || [])];

  let applicable = sundays || [];
  if (joinDate) applicable = applicable.filter((s) => s >= joinDate);
  if (applicable.length === 0) {
    return { attended: 0, possible: 0, rate: null, attendedSet: new Set() };
  }

  // 같은 일요일에 여러 attendance doc(alternateIds)에 출석되어도 1번만 카운트
  const attendedSet = new Set();
  applicable.forEach((sunday) => {
    for (const rec of attendanceList) {
      if (rec.date !== sunday) continue;
      const r = rec.records?.find((rr) => allIds.includes(rr.studentId));
      if (r?.present) { attendedSet.add(sunday); break; }
    }
  });

  return {
    attended: attendedSet.size,
    possible: applicable.length,
    rate: Math.round((attendedSet.size / applicable.length) * 1000) / 10,
    attendedSet,
  };
}

// 학생의 실효 등록일: joinDate 우선, 없으면 첫 출석 기록 날짜
export function getEffectiveJoinDate(student, attendanceList) {
  if (student.joinDate) return student.joinDate;
  const allIds = [student.id, ...(student.alternateIds || [])];
  let earliest = null;
  attendanceList.forEach((rec) => {
    if (!rec.date) return;
    const r = rec.records?.find((rr) => allIds.includes(rr.studentId));
    if (r && (earliest === null || rec.date < earliest)) {
      earliest = rec.date;
    }
  });
  return earliest;
}

// 학생의 월평균 출석율 계산 (등록일 ~ 현재)
// - joinDate(또는 첫 출석일) 이후만 카운트
// - alternateIds 모두 합산
// - 제외일(수련회/명절) 무시
export function calcAvgMonthlyRate(student, attendanceList) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const startYear = 2026;
  const startMonth = 1;
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;
  const joinDate = getEffectiveJoinDate(student, attendanceList);
  const allIds = [student.id, ...(student.alternateIds || [])];

  const monthRates = [];

  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 1;
    const mEnd = y === endYear ? endMonth : 12;

    for (let m = mStart; m <= mEnd; m++) {
      let sundays = getSundaysInMonth(y, m)
        .filter((s) => s <= todayStr)
        .filter((s) => !isExcludedDate(s));

      if (joinDate) sundays = sundays.filter((s) => s >= joinDate);
      if (sundays.length === 0) continue;

      // 같은 일요일에 여러 attendance doc(alternateIds)에 중복 출석되어도 1번만 카운트
      const attendedSet = new Set();
      sundays.forEach((sunday) => {
        for (const rec of attendanceList) {
          if (rec.date !== sunday || rec.submitted === false) continue;
          const r = rec.records?.find((rr) => allIds.includes(rr.studentId));
          if (r?.present) { attendedSet.add(sunday); break; }
        }
      });

      monthRates.push((attendedSet.size / sundays.length) * 100);
    }
  }

  if (monthRates.length === 0) return null;
  const avg = monthRates.reduce((a, b) => a + b, 0) / monthRates.length;
  return Math.round(avg * 10) / 10;
}
