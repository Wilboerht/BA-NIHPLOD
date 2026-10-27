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

async function req(pathname, { method = 'GET', body, token, rawBody } = {}) {
  const headers = {};
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
  return { status: res.status, json };
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

const badJson = await req('/api/auth/login', { method: 'POST', rawBody: '{not-json' });
assert('非法 JSON 返回 400', badJson.status === 400, `status=${badJson.status}`);

const superLogin = await login('super@test.local', 'SuperPass123');
const auditorLogin = await login('auditor@test.local', 'AuditPass123');
assert('超管/审核员登录', superLogin.status === 200 && !!superLogin.token && auditorLogin.status === 200 && !!auditorLogin.token);

const superToken = superLogin.token;
const auditorToken = auditorLogin.token;

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
  SELECT id, status, auth_scope FROM certificates WHERE cert_number = ${newCertNumber}
`;
assert('提报入库为 PENDING', pendingCertRow?.status === 'PENDING');
assert(
  '授权方由服务端固定，忽略客户端伪造值',
  pendingCertRow?.auth_scope && !pendingCertRow.auth_scope.includes('Fake Authorizer'),
  String(pendingCertRow?.auth_scope)
);
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
const approve = await req('/api/certificates', {
  method: 'POST', token: superToken, body: { action: 'approve_issue', certId: pendingCertRow.id },
});
assert('核发返回同编号', approve.status === 200 && approve.json?.certNumber === newCertNumber);
const [approvedRow] = await db`SELECT status, manager_id FROM certificates WHERE id = ${pendingCertRow.id}`;
assert('核发后 ISSUED 且记录 manager', approvedRow?.status === 'ISSUED' && approvedRow?.manager_id === superAdmin.id);

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

const complaintsPage2 = await req('/api/db/complaints?page=2&pageSize=20', { token: superToken });
assert('投诉第 2 页 5 条 / 总 25', complaintsPage2.json?.total === 25 && complaintsPage2.json?.data?.length === 5);
const complaintSearch = await req('/api/db/complaints?status=PENDING&q=' + encodeURIComponent('渠道13'), { token: superToken });
assert('投诉搜索命中 1 条', complaintSearch.json?.total === 1, `total=${complaintSearch.json?.total}`);
const complaintId = complaintsPage2.json.data[0].id;
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
assert('cron ?secret= 更新 1 张', cronQuery.status === 200 && cronQuery.json?.updatedCount === 1, `status=${cronQuery.status} ${JSON.stringify(cronQuery.json)}`);
const [expiredRow] = await db`SELECT status FROM certificates WHERE cert_number = 'BAVP-2026-BBBB0002'`;
assert('到期证书已置 EXPIRED', expiredRow?.status === 'EXPIRED');

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
