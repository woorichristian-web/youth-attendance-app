import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  doc,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';

const SERVICES = ['1부', '2부'];
const OFFICER_ROLES = ['회장', '부회장', '총무'];
const YEARS = Array.from({ length: 11 }, (_, i) => 2025 + i);

// 특정 학생의 특정 연도 사역 항목을 가져온다 (없으면 새 객체 반환).
function pickYearEntry(ministryTeams, year) {
  const list = ministryTeams || [];
  const idx = list.findIndex((m) => Number(m.year) === Number(year));
  return { idx, entry: idx >= 0 ? { ...list[idx], departments: [...(list[idx].departments || (list[idx].department ? [list[idx].department] : []))] } : { year, departments: [] } };
}

export default function OfficerManagement() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // form[service][role] = studentId, form[service].praise/worship = "이름1, 이름2"
  const [form, setForm] = useState({
    '1부': { 회장: '', 부회장: '', 총무: '', praise: '', worship: '' },
    '2부': { 회장: '', 부회장: '', 총무: '', praise: '', worship: '' },
  });

  async function loadStudents() {
    setLoading(true);
    const q = query(collection(db, 'students'), orderBy('name'));
    const snap = await getDocs(q);
    setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }

  useEffect(() => {
    loadStudents();
  }, []);

  // year, students 변경 시 form 자동 채움
  useEffect(() => {
    if (students.length === 0) return;
    const next = {
      '1부': { 회장: '', 부회장: '', 총무: '', praise: '', worship: '' },
      '2부': { 회장: '', 부회장: '', 총무: '', praise: '', worship: '' },
    };
    const inDept = (s, dept) =>
      (s.ministryTeams || []).some((m) => {
        if (Number(m.year) !== Number(year)) return false;
        const depts = m.departments || (m.department ? [m.department] : []);
        return depts.includes(dept);
      });
    for (const svc of SERVICES) {
      const svcStudents = students.filter((s) => s.service === svc);
      for (const role of OFFICER_ROLES) {
        const found = svcStudents.find((s) => inDept(s, role));
        if (found) next[svc][role] = found.id;
      }
      next[svc].praise = svcStudents.filter((s) => inDept(s, '찬양팀')).map((s) => s.name).join(', ');
      next[svc].worship = svcStudents.filter((s) => inDept(s, '예배팀')).map((s) => s.name).join(', ');
    }
    setForm(next);
  }, [year, students]);

  const studentsByService = useMemo(() => {
    const out = { '1부': [], '2부': [] };
    students.forEach((s) => {
      if (out[s.service]) out[s.service].push(s);
    });
    return out;
  }, [students]);

  // 이름으로 학생 찾기 (해당 예배 소속 우선, 못 찾으면 전체에서)
  function findByName(name, svc) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    return (
      studentsByService[svc].find((s) => s.name === trimmed) ||
      students.find((s) => s.name === trimmed) ||
      null
    );
  }

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      // 이번 저장에서 해당 연도에 부여할 역할 맵: studentId -> Set(roles)
      const desired = new Map();
      const addRole = (sid, role) => {
        if (!sid) return;
        if (!desired.has(sid)) desired.set(sid, new Set());
        desired.get(sid).add(role);
      };
      const missing = [];

      for (const svc of SERVICES) {
        for (const role of OFFICER_ROLES) {
          addRole(form[svc][role], role);
        }
        for (const [field, dept] of [['praise', '찬양팀'], ['worship', '예배팀']]) {
          const names = (form[svc][field] || '')
            .split(/[,\n]/)
            .map((n) => n.trim())
            .filter(Boolean);
          for (const n of names) {
            const found = findByName(n, svc);
            if (!found) {
              missing.push(`${svc} ${dept} "${n}"`);
              continue;
            }
            addRole(found.id, dept);
          }
        }
      }

      // 각 학생 문서의 ministryTeams[year] 를 재구성해서 배치 업데이트
      const MANAGED = new Set([...OFFICER_ROLES, '찬양팀', '예배팀']);
      const batch = writeBatch(db);
      let updates = 0;

      for (const s of students) {
        const currentList = (s.ministryTeams || []).map((m) => ({
          year: Number(m.year),
          departments: [...(m.departments || (m.department ? [m.department] : []))],
        }));
        const { idx, entry } = pickYearEntry(currentList, year);
        const originalDepts = idx >= 0 ? [...currentList[idx].departments] : [];

        // 관리 대상 역할 제거 후 원하는 역할 추가
        const preserved = originalDepts.filter((d) => !MANAGED.has(d));
        const wantRoles = [...(desired.get(s.id) || [])];
        const nextDepts = [...preserved, ...wantRoles];

        const changed =
          nextDepts.length !== originalDepts.length ||
          !nextDepts.every((d) => originalDepts.includes(d)) ||
          !originalDepts.every((d) => nextDepts.includes(d));

        if (!changed) continue;

        let nextList;
        if (nextDepts.length === 0) {
          nextList = currentList.filter((m) => Number(m.year) !== Number(year));
        } else {
          entry.departments = nextDepts;
          nextList = idx >= 0
            ? currentList.map((m, i) => (i === idx ? entry : m))
            : [...currentList, entry];
        }

        batch.update(doc(db, 'students', s.id), { ministryTeams: nextList });
        updates++;
      }

      if (updates > 0) await batch.commit();

      let msgText = `✅ 저장 완료 (${updates}명 업데이트)`;
      if (missing.length > 0) msgText += `\n⚠️ 학생을 찾지 못함: ${missing.join(', ')}`;
      setMsg(msgText);
      await loadStudents();
    } catch (err) {
      console.error(err);
      setMsg('❌ 저장 중 오류: ' + err.message);
    }
    setSaving(false);
  }

  if (loading) return <div className="text-center py-8 text-gray-400">불러오는 중...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">👑 임원 학생 & 찬양팀·예배팀</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">연도</label>
          <select
            className="input"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-xs text-gray-500 mb-4">
        저장하면 학생 정보의 사역 이력에 반영되어, 사역팀 & 기도모임 명단에 자동 표시됩니다.
      </div>

      <div className="space-y-6">
        {SERVICES.map((svc) => {
          const svcStudents = studentsByService[svc];
          return (
            <div key={svc} className="card">
              <h3 className="text-lg font-bold text-gray-800 mb-3">
                {svc}
                <span className="text-xs text-gray-400 ml-2 font-normal">
                  ({svcStudents.length}명)
                </span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                {OFFICER_ROLES.map((role) => (
                  <div key={role}>
                    <label className="label">
                      {role === '회장' ? '👑 ' : role === '부회장' ? '🥈 ' : '📋 '}
                      {role}
                    </label>
                    <select
                      className="input"
                      value={form[svc][role]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [svc]: { ...form[svc], [role]: e.target.value },
                        })
                      }
                    >
                      <option value="">— 없음 —</option>
                      {svcStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.grade ? ` (${s.grade})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mb-3">
                <label className="label">
                  🎤 찬양팀 <span className="text-xs text-gray-400">(이름을 콤마로 구분, 예: 홍길동, 김철수, 이영희)</span>
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="이름1, 이름2, 이름3"
                  value={form[svc].praise}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [svc]: { ...form[svc], praise: e.target.value },
                    })
                  }
                />
              </div>

              <div>
                <label className="label">
                  🙏 예배팀 <span className="text-xs text-gray-400">(이름을 콤마로 구분)</span>
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="이름1, 이름2, 이름3"
                  value={form[svc].worship}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [svc]: { ...form[svc], worship: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {msg && (
        <div className="mt-4 whitespace-pre-line text-sm p-3 rounded-lg bg-gray-50 border border-gray-200">
          {msg}
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full"
        >
          {saving ? '저장 중...' : '💾 저장 (학생 정보에 반영)'}
        </button>
      </div>
    </div>
  );
}
