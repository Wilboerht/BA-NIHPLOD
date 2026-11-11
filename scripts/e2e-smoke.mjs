import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

/**
 * 端到端冒烟测试（会清空目标库的业务表，仅限本地一次性数据库！）
 *
 * 前置：
 *   1. 目标库已执行 db/schema.sql 与全部迁移
 *   2. 应用已启动：DATABASE_URL=<一次性库> CRON_SECRET=<secret> npm run start -- -p 3999
 *
 * 用法：
 *   node scripts/e2e-smoke.mjs --base http://127.0.0.1:3999 --db postgresql://postgres@127.0.0.1:55432/sql_test
 *   可选：--cron-secret=<值>（默认读 CRON_SECRET 或 test-cron-secret）
 *         --force（目标库非本机时确认执行）
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getArg(name, fallback) {
  // 同时支持 --name=value 与 --name value 两种写法
  const prefix = `--${name}=`;
  const eqHit = process.argv.find((a) => a.startsWith(prefix));
  if (eqHit) return eqHit.slice(prefix.length);

  const idx = process.argv.indexOf(`--${name}`);
  const next = idx !== -1 ? process.argv[idx + 1] : undefined;
  if (next && !next.startsWith('--')) return next;

  return fallback;
}

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]*)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

const BASE = getArg('base', 'http://127.0.0.1:3999');
const DB_URL = getArg('db', process.env.E2E_DATABASE_URL || '');
const CRON_SECRET = getArg('cron-secret', process.env.CRON_SECRET || 'test-cron-secret');
const FORCE = process.argv.includes('--force');

if (!DB_URL) {
  console.error('❌ 必须显式传入 --db=<一次性数据库连接串>；不再从 DATABASE_URL 回退，避免误清空本地/生产库');
  process.exit(1);
}

if (process.env.DATABASE_URL && DB_URL === process.env.DATABASE_URL) {
  console.error('❌ --db 不能与 DATABASE_URL 相同；请使用独立的一次性数据库');
  process.exit(1);
}

const dbHost = new URL(DB_URL).hostname;
const isLocalDb = ['localhost', '127.0.0.1', '::1'].includes(dbHost);
if (!isLocalDb && !FORCE) {
  console.error(`❌ 目标库 ${dbHost} 不是本机地址。冒烟测试会清空数据，如确认请加 --force`);
  process.exit(1);
}

const db = postgres(DB_URL, { max: 3 });
let failures = 0;
const assert = (name, cond, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  :: ' + extra : ''}`);
};

async function req(pathname, { method = 'GET', body, token, rawBody, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Cookie = `auth-token=${token}`;
  const res = await fetch(BASE + pathname, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json, headers: res.headers };
}

async function login(identifier, password) {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: identifier, password }),
    redirect: 'manual',
  });
  const raw = res.headers.get('set-cookie') || '';
  const m = raw.match(/auth-token=([^;]+)/);
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, token: m ? m[1] : null, json };
}

// ---------------- 种子数据 ----------------
const superHash = await bcrypt.hash('SuperPass123', 10);
const auditHash = await bcrypt.hash('AuditPass123', 10);

// 审计日志是 append-only：仅在一次性数据库中临时禁用 trigger 以便清空
try {
  await db`ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_mutation`;
} catch {
  // 旧库可能还没有该 trigger
}

await db`DELETE FROM audit_logs`;
await db`DELETE FROM certificates`;
await db`DELETE FROM complaints`;
await db`DELETE FROM dealers`;
await db`DELETE FROM profiles`;
await db`DELETE FROM login_rate_limits`;
await db`DELETE FROM action_rate_limits`;

try {
  await db`ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_mutation`;
} catch {
  // 旧库可能还没有该 trigger
}

const [superAdmin] = await db`
  INSERT INTO profiles (username, full_name, email, password_hash, role, is_first_login)
  VALUES ('super@test.local', 'Super Admin', 'super@test.local', ${superHash}, 'SUPER_ADMIN', false)
  RETURNING id`;
const [auditor] = await db`
  INSERT INTO profiles (username, full_name, email, password_hash, role, is_first_login)
  VALUES ('auditor@test.local', 'Auditor One', 'auditor@test.local', ${auditHash}, 'AUDITOR', false)
  RETURNING id`;
const [dealerA] = await db`INSERT INTO dealers (company_name, phone) VALUES ('测试旗舰店', '13800000001') RETURNING id`;
const [dealerB] = await db`INSERT INTO dealers (company_name, phone) VALUES ('广州测试贸易有限公司', '13800000002') RETURNING id`;

const mkCert = (num, dealerId, status, startOffset, endOffset) =>
  db`INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status, auditor_id, manager_id)
     VALUES (${num}, ${dealerId}, ${'广东省测试公司 | 淘宝 | 天猫 | 旎柏（上海）商贸有限公司'},
             (CURRENT_DATE + ${startOffset + ' days'}::interval)::date,
             (CURRENT_DATE + ${endOffset + ' days'}::interval)::date,
             ${status}, ${auditor.id}, ${status === 'PENDING' ? null : superAdmin.id})`;

await mkCert('BAVP-2026-AAAA0001', dealerA.id, 'ISSUED', -30, 300);
await mkCert('BAVP-2026-BBBB0002', dealerA.id, 'ISSUED', -400, -30);
await mkCert('BAVP-2026-CCCC0003', dealerB.id, 'REVOKED', -200, 100);
await mkCert('BAVP-2026-DDDD0004', dealerB.id, 'REJECTED', -10, 100);
await mkCert('BAVP-2026-EEEE0005', dealerA.id, 'PENDING', -1, 365);
await mkCert('BAVP-2026-FFFF0006', dealerB.id, 'EXPIRED', -400, -100);
for (let i = 1; i <= 25; i++) {
  await db`INSERT INTO complaints (description, channel, contact_info, status)
           VALUES (${'测试投诉工单 ' + i}, ${'渠道' + i}, ${'1390000' + String(i).padStart(4, '0')}, 'PENDING')`;
}

// ---------------- 测试 ----------------
console.log(`\n=== E2E Smoke @ ${BASE} (db host: ${dbHost}) ===\n`);

const health = await req('/api/health');
assert('健康检查 200 + ok', health.status === 200 && health.json?.status === 'ok', `status=${health.status}`);

const home = await req('/');
const homeCsp = home.headers.get('content-security-policy') || '';
assert('CSP 含 nonce', /script-src[^;]*'nonce-/.test(homeCsp), homeCsp.slice(0, 160));
assert('生产 script-src 无 unsafe-inline', !/script-src[^;]*'unsafe-inline'/.test(homeCsp));
assert('X-Powered-By 已关闭', !home.headers.get('x-powered-by'), String(home.headers.get('x-powered-by')));

const verifyRedirect = await req('/verify');
assert(
  '/verify 返回 307 且保留跳转',
  verifyRedirect.status === 307 && verifyRedirect.headers.get('location')?.includes('/'),
  `status=${verifyRedirect.status} location=${verifyRedirect.headers.get('location')}`
);
const verifyWithCert = await req('/verify?cert=BAVP-2099-00000000');
assert(
  '/verify?cert 跳转保留参数',
  verifyWithCert.status === 307 && verifyWithCert.headers.get('location')?.includes('cert=BAVP-2099-00000000'),
  `status=${verifyWithCert.status} location=${verifyWithCert.headers.get('location')}`
);

const badJson = await req('/api/auth/login', { method: 'POST', rawBody: '{not-json' });
assert('非法 JSON 返回 400', badJson.status === 400, `status=${badJson.status}`);
const oversizedJson = await req('/api/auth/login', {
  method: 'POST',
  rawBody: JSON.stringify({ phone: 'x', password: 'y'.repeat(300000) }),
});
assert('超大 JSON 返回 413', oversizedJson.status === 413, `status=${oversizedJson.status}`);

const superLogin = await login('super@test.local', 'SuperPass123');
const auditorLogin = await login('auditor@test.local', 'AuditPass123');
assert('超管/审核员登录', superLogin.status === 200 && !!superLogin.token && auditorLogin.status === 200 && !!auditorLogin.token);

const superToken = superLogin.token;
const auditorToken = auditorLogin.token;

const badCertId = await req('/api/certificates', {
  method: 'POST', token: superToken,
  body: { action: 'revoke_certificate', certId: 'not-a-uuid' },
});
assert('非法证书 UUID 返回 400', badCertId.status === 400, `status=${badCertId.status}`);
const badComplaintId = await req('/api/db/complaints/not-a-uuid/logs', { token: superToken });
assert('非法工单 UUID 返回 400', badComplaintId.status === 400, `status=${badComplaintId.status}`);

const listAsAuditor = await req('/api/admin/list', { token: auditorToken });
assert('AUDITOR 访问账号列表 403', listAsAuditor.status === 403, `status=${listAsAuditor.status}`);
const stealReset = await req('/api/admin/reset-password', {
  method: 'POST', token: auditorToken, body: { userId: superAdmin.id, newPassword: 'HackedPass123' },
});
assert('AUDITOR 重置超管密码 403', stealReset.status === 403, `status=${stealReset.status}`);
const superOldPwd = await login('super@test.local', 'SuperPass123');
assert('超管密码未被越权修改', superOldPwd.status === 200);

const listAsSuper = await req('/api/admin/list', { token: superToken });
assert('SUPER 获取账号列表', listAsSuper.status === 200 && Array.isArray(listAsSuper.json?.data));
const badAdminPage = await req('/api/admin/list?page=abc', { token: superToken });
assert('非法分页参数回退到默认页', badAdminPage.status === 200, `status=${badAdminPage.status}`);
const created = await req('/api/admin/create-admin', {
  method: 'POST', token: superToken,
  body: { fullName: '新审核员', username: 'newauditor@test.local', password: 'NewAudit123', role: 'AUDITOR' },
});
assert('SUPER 创建审核员', created.status === 200, `status=${created.status}`);
const [newAuditorRow] = await db`SELECT id FROM profiles WHERE username = 'newauditor@test.local'`;
const newAuditorLogin1 = await login('newauditor@test.local', 'NewAudit123');
const resetBySuper = await req('/api/admin/reset-password', {
  method: 'POST', token: superToken, body: { userId: newAuditorRow.id, newPassword: 'ResetPass123' },
});
assert('SUPER 重置审核员密码', resetBySuper.status === 200);
const meWithOldToken = await req('/api/auth/me', { token: newAuditorLogin1.token });
assert('被重置用户旧 token 立即失效', meWithOldToken.status === 401, `status=${meWithOldToken.status}`);
const newAuditorLogin2 = await login('newauditor@test.local', 'ResetPass123');
assert('重置后新密码可登录', newAuditorLogin2.status === 200);
const firstLoginStats = await req('/api/db/stats', { token: newAuditorLogin2.token });
assert(
  '首登未改密访问业务接口 403',
  firstLoginStats.status === 403 && firstLoginStats.json?.code === 'PASSWORD_CHANGE_REQUIRED',
  `status=${firstLoginStats.status} code=${firstLoginStats.json?.code}`
);
const firstLoginMe = await req('/api/auth/me', { token: newAuditorLogin2.token });
assert('首登仍可访问 /api/auth/me', firstLoginMe.status === 200, `status=${firstLoginMe.status}`);

const changePwd = await req('/api/auth/change-password', {
  method: 'POST', token: auditorToken,
  body: { userId: auditor.id, oldPassword: 'AuditPass123', newPassword: 'AuditPass456' },
});
assert('审核员修改本人密码', changePwd.status === 200);
const newCookie = changePwd.headers.get('set-cookie') || '';
const newToken = newCookie.match(/auth-token=([^;]+)/)?.[1];
assert('改密返回新登录态 Cookie', !!newToken);
const meWithNewToken = await req('/api/auth/me', { token: newToken });
assert('改密后新 token 可立即使用', meWithNewToken.status === 200, `status=${meWithNewToken.status}`);
const meAfterChange = await req('/api/auth/me', { token: auditorToken });
assert('改密后旧 token 立即失效', meAfterChange.status === 401, `status=${meAfterChange.status}`);
const auditorRelogin = await login('auditor@test.local', 'AuditPass456');
assert('审核员新密码登录', auditorRelogin.status === 200);
const auditorToken2 = auditorRelogin.token;

await db`DELETE FROM login_rate_limits`;
let okLogins = 0;
for (let i = 0; i < 5; i++) {
  const r = await login('super@test.local', 'SuperPass123');
  if (r.status === 200) okLogins++;
}
assert('连续 5 次成功登录不被限流', okLogins === 5, `ok=${okLogins}`);
await db`DELETE FROM login_rate_limits`;
const failStatuses = [];
for (let i = 0; i < 6; i++) {
  const r = await login('super@test.local', 'WrongPass999');
  failStatuses.push(r.status);
}
assert('前 5 次失败 401 / 第 6 次 429', failStatuses.slice(0, 5).every((s) => s === 401) && failStatuses[5] === 429, failStatuses.join(','));
await db`DELETE FROM login_rate_limits`;

const createPending = await req('/api/certificates', {
  method: 'POST', token: auditorToken2,
  body: {
    action: 'create_pending',
    certData: {
      shopName: '集成测试旗舰店', companyName: '集成测试有限公司', phone: '13900000009',
      scopeText: '予以下渠道:\n\n淘宝 | 天猫', duration: '2026.10.01 - 2027.10.01',
      authorizer: 'Fake Authorizer', sealImage: '',
    },
  },
});
const newCertNumber = createPending.json?.certNumber;
assert('提报返回真实编号(8位)', createPending.status === 200 && /^BAVP-\d{4}-[0-9A-F]{8}$/.test(newCertNumber || ''), `status=${createPending.status} cert=${newCertNumber}`);
const [pendingCertRow] = await db`
  SELECT id, status, auth_scope, auditor_id, manager_id, seal_url
  FROM certificates WHERE cert_number = ${newCertNumber}
`;
assert('提报入库为 PENDING', pendingCertRow?.status === 'PENDING');
assert(
  '授权方由服务端固定，忽略客户端伪造值',
  pendingCertRow?.auth_scope && !pendingCertRow.auth_scope.includes('Fake Authorizer'),
  String(pendingCertRow?.auth_scope)
);
assert('提报记录 auditor 为本人', pendingCertRow?.auditor_id === auditor.id);
assert('提报记录 manager 为空', pendingCertRow?.manager_id === null);

const selfUpdate = await req('/api/certificates', {
  method: 'POST', token: auditorToken2,
  body: {
    action: 'update_certificate',
    certId: pendingCertRow.id,
    certData: {
      shopName: '集成测试旗舰店（修改）',
      companyName: '集成测试有限公司（修改）',
      phone: '13900000010',
      scopeText: '仅限抖音渠道',
      duration: '2026.10.02 - 2027.10.02',
      authorizer: 'Fake Authorizer',
      sealImage: '/uploads/certificates/evil.png',
    },
  },
});
assert('审核员可修改本人待审核证书', selfUpdate.status === 200 && selfUpdate.json?.status === 'UPDATED', `status=${selfUpdate.status}`);
const [selfUpdatedRow] = await db`
  SELECT c.status, c.auditor_id, c.manager_id, c.seal_url, c.auth_scope,
         d.company_name AS dealer_name, d.phone AS dealer_phone
  FROM certificates c
  LEFT JOIN dealers d ON c.dealer_id = d.id
  WHERE c.id = ${pendingCertRow.id}
`;
assert(
  '本人修改后仍为 PENDING',
  selfUpdatedRow?.status === 'PENDING',
  String(selfUpdatedRow?.status)
);
assert(
  '本人修改不改变 auditor/manager',
  selfUpdatedRow?.auditor_id === auditor.id && selfUpdatedRow?.manager_id === null,
  `auditor=${selfUpdatedRow?.auditor_id} manager=${selfUpdatedRow?.manager_id}`
);
assert(
  '本人修改不会写入自定义签章',
  selfUpdatedRow?.seal_url === null,
  String(selfUpdatedRow?.seal_url)
);
assert(
  '本人修改更新主体与授权范围',
  selfUpdatedRow?.dealer_name === '集成测试旗舰店（修改）'
    && selfUpdatedRow?.dealer_phone === '13900000010'
    && String(selfUpdatedRow?.auth_scope).includes('集成测试有限公司（修改）')
    && String(selfUpdatedRow?.auth_scope).includes('仅限抖音渠道'),
  `${selfUpdatedRow?.dealer_name} / ${selfUpdatedRow?.dealer_phone} / ${selfUpdatedRow?.auth_scope}`
);
assert(
  '审核员修改时授权方仍由服务端固定',
  selfUpdatedRow?.auth_scope && !selfUpdatedRow.auth_scope.includes('Fake Authorizer'),
  String(selfUpdatedRow?.auth_scope)
);

const superPendingCreate = await req('/api/certificates', {
  method: 'POST', token: superToken,
  body: {
    action: 'create_pending',
    certData: {
      shopName: '超管提报测试店', companyName: '超管提报测试有限公司', phone: '13900000011',
      scopeText: '仅供测试', duration: '2026.10.01 - 2027.10.01',
      authorizer: 'ignored', sealImage: '',
    },
  },
});
const superPendingNumber = superPendingCreate.json?.certNumber;
const [superPendingRow] = await db`
  SELECT id, auditor_id FROM certificates WHERE cert_number = ${superPendingNumber}
`;
assert('超管可创建待审申请', superPendingCreate.status === 200 && superPendingRow?.auditor_id === superAdmin.id);

const auditorPendingList = await req('/api/db/certificates?status=PENDING&pageSize=50', { token: auditorToken2 });
assert(
  '审核员 PENDING 列表只含本人记录',
  auditorPendingList.status === 200
    && auditorPendingList.json?.total === 2
    && auditorPendingList.json?.data?.every((row) => row.auditor_id === auditor.id),
  `status=${auditorPendingList.status} total=${auditorPendingList.json?.total}`
);
const superPendingList = await req('/api/db/certificates?status=PENDING&pageSize=50', { token: superToken });
assert('超管 PENDING 列表包含全部记录', superPendingList.status === 200 && superPendingList.json?.total === 3, `total=${superPendingList.json?.total}`);
const auditorPendingEndpoint = await req('/api/db/certificates/pending', { token: auditorToken2 });
assert(
  '审核员 pending 接口只含本人记录',
  auditorPendingEndpoint.status === 200
    && auditorPendingEndpoint.json?.data?.length === 2
    && auditorPendingEndpoint.json?.data?.every((row) => row.auditor_id === auditor.id),
  `status=${auditorPendingEndpoint.status} length=${auditorPendingEndpoint.json?.data?.length}`
);

const updateOthersPending = await req('/api/certificates', {
  method: 'POST', token: auditorToken2,
  body: {
    action: 'update_certificate',
    certId: superPendingRow.id,
    certData: {
      shopName: '越权修改店', companyName: '越权修改公司', phone: '13900000012',
      scopeText: '越权', duration: '2026.10.02 - 2027.10.02',
      authorizer: 'ignored', sealImage: '',
    },
  },
});
assert('审核员不能修改他人待审证书', updateOthersPending.status === 403, `status=${updateOthersPending.status}`);

const superUpdate = await req('/api/certificates', {
  method: 'POST', token: superToken,
  body: {
    action: 'update_certificate',
    certId: pendingCertRow.id,
    certData: {
      shopName: '超管复核修改店', companyName: '超管复核修改公司', phone: '13900000014',
      scopeText: '超管复核修改范围', duration: '2026.10.02 - 2027.10.02',
      authorizer: 'ignored', sealImage: '',
    },
  },
});
assert('超级管理员可修改审核员待审证书', superUpdate.status === 200, `status=${superUpdate.status}`);
const [superUpdatedRow] = await db`
  SELECT status, auditor_id, manager_id FROM certificates WHERE id = ${pendingCertRow.id}
`;
assert(
  '超管修改待审证书仍保持 auditor、PENDING 与空 manager',
  superUpdatedRow?.status === 'PENDING'
    && superUpdatedRow?.auditor_id === auditor.id
    && superUpdatedRow?.manager_id === null,
  `${superUpdatedRow?.status} / ${superUpdatedRow?.auditor_id} / ${superUpdatedRow?.manager_id}`
);

const rejectSuperPending = await req('/api/certificates', {
  method: 'POST', token: superToken,
  body: { action: 'reject_pending', certId: superPendingRow.id },
});
const deleteSuperPending = await req('/api/certificates', {
  method: 'POST', token: superToken,
  body: { action: 'delete_certificate', certId: superPendingRow.id },
});
assert('清理超管测试待审记录', rejectSuperPending.status === 200 && deleteSuperPending.status === 200);
const badSeal = await req('/api/certificates', {
  method: 'POST', token: auditorToken2,
  body: {
    action: 'create_pending',
    certData: {
      shopName: '恶意外链店', companyName: 'X', phone: '13900000008',
      scopeText: '予以下渠道:\n\n淘宝', duration: '2026.10.01 - 2027.10.01',
      authorizer: '旎柏（上海）商贸有限公司', sealImage: 'https://evil.example.com/seal.png',
    },
  },
});
assert('外链签章被拒 400', badSeal.status === 400, `status=${badSeal.status}`);
const emptyScope = await req('/api/certificates', {
  method: 'POST', token: superToken,
  body: {
    action: 'approve_issue',
    certData: {
      shopName: '空授权范围测试店', companyName: '', phone: '', scopeText: '  ',
      duration: '2026.11.01 - 2027.11.01', authorizer: 'ignored', sealImage: '',
    },
  },
});
assert('空授权范围证书被拒 400', emptyScope.status === 400, `status=${emptyScope.status}`);
const expiredIssue = await req('/api/certificates', {
  method: 'POST', token: superToken,
  body: {
    action: 'approve_issue',
    certData: {
      shopName: '过期证书测试店', companyName: '', phone: '', scopeText: '淘宝',
      duration: '2020.01.01 - 2020.12.31', authorizer: 'ignored', sealImage: '',
    },
  },
});
assert('已过期证书不得直接核发', expiredIssue.status === 400, `status=${expiredIssue.status}`);
const approve = await req('/api/certificates', {
  method: 'POST', token: superToken, body: { action: 'approve_issue', certId: pendingCertRow.id },
});
assert('核发返回同编号', approve.status === 200 && approve.json?.certNumber === newCertNumber);
const [approvedRow] = await db`SELECT status, manager_id FROM certificates WHERE id = ${pendingCertRow.id}`;
assert('核发后 ISSUED 且记录 manager', approvedRow?.status === 'ISSUED' && approvedRow?.manager_id === superAdmin.id);

const updateAfterApprove = await req('/api/certificates', {
  method: 'POST', token: auditorToken2,
  body: {
    action: 'update_certificate',
    certId: pendingCertRow.id,
    certData: {
      shopName: '核发后修改店', companyName: '核发后修改公司', phone: '13900000013',
      scopeText: '核发后修改', duration: '2026.10.02 - 2027.10.02',
      authorizer: 'ignored', sealImage: '',
    },
  },
});
assert('审核员不能修改已核发证书', updateAfterApprove.status === 400, `status=${updateAfterApprove.status}`);

const pendingList = await req('/api/db/certificates?status=PENDING&pageSize=1', { token: superToken });
assert('PENDING 过滤 total=1', pendingList.json?.total === 1, `total=${pendingList.json?.total}`);
const issuedList = await req('/api/db/certificates?status=ISSUED&pageSize=100', { token: superToken });
assert('ISSUED 过滤排除已过期(2)', issuedList.json?.total === 2, `total=${issuedList.json?.total}`);
const invalidList = await req('/api/db/certificates?status=invalid&pageSize=100', { token: superToken });
assert('invalid 过滤(4)', invalidList.json?.total === 4, `total=${invalidList.json?.total}`);
const searchList = await req('/api/db/certificates?q=' + encodeURIComponent('广州测试贸易') + '&pageSize=100', { token: superToken });
assert('按公司名搜索(3)', searchList.json?.total === 3, `total=${searchList.json?.total}`);
const page2 = await req('/api/db/certificates?status=invalid&page=2&pageSize=2', { token: superToken });
assert('invalid 第 2 页 2 条', page2.json?.total === 4 && page2.json?.data?.length === 2);
const stats = await req('/api/db/stats', { token: superToken });
assert('统计 totalCertificates=7', stats.json?.data?.totalCertificates === 7, `total=${stats.json?.data?.totalCertificates}`);
assert('统计包含待审计数', typeof stats.json?.data?.pendingCertificates === 'number');
assert(
  '统计接口禁止缓存',
  String(stats.headers.get('cache-control') || '').includes('no-store'),
  String(stats.headers.get('cache-control'))
);

const complaintsPage2 = await req('/api/db/complaints?page=2&pageSize=20', { token: superToken });
assert('投诉第 2 页 5 条 / 总 25', complaintsPage2.json?.total === 25 && complaintsPage2.json?.data?.length === 5);
const complaintSearch = await req('/api/db/complaints?status=PENDING&q=' + encodeURIComponent('渠道13'), { token: superToken });
assert('投诉搜索命中 1 条', complaintSearch.json?.total === 1, `total=${complaintSearch.json?.total}`);
const complaintId = complaintsPage2.json.data[0].id;
const reviewWithNote = await req(`/api/db/complaints/${complaintId}`, {
  method: 'PUT', token: superToken,
  body: { status: 'INVESTIGATING', review_note: '保留这条审核备注' },
});
const reviewWithoutNote = await req(`/api/db/complaints/${complaintId}`, {
  method: 'PUT', token: superToken,
  body: { status: 'RESOLVED' },
});
const [reviewedComplaint] = await db`
  SELECT status, review_note FROM complaints WHERE id = ${complaintId}
`;
assert(
  '未提交审核备注字段时保留原备注',
  reviewWithNote.status === 200
    && reviewWithoutNote.status === 200
    && reviewedComplaint?.status === 'RESOLVED'
    && reviewedComplaint?.review_note === '保留这条审核备注',
  JSON.stringify(reviewedComplaint)
);
const delComplaint = await req(`/api/db/complaints/${complaintId}`, { method: 'DELETE', token: superToken });
assert('删除投诉成功', delComplaint.status === 200, `status=${delComplaint.status}`);
const [gone] = await db`
  SELECT count(*)::int AS n, count(deleted_at)::int AS deleted
  FROM complaints WHERE id = ${complaintId}
`;
const [deletedLog] = await db`
  SELECT complaint_ref, complaint_id, action
  FROM audit_logs
  WHERE complaint_id = ${complaintId} AND action = 'DELETE_COMPLAINT'
`;
assert(
  '删除投诉为软删除且留痕',
  gone.n === 1 && gone.deleted === 1 && deletedLog && deletedLog.complaint_id === complaintId && deletedLog.complaint_ref === complaintId,
  JSON.stringify({ gone, deletedLog })
);

const cronNoSecret = await req('/api/cron/update-expired-certificates');
assert('cron 无密钥 401', cronNoSecret.status === 401, `status=${cronNoSecret.status}`);
const cronQuery = await req(`/api/cron/update-expired-certificates?secret=${encodeURIComponent(CRON_SECRET)}`);
assert('cron 不再接受查询参数', cronQuery.status === 401, `status=${cronQuery.status}`);
const cronHeader = await req('/api/cron/update-expired-certificates', {
  headers: { 'x-cron-secret': CRON_SECRET },
});
assert('cron 请求头更新 1 张', cronHeader.status === 200 && cronHeader.json?.updatedCount === 1, `status=${cronHeader.status} ${JSON.stringify(cronHeader.json)}`);
const [expiredRow] = await db`SELECT status FROM certificates WHERE cert_number = 'BAVP-2026-BBBB0002'`;
assert('到期证书已置 EXPIRED', expiredRow?.status === 'EXPIRED');
const [naturallyExpired] = await db`
  INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status)
  VALUES (
    'BAVP-2026-GGGG0007', ${dealerA.id}, '广东省测试公司 | 淘宝 | 旎柏（上海）商贸有限公司',
    (CURRENT_DATE - 400 * INTERVAL '1 day')::date,
    (CURRENT_DATE - 30 * INTERVAL '1 day')::date,
    'ISSUED'
  )
  RETURNING id
`;
const deleteNaturallyExpired = await req('/api/certificates', {
  method: 'POST', token: superToken,
  body: { action: 'delete_certificate', certId: naturallyExpired.id },
});
assert('自然过期但尚未归档状态的证书可软删除', deleteNaturallyExpired.status === 200, `status=${deleteNaturallyExpired.status}`);

const auditAsAuditor = await req('/api/db/audit-logs', { token: auditorToken2 });
assert('AUDITOR 访问操作日志 403', auditAsAuditor.status === 403, `status=${auditAsAuditor.status}`);
const auditAll = await req('/api/db/audit-logs?pageSize=100', { token: superToken });
assert('SUPER 查询操作日志', auditAll.status === 200 && auditAll.json?.total >= 2, `total=${auditAll.json?.total}`);
const auditDeleted = (auditAll.json?.data || []).find((x) => x.action === 'DELETE_COMPLAINT');
assert(
  '操作日志含软删除工单留痕',
  auditDeleted && auditDeleted.complaint_id === complaintId && auditDeleted.complaint_ref === complaintId,
  JSON.stringify(auditDeleted)
);
const auditCertOnly = await req('/api/db/audit-logs?category=certificate&pageSize=50', { token: superToken });
assert(
  '证书日志分类且带 cert_number',
  auditCertOnly.json?.data?.length > 0
    && auditCertOnly.json.data.every((x) => x.certificate_id || x.certificate_ref)
    && auditCertOnly.json.data.some((x) => x.cert_number)
);

console.log(`\n===== RESULT: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} =====`);
await db.end({ timeout: 3 });
process.exit(failures === 0 ? 0 : 1);
