// 특별새벽기도회(특새) 설정
// 연도별 사용 기간을 여기에 추가하면 됩니다. (설정된 연도만 입력/조회 가능)
export const TUKSAE_PERIODS = {
  2026: {
    label: '2026 가을 특별새벽기도회',
    dates: [
      '2026-10-05', '2026-10-06', '2026-10-07',
      '2026-10-08', '2026-10-09', '2026-10-10',
    ],
  },
};

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function getTuksaePeriod(year) {
  return TUKSAE_PERIODS[year] || null;
}

export function isTuksaeYear(year) {
  return !!TUKSAE_PERIODS[year];
}

// 로컬 기준 오늘 (YYYY-MM-DD)
export function todayLocal() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

// 날짜 라벨: "10/5(월)"
export function tuksaeDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW_KO[d.getDay()]})`;
}

// 드롭다운용 연도 목록 (설정된 연도 + 2026~현재+1), 최신순
export function tuksaeYears() {
  const cur = new Date().getFullYear();
  const set = new Set(Object.keys(TUKSAE_PERIODS).map(Number));
  for (let y = 2026; y <= Math.max(cur + 1, 2026); y++) set.add(y);
  return [...set].sort((a, b) => b - a);
}

// 오늘이 기간 내인 연도 (대시보드/팝업 노출용). 기간 종료(마지막 날) 다음날부터는 null.
export function activeDashboardYear() {
  const today = todayLocal();
  for (const [y, p] of Object.entries(TUKSAE_PERIODS)) {
    const start = p.dates[0];
    const end = p.dates[p.dates.length - 1];
    if (today >= start && today <= end) return Number(y);
  }
  return null;
}

// 기본 선택 연도: 기간 내면 그 연도, 아니면 가장 최근 설정 연도
export function defaultTuksaeYear() {
  const active = activeDashboardYear();
  if (active) return active;
  const years = Object.keys(TUKSAE_PERIODS).map(Number).sort((a, b) => b - a);
  return years[0] || new Date().getFullYear();
}
