import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { hasEcclesia, normalizeSchool } from '../utils/schoolConfig';

const TABS = ['임원', '예배팀', '찬양팀', '에클레시아'];

export default function StudentDashboardPage() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [stuSnap, clsSnap] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'classes')),
      ]);
      setStudents(stuSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.active !== false));
      setClasses(clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }
    load();
  }, []);

  const findClassName = (classId) => {
    const c = classes.find((cls) => cls.id === classId);
    return c?.teacherName ? `${c.teacherName} 선생님반` : '반 미정';
  };

  // 사역팀별 명단 (departments 배열 또는 legacy department 문자열 모두 지원)
  const hasDept = (s, deptName) =>
    s.ministryTeams?.some((m) => {
      if (Number(m.year) !== Number(year)) return false;
      const depts = m.departments || (m.department ? [m.department] : []);
      return depts.includes(deptName);
    });

  const ministryFilter = (deptName) =>
    students
      .filter((s) => hasDept(s, deptName))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));

  // 임원 (회장/부회장/총무) — 부서(1부→2부) → 직책(회장→부회장→총무) 순
  const ROLE_ORDER = ['회장', '부회장', '총무'];
  const SERVICE_ORDER = ['1부', '2부'];
  const officerList = students
    .filter((s) => ROLE_ORDER.some((r) => hasDept(s, r)))
    .map((s) => {
      // 우선순위 가장 높은 직책
      const role = ROLE_ORDER.find((r) => hasDept(s, r));
      return { student: s, role };
    })
    .sort((a, b) => {
      const sA = SERVICE_ORDER.indexOf(a.student.service);
      const sB = SERVICE_ORDER.indexOf(b.student.service);
      if (sA !== sB) return (sA === -1 ? 99 : sA) - (sB === -1 ? 99 : sB);
      const rA = ROLE_ORDER.indexOf(a.role);
      const rB = ROLE_ORDER.indexOf(b.role);
      if (rA !== rB) return rA - rB;
      return (a.student.name || '').localeCompare(b.student.name || '', 'ko');
    })
    .map(({ student }) => student);

  // 에클레시아 학생 그룹
  const ecclesiaStudents = students.filter((s) => s.ecclesia);
  const ecclesiaSchoolMap = {};
  ecclesiaStudents.forEach((s) => {
    // '판교중'과 '판교중학교' 같은 표기 차이를 같은 학교로 묶는다
    const sc = normalizeSchool(s.school) || '학교 미입력';
    if (!ecclesiaSchoolMap[sc]) ecclesiaSchoolMap[sc] = [];
    ecclesiaSchoolMap[sc].push(s);
  });
  const ecclesiaSchoolList = Object.entries(ecclesiaSchoolMap)
    .map(([school, list]) => ({ school, list: list.sort((a,b)=>(a.grade||'').localeCompare(b.grade||'')||(a.name||'').localeCompare(b.name||'','ko')) }))
    .sort((a, b) => a.school.localeCompare(b.school, 'ko'));

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">불러오는 중...</div>;
  }

  const getOfficerRoles = (s) => {
    if (!s.ministryTeams) return [];
    const roles = new Set();
    s.ministryTeams.forEach((m) => {
      if (Number(m.year) !== Number(year)) return;
      const depts = m.departments || (m.department ? [m.department] : []);
      depts.forEach((d) => {
        if (['회장', '부회장', '총무'].includes(d)) roles.add(d);
      });
    });
    return [...roles];
  };

  const renderStudent = (s) => (
    <div key={s.id} className="card flex items-center justify-between">
      <div>
        <div className="font-medium text-gray-800 flex items-center gap-2 flex-wrap">
          {s.name}
          {getOfficerRoles(s).map((role) => {
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
          })}
          {s.gender && <span className="text-xs text-gray-500">{s.gender}</span>}
          {s.grade && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{s.grade}</span>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {findClassName(s.classId)}{s.service ? ` · ${s.service}` : ''}{s.school ? ` · 🏫 ${s.school}` : ''}
        </div>
        {s.ministryTeams?.length > 0 && (
          <div className="text-xs text-gray-400">
            🎶 {s.ministryTeams.map((m) => {
              const depts = m.departments || (m.department ? [m.department] : []);
              return depts.length > 0 ? `${m.year}-${depts.join('/')}` : null;
            }).filter(Boolean).join(', ')}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">🙏 사역팀 & 기도모임</h1>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === i ? 'bg-white shadow text-blue-700' : 'text-gray-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 임원 / 예배팀 / 찬양팀 — 모두 1부 / 2부 분리 */}
      {(tab === 0 || tab === 1 || tab === 2) && (() => {
        const yearSelector = (
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input w-28"
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        );

        let title, fullList;
        if (tab === 0) {
          title = `👑 임원`;
          fullList = officerList;
        } else if (tab === 1) {
          title = `예배팀`;
          fullList = ministryFilter('예배팀');
        } else {
          title = `찬양팀`;
          fullList = ministryFilter('찬양팀');
        }

        const groups = SERVICE_ORDER.map((svc) => ({
          service: svc,
          students: fullList.filter((s) => s.service === svc),
        }));
        const noService = fullList.filter((s) => !SERVICE_ORDER.includes(s.service));

        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800">{title} ({fullList.length}명)</h3>
              {yearSelector}
            </div>
            {fullList.length === 0 ? (
              <div className="card text-center text-gray-400 py-8">{year}년 {title.replace('👑 ', '')} 멤버가 없습니다.</div>
            ) : (
              <div className="space-y-5">
                {groups.filter((g) => g.students.length > 0).map((g) => (
                  <div key={g.service}>
                    <div className="text-sm font-semibold text-blue-700 mb-2 px-1">
                      {g.service} <span className="text-xs text-gray-400">({g.students.length}명)</span>
                    </div>
                    <div className="space-y-2">{g.students.map(renderStudent)}</div>
                  </div>
                ))}
                {noService.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-gray-500 mb-2 px-1">
                      미배정 <span className="text-xs text-gray-400">({noService.length}명)</span>
                    </div>
                    <div className="space-y-2">{noService.map(renderStudent)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 에클레시아 */}
      {tab === 3 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800">✝ 에클레시아 참여 ({ecclesiaStudents.length}명)</h3>
            <span className="text-xs text-gray-400">{ecclesiaSchoolList.length}개 학교</span>
          </div>
          {ecclesiaSchoolList.length === 0 ? (
            <div className="card text-center text-gray-400 py-8">에클레시아 참여 학생이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {ecclesiaSchoolList.map(({ school, list }) => {
                const hasOfficial = hasEcclesia(school);
                return (
                  <div key={school} className="card">
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                      <span className="font-bold text-gray-800">🏫 {school}</span>
                      {hasOfficial && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">✝ 에클레시아</span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">{list.length}명</span>
                    </div>
                    <div className="space-y-1">
                      {list.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">{s.name}</span>
                            {s.gender && <span className="text-xs text-gray-400">{s.gender}</span>}
                            {s.grade && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{s.grade}</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{findClassName(s.classId)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
