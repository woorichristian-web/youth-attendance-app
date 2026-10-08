import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { isRegistered } from '../../utils/statusUtils';
import {
  getTuksaePeriod, tuksaeDateLabel, tuksaeYears, defaultTuksaeYear, isTuksaeYear,
} from '../../utils/tuksaeConfig';

// 교사용 특새 출석 패널 — 날짜 선택 → 반 학생 체크 → 제출 + 기록 그리드
// props: classId, service, teacherName, showYearPicker(기본 true), onSubmitted()
export default function TuksaePanel({ classId, service, teacherName, showYearPicker = true, onSubmitted }) {
  const [year, setYear] = useState(defaultTuksaeYear());
  const [students, setStudents] = useState([]);
  const [docData, setDocData] = useState(null); // tuksae_attendance 문서
  const [selectedDate, setSelectedDate] = useState(null);
  const [checked, setChecked] = useState({}); // {studentId: true}
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const period = getTuksaePeriod(year);

  // 반 학생 로드
  useEffect(() => {
    if (!classId) return;
    const q = query(collection(db, 'students'), where('classId', '==', classId));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.active !== false && isRegistered(s))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      setStudents(list);
    });
    return unsub;
  }, [classId]);

  // 특새 문서 로드
  useEffect(() => {
    if (!classId) return;
    const ref = doc(db, 'tuksae_attendance', `${year}_${classId}`);
    const unsub = onSnapshot(ref, (snap) => {
      setDocData(snap.exists() ? snap.data() : null);
    });
    return unsub;
  }, [classId, year]);

  // 기본 선택 날짜 (기간 첫날)
  useEffect(() => {
    if (period && !selectedDate) setSelectedDate(period.dates[0]);
    if (!period) setSelectedDate(null);
  }, [period, selectedDate]);

  // 선택 날짜 바뀌면 체크 상태를 기존 기록에서 로드
  useEffect(() => {
    if (!selectedDate) { setChecked({}); return; }
    const arr = (docData?.attendance?.[selectedDate]) || [];
    const map = {};
    arr.forEach((r) => { map[r.studentId] = true; });
    setChecked(map);
    setSavedMsg('');
  }, [selectedDate, docData]);

  const attendance = docData?.attendance || {};
  const dates = period?.dates || [];

  // 학생별 참석 요일 수 (그리드용)
  const presentSet = useMemo(() => {
    const m = {}; // date -> Set(studentId)
    dates.forEach((d) => {
      m[d] = new Set((attendance[d] || []).map((r) => r.studentId));
    });
    return m;
  }, [attendance, dates]);

  async function handleSubmit() {
    if (!selectedDate) return;
    setSaving(true);
    try {
      const presentList = students
        .filter((s) => checked[s.id])
        .map((s) => ({ studentId: s.id, studentName: s.name }));
      const newAttendance = { ...attendance, [selectedDate]: presentList };
      await setDoc(doc(db, 'tuksae_attendance', `${year}_${classId}`), {
        year, classId, service: service || '', teacherName: teacherName || '',
        attendance: newAttendance, updatedAt: serverTimestamp(),
      }, { merge: true });
      setSavedMsg(`${tuksaeDateLabel(selectedDate)} 저장되었습니다 (참석 ${presentList.length}명)`);
      if (onSubmitted) onSubmitted();
    } catch (e) {
      console.error('특새 저장 오류:', e);
      setSavedMsg('저장 중 오류가 발생했습니다.');
    }
    setSaving(false);
  }

  if (!classId) {
    return (
      <div className="card bg-amber-50 border-amber-200 text-amber-700 text-center py-6 text-sm">
        담당 반이 배정되지 않았습니다. 관리자에게 문의해주세요.
      </div>
    );
  }

  const presentCount = Object.values(checked).filter(Boolean).length;

  return (
    <div>
      {/* 연도 선택 */}
      {showYearPicker && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-ink-muted">연도</span>
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setSelectedDate(null); }}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
          >
            {tuksaeYears().map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          {period && <span className="text-xs text-ocean-600 font-medium">{period.label}</span>}
        </div>
      )}

      {!isTuksaeYear(year) ? (
        <div className="card bg-stone-50 border-stone-200 text-center py-8 text-sm text-ink-muted">
          {year}년은 특새 사용 기간이 아닙니다.
        </div>
      ) : (
        <>
          {/* 날짜 선택 */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  selectedDate === d
                    ? 'bg-ocean-500 text-white border-ocean-600 shadow-sm'
                    : 'bg-white text-ink border-gray-200 hover:bg-ocean-50'
                }`}
              >
                {tuksaeDateLabel(d)}
                {(attendance[d]?.length > 0) && (
                  <span className={`ml-1 text-[10px] ${selectedDate === d ? 'text-ocean-100' : 'text-ocean-500'}`}>
                    {attendance[d].length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 학생 체크 */}
          {selectedDate && (
            <div className="card mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-ink">
                  {tuksaeDateLabel(selectedDate)} 참석 체크
                </div>
                <div className="text-xs text-ink-muted">참석 {presentCount}명 / {students.length}명</div>
              </div>
              {students.length === 0 ? (
                <div className="text-center text-ink-muted py-6 text-sm">우리 반 학생이 없습니다.</div>
              ) : (
                <div className="space-y-1.5">
                  {students.map((s) => (
                    <label
                      key={s.id}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg border cursor-pointer transition-colors ${
                        checked[s.id] ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'
                      }`}
                    >
                      <span className="font-medium text-ink">{s.name}
                        {s.grade && <span className="text-xs text-ink-muted ml-1.5">{s.grade}</span>}
                      </span>
                      <input
                        type="checkbox"
                        checked={!!checked[s.id]}
                        onChange={() => setChecked((p) => ({ ...p, [s.id]: !p[s.id] }))}
                        className="w-5 h-5 accent-emerald-500"
                      />
                    </label>
                  ))}
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={saving || students.length === 0}
                className="btn-primary w-full mt-3 py-3"
              >
                {saving ? '저장 중...' : `${tuksaeDateLabel(selectedDate)} 제출`}
              </button>
              {savedMsg && <p className="text-xs text-emerald-600 mt-2 text-center">{savedMsg}</p>}
            </div>
          )}

          {/* 기록 그리드 */}
          <div className="card">
            <div className="text-sm font-semibold text-ink mb-2">📋 우리 반 특새 참석 기록</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-1.5 px-2 text-ink-muted font-medium border-b border-gray-100">이름</th>
                    {dates.map((d) => (
                      <th key={d} className="py-1.5 px-1 text-center text-[11px] text-ink-muted font-medium border-b border-gray-100 whitespace-nowrap">
                        {tuksaeDateLabel(d).replace(/\(.\)/, '')}
                      </th>
                    ))}
                    <th className="py-1.5 px-1 text-center text-[11px] text-ink-muted font-medium border-b border-gray-100">계</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const cnt = dates.filter((d) => presentSet[d]?.has(s.id)).length;
                    return (
                      <tr key={s.id} className="border-b border-gray-50">
                        <td className="py-1.5 px-2 text-ink whitespace-nowrap">{s.name}</td>
                        {dates.map((d) => (
                          <td key={d} className="py-1.5 px-1 text-center">
                            {presentSet[d]?.has(s.id)
                              ? <span className="text-emerald-500 font-bold">✓</span>
                              : <span className="text-gray-200">·</span>}
                          </td>
                        ))}
                        <td className="py-1.5 px-1 text-center font-semibold text-ocean-600">{cnt}</td>
                      </tr>
                    );
                  })}
                  {students.length === 0 && (
                    <tr><td colSpan={dates.length + 2} className="text-center text-ink-muted py-4 text-sm">학생이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
