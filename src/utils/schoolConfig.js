// 에클레시아가 있는 학교 목록
// 에클레시아 있는 학교 이름을 정확히 입력하세요 (학생 출석학교 입력값과 일치해야 함)
export const SCHOOLS_WITH_ECCLESIA = [
  '태랑중', '이매중', '판교중', '용인홍천중', '보라중', '샛별중',
  '내정중', '서현중', '광남중', '양영중', '운중중', '수내중',
  '신백현중', '분당중', '보평중', '광교중', '용인대덕중', '성일중',
  '하탑중', '상현중', '치동중', '대지중', '송림중', '휘문중',
  '대안여중', '청림중학교',
  '성남외고', '송림고', '야탑고', '돌마고', '동탄국제고',
  '분당영덕여고', '죽전고', '운중고', '대진고', '이매고',
  '소명고', '양영디고', '분당중앙고', '동탄고',
];

// 학교명 정규화 — '판교중학교'와 '판교중', '휘문중학교'와 '휘문중'을 같은 학교로 취급
// 규칙: 공백 제거 후 끝의 '중학교/고등학교/초등학교'를 '중/고/초'로 축약, '여자중/여자고'는 '여중/여고'로
export function normalizeSchool(name) {
  if (!name) return '';
  let n = String(name).trim().replace(/\s+/g, '');
  n = n.replace(/(중|고|초)등?학교$/, '$1');
  n = n.replace(/여자(중|고)$/, '여$1');
  return n;
}

export function hasEcclesia(schoolName) {
  if (!schoolName) return false;
  const n = normalizeSchool(schoolName);
  return SCHOOLS_WITH_ECCLESIA.some((s) => normalizeSchool(s) === n);
}
