import React, { useState, useEffect, useMemo } from 'react';
import XLSX from 'xlsx-js-style';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';

// 년도·학기 옵션
const YEARS = Array.from({ length: 6 }, (_, i) => 2026 + i);
const SEMESTERS = ['1학기', '2학기'];
const PROGRAM_TABS = [
  { id: '신앙교육', label: '신앙교육' },
  { id: '홀리틴즈', label: '홀리틴즈' },
];

// 템플릿 헤더
const TEMPLATE_HEADERS = ['학기', '학생이름', '부서', '학년반', '반사이름'];

export default function DiscipleshipManagement({ students, classes }) {
  const [programType, setProgramType] = useState('신앙교육');
  const [year, setYear] = useState(new Date().getFullYear());
  const [semester, setSemester] = useState('1학기');
  const [enrollments, setEnrollments] = useState([]);
  const [sessions, setSessions] = useState([]); // 수업 날짜 목록
  const [loading, setLoading] = useState(true);
  const [attendOpen, setAttendOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingStudentId, setEditingStudentId] = useState(null);

  const semesterKey = `${programType}_${year}_${semester}`;

  // Firestore 구독
  useEffect(() => {
    setLoading(true);
    const u1 = onSnapshot(collection(db, 'discipleship_enrollments'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.semesterKey === semesterKey);
      setEnrollments(list);
      setLoading(false);
    });
    const u2 = onSnapshot(doc(db, 'discipleship_sessions', semesterKey), (snap) => {
      setSessions(snap.exists() ? (snap.data().dates || []) : []);
    });
    return () => { u1(); u2(); };
  }, [semesterKey]);

  // 템플릿 다운로드
  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      ['1학기', '홍길동', '1부', '중2 김민선반', '김민선'],
    ]);
    // 컬럼 폭
    ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 6 }, { wch: 16 }, { wch: 12 }];
    // 헤더 스타일
    TEMPLATE_HEADERS.forEach((_, c) => {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
    });
    XLSX.utils.book_append_sheet(wb, ws, '신앙교육 신청');
    XLSX.writeFile(wb, `신앙교육_신청_템플릿.xlsx`);
  }

  // 엑셀 업로드
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const batch = writeBatch(db);
      let count = 0;
      rows.forEach((r) => {
        const studentName = String(r['학생이름'] || r['이름'] || '').trim();
        if (!studentName) return;
        const semLabel = String(r['학기'] || semester).trim() || semester;
        const service = String(r['부서'] || '').trim();
        const gradeClass = String(r['학년반'] || r['학년'] || '').trim();
        const teacherName = String(r['반사이름'] || r['반사'] || '').trim();
        const docId = `${semesterKey}__${studentName}__${teacherName}`;
        // 학생 매칭 (이름 기준)
        const matched = students.find((s) => s.name === studentName && (!service || s.service === service));
        const data = {
          semesterKey, year, semester: semLabel,
          studentName, service, gradeClass, teacherName,
          studentId: matched?.id || '',
          attendance: {},
          feeContent: '',
          completed: false,
          createdAt: new Date().toISOString(),
        };
        batch.set(doc(db, 'discipleship_enrollments', docId), data, { merge: true });
        count++;
      });
      await batch.commit();
      setMsg(`✅ ${count}명 업로드 완료`);
    } catch (err) {
      setMsg('❌ 업로드 오류: ' + err.message);
    }
    setUploading(false);
    e.target.value = '';
  }

  async function toggleFee(en) {
    const next = en.feeContent === 'O' ? 'X' : (en.feeContent === 'X' ? '' : 'O');
    await updateDoc(doc(db, 'discipleship_enrollments', en.id), { feeContent: next });
  }
  async function toggleCompleted(en) {
    await updateDoc(doc(db, 'discipleship_enrollments', en.id), { completed: !en.completed });
  }
  async function removeEnrollment(en) {
    if (!window.confirm(`${en.studentName} 학생을 신청 명단에서 제거할까요?`)) return;
    await deleteDoc(doc(db, 'discipleship_enrollments', en.id));
  }

  // 수업 날짜 관리
  async function addSession(date) {
    if (!date || sessions.includes(date)) return;
    const next = [...sessions, date].sort();
    await setDoc(doc(db, 'discipleship_sessions', semesterKey), { dates: next }, { merge: true });
  }
  async function removeSession(date) {
    const next = sessions.filter((d) => d !== date);
    await setDoc(doc(db, 'discipleship_sessions', semesterKey), { dates: next }, { merge: true });
  }
  async function markAttendance(en, date, present) {
    const nextAtt = { ...(en.attendance || {}) };
    if (present) nextAtt[date] = true;
    else delete nextAtt[date];
    await updateDoc(doc(db, 'discipleship_enrollments', en.id), { attendance: nextAtt });
  }

  const sorted = useMemo(() => {
    return [...enrollments].sort((a, b) =>
      (a.service || '').localeCompare(b.service || '') ||
      (a.teacherName || '').localeCompare(b.teacherName || '', 'ko') ||
      (a.studentName || '').localeCompare(b.studentName || '', 'ko')
    );
  }, [enrollments]);

  return (
    <div className="space-y-4">
      {/* 프로그램 서브탭 */}
      <div className="flex gap-1 bg-white/60 rounded-xl p-1 w-fit">
        {PROGRAM_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setProgramType(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              programType === t.id ? 'bg-white text-teal-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 상단 컨트롤 */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-stone-500 block mb-1">연도</label>
            <select className="border border-stone-300 rounded-lg px-3 py-1.5 bg-white text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-stone-500 block mb-1">학기</label>
            <select className="border border-stone-300 rounded-lg px-3 py-1.5 bg-white text-sm" value={semester} onChange={(e) => setSemester(e.target.value)}>
              {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={downloadTemplate} className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50">
            📄 템플릿 다운로드
          </button>
          <label className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 cursor-pointer">
            {uploading ? '업로드 중...' : '📥 명단 업로드 (.xlsx)'}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          <button onClick={() => setAttendOpen(true)} className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800">
            📋 출석 체크
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-stone-700">{msg}</div>}

      {/* 명단 테이블 */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
          <div className="font-semibold text-stone-900">{year} {semester} · 신청자 {sorted.length}명</div>
        </div>
        {loading ? (
          <div className="p-6 text-center text-stone-500 text-sm">불러오는 중...</div>
        ) : sorted.length === 0 ? (
          <div className="p-6 text-center text-stone-500 text-sm">등록된 신청자가 없습니다. 템플릿을 다운받아 명단을 업로드하세요.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">학기</th>
                  <th className="text-left px-3 py-2 font-medium">학생</th>
                  <th className="text-left px-3 py-2 font-medium">부서</th>
                  <th className="text-left px-3 py-2 font-medium">학년반</th>
                  <th className="text-left px-3 py-2 font-medium">반사</th>
                  <th className="text-center px-3 py-2 font-medium">출석</th>
                  <th className="text-center px-3 py-2 font-medium">회비</th>
                  <th className="text-center px-3 py-2 font-medium">수료</th>
                  <th className="text-right px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((en) => {
                  const attCount = Object.values(en.attendance || {}).filter(Boolean).length;
                  return (
                    <tr key={en.id} className="border-t border-stone-100 hover:bg-stone-50">
                      <td className="px-3 py-2 text-stone-600">{en.semester}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => en.studentId && setEditingStudentId(en.studentId)}
                          className={`font-medium ${en.studentId ? 'text-teal-700 hover:underline' : 'text-stone-800'}`}
                          disabled={!en.studentId}
                          title={en.studentId ? '학생 정보 열기' : '시스템에 매칭된 학생이 없음'}
                        >
                          {en.studentName}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-stone-600">{en.service}</td>
                      <td className="px-3 py-2 text-stone-600">{en.gradeClass}</td>
                      <td className="px-3 py-2 text-stone-600">{en.teacherName}</td>
                      <td className="px-3 py-2 text-center text-stone-600">
                        {attCount}/{sessions.length || '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => toggleFee(en)}
                          className={`w-8 h-6 rounded text-xs font-semibold ${
                            en.feeContent === 'O' ? 'bg-teal-100 text-teal-700' :
                            en.feeContent === 'X' ? 'bg-rose-100 text-rose-700' :
                            'bg-stone-100 text-stone-400'
                          }`}
                        >
                          {en.feeContent || '-'}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => toggleCompleted(en)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                            en.completed ? 'bg-teal-600 text-white' : 'bg-stone-200 text-stone-500 hover:bg-stone-300'
                          }`}
                        >
                          {en.completed ? '✓ 수료' : '대기'}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeEnrollment(en)} className="text-xs text-rose-500 hover:text-rose-700">
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 출석 체크 매트릭스 모달 */}
      {attendOpen && (
        <AttendMatrixModal
          onClose={() => setAttendOpen(false)}
          enrollments={sorted}
          sessions={sessions}
          onAddSession={addSession}
          onRemoveSession={removeSession}
          onMark={markAttendance}
        />
      )}

      {/* 학생 정보 모달 (기본 정보 편집) */}
      {editingStudentId && (
        <StudentEditModal studentId={editingStudentId} students={students} classes={classes} onClose={() => setEditingStudentId(null)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// 출석 체크 모달
// ═══════════════════════════════════════════════
function AttendMatrixModal({ enrollments, sessions, onAddSession, onRemoveSession, onMark, onClose }) {
  const [newDate, setNewDate] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
          <h3 className="font-bold text-stone-900">출석 체크</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900">✕</button>
        </div>
        <div className="px-5 py-3 border-b border-stone-200 flex items-center gap-2">
          <input type="date" className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button
            onClick={() => { if (newDate) { onAddSession(newDate); setNewDate(''); } }}
            className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
          >
            수업 날짜 추가
          </button>
          <span className="text-xs text-stone-500 ml-auto">셀 클릭 시 출석 토글</span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-stone-50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-stone-600 border-b border-stone-200 sticky left-0 bg-stone-50 z-10">학생</th>
                {sessions.map((d) => (
                  <th key={d} className="text-center px-2 py-2 font-medium text-stone-600 border-b border-stone-200 whitespace-nowrap">
                    <div className="flex flex-col items-center">
                      <span>{d.slice(5)}</span>
                      <button onClick={() => onRemoveSession(d)} className="text-[10px] text-rose-500 hover:text-rose-700">삭제</button>
                    </div>
                  </th>
                ))}
                {sessions.length === 0 && (
                  <th className="text-left px-3 py-2 font-medium text-stone-400 border-b border-stone-200">수업 날짜를 추가하세요</th>
                )}
              </tr>
            </thead>
            <tbody>
              {enrollments.map((en) => (
                <tr key={en.id} className="border-b border-stone-100">
                  <td className="px-3 py-2 font-medium text-stone-800 sticky left-0 bg-white">{en.studentName}</td>
                  {sessions.map((d) => {
                    const present = !!(en.attendance || {})[d];
                    return (
                      <td key={d} className="text-center px-2 py-1">
                        <button
                          onClick={() => onMark(en, d, !present)}
                          className={`w-9 h-9 rounded-md text-sm font-semibold transition-all ${
                            present ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-300 hover:bg-stone-200'
                          }`}
                        >
                          {present ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// 학생 기본 정보 모달 (연락처 등)
// ═══════════════════════════════════════════════
function StudentEditModal({ studentId, students, classes, onClose }) {
  const st = students.find((s) => s.id === studentId);
  if (!st) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl p-6 max-w-sm">학생을 찾을 수 없습니다.</div>
      </div>
    );
  }
  const cls = classes.find((c) => c.id === st.classId);
  const Field = ({ label, value }) => (
    <div>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-sm text-stone-900">{value || '-'}</div>
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-stone-900">{st.name} 학생 정보</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="부서" value={st.service} />
          <Field label="반" value={cls?.teacherName ? `${cls.teacherName} 선생님반` : '-'} />
          <Field label="학년" value={st.grade} />
          <Field label="성별" value={st.gender} />
          <Field label="생년월일" value={st.birthDate} />
          <Field label="학교" value={st.school} />
          <Field label="학생 연락처" value={st.phone} />
          <Field label="보호자 연락처" value={st.parentPhone} />
          <div className="col-span-2"><Field label="주소" value={st.address} /></div>
          <Field label="신급" value={st.baptismLevel} />
          <Field label="인도자" value={st.evangelist} />
          {st.notes && <div className="col-span-2"><Field label="특이사항" value={st.notes} /></div>}
        </div>
      </div>
    </div>
  );
}
