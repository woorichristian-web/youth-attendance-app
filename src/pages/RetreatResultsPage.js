import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const GRADE_ORDER = ['중1', '중2', '중3', '고1', '고2', '고3'];

// 수련회 신청 결과 페이지 — 신청자 목록 + 집계 (관리자 전용)
export default function RetreatResultsPage() {
  const { retreatId } = useParams();
  const [retreat, setRetreat] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('student');

  useEffect(() => {
    const u1 = onSnapshot(doc(db, 'retreats', retreatId), (snap) => {
      setRetreat(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db, 'retreat_applications'), (snap) => {
      setApplications(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((a) => a.retreatId === retreatId)
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      );
    });
    return () => { u1(); u2(); };
  }, [retreatId]);

  const stats = useMemo(() => {
    const st = applications.filter((a) => a.audience === 'student');
    const tc = applications.filter((a) => a.audience === 'teacher');
    const count = (list, fn) => list.filter(fn).length;
    const gradeCounts = {};
    st.forEach((a) => { if (a.grade) gradeCounts[a.grade] = (gradeCounts[a.grade] || 0) + 1; });
    return {
      total: applications.length,
      student: st.length,
      teacher: tc.length,
      full: count(applications, (a) => a.attendType === '전체참석'),
      partial: count(applications, (a) => a.attendType === '부분참석'),
      svc1: count(applications, (a) => a.service === '1부'),
      svc2: count(applications, (a) => a.service === '2부'),
      gradeCounts,
    };
  }, [applications]);

  async function removeApp(a) {
    if (!window.confirm(`${a.name}님의 신청을 삭제할까요?`)) return;
    await deleteDoc(doc(db, 'retreat_applications', a.id));
  }

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-10 text-center text-stone-400 text-sm">불러오는 중...</div>;
  }
  if (!retreat) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 text-center">
        <p className="text-stone-600">수련회를 찾을 수 없습니다.</p>
        <Link to="/admin-home?m=admin_office" className="text-teal-700 text-sm hover:underline mt-2 inline-block">← 목회행정으로 돌아가기</Link>
      </div>
    );
  }

  const list = applications.filter((a) => a.audience === tab);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 admin-theme">
      {/* 헤더 */}
      <div className="mb-5 pb-4 border-b border-stone-200 flex items-end justify-between flex-wrap gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-medium mb-1">Retreat Results</p>
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">⛺ {retreat.title} — 신청 결과</h1>
          <div className="text-xs text-stone-500 mt-1">
            {[retreat.schedule, retreat.place, retreat.theme].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Link to="/admin-home?m=admin_office"
          className="text-sm text-stone-500 hover:text-teal-700">← 목회행정</Link>
      </div>

      {/* 집계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatCard label="총 신청" value={`${stats.total}명`} strong />
        <StatCard label="학생 / 교사" value={`${stats.student} / ${stats.teacher}명`} />
        <StatCard label="전체참석 / 부분참석" value={`${stats.full} / ${stats.partial}명`} />
        <StatCard label="1부 / 2부" value={`${stats.svc1} / ${stats.svc2}명`} />
      </div>
      {Object.keys(stats.gradeCounts).length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3 flex-wrap text-sm">
          <span className="text-xs text-stone-400 font-medium">학년별</span>
          {GRADE_ORDER.filter((g) => stats.gradeCounts[g]).map((g) => (
            <span key={g} className="text-stone-700">
              {g} <b className="text-teal-700">{stats.gradeCounts[g]}</b>
            </span>
          ))}
        </div>
      )}

      {/* 학생/교사 탭 */}
      <div className="flex gap-1 mb-4 bg-white/60 rounded-xl p-1 w-fit">
        {[
          { id: 'student', label: `학생 신청 (${stats.student})` },
          { id: 'teacher', label: `교사 신청 (${stats.teacher})` },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-teal-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 신청자 목록 */}
      {list.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl text-center text-stone-400 py-10 text-sm">
          아직 신청이 없습니다.
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100 bg-stone-50">
                  <th className="text-left font-medium px-3 py-2.5">#</th>
                  <th className="text-left font-medium px-3 py-2.5">제출일시</th>
                  <th className="text-left font-medium px-3 py-2.5">이름</th>
                  <th className="text-left font-medium px-3 py-2.5">부서</th>
                  {tab === 'student' ? (
                    <>
                      <th className="text-left font-medium px-3 py-2.5">학년</th>
                      <th className="text-left font-medium px-3 py-2.5">반</th>
                      <th className="text-left font-medium px-3 py-2.5">선생님</th>
                    </>
                  ) : (
                    <th className="text-left font-medium px-3 py-2.5">담당</th>
                  )}
                  <th className="text-left font-medium px-3 py-2.5">참석</th>
                  <th className="text-left font-medium px-3 py-2.5">부분참석 시기</th>
                  <th className="text-left font-medium px-3 py-2.5">기대되는 것</th>
                  <th className="text-left font-medium px-3 py-2.5">기도제목</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((a, i) => (
                  <tr key={a.id} className="border-b border-stone-50 last:border-0 align-top hover:bg-stone-50/60">
                    <td className="px-3 py-2.5 text-stone-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5 text-stone-400 text-xs">{fmtDate(a.createdAt)}</td>
                    <td className="px-3 py-2.5 font-semibold text-stone-900">{a.name}</td>
                    <td className="px-3 py-2.5 text-stone-600">{a.service}</td>
                    {tab === 'student' ? (
                      <>
                        <td className="px-3 py-2.5 text-stone-600">{a.grade || '-'}</td>
                        <td className="px-3 py-2.5 text-stone-600">{a.className || '-'}</td>
                        <td className="px-3 py-2.5 text-stone-600">{a.teacherName || '-'}</td>
                      </>
                    ) : (
                      <td className="px-3 py-2.5 text-stone-600">{a.role || '-'}</td>
                    )}
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.attendType === '전체참석' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {a.attendType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-stone-600 whitespace-pre-wrap max-w-[180px]">{a.partialWhen || '-'}</td>
                    <td className="px-3 py-2.5 text-stone-600 whitespace-pre-wrap max-w-[240px]">{a.expectation || '-'}</td>
                    <td className="px-3 py-2.5 text-stone-600 whitespace-pre-wrap max-w-[240px]">{a.prayer || '-'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => removeApp(a)}
                        className="text-xs text-stone-300 hover:text-red-500">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, strong }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl px-4 py-3.5">
      <div className="text-xs font-medium text-stone-400">{label}</div>
      <div className={`text-xl font-bold mt-0.5 tracking-tight ${strong ? 'text-teal-700' : 'text-stone-800'}`}>{value}</div>
    </div>
  );
}
