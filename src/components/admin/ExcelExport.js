import React, { useState } from 'react';
import XLSX from 'xlsx-js-style';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { format } from 'date-fns';
import { getSundaysInMonth } from '../../utils/dateUtils';
import { calcRate } from '../../utils/attendanceUtils';
import { isRegistered } from '../../utils/statusUtils';
import { RED_FLAG_THRESHOLD, calcAvgMonthlyRate, getEffectiveJoinDate } from '../../utils/redFlag';

// 내용이 있는 셀에만 테두리 적용. 빈 셀은 테두리 없음 + 그리드라인 숨김.
const BORDER_STYLE = {
  border: {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } },
  },
};
const HEADER_STYLE = {
  ...BORDER_STYLE,
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  fill: { patternType: 'solid', fgColor: { rgb: '1D4ED8' } }, // blue-700
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};

// 셀 값의 표시 너비 계산 (한글은 2, 그 외 1 로 가중치)
function displayWidth(v) {
  const s = v == null ? '' : String(v);
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    // 한글 · 전각 문자
    if ((code >= 0xAC00 && code <= 0xD7A3) || (code >= 0x3130 && code <= 0x318F) || code >= 0xFF00) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

// 각 컬럼의 최대 텍스트 너비에 맞춰 !cols 설정.
// fixedWidths: { 헤더명: 폭 } — 자동계산 대신 고정 폭 강제.
function autoFitColumns(ws, fixedWidths = {}) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  // 헤더 텍스트 수집
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    headers.push(cell?.v ? String(cell.v) : '');
  }
  const cols = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const header = headers[c];
    if (fixedWidths[header] != null) {
      cols.push({ wch: fixedWidths[header] });
      continue;
    }
    let max = 4;
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const w = displayWidth(cell.v);
      if (w > max) max = w;
    }
    cols.push({ wch: Math.min(max + 2, 60) });
  }
  ws['!cols'] = cols;
}

function applyBorders(ws) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);

  // 실제 사용 영역 계산: 비어있지 않은 셀이 있는 최대 row/col
  let maxRow = -1, maxCol = -1;
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
        if (r > maxRow) maxRow = r;
        if (c > maxCol) maxCol = c;
      }
    }
  }
  if (maxRow < 0 || maxCol < 0) return;

  // 활성 영역 (0..maxRow × 0..maxCol) 내 모든 셀에 border. 비어있어도 셀 생성.
  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = r === 0
        ? HEADER_STYLE
        : { ...BORDER_STYLE, alignment: { vertical: 'center', wrapText: false } };
    }
  }

  // !ref도 활성 영역으로 재설정
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  // 시트 전체 그리드라인 숨김 → 활성 영역 밖은 그리드 안 보임
  ws['!sheetViews'] = [{ showGridLines: false }];
}

