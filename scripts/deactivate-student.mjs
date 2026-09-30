// 학생 기타비활성(inactive) 처리 + 지정일 이후 결석 기록 제거 스크립트
// - 학생의 status='inactive', active=false 로 변경 (등록 성도/명단/통계에서 제외)
// - INACTIVE_FROM(YYYY-MM-DD) 지정 시, 그 날짜 이후 결석(present=false) 기록을
//   출석문서에서 제거하여 "결석"으로 카운트되지 않도록 함 (present=true는 유지)
// - 학생의 전체 출석 기록을 항상 출력하여 결석 시작 시점을 확인할 수 있게 함
//
// 환경변수:
//   FIREBASE_SERVICE_ACCOUNT  서비스계정 JSON (GitHub Secret)
//   STUDENT_NAME              대상 학생 이름 (예: 정서윤)
//   INACTIVE_FROM             비활성 시작일 YYYY-MM-DD (이 날짜 이후 결석 기록 제거)
//   MODE                      dry-run(기본, 미리보기) | apply(실제 적용)

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const MODE = process.env.MODE || 'dry-run';
const STUDENT_NAME = (process.env.STUDENT_NAME || '').trim();
const INACTIVE_FROM = (process.env.INACTIVE_FROM || '').trim();
const APPLY = MODE === 'apply';

if (!STUDENT_NAME) { console.error('STUDENT_NAME 은 필수입니다.'); process.exit(1); }

// ── OAuth 토큰 발급 ──
const crypto = await import('crypto');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/cloud-platform',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
})}`;
const jwt = `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
const tokRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
});
const token = (await tokRes.json()).access_token;
if (!token) { console.error('토큰 발급 실패'); process.exit(1); }
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const P = sa.project_id;
const BASE = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;

// ── REST 헬퍼 (429/503 백오프) ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, opts = {}, label = '요청') {
  const delays = [2000, 5000, 10000, 20000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, opts);
    if (res.ok) return res;
    if ((res.status === 429 || res.status === 503) && attempt < delays.length) {
      console.log(`  ⏳ ${label} ${res.status} — ${delays[attempt] / 1000}s 후 재시도 (${attempt + 1}/${delays.length})`);
      await sleep(delays[attempt]);
      continue;
    }
    throw new Error(`${label} 실패(${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}
async function listDocs(coll) {
  let docs = [];
  let pt;
  do {
    const url = `${BASE}/${coll}?pageSize=300${pt ? `&pageToken=${encodeURIComponent(pt)}` : ''}`;
    const res = await fetchRetry(url, { headers: H }, `${coll} 조회`);
    const d = await res.json();
    docs = docs.concat(d.documents || []);
    pt = d.nextPageToken;
  } while (pt);
  return docs;
}
const idOf = (doc) => doc.name.split('/').pop();
const sv = (f) => f?.stringValue ?? '';
const bv = (f) => f?.booleanValue ?? false;

function readRecords(fields) {
  const arr = fields?.records?.arrayValue?.values || [];
  return arr.map((v) => {
    const f = v.mapValue?.fields || {};
    return { studentId: sv(f.studentId), studentName: sv(f.studentName), present: bv(f.present) };
  });
}
function toRecordsValue(records) {
  return {
    arrayValue: {
      values: records.map((r) => ({
        mapValue: { fields: {
          studentId: { stringValue: r.studentId || '' },
          studentName: { stringValue: r.studentName || '' },
          present: { booleanValue: !!r.present },
        } },
      })),
    },
  };
}
async function patchRecords(docName, records) {
  const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=records`;
  await fetchRetry(url, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { records: toRecordsValue(records) } }) }, 'records PATCH');
}
async function patchStudentInactive(sid) {
  const url = `${BASE}/students/${sid}?updateMask.fieldPaths=status&updateMask.fieldPaths=active`;
  const body = { fields: { status: { stringValue: 'inactive' }, active: { booleanValue: false } } };
  await fetchRetry(url, { method: 'PATCH', headers: H, body: JSON.stringify(body) }, '학생 상태 변경');
}

