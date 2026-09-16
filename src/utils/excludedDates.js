// 출석 계산에서 제외할 날짜 목록
// (수련회, 명절, 공휴일 등 교회 행사로 인해 출석 체크를 하지 않는 날)
export const EXCLUDED_DATES_INFO = {
  '2026-01-25': '겨울수련회',
  '2026-02-15': '설연휴',
  '2026-07-26': '여름수련회',
  '2026-08-16': '교사방학',
  '2026-09-27': '추석',
};

export const EXCLUDED_DATES = Object.keys(EXCLUDED_DATES_INFO);

// 특정 날짜가 제외 날짜인지 확인
export function isExcludedDate(dateStr) {
  return EXCLUDED_DATES.includes(dateStr);
}

// 제외 날짜의 사유 반환
export function getExcludedReason(dateStr) {
  return EXCLUDED_DATES_INFO[dateStr] || '';
}

// 일요일 목록에서 제외 날짜를 걸러냄
export function filterExcludedSundays(sundays) {
  return sundays.filter((s) => !isExcludedDate(s));
}
