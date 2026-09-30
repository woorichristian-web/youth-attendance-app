// 학생 반 이동 + 출석기록 이관 스크립트
// - 학생의 classId/service 를 대상 반으로 갱신 (이미 이동돼 있어도 idempotent)
// - 이전 반 출석문서(attendance)에 남아있는 해당 학생 기록을 대상 반 문서로 이동
// - 최근 N주(기본 4주) 주일은 모두 출석(present=true)으로 표기
//
// 환경변수:
//   FIREBASE_SERVICE_ACCOUNT  서비스계정 JSON (GitHub Secret)
//   STUDENT_NAME              이동할 학생 이름 (예: 박서령)
//   TO_TEACHER                대상 반 담임 이름 (예: 이명희)
//   TO_SERVICE               대상 반 부서 (예: 2부)
//   WEEKS_PRESENT            최근 며칠 주일을 출석 처리할지 (기본 4, 0이면 미적용)
//   MODE                     dry-run(기본, 미리보기) | apply(실제 적용)

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const MODE = process.env.MODE || 'dry-run';
const STUDENT_NAME = (process.env.STUDENT_NAME || '').trim();
const TO_TEACHER = (process.env.TO_TEACHER || '').trim();
const TO_SERVICE = (process.env.TO_SERVICE || '').trim();
const WEEKS_PRESENT = parseInt(process.env.WEEKS_PRESENT ?? '4', 10);
const APPLY = MODE === 'apply';

if (!STUDENT_NAME || !TO_TEACHER || !TO_SERVICE) {
  console.error('STUDENT_NAME, TO_TEACHER, TO_SERVICE 는 필수입니다.');
  process.exit(1);
}

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

