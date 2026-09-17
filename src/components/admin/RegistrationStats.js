import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { getSundaysInMonth } from '../../utils/dateUtils';
import { isExcludedDate } from '../../utils/excludedDates';
import { isRegistered, REGISTERED_DESCRIPTION } from '../../utils/statusUtils';
import { getEffectiveJoinDate } from '../../utils/redFlag';

// 학생의 출석 상세 (joinDate 이후 + alternateIds 포함)
function calcStudentRateDetail(student, attendanceList, todayStr) {
  const joinDate = getEffectiveJoinDate(student, attendanceList);
  const allIds = [student.id, ...(student.alternateIds || [])];

  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;
  let allSundays = [];
  for (let y = 2026; y <= endYear; y++) {
    const mEnd = y === endYear ? endMonth : 12;
    for (let m = 1; m <= mEnd; m++) {
      allSundays.push(...getSundaysInMonth(y, m));
    }
  }
  allSundays = allSundays.filter((s) => s <= todayStr).filter((s) => !isExcludedDate(s));
  if (joinDate) allSundays = allSundays.filter((s) => s >= joinDate);
  if (allSundays.length === 0) return null;

  const attendedSundays = new Set();
  allSundays.forEach((sunday) => {
    for (const rec of attendanceList) {
      if (rec.date !== sunday) continue;
      const r = rec.records?.find((rr) => allIds.includes(rr.studentId));
      if (r?.present) { attendedSundays.add(sunday); break; }
    }
  });
  return {
    rate: (attendedSundays.size / allSundays.length) * 100,
    attended: attendedSundays.size,
    possible: allSundays.length,
    absences: allSundays.length - attendedSundays.size,
  };
}

// 월별 평균 출석률 (1부/2부/전체)
function calcMonthlyAverage(attendanceList, year, month, service) {
  let sundays = getSundaysInMonth(year, month).filter((s) => !isExcludedDate(s));
  const todayStr = new Date().toISOString().slice(0, 10);
  sundays = sundays.filter((s) => s <= todayStr);
  if (sundays.length === 0) return null;

  let present = 0, total = 0;
  sundays.forEach((sunday) => {
    attendanceList
      .filter((a) => sunday === a.date && (service === '전체' || a.service === service))
      .forEach((rec) => {
        rec.records?.forEach((r) => {
          total++;
          if (r.present) present++;
        });
      });
  });
  if (total === 0) return null;
  return Math.round((present / total) * 1000) / 10;
}

