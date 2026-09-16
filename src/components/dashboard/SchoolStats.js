import React, { useState } from 'react';
import { hasEcclesia } from '../../utils/schoolConfig';

export default function SchoolStats({ students, classes }) {
  const [expanded, setExpanded] = useState({});

  // 활성 학생만, 학교별 그룹
  const activeStudents = students.filter((s) => s.active !== false);

  const schoolMap = {};
  activeStudents.forEach((s) => {
    const key = s.school?.trim() || '학교 미입력';
    if (!schoolMap[key]) schoolMap[key] = [];
    schoolMap[key].push(s);
  });

  // 학교 이름 정렬: 실제 학교명 먼저, 미입력 맨 뒤
  const schoolNames = Object.keys(schoolMap).sort((a, b) => {
    if (a === '학교 미입력') return 1;
    if (b === '학교 미입력') return -1;
    return a.localeCompare(b, 'ko');
  });

  function toggle(name) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  const GRADE_ORDER = ['중1', '중2', '중3', '고1', '고2', '고3'];

  function sortStudents(list) {
    return [...list].sort((a, b) => {
      const ga = GRADE_ORDER.indexOf(a.grade || '');
      const gb = GRADE_ORDER.indexOf(b.grade || '');
      if (ga !== gb) return (ga === -1 ? 999 : ga) - (gb === -1 ? 999 : gb);
      return a.name.localeCompare(b.name, 'ko');
    });
  }

  const totalWithSchool = activeStudents.filter((s) => s.school?.trim()).length;

  return (
    <div className="space-y-3">
      {/* 요약 */}
      <div className="card flex items-center justify-between py-3">
        <span className="text-sm font-medium text-gray-700">
          학교 정보 입력된 학생
        </span>
        <span className="font-bold text-blue-600 text-lg">
          {totalWithSchool}명 / {schoolNames.filter((n) => n !== '학교 미입력').length}개 학교
        </span>
      </div>

      {/* 학교 목록 */}
      {schoolNames.map((schoolName) => {
        const studentList = sortStudents(schoolMap[schoolName]);
        const ecclesia = hasEcclesia(schoolName);
        const isOpen = !!expanded[schoolName];
        const isMissing = schoolName === '학교 미입력';

        const ecclesiaCount = studentList.filter((s) => s.ecclesia).length;

        return (
          <div
            key={schoolName}
            className={`card overflow-hidden ${isMissing ? 'opacity-60' : ''}`}
          >
            {/* 학교 헤더 */}
            <button
              className="w-full flex items-center justify-between text-left"
              onClick={() => toggle(schoolName)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-800">{schoolName}</span>
                {ecclesia && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                    ✝ 에클레시아
                  </span>
                )}
                {ecclesiaCount > 0 && (
                  <span className="text-xs text-purple-500">
                    ({ecclesiaCount}명 참석)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-blue-600">
                  {studentList.length}명
                </span>
                <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* 학생 목록 */}
            {isOpen && (
              <div className="mt-3 border-t border-gray-100 pt-3 space-y-1.5">
                {/* 학년별 소그룹 */}
                {(() => {
                  const byGrade = {};
                  studentList.forEach((s) => {
                    const g = s.grade || '학년 미입력';
                    if (!byGrade[g]) byGrade[g] = [];
                    byGrade[g].push(s);
                  });
                  const gradeKeys = Object.keys(byGrade).sort((a, b) => {
                    const ia = GRADE_ORDER.indexOf(a);
                    const ib = GRADE_ORDER.indexOf(b);
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return a.localeCompare(b, 'ko');
                  });

                  return gradeKeys.map((grade) => (
                    <div key={grade}>
                      <div className="text-xs font-semibold text-gray-400 mb-1 mt-2">
                        {grade}
                      </div>
                      {byGrade[grade].map((s) => {
                        const cls = classes.find((c) => c.id === s.classId);
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-800">
                                {s.name}
                              </span>
                              {s.ecclesia && ecclesia && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">
                                  에클레시아
                                </span>
                              )}
                              {s.gender && (
                                <span className="text-xs text-gray-400">{s.gender}</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">
                              {cls ? `${cls.teacherName} 선생님반` : '반 미정'}
                              {s.service ? ` · ${s.service}` : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        );
      })}

      {schoolNames.length === 0 && (
        <div className="card text-center py-8 text-gray-400 text-sm">
          학교 정보가 입력된 학생이 없습니다.
        </div>
      )}
    </div>
  );
}
