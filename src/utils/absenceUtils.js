// 연속 결석 계산 유틸
// 학생이 포함된 "제출된" 출석 기록만 최신 날짜부터 훑으며
// 가장 최근 주일부터 연속으로 결석(present === false)한 횟수를 센다.
import { isRegistered } from './statusUtils';

export function calcConsecutiveAbsences(student, attendanceList) {
  const allIds = new Set([student.id, ...(student.alternateIds || [])]);
  const recs = attendanceList
    .filter((rec) =>
      rec.submitted !== false &&
      rec.records?.some((r) => allIds.has(r.studentId) && typeof r.present === 'boolean')
    )
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  let streak = 0;
  for (const rec of recs) {
    const r = rec.records.find((rr) => allIds.has(rr.studentId) && typeof rr.present === 'boolean');
    if (r && r.present === false) streak += 1;
    else break;
  }
  return streak;
}

// minStreak회 이상 연속 결석한 재적 학생 목록
// 반환: [{ id, name, grade, service, teacherName, className, streak }]
export function getConsecutiveAbsentees(students, classes, attendanceList, minStreak = 3) {
  const SVC = { '1부': 0, '2부': 1 };
  return students
    .filter(isRegistered)
    .map((s) => {
      const streak = calcConsecutiveAbsences(s, attendanceList);
      if (streak < minStreak) return null;
      const cls = classes.find((c) => c.id === s.classId);
      return {
        id: s.id,
        name: s.name,
        grade: s.grade || '',
        service: s.service || cls?.service || '',
        teacherName: cls?.teacherName || '',
        className: cls?.name || (cls?.teacherName ? `${cls.teacherName}반` : ''),
        streak,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const sa = SVC[a.service] ?? 9, sb = SVC[b.service] ?? 9;
      if (sa !== sb) return sa - sb;
      if (b.streak !== a.streak) return b.streak - a.streak;
      if (a.teacherName !== b.teacherName) return (a.teacherName || '').localeCompare(b.teacherName || '', 'ko');
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });
}