// ── 1) 학생 찾기 ──
const students = await listDocs('students');
const matches = students.filter((doc) => (sv(doc.fields?.name) || '').trim() === STUDENT_NAME);
if (matches.length === 0) { console.error(`학생 '${STUDENT_NAME}' 을(를) 찾을 수 없습니다.`); process.exit(1); }
if (matches.length > 1) {
  console.error(`이름이 같은 학생이 ${matches.length}명 있습니다:`);
  matches.forEach((m) => console.error(`  id=${idOf(m)} service=${sv(m.fields?.service)} classId=${sv(m.fields?.classId)}`));
  process.exit(1);
}
const studentDoc = matches[0];
const sid = idOf(studentDoc);
const altIds = (studentDoc.fields?.alternateIds?.arrayValue?.values || []).map((v) => v.stringValue);
const studentIds = new Set([sid, ...altIds]);
const curStatus = sv(studentDoc.fields?.status) || '(없음)';

console.log(`학생: ${STUDENT_NAME} (id=${sid})`);
console.log(`현재 상태: ${curStatus} · classId=${sv(studentDoc.fields?.classId)} · service=${sv(studentDoc.fields?.service)}`);
console.log(`모드: ${MODE}${INACTIVE_FROM ? ` · 비활성 시작일=${INACTIVE_FROM}` : ' · (비활성 시작일 미지정: 출석 기록만 확인)'}`);
console.log('─'.repeat(50));

// ── 2) 학생 출석 기록 수집 ──
const attendance = await listDocs('attendance');
const myRecs = []; // { date, present, docName, allRecords }
attendance.forEach((doc) => {
  const f = doc.fields || {};
  if (f.submitted && f.submitted.booleanValue === false) return;
  const recs = readRecords(f);
  const mine = recs.find((r) => studentIds.has(r.studentId));
  if (!mine) return;
  myRecs.push({ date: sv(f.date), present: mine.present, docName: doc.name, allRecords: recs });
});
myRecs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

console.log(`출석 기록 총 ${myRecs.length}건:`);
myRecs.forEach((r) => console.log(`  ${r.date} : ${r.present ? '출석' : '결석'}`));
console.log('─'.repeat(50));

if (!INACTIVE_FROM) {
  console.log('비활성 시작일(INACTIVE_FROM)이 지정되지 않아 출석 기록만 출력했습니다.');
  console.log('결석 시작 시점을 확인한 뒤 INACTIVE_FROM=YYYY-MM-DD 로 다시 실행하세요.');
  process.exit(0);
}

// ── 3) 제거 대상: INACTIVE_FROM 이후의 결석(present=false) 기록 ──
const toRemove = myRecs.filter((r) => r.date >= INACTIVE_FROM && r.present === false);
const keptPresentAfter = myRecs.filter((r) => r.date >= INACTIVE_FROM && r.present === true);

console.log(`상태 변경: ${curStatus} → inactive(기타비활성), active=false`);
console.log(`제거할 결석 기록(${INACTIVE_FROM} 이후): ${toRemove.length}건`);
toRemove.forEach((r) => console.log(`  ${r.date} 결석 → 기록 제거(결석 미카운트)`));
if (keptPresentAfter.length) {
  console.log(`※ ${INACTIVE_FROM} 이후 출석 기록 ${keptPresentAfter.length}건은 그대로 유지: ${keptPresentAfter.map((r) => r.date).join(', ')}`);
}
console.log('─'.repeat(50));

if (!APPLY) {
  console.log('(dry-run) 실제 변경 없음. 확인 후 MODE=apply 로 다시 실행하세요.');
  process.exit(0);
}

// ── 4) 적용 ──
let ops = 0;
for (const r of toRemove) {
  const newRecords = r.allRecords.filter((rr) => !studentIds.has(rr.studentId));
  await patchRecords(r.docName, newRecords);
  ops++;
  console.log(`제거 완료: ${r.date} 출석문서에서 ${STUDENT_NAME} 결석 기록 삭제`);
}
await patchStudentInactive(sid);
ops++;
console.log(`상태 변경 완료: ${STUDENT_NAME} → 기타비활성(inactive), active=false`);
console.log('─'.repeat(50));
console.log(`완료: 총 ${ops}건 처리`);
