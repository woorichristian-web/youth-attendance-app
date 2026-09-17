import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateKo } from '../../utils/dateUtils';
import { isRegistered } from '../../utils/statusUtils';

export default function AttendanceSheet({ date, service, teacher, classId }) {
  const { currentUser } = useAuth();
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [absentReason, setAbsentReason] = useState('');
  const [visitPrayer, setVisitPrayer] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [existingId, setExistingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setSuccess(false);
      setError('');
      try {
        // 학생 목록 로드
        const studentsQ = query(
          collection(db, 'students'),
          where('classId', '==', classId),
          where('active', '==', true)
        );
        const studentsSnap = await getDocs(studentsQ);
        // 타교회 이동 등 비재적 학생은 반 출석 명단에서 제외
        const studentList = studentsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(isRegistered);
        studentList.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        setStudents(studentList);

        // 기존 출석 데이터 확인
        const attQ = query(
          collection(db, 'attendance'),
          where('date', '==', date),
          where('service', '==', service),
          where('classId', '==', classId)
        );
        const attSnap = await getDocs(attQ);

        if (!attSnap.empty) {
          const existing = attSnap.docs[0];
          setExistingId(existing.id);
          const data = existing.data();
          const records = data.records || [];
          const map = {};
          records.forEach((r) => {
            map[r.studentId] = r.present;
          });
          studentList.forEach((s) => {
            if (!(s.id in map)) map[s.id] = false;
          });
          setAttendance(map);
          // 마이그레이션: 기존 notes는 absentReason으로 흡수
          setAbsentReason(data.absentReason || data.notes || '');
          setVisitPrayer(data.visitPrayer || '');
        } else {
          setExistingId(null);
          const map = {};
          studentList.forEach((s) => {
            map[s.id] = false;
          });
          setAttendance(map);
          setAbsentReason('');
          setVisitPrayer('');
        }
      } catch (err) {
        console.error('데이터 로드 오류:', err);
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      }
      setLoading(false);
    }

    if (date && service && classId) {
      loadData();
    }
  }, [date, service, classId]);

  function toggleStudent(studentId) {
    setAttendance((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  function markAll(present) {
    const map = {};
    students.forEach((s) => {
      map[s.id] = present;
    });
    setAttendance(map);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const records = students.map((s) => ({
        studentId: s.id,
        studentName: s.name,
        present: attendance[s.id] || false,
      }));

      const docId = existingId || `${date}_${service}_${classId}`;
      const ar = absentReason.trim();
      const vp = visitPrayer.trim();
      await setDoc(doc(db, 'attendance', docId), {
        date,
        service,
        classId,
        teacherId: teacher.id,
        teacherName: teacher.name,
        records,
        absentReason: ar,
        visitPrayer: vp,
        notes: [ar, vp].filter(Boolean).join('\n'), // 하위 호환
        submitted: true,
        submittedAt: serverTimestamp(),
        submittedBy: currentUser.uid,
      });

      // 결석자 사유 또는 심방/기도 입력 시 관리자 알림 생성
      if (ar || vp) {
        await addDoc(collection(db, 'notifications'), {
          type: 'notes',
          teacherName: teacher.name,
          service,
          classId,
          date,
          notes: [ar && `[결석사유] ${ar}`, vp && `[심방/기도] ${vp}`].filter(Boolean).join('\n'),
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setSuccess(true);
      setExistingId(docId);
    } catch (err) {
      console.error('출석 저장 오류:', err);
      setError('출석 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
    setSubmitting(false);
  }

  const presentCount = students.filter((s) => attendance[s.id]).length;
  const totalCount = students.length;

  if (loading) {
    return (
      <div className="card text-center py-10 text-gray-500">
        학생 목록을 불러오는 중...
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-gray-800">📋 출석 체크</h2>
        {existingId && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-lg">
            기존 데이터 있음 (수정 가능)
          </span>
        )}
      </div>

      <div className="text-sm text-gray-500 mb-4">
        <span className="font-medium text-gray-700">{formatDateKo(date)}</span> /{' '}
        <span className="font-medium text-blue-600">{service} 예배</span> /{' '}
        <span className="font-medium text-gray-700">{teacher.name} 선생님반</span>
      </div>

      {students.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          이 반에 등록된 학생이 없습니다.
          <br />
          <span className="text-sm">관리자에게 학생 등록을 요청하세요.</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-600">
              출석: <span className="text-blue-600 font-bold">{presentCount}</span> /{' '}
              {totalCount}명
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => markAll(true)}
                className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-lg"
              >
                전체 출석
              </button>
              <button
                onClick={() => markAll(false)}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded-lg"
              >
                전체 결석
              </button>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {students.map((student) => (
              <label
                key={student.id}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  attendance[student.id]
                    ? 'bg-green-50 border-green-400'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={attendance[student.id] || false}
                  onChange={() => toggleStudent(student.id)}
                  className="w-5 h-5 accent-green-500"
                />
                <span className="flex-1 flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-medium text-base ${
                      attendance[student.id] ? 'text-green-800' : 'text-gray-700'
                    }`}
                  >
                    {student.name}
                  </span>
                  {student.joinDate &&
                    (new Date() - new Date(student.joinDate)) / (1000 * 60 * 60 * 24) <= 30 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        새친구
                      </span>
                    )}
                  {(() => {
                    const yr = new Date().getFullYear();
                    const roles = new Set();
                    (student.ministryTeams || []).forEach((m) => {
                      if (Number(m.year) !== yr) return;
                      const depts = m.departments || (m.department ? [m.department] : []);
                      depts.forEach((d) => { if (['회장','부회장','총무'].includes(d)) roles.add(d); });
                    });
                    return [...roles].map((role) => {
                      const color = role === '회장'
                        ? 'bg-yellow-300 text-yellow-900'
                        : role === '부회장'
                        ? 'bg-gray-300 text-gray-700'
                        : 'bg-orange-300 text-orange-900';
                      return (
                        <span key={role} className={`text-xs px-2 py-0.5 rounded-full font-semibold ${color}`}>
                          👑 {role}
                        </span>
                      );
                    });
                  })()}
                </span>
                {attendance[student.id] && (
                  <span className="text-green-600 text-sm font-medium">출석 ✓</span>
                )}
              </label>
            ))}
          </div>

          {/* 결석자 사유 */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ❌ 결석자 사유
            </label>
            <textarea
              value={absentReason}
              onChange={(e) => setAbsentReason(e.target.value)}
              placeholder="결석한 학생의 사유를 입력해주세요. (선택사항)"
              rows={2}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>

          {/* 심방 및 기도 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              🙏 심방 및 기도
            </label>
            <textarea
              value={visitPrayer}
              onChange={(e) => setVisitPrayer(e.target.value)}
              placeholder="심방이 필요하거나 기도 부탁이 있으면 입력해주세요. (선택사항)"
              rows={2}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
            />
            {(absentReason.trim() || visitPrayer.trim()) && (
              <p className="text-xs text-amber-600 mt-1">⚠️ 저장 시 관리자에게 알림이 전송됩니다.</p>
            )}
          </div>

          {error && (
            <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          {success && (
            <div className="mb-3 p-3 bg-green-50 text-green-700 rounded-lg text-sm font-medium">
              ✅ 출석이 저장되었습니다! ({presentCount}/{totalCount}명 출석)
              {(absentReason.trim() || visitPrayer.trim()) && ' · 특이사항이 관리자에게 전달됐습니다.'}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary w-full py-3 text-base"
          >
            {submitting ? '저장 중...' : existingId ? '출석 수정 저장' : '출석 저장'}
          </button>
        </>
      )}
    </div>
  );
}
