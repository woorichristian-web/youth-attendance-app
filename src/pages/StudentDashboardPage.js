import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { hasEcclesia, normalizeSchool } from '../utils/schoolConfig';

// 카드형 탭 4개: 임원 / 찬양팀·예배팀 / 에클레시아 / 교사 명단
const TABS = [
  { icon: '👑', label: '임원' },
  { icon: '🎤', icon2: '🙏', label: '찬양팀 · 예배팀' },
  { icon: '✝', label: '에클레시아' },
  { icon: '🧑‍🏫', label: '교사 명단' },
];

export default function StudentDashboardPage() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [stuSnap, clsSnap, usrSnap] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'users')),
      ]);
      setStudents(stuSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.active !== false));
      setClasses(clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      // 교사 명단: 이름과 반/사역팀 정보만 사용 (개인정보 미노출), 사임 교사 제외
      setTeachers(
        usrSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => (u.role === 'teacher' || u.role === 'admin') && u.teacherStatus !== 'resigned' && u.name)
      );
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">🙏 사역팀 & 기도모임</h1>

      {/* 카드형 탭 (임원 / 찬양팀·예배팀 / 에클레시아) */}
      <div className="space-y-2.5 mb-5">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setTab(i)}
            className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-all ${
              tab === i
                ? 'bg-white border-ocean-400 shadow-md ring-1 ring-ocean-200'
                : 'bg-white/60 border-white/70 hover:bg-white/80'
            }`}
          >
            <span className={`font-bold text-base flex items-center gap-2 ${tab === i ? 'text-ocean-700' : 'text-ink'}`}>
              <span>{t.icon}</span>
              {t.icon2 && <span className="-ml-1">{t.icon2}</span>}
              {t.label}
              {tab === i && <span className="ml-auto text-ocean-400 text-sm">▼</span>}
            </span>
          </button>
        ))}
      </div>

      {/* 연도 선택 (임원 · 찬양팀·예배팀 탭) */}
      {(tab === 0 || tab === 1) && (
        <div className="flex justify-end mb-3">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input w-28"
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
      )}

      {/* 👑 임원 — 부서별 회장/부회장/총무 카드 */}
      {tab === 0 && (
        <div className="space-y-4">
          {SERVICE_ORDER.map((svc) => {
            const findRole = (role) =>
              students.find((s) => s.service === svc && hasDept(s, role)) || null;
            const roles = [['회장', findRole('회장')], ['부회장', findRole('부회장')], ['총무', findRole('총무')]];
            return (
              <div key={svc} className="card">
                <div className="font-bold text-gray-800 mb-3">🎗 {svc} 임원</div>
                <div className="grid grid-cols-3 gap-2">
                  {roles.map(([role, st]) => (
                    <div key={role} className="rounded-xl border border-gray-200 bg-white text-center py-3 px-1">
                      <div className="text-xs font-semibold text-blue-700 mb-1">{role}</div>
                      <div className="font-bold text-gray-800 text-sm truncate">{st?.name || '-'}</div>
                      {st?.grade && <div className="text-[11px] text-gray-400 mt-0.5">{st.grade}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {officerList.length === 0 && (
            <div className="card text-center text-gray-400 py-8">{year}년 임원 정보가 없습니다.</div>
          )}
        </div>
      )}

      {/* 🎤🙏 찬양팀 · 예배팀 — 부서별 명단 */}
      {tab === 1 && (
        <div className="space-y-4">
          {SERVICE_ORDER.map((svc) => {
            const praise = ministryFilter('찬양팀').filter((s) => s.service === svc);
            const worship = ministryFilter('예배팀').filter((s) => s.service === svc);
            if (praise.length === 0 && worship.length === 0) return null;
            return (
              <div key={svc} className="card">
                <div className="font-bold text-gray-800 mb-3">{svc}</div>
                <div className="mb-3">
                  <div className="text-sm font-semibold text-blue-700 mb-1">🎤 찬양팀 ({praise.length})</div>
                  <div className="text-sm text-gray-700">
                    {praise.length > 0 ? praise.map((s) => s.name).join(', ') : <span className="text-gray-400">등록된 멤버가 없습니다.</span>}
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-sm font-semibold text-blue-700 mb-1">🙏 예배팀 ({worship.length})</div>
                  <div className="text-sm text-gray-700">
                    {worship.length > 0 ? worship.map((s) => s.name).join(', ') : <span className="text-gray-400">등록된 멤버가 없습니다.</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {ministryFilter('찬양팀').length === 0 && ministryFilter('예배팀').length === 0 && (
            <div className="card text-center text-gray-400 py-8">{year}년 찬양팀 · 예배팀 정보가 없습니다.</div>
          )}
        </div>
      )}

      {/* 🧑‍🏫 교사 명단 — 이름과 반/사역팀만 표시 (개인정보 미노출) */}
      {tab === 3 && (() => {
        const groups = { '1부': [], '2부': [], '사역팀': [], '기타': [] };
        teachers.forEach((t) => {
          if (t.service === '1부') groups['1부'].push(t);
          else if (t.service === '2부') groups['2부'].push(t);
          else if (['찬양팀', '예배팀', '행정팀'].includes(t.ministryMain)) groups['사역팀'].push(t);
          else groups['기타'].push(t);
        });
        Object.keys(groups).forEach((k) =>
          groups[k].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
        );
        const teacherInfo = (t) => {
          const cls =
            classes.find((c) => c.teacherId === t.id) ||
            (t.classId ? classes.find((c) => c.id === t.classId) : null);
          if (cls) return cls.name || `${cls.teacherName} 선생님반`;
          if (t.ministryMain) return t.ministrySub ? `${t.ministryMain} · ${t.ministrySub}` : t.ministryMain;
          if (t.ministrySub) return t.ministrySub;
          return '-';
        };
        const order = ['1부', '2부', '사역팀', '기타'];
        return (
          <div className="space-y-4">
            {order.map((g) => {
              const list = groups[g];
              if (list.length === 0) return null;
              return (
                <div key={g} className="card">
                  <div className="font-bold text-gray-800 mb-2 pb-2 border-b border-gray-100">
                    {g} <span className="text-xs text-gray-400 font-normal">({list.length}명)</span>
                  </div>
                  <div className="space-y-1.5">
                    {list.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-sm py-0.5">
                        <span className="font-medium text-gray-800">{t.name}</span>
                        <span className="text-xs text-gray-500">{teacherInfo(t)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {teachers.length === 0 && (
              <div className="card text-center text-gray-400 py-8">교사 명단이 없습니다.</div>
            )}
          </div>
        );
      })()}

      {/* 에클레시아 */}
      {tab === 2 && (
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
