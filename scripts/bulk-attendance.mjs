// 일괄 출석 입력 스크립트 (반별 결석자 명단 기반)
// - 지정 날짜/부서의 각 반에 대해: 현재 재적(active·등록) 학생 전원을 출석 처리하고,
//   결석자 명단에 있는 학생만 결석(present=false)으로 표기
// - 결석자 명단에 있으나 해당 반 현재 명단에 없는 이름은 경고로 보고(이동/비활성 등)
// - 출석문서(attendance)를 upsert (records·submitted만 갱신, 결석사유 등 기존 필드 보존)
//
// 환경변수:
//   FIREBASE_SERVICE_ACCOUNT  서비스계정 JSON (GitHub Secret)
//   PAYLOAD                   JSON 문자열:
//     { "service": "1부", "date": "2026-10-04",
//       "classes": [ { "teacher": "권윤주", "absentees": ["나호원"] }, ... ] }
//   MODE                      dry-run(기본) | apply

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const MODE = process.env.MODE || 'dry-run';
const APPLY = MODE === 'apply';
let payload;
try { payload = JSON.parse(process.env.PAYLOAD || '{}'); }
catch (e) { console.error('PAYLOAD JSON 파싱 실패:', e.message); process.exit(1); }
const SERVICE = (payload.service || '').trim();
const DATE = (payload.date || '').trim();
const CLASSES = Array.isArray(payload.classes) ? payload.classes : [];
if (!SERVICE || !DATE || CLASSES.length === 0) {
  console.error('PAYLOAD 에 service, date, classes 가 모두 필요합니다.');
  process.exit(1);
}

// ── OAuth ──
const crypto = await import('crypto');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
  aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
})}`;
const jwt = `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
const token = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
})).json()).access_token;
if (!token) { console.error('토큰 발급 실패'); process.exit(1); }
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const P = sa.project_id;
const BASE = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;

// ── REST 헬퍼 ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, opts = {}, label = '요청') {
  const delays = [2000, 5000, 10000, 20000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, opts);
    if (res.ok) return res;
    if ((res.status === 429 || res.status === 503) && attempt < delays.length) {
      console.log(`  ⏳ ${label} ${res.status} — ${delays[attempt] / 1000}s 후 재시도`);
      await sleep(delays[attempt]); continue;
    }
    throw new Error(`${label} 실패(${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}
async function listDocs(coll) {
  let docs = [], pt;
  do {
    const url = `${BASE}/${coll}?pageSize=300${pt ? `&pageToken=${encodeURIComponent(pt)}` : ''}`;
    const res = await fetchRetry(url, { headers: H }, `${coll} 조회`);
    const d = await res.json();
    docs = docs.concat(d.documents || []); pt = d.nextPageToken;
  } while (pt);
  return docs;
}
const idOf = (doc) => doc.name.split('/').pop();
const sv = (f) => f?.stringValue ?? '';
const TRANSFERRED = ['transferred_church', 'transferred_seohyeon', 'transferred_dept', 'inactive'];
const isRegistered = (fields) => {
  const s = sv(fields?.status);
  if (!s) return true;
  return !TRANSFERRED.includes(s);
};
const isActive = (fields) => fields?.active?.booleanValue !== false;

function toRecordsValue(records) {
  return { arrayValue: { values: records.map((r) => ({ mapValue: { fields: {
    studentId: { stringValue: r.studentId }, studentName: { stringValue: r.studentName },
    present: { booleanValue: !!r.present },
  } } })) } };
}

// ── 데이터 로드 ──
const [classes, students, attendance] = await Promise.all([
  listDocs('classes'), listDocs('students'), listDocs('attendance'),
]);
// 기존 출석문서 인덱스 (date+service+classId → doc)
const attByKey = {};
attendance.forEach((doc) => {
  const f = doc.fields || {};
  attByKey[`${sv(f.date)}__${sv(f.service)}__${sv(f.classId)}`] = doc;
});

console.log(`일괄 출석 입력 · ${SERVICE} · ${DATE} · 반 ${CLASSES.length}개 · 모드: ${MODE}`);
console.log('='.repeat(55));

const writes = []; // { docName|null, docId, fields..., records }
for (const entry of CLASSES) {
  const teacher = (entry.teacher || '').trim();
  const absentees = (entry.absentees || []).map((n) => n.trim());
  const cls = classes.find((c) => sv(c.fields?.teacherName) === teacher && sv(c.fields?.service) === SERVICE);
  if (!cls) { console.log(`❌ 반 못찾음: ${SERVICE} ${teacher} 선생님 — 건너뜀`); continue; }
  const classId = idOf(cls);
  const roster = students.filter((s) => sv(s.fields?.classId) === classId && isRegistered(s.fields) && isActive(s.fields));
  const rosterNames = roster.map((s) => sv(s.fields?.name));

  const records = roster.map((s) => {
    const nm = sv(s.fields?.name);
    return { studentId: idOf(s), studentName: nm, present: !absentees.includes(nm) };
  });
  const matchedAbsent = absentees.filter((a) => rosterNames.includes(a));
  const unmatched = absentees.filter((a) => !rosterNames.includes(a));
  const presentCount = records.filter((r) => r.present).length;

  console.log(`\n▶ ${teacher} 선생님반 (명단 ${roster.length}명)`);
  console.log(`  출석 ${presentCount} / 결석 ${matchedAbsent.length}`);
  if (matchedAbsent.length) console.log(`  결석: ${matchedAbsent.join(', ')}`);
  if (unmatched.length) console.log(`  ⚠ 명단에 없는 결석자(이동/비활성 등, 제외): ${unmatched.join(', ')}`);

  const key = `${DATE}__${SERVICE}__${classId}`;
  const existing = attByKey[key];
  writes.push({
    existing, classId, teacherId: sv(cls.fields?.teacherId), teacherName: teacher, records,
  });
  if (existing) console.log(`  (기존 출석문서 갱신: records·submitted)`);
  else console.log(`  (새 출석문서 생성)`);
}

console.log('\n' + '='.repeat(55));
if (!APPLY) {
  console.log('(dry-run) 실제 변경 없음. 확인 후 MODE=apply 로 다시 실행하세요.');
  process.exit(0);
}

// ── 적용 ──
let ops = 0;
for (const w of writes) {
  if (w.existing) {
    const url = `https://firestore.googleapis.com/v1/${w.existing.name}?updateMask.fieldPaths=records&updateMask.fieldPaths=submitted`;
    await fetchRetry(url, { method: 'PATCH', headers: H, body: JSON.stringify({
      fields: { records: toRecordsValue(w.records), submitted: { booleanValue: true } },
    }) }, '출석 갱신');
  } else {
    const docId = `${DATE}_${SERVICE}_${w.classId}`;
    const url = `${BASE}/attendance?documentId=${encodeURIComponent(docId)}`;
    await fetchRetry(url, { method: 'POST', headers: H, body: JSON.stringify({ fields: {
      date: { stringValue: DATE }, service: { stringValue: SERVICE }, classId: { stringValue: w.classId },
      teacherId: { stringValue: w.teacherId }, teacherName: { stringValue: w.teacherName },
      records: toRecordsValue(w.records), submitted: { booleanValue: true },
    } }) }, '출석 생성');
  }
  ops++;
  console.log(`처리 완료: ${w.teacherName} 선생님반`);
}
console.log('─'.repeat(55));
console.log(`완료: 총 ${ops}개 반 처리`);