export default function RegistrationStats() {
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // 시간 기반 재계산용

  // 일요일에만 1시간마다 자동 재계산 — 다른 요일에는 갱신 안 함
  useEffect(() => {
    const id = setInterval(() => {
      // 매 시간 체크: 오늘이 일요일일 때만 tick 증가
      if (new Date().getDay() === 0) {
        setTick((t) => t + 1);
      }
    }, 60 * 60 * 1000); // 1시간
    return () => clearInterval(id);
  }, []);

  // 실시간 구독 — Firestore 변경 시 자동 업데이트
  useEffect(() => {
    let firstStudents = false;
    let firstAttendance = false;
    const checkLoaded = () => { if (firstStudents && firstAttendance) setLoading(false); };

    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      firstStudents = true;
      checkLoaded();
    });
    const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map((d) => d.data()));
      firstAttendance = true;
      checkLoaded();
    });
    return () => { unsubStudents(); unsubAttendance(); };
  }, []);

  // 등록 성도: 타교회이동/부서이동/기타비활성 모두 제외 (A방안 통일 기준)
  const activeStudents = useMemo(
    () => students.filter(isRegistered),
    [students]
  );

  // 부서별 카운트
  const count1 = activeStudents.filter((s) => s.service === '1부').length;
  const count2 = activeStudents.filter((s) => s.service === '2부').length;
  const countOther = activeStudents.length - count1 - count2;

  // 월별 평균 (1월~현재)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const yr = now.getFullYear();
    const endMonth = now.getMonth() + 1;
    const months = [];
    for (let m = 1; m <= endMonth; m++) {
      months.push({
        label: `${m}월`,
        year: yr, month: m,
        avg1: calcMonthlyAverage(attendance, yr, m, '1부'),
        avg2: calcMonthlyAverage(attendance, yr, m, '2부'),
      });
    }
    return months;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, tick]);

  // 성별 분포
  const genderDist = useMemo(() => {
    const counts = { 남: 0, 여: 0, 미입력: 0 };
    activeStudents.forEach((s) => {
      if (s.gender === '남') counts.남++;
      else if (s.gender === '여') counts.여++;
      else counts.미입력++;
    });
    return counts;
  }, [activeStudents]);

  // 전체 출석가능 일요일 수 T 계산 (1월~현재, 제외일 제외)
  const globalT = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yr = now.getFullYear();
    const endM = now.getMonth() + 1;
    let sundays = [];
    for (let m = 1; m <= endM; m++) {
      sundays.push(...getSundaysInMonth(yr, m));
    }
    return sundays.filter(s => s <= todayStr).filter(s => !isExcludedDate(s)).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // 동적 경계 — 비교용(원본)과 표시용(반올림) 분리
  // 1~2회 결석자들: (T-2)/T ~ (T-1)/T
  const lower1Raw = globalT > 0 ? ((globalT - 2) / globalT) * 100 : 90;
  const upper1Raw = globalT > 0 ? ((globalT - 1) / globalT) * 100 : 95;
  const lower1 = Math.round(lower1Raw * 100) / 100;
  const upper1 = Math.round(upper1Raw * 100) / 100;
  // 3~5회 결석자들: (T-5)/T ~ (T-3)/T
  const lower2Raw = globalT > 0 ? ((globalT - 5) / globalT) * 100 : 75;
  const upper2Raw = globalT > 0 ? ((globalT - 3) / globalT) * 100 : 85;
  const lower2 = Math.round(lower2Raw * 100) / 100;
  const upper2 = Math.round(upper2Raw * 100) / 100;
  // 그 아래 ~ 51% (정수)
  const upperHigh = Math.max(51, Math.floor(lower2Raw) - 1);

  // 학생별 출석율 분포 (T 기준 동적 구간)
  const { distribution, bucketStudents } = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const buckets = { perfect: 0, fewAbsences: 0, midAbsences: 0, high: 0, mid: 0, low: 0, zero: 0, noData: 0 };
    const lists = { perfect: [], fewAbsences: [], midAbsences: [], high: [], mid: [], low: [], zero: [], noData: [] };
    activeStudents.forEach((s) => {
      const result = calcStudentRateDetail(s, attendance, todayStr);
      if (result === null) { buckets.noData++; lists.noData.push({ ...s, rate: null }); return; }
      const { rate, absences } = result;
      const rounded = Math.round(rate * 10) / 10;
      const entry = { ...s, rate: rounded, absences };
      // 비교는 원본 rate vs raw 경계값으로 (반올림 오차 방지)
      const EPS = 0.0001;
      if (rate >= 100 - EPS) { buckets.perfect++; lists.perfect.push(entry); }
      else if (rate >= lower1Raw - EPS && rate <= upper1Raw + EPS) { buckets.fewAbsences++; lists.fewAbsences.push(entry); }
      else if (rate >= lower2Raw - EPS && rate <= upper2Raw + EPS) { buckets.midAbsences++; lists.midAbsences.push(entry); }
      else if (rate >= 51) { buckets.high++; lists.high.push(entry); }
      else if (rate >= 21) { buckets.mid++; lists.mid.push(entry); }
      else if (rate >= 1) { buckets.low++; lists.low.push(entry); }
      else { buckets.zero++; lists.zero.push(entry); }
    });
    // 정렬: 출석율 내림차순 → 이름 가나다순
    Object.keys(lists).forEach((k) => {
      lists[k].sort((a, b) => {
        if ((b.rate ?? -1) !== (a.rate ?? -1)) return (b.rate ?? -1) - (a.rate ?? -1);
        return (a.name || '').localeCompare(b.name || '', 'ko');
      });
    });
    return { distribution: buckets, bucketStudents: lists };
  // tick 의존성: 시간 흐름에 따라 자동 재계산
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudents, attendance, tick, lower1Raw, upper1Raw, lower2Raw, upper2Raw]);

  if (loading) {
    return <div className="text-center py-12 text-gray-400">데이터를 불러오는 중...</div>;
  }

  // 라인 그래프 좌표 계산
  const CHART_W = 600, CHART_H = 220, PAD_L = 25, PAD_R = 25, PAD_T = 18, PAD_B = 48;
  const innerW = CHART_W - PAD_L - PAD_R;
  const innerH = CHART_H - PAD_T - PAD_B;
  const monthCount = monthlyData.length;
  const xStep = monthCount > 1 ? innerW / (monthCount - 1) : 0;
  const yMax = 100;
  const xOf = (i) => PAD_L + i * xStep;
  const yOf = (v) => PAD_T + innerH - (v / yMax) * innerH;
  const buildPath = (key) => {
    let d = '';
    let started = false;
    monthlyData.forEach((m, i) => {
      const v = m[key];
      if (v === null || v === undefined) return;
      if (!started) { d += `M ${xOf(i)} ${yOf(v)}`; started = true; }
      else d += ` L ${xOf(i)} ${yOf(v)}`;
    });
    return d;
  };
  const path1 = buildPath('avg1');
  const path2 = buildPath('avg2');

  // 성별 파이차트 (남/여)
  const genderTotal = genderDist.남 + genderDist.여;
  const genderSlices = genderTotal === 0 ? [] : [
    { label: '남', value: genderDist.남, color: '#3b82f6' },
    { label: '여', value: genderDist.여, color: '#ec4899' },
  ].filter((s) => s.value > 0);
  const cxG = 100, cyG = 100, rG = 90;
  let cumG = -Math.PI / 2;
  const genderPaths = genderSlices.map((s) => {
    const angle = (s.value / genderTotal) * 2 * Math.PI;
    const x1 = cxG + rG * Math.cos(cumG);
    const y1 = cyG + rG * Math.sin(cumG);
    cumG += angle;
    const x2 = cxG + rG * Math.cos(cumG);
    const y2 = cyG + rG * Math.sin(cumG);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cxG} ${cyG} L ${x1} ${y1} A ${rG} ${rG} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...s, path, percent: Math.round((s.value / genderTotal) * 100) };
  });

  // 파이차트 데이터 (출석률 분포)
  const total = distribution.perfect + distribution.fewAbsences + distribution.midAbsences + distribution.high + distribution.mid + distribution.low + distribution.zero;
  const fewAbsLabel = `${lower1}%~${upper1}% (1~2회 결석자들)`;
  const midAbsLabel = `${lower2}%~${upper2}% (3~5회 결석자들)`;
  const highLabel = `51%~${upperHigh}%`;
  const pieSlices = total === 0 ? [] : [
    { key: 'perfect',     label: '100% 출석',     value: distribution.perfect,     color: '#059669' },
    { key: 'fewAbsences', label: fewAbsLabel,     value: distribution.fewAbsences, color: '#84cc16' },
    { key: 'midAbsences', label: midAbsLabel,     value: distribution.midAbsences, color: '#22d3ee' },
    { key: 'high',        label: highLabel,       value: distribution.high,        color: '#34d399' },
    { key: 'mid',         label: '21%~50%',       value: distribution.mid,         color: '#f59e0b' },
    { key: 'low',         label: '1%~20%',        value: distribution.low,         color: '#ea580c' },
    { key: 'zero',        label: '0%',            value: distribution.zero,        color: '#dc2626' },
  ].filter((s) => s.value > 0);

  // 파이차트 SVG path 계산
  const cx = 100, cy = 100, r = 90;
  let cumAngle = -Math.PI / 2;
  const piePaths = pieSlices.map((s) => {
    const angle = (s.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = cx + r * Math.cos(cumAngle);
    const y2 = cy + r * Math.sin(cumAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...s, path, percent: Math.round((s.value / total) * 100) };
  });

  return (
    <div className="space-y-5">
      {/* 안내 문구 (인라인) */}
      <p className="text-xs text-slate-500">
        · 인원 계산 기준: {REGISTERED_DESCRIPTION}
      </p>

      {/* 인포그래픽 카드 — 뉴트럴 톤 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-xs text-slate-500 mb-1">전체 등록 성도</div>
          <div className="text-3xl font-semibold text-slate-900">{activeStudents.length}</div>
          <div className="text-xs text-slate-400 mt-1">명</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> 1부 예배
          </div>
          <div className="text-3xl font-semibold text-slate-900">{count1}</div>
          <div className="text-xs text-slate-400 mt-1">명</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> 2부 예배
          </div>
          <div className="text-3xl font-semibold text-slate-900">{count2}</div>
          <div className="text-xs text-slate-400 mt-1">명</div>
        </div>
      </div>
      {countOther > 0 && (
        <div className="text-xs text-slate-400 text-right">반 미정 {countOther}명 포함</div>
      )}

      {/* 월별 평균 선그래프 */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800">📈 월별 평균 출석률</h3>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 bg-emerald-500"></div>
              <span className="text-emerald-700 font-medium">1부</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 bg-violet-500"></div>
              <span className="text-violet-700 font-medium">2부</span>
            </div>
          </div>
        </div>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full">
          {/* 그리드 가이드라인 (더 진하게) */}
          {[0, 25, 50, 75, 100].map((y) => (
            <line key={y} x1={PAD_L} y1={yOf(y)} x2={CHART_W - PAD_R} y2={yOf(y)}
              stroke="#9ca3af" strokeDasharray="4,4" strokeWidth="1" />
          ))}
          {/* X축 라벨 (월 숫자) */}
          {monthlyData.map((m, i) => (
            <text key={m.label} x={xOf(i)} y={CHART_H - PAD_B + 18}
              fontSize="12" fill="#6b7280" textAnchor="middle">{m.month}</text>
          ))}
          {/* "월" 단위 표기 — 숫자에서 여유 두고 */}
          <text x={(PAD_L + CHART_W - PAD_R) / 2} y={CHART_H - 6}
            fontSize="11" fill="#9ca3af" textAnchor="middle">월</text>

          {/* 1부 선 (1부 라벨은 점 아래, 2부 라벨은 점 위 — 겹침 방지) */}
          <path d={path1} stroke="#10b981" strokeWidth="1.5" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
          {monthlyData.map((m, i) => m.avg1 !== null && (
            <g key={`p1-${i}`}>
              <circle cx={xOf(i)} cy={yOf(m.avg1)} r="3.5" fill="#10b981" />
              <text x={xOf(i)} y={yOf(m.avg1) + 16} fontSize="11" fill="#047857"
                textAnchor="middle" fontWeight="700"
                paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
                {m.avg1}
              </text>
            </g>
          ))}
          {/* 2부 선 */}
          <path d={path2} stroke="#8b5cf6" strokeWidth="1.5" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
          {monthlyData.map((m, i) => m.avg2 !== null && (
            <g key={`p2-${i}`}>
              <circle cx={xOf(i)} cy={yOf(m.avg2)} r="3.5" fill="#8b5cf6" />
              <text x={xOf(i)} y={yOf(m.avg2) - 9} fontSize="11" fill="#6d28d9"
                textAnchor="middle" fontWeight="700"
                paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
                {m.avg2}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* 출석률 분포 파이차트 */}
      <div className="card">
        <div className="flex items-end justify-between gap-2 mb-3 flex-wrap">
          <h3 className="font-bold text-gray-800">🥧 출석률 분포</h3>
          <span className="text-xs text-gray-400">
            2026년 1월~현재 · 1부+2부 통합 누적 출석률
          </span>
        </div>

        {/* 공식 안내 */}
        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
          <div className="font-semibold mb-1 text-slate-800">출석률 계산식</div>
          <div className="font-mono text-[13px] text-slate-900">
            출석률 = (실제 출석 횟수 ÷ 총 일요일 횟수) × 100
          </div>
          <div className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">
            · 총 일요일 횟수 <span className="font-bold">T = {globalT}</span> (1월~현재, 수련회·명절 제외)
            <br />
            · 1회 결석 = <span className="font-mono">({globalT}−1)/{globalT} × 100 ≈ {upper1}%</span>
            <br />
            · 2회 결석 = <span className="font-mono">({globalT}−2)/{globalT} × 100 ≈ {lower1}%</span>
            <br />
            · 3회 결석 = <span className="font-mono">({globalT}−3)/{globalT} × 100 ≈ {upper2}%</span>
            <br />
            · 5회 결석 = <span className="font-mono">({globalT}−5)/{globalT} × 100 ≈ {lower2}%</span>
          </div>
        </div>
        {pieSlices.length === 0 ? (
          <div className="text-center text-gray-400 py-8">데이터가 부족합니다.</div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            <svg viewBox="0 0 200 200" className="w-44 h-44 flex-shrink-0">
              {piePaths.map((p, i) => (
                <path key={i} d={p.path} fill={p.color} stroke="#fff" strokeWidth="2" />
              ))}
            </svg>
            <div className="flex-1 min-w-[150px] space-y-2">
              {piePaths.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: p.color }}></div>
                    <span className="text-sm text-gray-700">{p.label}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800">
                    {p.value}명 <span className="text-xs text-gray-400">({p.percent}%)</span>
                  </div>
                </div>
              ))}
              {distribution.noData > 0 && (
                <div className="text-xs text-gray-400 pt-2 border-t border-gray-100 mt-2">
                  · 출석 기록 없음: {distribution.noData}명
                </div>
              )}
            </div>
          </div>
        )}

        {/* 구간별 학생 명단 */}
        {pieSlices.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
            {piePaths.map((p) => {
              const list = bucketStudents[p.key] || [];
              if (list.length === 0) return null;
              return (
                <div key={p.key} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: p.color }}></div>
                    <span className="text-sm font-bold" style={{ color: p.color }}>{p.label}</span>
                    <span className="text-xs text-gray-400">{list.length}명</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((s) => (
                      <span key={s.id}
                        className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1"
                        title={`${s.name} · ${s.rate}%`}>
                        <span className="font-medium text-gray-800">{s.name}</span>
                        <span className="text-gray-400 ml-1">{s.rate}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 성별 파이차트 (맨 아래) */}
      <div className="card">
        <h3 className="font-bold text-gray-800 mb-3">👥 남녀 비율</h3>
        {genderSlices.length === 0 ? (
          <div className="text-center text-gray-400 py-6 text-sm">데이터가 없습니다.</div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            <svg viewBox="0 0 200 200" className="w-36 h-36 flex-shrink-0">
              {genderPaths.map((p, i) => (
                <path key={i} d={p.path} fill={p.color} stroke="#fff" strokeWidth="2" />
              ))}
            </svg>
            <div className="flex-1 min-w-[140px] space-y-2">
              {genderPaths.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: p.color }}></div>
                    <span className="text-sm text-gray-700">{p.label}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800">
                    {p.value}명 <span className="text-xs text-gray-400">({p.percent}%)</span>
                  </div>
                </div>
              ))}
              {genderDist.미입력 > 0 && (
                <div className="text-xs text-gray-400 pt-2 border-t border-gray-100 mt-2">
                  · 성별 미입력: {genderDist.미입력}명
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
