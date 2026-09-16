// 학생 상태 유틸리티
// ─────────────────────────────────────────────────────
// 정책 (A방안):
// - 등록 성도 = 타교회이동 외의 모든 학생 = 재적(출석/장결자/미분류) 합계
// - 적신호 학생: 1월~현재 월평균 출석률 ≤ 25%
// - 자동 변환: 적신호로 잡힌 status='active' 학생은 long_absent로 자동 변경

// 타교회/부서이동/기타비활성 → 통합해서 "타교회이동" 그룹
export const TRANSFERRED_STATUSES = [
  'transferred_church',
  'transferred_seohyeon',
  'transferred_dept',
  'inactive',
];

// 등록 성도 여부 (재적)
export function isRegistered(student) {
  const s = student.status;
  if (!s) return true; // status 없으면 재적으로 간주
  return !TRANSFERRED_STATUSES.includes(s);
}

// 4가지 분류 카테고리
export const CATEGORY = {
  ACTIVE: '재적(출석)',
  LONG_ABSENT: '재적(장결자)',
  UNCLASSIFIED: '재적(미분류)',
  TRANSFERRED: '타교회이동',
};

export function getCategory(student) {
  const s = student.status;
  if (!s || s === 'active') return CATEGORY.ACTIVE;
  if (s === 'long_absent') return CATEGORY.LONG_ABSENT;
  if (s === 'unclassified') return CATEGORY.UNCLASSIFIED;
  return CATEGORY.TRANSFERRED;
}

// 장결자 기준 안내 문구
export const LONG_ABSENT_CRITERIA = '1월부터 현재까지 월평균 출석률 25% 이하인 학생';

// 등록 성도 카운트 기준 안내 문구
export const REGISTERED_DESCRIPTION = '등록 성도 = 재적(출석) + 재적(장결자) + 재적(미분류). 타교회 이동 학생은 제외됩니다.';
