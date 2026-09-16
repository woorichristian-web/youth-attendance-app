import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  parseISO,
  isValid,
  startOfWeek,
  addDays,
} from 'date-fns';
import { ko } from 'date-fns/locale';

// 해당 월의 모든 일요일 날짜 반환
export function getSundaysInMonth(year, month) {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start, end });
  return days.filter((day) => getDay(day) === 0).map((day) => format(day, 'yyyy-MM-dd'));
}

// 이번 달 일요일 수 반환
export function countSundaysInMonth(year, month) {
  return getSundaysInMonth(year, month).length;
}

// 날짜 포맷 (한국어)
export function formatDateKo(dateStr) {
  if (!dateStr) return '';
  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
  if (!isValid(date)) return '';
  return format(date, 'yyyy년 M월 d일 (EEEE)', { locale: ko });
}

// 이번 주 일요일 날짜 반환
export function getThisSunday() {
  const today = new Date();
  const dayOfWeek = getDay(today);
  const sunday = dayOfWeek === 0 ? today : addDays(today, -dayOfWeek);
  return format(sunday, 'yyyy-MM-dd');
}

// 오늘이 일요일인지 확인
export function isSunday(date) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return getDay(d) === 0;
}

// 날짜 문자열이 일요일인지 확인
export function isValidSunday(dateStr) {
  if (!dateStr) return false;
  const date = parseISO(dateStr);
  if (!isValid(date)) return false;
  return getDay(date) === 0;
}

// 연도와 월 목록 생성 (최근 12개월)
export function getRecentMonths(count = 12) {
  const months = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: format(d, 'yyyy년 M월'),
    });
  }
  return months;
}

// YYYY-MM-DD 포맷으로 변환
export function toDateString(date) {
  return format(date, 'yyyy-MM-dd');
}
