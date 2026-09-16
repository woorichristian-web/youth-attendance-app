// 전체 계정 비밀번호 재설정 스크립트
// 규칙: 성(姓)을 두벌식 영타로 친 것 + "1234"  (예: 전→wjs1234, 김→rla1234)
// MODE=dry-run  → 변경 없이 목록·중복만 출력
// MODE=apply    → 실제로 비밀번호 변경
import crypto from 'crypto';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const MODE = process.env.MODE || 'dry-run';

// ── OAuth 토큰 발급 ──
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

// ── Firebase Auth 전체 계정 조회 ──
let authUsers = [];
let pageToken;
do {
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${P}/accounts:batchGet?maxResults=500${pageToken ? `&nextPageToken=${encodeURIComponent(pageToken)}` : ''}`;
  const d = await (await fetch(url, { headers: H })).json();
  authUsers = authUsers.concat(d.users || []);
  pageToken = d.nextPageToken;
} while (pageToken);

// ── Firestore에서 이름 매핑 조회 ──
async function listDocs(coll) {
  let docs = [];
  let pt;
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents/${coll}?pageSize=300${pt ? `&pageToken=${encodeURIComponent(pt)}` : ''}`;
    const d = await (await fetch(url, { headers: H })).json();
    docs = docs.concat(d.documents || []);
    pt = d.nextPageToken;
  } while (pt);
  return docs;
}

const nameByUid = {};
(await listDocs('users')).forEach((doc) => {
  const uid = doc.name.split('/').pop();
  nameByUid[uid] = doc.fields?.name?.stringValue || '';
});
const nameByEmail = {};
(await listDocs('usernames')).forEach((doc) => {
  const nm = decodeURIComponent(doc.name.split('/').pop());
  const em = doc.fields?.email?.stringValue || '';
  if (em) nameByEmail[em.toLowerCase()] = nm;
});

// ── 한글 성 → 두벌식 영타 변환 ──
const CHO = ['r','R','s','e','E','f','a','q','Q','t','T','d','w','W','c','z','x','v','g'];
const JUNG = ['k','o','i','O','j','p','u','P','h','hk','ho','hl','y','n','nj','np','nl','b','m','ml','l'];
const JONG = ['','r','R','rt','s','sw','sg','e','f','fr','fa','fq','ft','fx','fv','fg','a','q','qt','t','T','d','w','c','z','x','v','g'];
function surnameToKeys(ch) {
  const c = ch.codePointAt(0);
  if (c < 0xac00 || c > 0xd7a3) return null;
  const i = c - 0xac00;
  return CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28];
}

// ── 특별 계정 이름 지정 (Firestore에 이름이 없는 계정) ──
// 저장소에 이름을 남기지 않도록 실행 시 환경변수로 받는다.
// 형식: SPECIAL_NAMES="admin=홍길동,leader1=김철수" (이메일의 @ 앞부분=이름)
const SPECIAL_NAMES = {};
(process.env.SPECIAL_NAMES || '').split(',').forEach((pair) => {
  const [k, v] = pair.split('=').map((x) => (x || '').trim());
  if (k && v) SPECIAL_NAMES[k.toLowerCase()] = v;
});

// ── 대상 계산 ──
const rows = [];
const skipped = [];
for (const u of authUsers) {
  const localPart = (u.email || '').split('@')[0].toLowerCase();
  const name = nameByUid[u.localId]
    || nameByEmail[(u.email || '').toLowerCase()]
    || SPECIAL_NAMES[localPart]
    || '';
  const keys = name ? surnameToKeys(name[0]) : null;
  if (!keys) { skipped.push({ email: u.email || u.localId, name }); continue; }
  rows.push({ uid: u.localId, email: u.email || '', name, pw: `${keys}1234` });
}
rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

console.log(`전체 계정 ${authUsers.length}개 / 변경 대상 ${rows.length}개 / 제외 ${skipped.length}개`);
console.log('');
console.log('=== 이름 / 이메일 / 새 비밀번호 ===');
rows.forEach((r) => console.log(`${r.name}\t${r.email}\t${r.pw}`));

const cnt = {};
rows.forEach((r) => { cnt[r.pw] = (cnt[r.pw] || 0) + 1; });
const dups = Object.entries(cnt).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
console.log('');
console.log('=== 동일한 비밀번호 그룹 ===');
if (dups.length === 0) console.log('없음 — 모두 서로 다른 비밀번호입니다.');
dups.forEach(([pw, n]) => {
  const names = rows.filter((r) => r.pw === pw).map((r) => r.name).join(', ');
  console.log(`${pw}: ${n}명 (${names})`);
});
console.log(`→ 중복 그룹 ${dups.length}개, 해당 인원 ${dups.reduce((s, [, n]) => s + n, 0)}명`);

if (skipped.length > 0) {
  console.log('');
  console.log('=== 제외된 계정 (이름 없음 또는 한글 이름 아님) ===');
  skipped.forEach((s) => console.log(`${s.name || '(이름없음)'}\t${s.email}`));
}

// ── 적용 ──
if (MODE === 'apply') {
  console.log('');
  console.log('=== 비밀번호 변경 적용 중... ===');
  let ok = 0, fail = 0;
  for (const r of rows) {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${P}/accounts:update`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ localId: r.uid, password: r.pw }),
    });
    if (res.ok) ok++;
    else { fail++; console.log(`실패: ${r.name} (${r.email}) — HTTP ${res.status}`); }
  }
  console.log(`완료: 성공 ${ok}건, 실패 ${fail}건`);
} else {
  console.log('');
  console.log('(dry-run 모드 — 실제 변경 없음. 적용하려면 MODE=apply 로 실행)');
}