// ── Firestore REST 헬퍼 ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 429/503 등 일시적 오류 시 지수 백오프 재시도
async function fetchRetry(url, opts = {}, label = '요청') {
  const delays = [2000, 5000, 10000, 20000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, opts);
    if (res.ok) return res;
    if ((res.status === 429 || res.status === 503) && attempt < delays.length) {
      const body = await res.text();
      console.log(`  ⏳ ${label} ${res.status} — ${delays[attempt] / 1000}s 후 재시도 (${attempt + 1}/${delays.length})`);
      if (attempt === 0) console.log(`     ${body.slice(0, 160)}`);
      await sleep(delays[attempt]);
      continue;
    }
    const errBody = await res.text();
    throw new Error(`${label} 실패(${res.status}): ${errBody.slice(0, 300)}`);
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

// records(arrayValue) → JS 배열
function readRecords(fields) {
  const arr = fields?.records?.arrayValue?.values || [];
  return arr.map((v) => {
    const f = v.mapValue?.fields || {};
    return { studentId: sv(f.studentId), studentName: sv(f.studentName), present: bv(f.present) };
  });
}
// JS 배열 → records(arrayValue) 타입
function toRecordsValue(records) {
  return {
    arrayValue: {
      values: records.map((r) => ({
        mapValue: {
          fields: {
            studentId: { stringValue: r.studentId || '' },
            studentName: { stringValue: r.studentName || '' },
            present: { booleanValue: !!r.present },
          },
        },
      })),
    },
  };
}

async function patchRecords(docName, records) {
  const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=records`;
  await fetchRetry(url, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { records: toRecordsValue(records) } }) }, 'records PATCH');
}

async function createAttendanceDoc(docId, { date, service, classId, teacherId, teacherName, records }) {
  const url = `${BASE}/attendance?documentId=${encodeURIComponent(docId)}`;
  const body = {
    fields: {
      date: { stringValue: date },
      service: { stringValue: service },
      classId: { stringValue: classId },
      teacherId: { stringValue: teacherId || '' },
      teacherName: { stringValue: teacherName || '' },
      records: toRecordsValue(records),
      submitted: { booleanValue: true },
    },
  };
  await fetchRetry(url, { method: 'POST', headers: H, body: JSON.stringify(body) }, 'attendance 생성');
}

async function patchStudentClass(sid, classId, service) {
  const url = `${BASE}/students/${sid}?updateMask.fieldPaths=classId&updateMask.fieldPaths=service&updateMask.fieldPaths=active`;
  const body = { fields: { classId: { stringValue: classId }, service: { stringValue: service }, active: { booleanValue: true } } };
  await fetchRetry(url, { method: 'PATCH', headers: H, body: JSON.stringify(body) }, '학생 반 갱신');
}

// ── 최근 N주 주일(일요일) 목록 (오늘 이하) ──
function lastNSundays(n) {
  const res = [];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // 가장 최근 일요일
  for (let i = 0; i < n; i++) {
    res.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 7);
  }
  return res;
}

// ── 1) 학생 찾기 ──
const students = await listDocs('students');
console.log(`students 컬렉션 문서 수: ${students.length}`);
const matches = students.filter((doc) => (sv(doc.fields?.name) || '').trim() === STUDENT_NAME);
if (matches.length === 0) {
  console.error(`학생 '${STUDENT_NAME}' 을(를) 찾을 수 없습니다.`);
  const head = STUDENT_NAME.slice(0, 2);
  const near = students.filter((doc) => (sv(doc.fields?.name) || '').includes(head));
  if (near.length) {
    console.error(`유사 이름 후보(${near.length}):`);
    near.forEach((m) => console.error(`  '${sv(m.fields?.name)}' id=${idOf(m)} service=${sv(m.fields?.service)} classId=${sv(m.fields?.classId)}`));
  } else {
    console.error('유사 이름 후보 없음. 이름 표기를 확인하세요.');
  }
  process.exit(1);
}
if (matches.length > 1) {
  console.error(`이름이 같은 학생이 ${matches.length}명 있습니다. 수동 확인이 필요합니다:`);
  matches.forEach((m) => console.error(`  id=${idOf(m)} service=${sv(m.fields?.service)} classId=${sv(m.fields?.classId)}`));
  process.exit(1);
}
const studentDoc = matches[0];
const sid = idOf(studentDoc);
const altIds = (studentDoc.fields?.alternateIds?.arrayValue?.values || []).map((v) => v.stringValue);
const studentIds = new Set([sid, ...altIds]);

// ── 2) 대상 반 찾기 ──
const classes = await listDocs('classes');
const targetClasses = classes.filter(
  (c) => sv(c.fields?.teacherName) === TO_TEACHER && sv(c.fields?.service) === TO_SERVICE
);
if (targetClasses.length === 0) { console.error(`대상 반(${TO_SERVICE} ${TO_TEACHER} 선생님)을 찾을 수 없습니다.`); process.exit(1); }
if (targetClasses.length > 1) { console.error(`대상 반이 여러 개입니다. 수동 확인 필요.`); process.exit(1); }
const targetClass = targetClasses[0];
const targetClassId = idOf(targetClass);
const targetTeacherId = sv(targetClass.fields?.teacherId);
const targetTeacherName = sv(targetClass.fields?.teacherName) || TO_TEACHER;

console.log(`학생: ${STUDENT_NAME} (id=${sid}${altIds.length ? `, alt=${altIds.join(',')}` : ''})`);
console.log(`대상 반: ${TO_SERVICE} ${targetTeacherName} 선생님 (classId=${targetClassId})`);
console.log(`모드: ${MODE}${WEEKS_PRESENT > 0 ? ` · 최근 ${WEEKS_PRESENT}주 출석표기` : ''}`);
console.log('─'.repeat(50));

// ── 3) 출석 문서 훑기 ──
const attendance = await listDocs('attendance');
// 대상 반의 날짜별 문서 인덱스
const targetByDate = {};
attendance.forEach((doc) => {
  const f = doc.fields || {};
  if (sv(f.classId) === targetClassId) targetByDate[sv(f.date)] = doc;
});

// 이관 대상(다른 반에 남아있는 학생 기록)
const migrations = []; // { sourceDoc, date, present, newSourceRecords }
attendance.forEach((doc) => {
  const f = doc.fields || {};
  if (sv(f.classId) === targetClassId) return; // 이미 대상 반
  const recs = readRecords(f);
  const mine = recs.find((r) => studentIds.has(r.studentId));
  if (!mine) return;
  migrations.push({
    sourceDoc: doc,
    date: sv(f.date),
    service: sv(f.service),
    present: mine.present,
    newSourceRecords: recs.filter((r) => !studentIds.has(r.studentId)),
  });
});

// 대상 날짜별 최종 출석값 계산: 이관값 + 최근 N주 present 강제
const sundays = WEEKS_PRESENT > 0 ? new Set(lastNSundays(WEEKS_PRESENT)) : new Set();
const desiredByDate = {}; // date -> present(boolean)
migrations.forEach((m) => { desiredByDate[m.date] = m.present; });
sundays.forEach((d) => { desiredByDate[d] = true; });

console.log(`이관할 이전 반 기록: ${migrations.length}건`);
migrations.forEach((m) => console.log(`  ${m.date} (${m.service}) present=${m.present} → 대상 반으로 이동`));
console.log(`최근 ${WEEKS_PRESENT}주 출석 표기 대상 주일: ${[...sundays].sort().join(', ') || '(없음)'}`);
console.log('─'.repeat(50));

if (!APPLY) {
  console.log('(dry-run) 실제 변경 없음. 확인 후 MODE=apply 로 다시 실행하세요.');
  // 대상 반에 반영될 최종 목록 미리보기
  Object.keys(desiredByDate).sort().forEach((date) => {
    const exists = !!targetByDate[date];
    console.log(`  대상 ${date}: present=${desiredByDate[date]} (${exists ? '기존 문서 수정' : '문서 생성'})`);
  });
  process.exit(0);
}

// ── 4) 적용 ──
let ops = 0;

// 4-1) 이전 반 문서에서 학생 기록 제거
for (const m of migrations) {
  await patchRecords(m.sourceDoc.name, m.newSourceRecords);
  ops++;
  console.log(`제거: ${m.date} 이전 반 문서에서 ${STUDENT_NAME} 기록 삭제`);
}

// 4-2) 대상 반 문서에 학생 기록 추가/갱신
for (const date of Object.keys(desiredByDate).sort()) {
  const present = desiredByDate[date];
  const existing = targetByDate[date];
  if (existing) {
    const recs = readRecords(existing.fields);
    const idx = recs.findIndex((r) => studentIds.has(r.studentId));
    if (idx >= 0) recs[idx] = { studentId: sid, studentName: STUDENT_NAME, present };
    else recs.push({ studentId: sid, studentName: STUDENT_NAME, present });
    await patchRecords(existing.name, recs);
    console.log(`갱신: ${date} 대상 반 문서에 ${STUDENT_NAME} present=${present}`);
  } else {
    const docId = `${date}_${TO_SERVICE}_${targetClassId}`;
    await createAttendanceDoc(docId, {
      date, service: TO_SERVICE, classId: targetClassId,
      teacherId: targetTeacherId, teacherName: targetTeacherName,
      records: [{ studentId: sid, studentName: STUDENT_NAME, present }],
    });
    console.log(`생성: ${date} 대상 반 문서 생성 + ${STUDENT_NAME} present=${present}`);
  }
  ops++;
}

// 4-3) 학생 반/부서 갱신
await patchStudentClass(sid, targetClassId, TO_SERVICE);
ops++;
console.log(`학생 반 갱신: ${STUDENT_NAME} → ${TO_SERVICE} ${targetTeacherName} 선생님 (classId=${targetClassId})`);

console.log('─'.repeat(50));
console.log(`완료: 총 ${ops}건 처리`);