export default function ExcelExport({ classes, students }) {
  const [exporting, setExporting] = useState(false);

  // ── 시트 1: 연간 출석부 ──────────────────────────────────────
  async function buildAnnualAttendanceRows() {
    const now = new Date();
    const yr = now.getFullYear();
    const endMonth = now.getMonth() + 1;
    const sundays = [];
    for (let m = 1; m <= endMonth; m++) sundays.push(...getSundaysInMonth(yr, m));
    const todayStr = now.toISOString().slice(0, 10);
    const filtered = sundays.filter((s) => s <= todayStr);

    const chunks = [];
    for (let i = 0; i < filtered.length; i += 30) chunks.push(filtered.slice(i, i + 30));
    let attList = [];
    for (const chunk of chunks) {
      const snap = await getDocs(query(
        collection(db, 'attendance'),
        where('date', 'in', chunk.length > 0 ? chunk : ['9999-99-99'])
      ));
      attList.push(...snap.docs.map((d) => d.data()));
    }

    const effectiveJoinMap = {};
    students.forEach((s) => { effectiveJoinMap[s.id] = getEffectiveJoinDate(s, attList) || null; });

    const studentMap = {};
    students.forEach((s) => {
      const cls = classes.find((c) => c.id === s.classId);
      const joinDate = effectiveJoinMap[s.id];
      const cells = {};
      filtered.forEach((d) => { cells[d] = (joinDate && d < joinDate) ? '-' : '결석'; });
      const applicable = joinDate ? filtered.filter((d) => d >= joinDate) : filtered;
      studentMap[s.id] = {
        부서: s.service || '',
        반사: cls?.teacherName || '',
        이름: s.name,
        등록일: s.joinDate || (joinDate ? `(${joinDate} 첫 출석)` : ''),
        ...cells,
        출석수: 0,
        전체주: applicable.length,
        출석률: '0%',
      };
    });

    attList.forEach((record) => {
      record.records?.forEach(({ studentId, present }) => {
        const stat = studentMap[studentId];
        if (!stat) return;
        stat[record.date] = present ? '출석' : '결석';
        const joinDate = effectiveJoinMap[studentId];
        if (present && (!joinDate || record.date >= joinDate)) stat.출석수 += 1;
      });
    });

    Object.values(studentMap).forEach((s) => {
      s.출석률 = `${calcRate(s.출석수, s.전체주)}%`;
    });

    // 반사 미배정 학생은 맨 하단으로. 1부 → 2부 → (기타) → 반사 미정
    const SVC_ORDER = { '1부': 0, '2부': 1 };
    return Object.values(studentMap).sort((a, b) => {
      const aTeacher = (a.반사 || '').trim();
      const bTeacher = (b.반사 || '').trim();
      // 반사 없음 → 뒤로
      if (!aTeacher && bTeacher) return 1;
      if (aTeacher && !bTeacher) return -1;
      // 예배 순
      const sa = SVC_ORDER[a.부서] ?? 9;
      const sb = SVC_ORDER[b.부서] ?? 9;
      if (sa !== sb) return sa - sb;
      // 반사, 이름 순
      if (aTeacher !== bTeacher) return aTeacher.localeCompare(bTeacher, 'ko');
      return (a.이름 || '').localeCompare(b.이름 || '', 'ko');
    });
  }

  // ── 시트 2: 장결자 (적신호 학생) ───────────────────────────────
  async function buildRedFlagRows() {
    const attSnap = await getDocs(collection(db, 'attendance'));
    const attList = attSnap.docs.map((d) => d.data());
    return students
      .filter(isRegistered)
      .map((s) => {
        const avg = calcAvgMonthlyRate(s, attList);
        if (avg === null) return null;
        const cls = classes.find((c) => c.id === s.classId);
        return {
          부서: s.service || '',
          이름: s.name,
          반사: cls?.teacherName || '',
          학년: s.grade || '',
          성별: s.gender || '',
          학생연락처: s.phone || '',
          보호자연락처: s.parentPhone || '',
          주소: s.address || '',
          월평균출석률: `${avg}%`,
          기준: `${RED_FLAG_THRESHOLD}% 미만`,
          _avg: avg,
        };
      })
      .filter((r) => r && r._avg < RED_FLAG_THRESHOLD)
      .sort((a, b) => {
        const at = (a.반사 || '').trim();
        const bt = (b.반사 || '').trim();
        if (!at && bt) return 1;
        if (at && !bt) return -1;
        const SVC = { '1부': 0, '2부': 1 };
        const sa = SVC[a.부서] ?? 9, sb = SVC[b.부서] ?? 9;
        if (sa !== sb) return sa - sb;
        if (at !== bt) return at.localeCompare(bt, 'ko');
        return (a.이름 || '').localeCompare(b.이름 || '', 'ko');
      })
      .map(({ _avg, ...rest }) => rest);
  }

  // ── 시트 3: 전체 학생 정보 ───────────────────────────────────
  // 반환: { rows, newRowIndices } — newRowIndices 는 상단 신규 강조 대상
  function buildStudentListRows(allAttList = []) {
    const STATUS_LABEL = {
      active: '재적',
      long_absent: '장결자',
      unclassified: '미분류',
      transferred_seohyeon: '서현이동',
      transferred_church: '타교회이동',
      transferred_dept: '부서이동',
      inactive: '기타비활성',
    };
    const currentYear = new Date().getFullYear();
    const now = new Date();
    const GRADE_ORDER = { '중1': 0, '중2': 1, '중3': 2, '고1': 3, '고2': 4, '고3': 5 };
    const SVC_ORDER = { '1부': 0, '2부': 1 };

    const rowsWithMeta = students.map((s) => {
      const cls = classes.find((c) => c.id === s.classId);
      const statusLabel = STATUS_LABEL[s.status] || (s.active === false ? '비재적' : '재적');
      const ministrySet = new Set();
      (s.ministryTeams || []).forEach((m) => {
        if (Number(m.year) !== currentYear) return;
        const depts = m.departments || (m.department ? [m.department] : []);
        depts.forEach((d) => ministrySet.add(d));
      });
      const ministryStr = [...ministrySet].join(', ');

      const nfi = s.newFriendInfo || {};
      // 신급: baptismLevel 우선, 없으면 legacy(baptismStatus/baptized)
      const baptismLevel = s.baptismLevel || nfi.baptismLevel
        || [s.baptized ? '입교' : '', s.baptismStatus || ''].filter(Boolean).join(' / ');
      // 인도자
      const evangelist = s.evangelist || nfi.evangelist || '';
      // 가족 구성원 문자열
      const familyText = (nfi.familyMembers || [])
        .map((m) => `${m.name || ''}(${m.relation || ''})${m.birthMonthDay ? ' ' + m.birthMonthDay : ''}${m.religion ? ' / ' + m.religion : ''}${m.church ? ' / ' + m.church : ''}`)
        .filter((x) => x.replace(/[\(\)\s\/]/g, ''))
        .join('; ');

      // ── 신규 등록 강조 판정 ──
      // 방문일 기준 12주 미만 → NEW
      // 12주 지났어도 월평균 출석률 < 50% → 계속 NEW
      const joinDateStr = nfi.visitDate || s.joinDate || '';
      let isNew = false;
      let weeksSince = null;
      if (joinDateStr) {
        const jd = new Date(joinDateStr);
        if (!isNaN(jd.getTime())) {
          weeksSince = Math.floor((now - jd) / (7 * 24 * 60 * 60 * 1000));
          if (weeksSince < 12) {
            isNew = true;
          } else {
            const avg = calcAvgMonthlyRate(s, allAttList);
            if (avg !== null && avg < 50) isNew = true;
          }
        }
      }

      return {
        부서: s.service || '',
        학년: s.grade || '',
        반사: cls?.teacherName || '',
        이름: s.name,
        성별: s.gender || '',
        나이: s.age != null ? s.age : '',
        생년월일: s.birthDate || '',
        학생연락처: s.phone || '',
        보호자연락처: s.parentPhone || '',
        주소: s.address || '',
        재적상태: statusLabel,
        등록유형: s.entryTypeLabel || nfi.entryTypeLabel || '',
        신급: baptismLevel,
        인도자: evangelist,
        사역: ministryStr,
        에클레시아참여여부: s.ecclesia ? 'O' : '',
        방문일: joinDateStr,
        등반일: nfi.registerDate || '',
        부: nfi.father || '',
        모: nfi.mother || '',
        가족사항: familyText,
        '1주차 심방': nfi.week1Visit || '',
        '2주차 심방': nfi.week2Visit || '',
        '교회 내 지인': nfi.churchAcquaintance || '',
        '메모(새친구팀)': nfi.newFriendTeamMemo || '',
        교역자심방: nfi.pastorVisit || '',
        등록가부: nfi.registerConfirmed || '',
        비고: nfi.additionalNote || nfi.followupNote || '',
        개인정보동의: s.privacyConsent ? 'O' : '',
        특이사항: s.notes || '',
        _isNew: isNew,
        _joinDate: joinDateStr,
      };
    });

    // 정렬: NEW 상단 (방문일 최신순) → 일반(부서·학년·반사·이름)
    rowsWithMeta.sort((a, b) => {
      if (a._isNew !== b._isNew) return a._isNew ? -1 : 1;
      if (a._isNew) {
        // NEW 그룹: 방문일 최신 우선
        if (a._joinDate !== b._joinDate) return b._joinDate.localeCompare(a._joinDate);
        return (a.이름 || '').localeCompare(b.이름 || '', 'ko');
      }
      // 일반 그룹: 부서 → 학년 → 반사 → 이름
      const sa = SVC_ORDER[a.부서] ?? 9;
      const sb = SVC_ORDER[b.부서] ?? 9;
      if (sa !== sb) return sa - sb;
      const ga = GRADE_ORDER[a.학년] ?? 9;
      const gb = GRADE_ORDER[b.학년] ?? 9;
      if (ga !== gb) return ga - gb;
      const at = (a.반사 || ''), bt = (b.반사 || '');
      if (at !== bt) return at.localeCompare(bt, 'ko');
      return (a.이름 || '').localeCompare(b.이름 || '', 'ko');
    });

    // 최종 rows + NEW 인덱스 (헤더 다음 행부터 0)
    const newRowIndices = [];
    const rows = rowsWithMeta.map((r, i) => {
      if (r._isNew) newRowIndices.push(i);
      const { _isNew, _joinDate, ...rest } = r;
      return rest;
    });

    return { rows, newRowIndices };
  }

  // ── 시트: 임원 & 사역팀 (전 연도 · 년도 컬럼 포함) ─────────
  function buildOfficerRows() {
    const ROLE_ORDER = { 회장: 0, 부회장: 1, 총무: 2, 찬양팀: 3, 예배팀: 4 };
    const SERVICE_ORDER = { '1부': 0, '2부': 1 };
    const rows = [];
    students.forEach((s) => {
      (s.ministryTeams || []).forEach((m) => {
        const year = Number(m.year);
        if (!year) return;
        const depts = m.departments || (m.department ? [m.department] : []);
        depts.forEach((role) => {
          if (ROLE_ORDER[role] === undefined) return;
          const cls = classes.find((c) => c.id === s.classId);
          rows.push({
            연도: year,
            부서: s.service || '',
            역할: role,
            이름: s.name,
            학년: s.grade || '',
            성별: s.gender || '',
            반사: cls?.teacherName || '',
            학생연락처: s.phone || '',
            보호자연락처: s.parentPhone || '',
            _roleIdx: ROLE_ORDER[role],
            _svcIdx: SERVICE_ORDER[s.service] ?? 99,
          });
        });
      });
    });
    return rows
      // 최신 연도 위, 그 안에서 부서→역할→이름
      .sort((a, b) =>
        (b.연도 - a.연도) ||
        (a._svcIdx - b._svcIdx) ||
        (a._roleIdx - b._roleIdx) ||
        (a.이름 || '').localeCompare(b.이름 || '', 'ko')
      )
      .map(({ _roleIdx, _svcIdx, ...rest }) => rest);
  }

  // ── 시트: 에클레시아 (학교별 그룹핑 테이블) ─────────────────
  // 각 학교의 학생들을 학년순 정렬, 학교 헤더 + 소계, 학교간 빈 행 구분
  function buildEcclesiaRows() {
    const STATUS_LABEL = {
      active: '재적',
      long_absent: '장결자',
      unclassified: '미분류',
      transferred_seohyeon: '서현이동',
      transferred_church: '타교회이동',
      transferred_dept: '부서이동',
      inactive: '기타비활성',
    };
    const GRADE_ORDER = ['중1', '중2', '중3', '고1', '고2', '고3'];

    // 학교별로 그룹핑
    const bySchool = {};
    students.filter((s) => s.ecclesia).forEach((s) => {
      const key = s.school || '(학교 미입력)';
      if (!bySchool[key]) bySchool[key] = [];
      bySchool[key].push(s);
    });

    // 학교 정렬: 학생 수 많은 순 → 학교명 가나다순
    const schoolNames = Object.keys(bySchool).sort((a, b) => {
      const diff = bySchool[b].length - bySchool[a].length;
      if (diff !== 0) return diff;
      return a.localeCompare(b, 'ko');
    });

    const emptyRow = {
      학교: '', 부서: '', 반사: '', 이름: '', 학년: '', 성별: '',
      학생연락처: '', 보호자연락처: '', 주소: '',
      '입교/세례': '', 재적상태: '', 새친구등록일: '',
    };

    const rows = [];
    for (const school of schoolNames) {
      const list = bySchool[school].sort((a, b) => {
        const ai = GRADE_ORDER.indexOf(a.grade);
        const bi = GRADE_ORDER.indexOf(b.grade);
        const aIdx = ai === -1 ? 99 : ai;
        const bIdx = bi === -1 ? 99 : bi;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return (a.name || '').localeCompare(b.name || '', 'ko');
      });

      // 학교 헤더 행 (학교명 + 소계)
      rows.push({
        ...emptyRow,
        학교: `▶ ${school} (${list.length}명)`,
      });

      // 학생 행
      list.forEach((s) => {
        const cls = classes.find((c) => c.id === s.classId);
        rows.push({
          학교: '',
          부서: s.service || '',
          반사: cls?.teacherName || '',
          이름: s.name,
          학년: s.grade || '',
          성별: s.gender || '',
          학생연락처: s.phone || '',
          보호자연락처: s.parentPhone || '',
          주소: s.address || '',
          '입교/세례': [s.baptized ? '입교' : '', s.baptismStatus || ''].filter(Boolean).join(' / '),
          재적상태: STATUS_LABEL[s.status] || (s.active === false ? '비재적' : '재적'),
          새친구등록일: s.joinDate || '',
        });
      });

      // 학교간 구분 빈 행
      rows.push({ ...emptyRow });
    }

    // 맨 뒤 빈 행 제거
    if (rows.length > 0 && Object.values(rows[rows.length - 1]).every((v) => !v)) {
      rows.pop();
    }
    return rows;
  }

  // ── 시트 4: 교사 정보 ────────────────────────────────────────
  async function buildTeacherListRows() {
    const snap = await getDocs(collection(db, 'users'));
    const teachers = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => u.role === 'teacher');
    const STATUS_LABEL = { active: '현교사', resigned: '사임교사', leave: '휴직교사' };
    const getDept = (t) => {
      if (t.ministryMain === '교사') return t.service || '교사(부서 미정)';
      return t.ministryMain || '미분류';
    };
    const DEPT_ORDER = ['1부', '2부', '예배팀', '찬양팀', '행정팀'];
    const rows = teachers.map((t) => ({
      부서: getDept(t),
      이름: t.name || '',
      성별: t.gender || '',
      사역연차: t.tenure || '',
      담당사역: t.ministryMain
        ? `${t.ministryMain}${t.ministrySub ? ' / ' + t.ministrySub : ''}`
        : '',
      전화번호: t.phone || '',
      이메일: t.email || '',
      주소: t.address || '',
      교사상태: STATUS_LABEL[t.teacherStatus] || '현교사',
      상태사유: t.statusReason || '',
      송청년차: (t.songchungYears || []).map((s) =>
        `${s.year}-${s.grade}${s.classGender ? `(${s.classGender})` : ''}`
      ).join(', '),
      특이사항: t.notes || '',
    }));
    return rows.sort((a, b) => {
      const ai = DEPT_ORDER.indexOf(a.부서);
      const bi = DEPT_ORDER.indexOf(b.부서);
      const aIdx = ai === -1 ? 99 : ai;
      const bIdx = bi === -1 ? 99 : bi;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return (a.이름 || '').localeCompare(b.이름 || '', 'ko');
    });
  }

  // ── 시트: 새친구 관리 시트 (새친구 관리 시트 형식) ─────────────────
  // 새로 등록된 학생이 맨 위에 오도록 방문일/등록일자 기준 내림차순 정렬
  function buildNewFamilyRows() {
    const list = students.filter((s) => s.isNewFriend || s.newFriendInfo);
    return list
      .map((s) => {
        const nfi = s.newFriendInfo || {};
        const cls = classes.find((c) => c.id === (nfi.assignedClassId || s.classId));
        const familyText = (nfi.familyMembers || [])
          .map((m) => `${m.name || ''}(${m.relation || ''})${m.birthMonthDay ? ' ' + m.birthMonthDay : ''}${m.religion ? ' / ' + m.religion : ''}${m.church ? ' / ' + m.church : ''}`)
          .filter((x) => x.replace(/[\(\)\s\/]/g, ''))
          .join('; ');
        return {
          반배정: cls?.teacherName || nfi.assignedTeacherName || '',
          날짜: nfi.visitDate || s.joinDate || '',
          부서: s.service || '',
          학년: s.grade || '',
          이름: s.name,
          사진: '',
          성별: s.gender || '',
          생년월일: s.birthDate || '',
          '연락처(본인)': s.phone || '',
          전도자: nfi.evangelist || s.evangelist || '',
          '주보호자 연락처': s.parentPhone || '',
          신급: nfi.baptismLevel || s.baptismLevel || '',
          학교: s.school || '',
          주소: s.address || '',
          '1주차': nfi.week1Visit || '',
          '2주차': nfi.week2Visit || '',
          '교회 내 지인': nfi.churchAcquaintance || '',
          '메모 by 새친구팀': nfi.newFriendTeamMemo || '',
          교역자심방: nfi.pastorVisit || '',
          등록가부: nfi.registerConfirmed || '',
          비고: nfi.additionalNote || '',
          '특이사항 및 심방내용': nfi.followupNote || '',
          가족사항: familyText,
          부: nfi.father || '',
          모: nfi.mother || '',
          등반일: nfi.registerDate || '',
          _sortDate: nfi.visitDate || s.joinDate || '',
        };
      })
      // 최신 방문일이 맨 위 (내림차순)
      .sort((a, b) => (b._sortDate || '').localeCompare(a._sortDate || ''))
      .map(({ _sortDate, ...rest }) => rest);
  }

  // ── 시트: 로그인 계정 정보 ─────────────────────────────────
  // 로그인이메일 / 비밀번호 / 아이디배정 3컬럼.
  // skygarden79 는 제외.
  async function buildAccountsRows() {
    const snap = await getDocs(collection(db, 'users'));
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => u.email && u.email !== 'skygarden79@gmail.com');

    // 이메일별 기본 비번
    // st{번호}@ 계정은 "songrim{번호}" (예: st100 → songrim100)
    // 그 외 특수 계정은 지정값
    const passwordFor = (email) => {
      if (email === 'admin@songrim.church') return 'hojin1234!';
      const m = /^st(\d+)@songrim\.church$/.exec(email);
      if (m) return 'songrim' + m[1];
      return 'songrim1234!';
    };

    // 아이디배정: 어떤 역할·선생님이 배정됐는지
    const assignmentFor = (u) => {
      if (u.name && u.name.trim()) {
        const parts = [u.name];
        if (u.service) parts.push(u.service);
        if (u.ministrySub) parts.push(u.ministrySub);
        return parts.join(' · ');
      }
      // 이름 없는 계정 (신규 미배정)
      if (u.role === 'admin') return '관리자';
      if (u.email === 'newsongrim@songrim.church') return '새친구 담당';
      if (u.email === 'praise@songrim.church') return '찬양팀 계정';
      if (u.email === 'staff@songrim.church') return '행정팀 계정';
      if (u.email === 'leader1@songrim.church') return '1부 부장 계정';
      if (u.email === 'leader2@songrim.church') return '2부 부장 계정';
      if (/^st1\d+@/.test(u.email)) return '1부 미배정';
      if (/^st2\d+@/.test(u.email)) return '2부 미배정';
      return u.service ? `${u.service} 미배정` : '미배정';
    };

    const rows = list.map((u) => ({
      로그인이메일: u.email,
      비밀번호: passwordFor(u.email),
      아이디배정: assignmentFor(u),
    }));

    // 정렬 우선순위 함수 — 어드민 → 리더 → newsongrim → 선생님(1부→2부) → 사역팀 계정
    const groupOf = (email) => {
      if (email === 'admin@songrim.church') return 0;
      if (email === 'leader1@songrim.church') return 1;
      if (email === 'leader2@songrim.church') return 2;
      if (email === 'newsongrim@songrim.church') return 3;
      if (/^st1\d+@/.test(email)) return 4;
      if (/^st2\d+@/.test(email)) return 5;
      if (email === 'praise@songrim.church') return 6;
      if (email === 'staff@songrim.church') return 7;
      return 8;
    };
    return rows.sort((a, b) => {
      const ga = groupOf(a.로그인이메일), gb = groupOf(b.로그인이메일);
      if (ga !== gb) return ga - gb;
      return a.로그인이메일.localeCompare(b.로그인이메일);
    });
  }

  // ── 전체 다운로드 (한 파일, 여러 시트) ────────────────────────
  // 실천 카드(스티커) 받은 기록 — 부서·반·학생·카드별 개수와 지급 기간
  async function buildGrowthRows() {
    const [catSnap, growthSnap, logSnap] = await Promise.all([
      getDocs(collection(db, 'class_growth_categories')),
      getDocs(collection(db, 'student_growth')),
      getDocs(collection(db, 'growth_logs')),
    ]);
    const catsByClass = {};
    catSnap.docs.forEach((d) => {
      if (Array.isArray(d.data().categories)) catsByClass[d.id] = d.data().categories;
    });
    const counts = {};
    growthSnap.docs.forEach((d) => { counts[d.id] = d.data() || {}; });
    const logs = logSnap.docs.map((d) => d.data());

    const DEFAULT_CATS = [
      { id: 'quiet_time', name: '말씀 묵상', points: 5 },
      { id: 'writing', name: '필사', points: 5 },
      { id: 'personal_goal', name: '개인 목표 달성', points: 5 },
    ];

    const rows = [];
    const sortedClasses = [...classes].sort((a, b) =>
      (a.service || '').localeCompare(b.service || '', 'ko') ||
      (a.teacherName || '').localeCompare(b.teacherName || '', 'ko'));

    sortedClasses.forEach((cls) => {
      const cats = catsByClass[cls.id]?.length ? catsByClass[cls.id] : DEFAULT_CATS;
      const members = students
        .filter((s) => s.classId === cls.id)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      members.forEach((st) => {
        const c = counts[st.id] || {};
        cats.forEach((cat) => {
          const cnt = Number(c[cat.id]) || 0;
          if (cnt === 0) return;
          const catLogs = logs.filter((l) => l.studentId === st.id && l.catId === cat.id && l.ts);
          const first = catLogs.length ? Math.min(...catLogs.map((l) => l.ts)) : null;
          const last = catLogs.length ? Math.max(...catLogs.map((l) => l.ts)) : null;
          rows.push({
            '부서': cls.service || '',
            '반사': cls.teacherName || '',
            '학생': st.name || '',
            '카드(항목)': cat.name || '',
            '스티커 개수': cnt,
            '포인트': cnt * (Number(cat.points) || 0),
            '첫 지급일': first ? format(new Date(first), 'yyyy-MM-dd') : '',
            '마지막 지급일': last ? format(new Date(last), 'yyyy-MM-dd') : '',
          });
        });
      });
    });
    return rows;
  }

  // 헌금 기록 — 연도별 → 주별 → 부서별 전체 내역
  async function buildOfferingRows() {
    const snap = await getDocs(collection(db, 'offerings'));
    const recs = snap.docs.map((d) => d.data())
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.service || '').localeCompare(b.service || ''));
    return recs.map((r) => ({
      '연도': (r.date || '').slice(0, 4),
      '주일(날짜)': r.date || '',
      '부서': r.service || '',
      '주일헌금': Number(r.amounts?.sunday) || 0,
      '십일조': Number(r.amounts?.tithe) || 0,
      '감사헌금': Number(r.amounts?.thanks) || 0,
      '선교헌금': Number(r.amounts?.mission) || 0,
      '기타': Number(r.amounts?.etc) || 0,
      '합계': Number(r.total) || 0,
      '메모': r.memo || '',
    }));
  }

  async function exportAll() {
    setExporting(true);
    try {
      // 전체 attendance 한번만 가져오기 (buildStudentListRows에서 신규 판정에 사용)
      const attSnap = await getDocs(collection(db, 'attendance'));
      const allAttList = attSnap.docs.map((d) => d.data());

      const [annualRows, redFlagRows, teacherRows, accountRows, growthRows, offeringRows] = await Promise.all([
        buildAnnualAttendanceRows(),
        buildRedFlagRows(),
        buildTeacherListRows(),
        buildAccountsRows(),
        buildGrowthRows(),
        buildOfferingRows(),
      ]);
      const { rows: studentRows, newRowIndices: studentNewRows } = buildStudentListRows(allAttList);

      const officerRows = buildOfficerRows();
      const ecclesiaRows = buildEcclesiaRows();
      const newFamilyRows = buildNewFamilyRows();

      const wb = XLSX.utils.book_new();
      const sheets = [
        { name: '연간출석부',       rows: annualRows },
        { name: '전체학생정보',      rows: studentRows },
        { name: '새친구 관리 시트',  rows: newFamilyRows },
        { name: '임원&사역팀',       rows: officerRows },
        { name: '장결자',           rows: redFlagRows },
        { name: '교사정보',         rows: teacherRows },
        { name: '로그인계정',        rows: accountRows },
        { name: '에클레시아',        rows: ecclesiaRows },
        { name: '실천카드(스티커)',  rows: growthRows },
        { name: '헌금기록',          rows: offeringRows },
      ];
      // 시트별 고정 폭 설정
      const FIXED_WIDTHS = {
        '전체학생정보': { '특이사항': 40, '메모(새친구팀)': 40, '가족사항': 40, '주소': 40 },
        '새친구 관리 시트': { '메모 by 새친구팀': 40, '가족사항': 40, '주소': 40 },
      };
      // 자동 줄바꿈(wrap text)을 켤 컬럼
      const WRAP_COLS = new Set([
        '특이사항', '메모(새친구팀)', '메모 by 새친구팀', '가족사항',
        '비고', '주소', '학교', '교회 내 지인', '교역자심방',
      ]);
      // 가운데 정렬에서 제외 (좌측 정렬 유지)
      const LEFT_ALIGN_COLS = new Set(['주소', '특이사항']);

      sheets.forEach(({ name, rows }) => {
        const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ '안내': '데이터가 없습니다.' }]);
        applyBorders(ws);
        autoFitColumns(ws, FIXED_WIDTHS[name] || {});
        // 컬럼별 정렬 · wrap 적용
        if (ws['!ref']) {
          const range = XLSX.utils.decode_range(ws['!ref']);
          const headers = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const hc = ws[XLSX.utils.encode_cell({ r: 0, c })];
            headers.push(hc?.v ? String(hc.v) : '');
          }
          for (let c = range.s.c; c <= range.e.c; c++) {
            const header = headers[c];
            const isLeft = LEFT_ALIGN_COLS.has(header);
            const isWrap = WRAP_COLS.has(header);
            for (let r = 1; r <= range.e.r; r++) {
              const ref = XLSX.utils.encode_cell({ r, c });
              if (!ws[ref]) ws[ref] = { t: 's', v: '' };
              const prev = ws[ref].s || {};
              const horizontal = isLeft ? 'left' : 'center';
              const vertical = isWrap ? 'top' : 'center';
              ws[ref].s = {
                ...prev,
                alignment: { horizontal, vertical, wrapText: isWrap },
              };
            }
          }
        }
        // 전체학생정보: 신규 등록(12주 미만 · 12주+출석률<50%) 행 강조
        if (name === '전체학생정보' && studentNewRows && studentNewRows.length > 0 && rows.length > 0) {
          const NEW_FILL = { patternType: 'solid', fgColor: { rgb: 'FFF2C5' } }; // 연한 노랑
          const range = XLSX.utils.decode_range(ws['!ref']);
          for (const idx of studentNewRows) {
            const r = idx + 1; // 헤더 다음
            for (let c = 0; c <= range.e.c; c++) {
              const ref = XLSX.utils.encode_cell({ r, c });
              if (!ws[ref]) ws[ref] = { t: 's', v: '' };
              ws[ref].s = { ...(ws[ref].s || {}), fill: NEW_FILL };
            }
          }
        }
        // 임원&사역팀: AutoFilter 적용 (년도 등 정렬/필터 편의)
        if (name === '임원&사역팀' && rows.length > 0 && ws['!ref']) {
          ws['!autofilter'] = { ref: ws['!ref'] };
        }
        // 연간출석부: 1부/2부 부서별 배경색 적용
        if (name === '연간출석부' && rows.length > 0) {
          const FILL_1BU = { patternType: 'solid', fgColor: { rgb: 'E8F1FB' } }; // 연한 파랑
          const FILL_2BU = { patternType: 'solid', fgColor: { rgb: 'FFF4E6' } }; // 연한 주황
          const FILL_ETC = { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } }; // 연회색 (반사 미정 등)
          const range = XLSX.utils.decode_range(ws['!ref']);
          for (let r = 1; r <= range.e.r; r++) {
            const svcCell = ws[XLSX.utils.encode_cell({ r, c: 0 })]; // 부서 컬럼
            const teacherCell = ws[XLSX.utils.encode_cell({ r, c: 1 })]; // 반사 컬럼
            const svc = svcCell?.v || '';
            const hasTeacher = teacherCell?.v && String(teacherCell.v).trim();
            let fill = FILL_ETC;
            if (hasTeacher) {
              if (svc === '1부') fill = FILL_1BU;
              else if (svc === '2부') fill = FILL_2BU;
            }
            for (let c = 0; c <= range.e.c; c++) {
              const ref = XLSX.utils.encode_cell({ r, c });
              if (!ws[ref]) ws[ref] = { t: 's', v: '' };
              ws[ref].s = { ...(ws[ref].s || {}), fill };
            }
          }
        }
        XLSX.utils.book_append_sheet(wb, ws, name);
      });

      XLSX.writeFile(wb, `송림청소년부_전체데이터_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    } catch (err) {
      console.error('내보내기 오류:', err);
      alert('내보내기 중 오류가 발생했습니다: ' + err.message);
    }
    setExporting(false);
  }

  const yr = new Date().getFullYear();
  const mn = new Date().getMonth() + 1;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-4">전체 다운로드</h2>

      <div className="card bg-blue-50 border-blue-200 text-sm text-blue-700 mb-4">
        📦 10개 시트가 하나의 엑셀 파일로 다운로드됩니다:
        <ul className="list-disc list-inside mt-1.5 space-y-0.5 text-blue-600">
          <li><strong>연간출석부</strong> — {yr}년 1월~{mn}월 출석 기록</li>
          <li><strong>전체학생정보</strong> — 모든 학생의 전체 정보</li>
          <li><strong>새친구 관리 시트</strong> — 새친구 등록 학생 상세 (최신순)</li>
          <li><strong>임원&사역팀</strong> — {yr}년 부서별 회장/부회장/총무/찬양팀 명단</li>
          <li><strong>장결자</strong> — 월평균 출석률 {RED_FLAG_THRESHOLD}% 미만 학생</li>
          <li><strong>교사정보</strong> — 부서별 교사 정보</li>
          <li><strong>로그인계정</strong> — 교사·관리자 이메일/기본 비밀번호</li>
          <li><strong>에클레시아</strong> — 학교별 그룹핑된 참여 학생 명단</li>
          <li><strong>실천카드(스티커)</strong> — 반·학생·카드별 스티커 개수와 지급 기간</li>
          <li><strong>헌금기록</strong> — 연도별·주별·부서별 헌금 내역</li>
        </ul>
      </div>

      <button
        onClick={exportAll}
        disabled={exporting}
        className="btn-primary w-full py-4 text-base"
      >
        {exporting ? '📊 데이터 수집 중...' : '📥 전체 데이터 다운로드 (.xlsx)'}
      </button>
    </div>
  );
}
