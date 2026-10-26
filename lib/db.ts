import postgres from 'postgres';
import { ADMIN_ROLES } from '@/types';

/**
 * 原生 Postgres 连接池（保留用于复杂 SQL 查询）
 * 请在 .env.local 中配置 DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
 */

// 数据库会话时区（与应用侧日期判断保持一致）；仅允许安全字符，防止注入
const SAFE_TIMEZONE = /^[A-Za-z0-9_+\-/]+$/;
const DB_TIMEZONE =
  process.env.DB_TIMEZONE && SAFE_TIMEZONE.test(process.env.DB_TIMEZONE)
    ? process.env.DB_TIMEZONE
    : 'Asia/Shanghai';

function createDbClient() {
  const databaseUrl = process.env.DATABASE_URL?.replace(/^["']|["']$/g, '');
  if (!databaseUrl) {
    console.error('[db] FATAL: DATABASE_URL environment variable is not set.');
    // 返回一个代理对象，在调用时抛出明确的错误，避免 null 导致的隐晦崩溃
    return new Proxy({} as ReturnType<typeof postgres>, {
      get(_target, prop) {
        const err = new Error(
          `[db] Database connection failed: DATABASE_URL is not configured. ` +
          `Attempted to access "sql.${String(prop)}". ` +
          `Please set DATABASE_URL in your .env.local file.`
        );
        (err as Error & { statusCode?: number }).statusCode = 503;
        throw err;
      },
    });
  }
  return postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // 通过启动参数设置会话时区，确保 CURRENT_DATE 与业务时区一致
    connection: {
      TimeZone: DB_TIMEZONE,
      application_name: 'bavp',
    },
  });
}

// 在 dev HMR / 多 bundle（proxy 与路由）场景下复用同一连接池
const globalForDb = globalThis as unknown as { __bavpSql?: ReturnType<typeof postgres> };

function getSqlInstance(): ReturnType<typeof postgres> {
  if (!globalForDb.__bavpSql) {
    globalForDb.__bavpSql = createDbClient();
  }
  return globalForDb.__bavpSql;
}

export const sql = new Proxy(
  function () {} as unknown as ReturnType<typeof postgres>,
  {
    get(_target, prop) {
      const instance = getSqlInstance();
      const value = instance[prop as keyof ReturnType<typeof postgres>];
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(instance)
        : value;
    },
    apply(_target, _thisArg, args: unknown[]) {
      return (getSqlInstance() as unknown as (...args: unknown[]) => unknown)(...args);
    },
  }
);

// 如需使用 Prisma ORM（类型安全查询），请从 @/lib/prisma 导入
// import { prisma } from '@/lib/prisma';

// ============================================================================
// 【认证类】
// ============================================================================

/**
 * 根据账号查找用户信息 (兼容 phone 或 username)
 */
export async function findProfileForLogin(identifier: string): Promise<{ data: SqlRow | null; error: Error | null }> {
  const result = await sql`
    SELECT id, username, full_name, phone, password_hash, role, is_banned, is_first_login, token_version
    FROM profiles
    WHERE deleted_at IS NULL
      AND (phone = ${identifier}
       OR username = ${identifier}
       OR username = ${identifier.toLowerCase()})
    LIMIT 1
  `;
  return { data: result[0] || null, error: null };
}

/**
 * 根据 ID 查找用户信息
 */
export async function getProfileById(id: string): Promise<{ data: SqlRow | null; error: Error | null }> {
  const result = await sql`
    SELECT id, username, full_name, phone, role, is_banned, is_first_login, created_at, updated_at
    FROM profiles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
  `;
  return { data: result[0] || null, error: null };
}

/**
 * 检查管理员权限
 */
export async function checkIsAdmin(adminId: string): Promise<boolean> {
  if (!adminId) return false;

  try {
    const { data: profile, error } = await getProfileById(adminId);
    if (error || !profile) return false;

    return ADMIN_ROLES.includes(String(profile.role) as typeof ADMIN_ROLES[number]);
  } catch (error) {
    console.error("[checkIsAdmin] Error:", error);
    return false;
  }
}

// ============================================================================
// 【通用工具】
// ============================================================================

interface SqlRow {
  [key: string]: unknown;
}

function formatDateFields(row: SqlRow): SqlRow {
  // 使用本地时区格式化日期，避免 UTC 转换导致跨天时差（off-by-one）
  const fmtDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    ...row,
    start_date: row.start_date instanceof Date
      ? fmtDate(row.start_date)
      : row.start_date,
    end_date: row.end_date instanceof Date
      ? fmtDate(row.end_date)
      : row.end_date,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  };
}

function buildDealersNested(row: SqlRow): SqlRow {
  return {
    ...formatDateFields(row),
    dealers: row.company_name ? {
      company_name: row.company_name,
      phone: row.phone,
    } : null,
  };
}

// ============================================================================
// 【证书数据类】
// ============================================================================

/**
 * 获取待核发证书列表（用于管理面板）
 */
export async function getPendingCertificates(limit?: number): Promise<{ data: SqlRow[]; error: Error | null }> {
  const result = await sql`
    SELECT c.id, c.cert_number, c.dealer_id, c.template_id, c.auth_scope, c.start_date, c.end_date, c.status, c.final_image_url, c.seal_url, c.auditor_id, c.manager_id, c.created_at, c.updated_at, d.company_name, d.phone, p.id as profile_id, p.full_name as auditor_name
    FROM certificates c
    LEFT JOIN dealers d ON c.dealer_id = d.id
    LEFT JOIN profiles p ON c.auditor_id = p.id
    WHERE c.status = 'PENDING'
    ORDER BY c.created_at ASC
    ${limit ? sql`LIMIT ${limit}` : sql``}
  `;
  const formatted = result.map(buildDealersNested);
  return { data: formatted || [], error: null };
}

/**
 * 获取所有证书列表（用于管理面板 - 不仅限待审状态）
 */
export async function getAllCertificates(
  limit?: number,
  offset?: number,
  statusFilter?: string,
  search?: string
): Promise<{ data: SqlRow[]; total: number; error: Error | null }> {
  const baseSelect = sql`
    SELECT c.id, c.cert_number, c.dealer_id, c.template_id, c.auth_scope, c.start_date, c.end_date, c.status, c.final_image_url, c.seal_url, c.auditor_id, c.manager_id, c.created_at, c.updated_at, c.search_count, d.company_name, d.phone, p.id as profile_id, p.full_name as auditor_name
    FROM certificates c
    LEFT JOIN dealers d ON c.dealer_id = d.id
    LEFT JOIN profiles p ON c.auditor_id = p.id
  `;

  // 状态语义与前端展示保持一致：ISSUED 仅指「已签发且未到期」
  const statusCondition =
    statusFilter === 'invalid'
      ? sql` AND (c.status IN ('EXPIRED', 'REVOKED', 'REJECTED') OR (c.status = 'ISSUED' AND c.end_date < CURRENT_DATE))`
      : statusFilter === 'ISSUED'
        ? sql` AND c.status = 'ISSUED' AND c.end_date >= CURRENT_DATE`
        : statusFilter
          ? sql` AND c.status = ${statusFilter}`
          : sql``;

  const likePattern = search?.trim() ? `%${search.trim()}%` : null;
  const searchCondition = likePattern
    ? sql` AND (c.cert_number ILIKE ${likePattern} OR d.company_name ILIKE ${likePattern} OR split_part(c.auth_scope, ' | ', 1) ILIKE ${likePattern})`
    : sql``;

  const whereClause = sql`WHERE TRUE ${statusCondition} ${searchCondition}`;

  const countRes = await sql`
    SELECT COUNT(*) as count
    FROM certificates c
    LEFT JOIN dealers d ON c.dealer_id = d.id
    ${whereClause}
  `;
  const result = await sql`
    ${baseSelect}
    ${whereClause}
    ORDER BY c.created_at DESC
    ${limit ? sql`LIMIT ${limit}` : sql``}
    ${offset ? sql`OFFSET ${offset}` : sql``}
  `;

  const total = parseInt(String(countRes[0]?.count || 0), 10);
  const formatted = result.map(buildDealersNested);
  return { data: formatted || [], total, error: null };
}

// ============================================================================
// 【投诉数据类】
// ============================================================================

/**
 * 获取所有投诉列表（支持分页和状态过滤）
 */
export async function getAllComplaints(
  page?: number,
  pageSize?: number,
  status?: string,
  search?: string
): Promise<{ data: SqlRow[]; total: number; error: Error | null }> {
  try {
    const limit = Math.min(pageSize && pageSize > 0 ? pageSize : 50, 200);
    const offset = page && page > 0 ? (page - 1) * limit : 0;

    const statusCondition = status && status !== 'ALL'
      ? sql` AND status = ${status}`
      : sql``;
    const likePattern = search?.trim() ? `%${search.trim()}%` : null;
    const searchCondition = likePattern
      ? sql` AND (channel ILIKE ${likePattern} OR description ILIKE ${likePattern} OR contact_info ILIKE ${likePattern} OR id::text ILIKE ${likePattern})`
      : sql``;
    const whereClause = sql`WHERE TRUE ${statusCondition} ${searchCondition}`;

    const result = await sql`
      SELECT * FROM complaints
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const countRes = await sql`SELECT COUNT(*) as count FROM complaints ${whereClause}`;

    const total = parseInt(String(countRes[0]?.count || 0), 10);
    return { data: result || [], total, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '数据库查询失败';
    console.error('[getAllComplaints] 查询失败:', err);
    return { data: [], total: 0, error: new Error(message) };
  }
}

/**
 * 获取待处理投诉（PENDING + INVESTIGATING）
 */
export async function getPendingComplaints(limit = 500): Promise<{ data: SqlRow[]; error: Error | null }> {
  const result = await sql`
    SELECT * FROM complaints
    WHERE status IN ('PENDING', 'INVESTIGATING')
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return { data: result || [], error: null };
}

/**
 * 获取待处理投诉计数（PENDING + INVESTIGATING）
 */
export async function getPendingComplaintsCount(): Promise<{ data: { count: number }; error: Error | null }> {
  const result = await sql`
    SELECT COUNT(*) as count
    FROM complaints
    WHERE status IN ('PENDING', 'INVESTIGATING')
  `;
  return { data: { count: parseInt(String(result[0]?.count || 0), 10) }, error: null };
}

// ============================================================================
// 【系统统计类】
// ============================================================================

/**
 * 获取系统仪表板统计数据
 */
export async function getDashboardStats(): Promise<{ data: Record<string, number>; error: Error | null }> {
  const [certCountRes, complaintCountRes, issuedCountRes] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM certificates`,
    sql`SELECT COUNT(*) as count FROM complaints WHERE status IN ('PENDING', 'INVESTIGATING')`,
    sql`SELECT COUNT(*) as count FROM certificates WHERE status = 'ISSUED' AND end_date >= CURRENT_DATE`
  ]);

  return {
    data: {
      totalCertificates: parseInt(String(certCountRes[0]?.count || 0), 10),
      pendingComplaints: parseInt(String(complaintCountRes[0]?.count || 0), 10),
      issuedValid: parseInt(String(issuedCountRes[0]?.count || 0), 10)
    },
    error: null
  };
}


// ============================================================================
// 【限流与审计类】
// ============================================================================

const DEFAULT_ACTION_MAX_ATTEMPTS = 5;
const DEFAULT_ACTION_WINDOW_MS = 5 * 60 * 1000; // 5 分钟

/**
 * 通用行为限流检查（基于 IP + 动作类型）
 * @returns true 表示允许通过，false 表示已触发限流
 */
export async function checkActionRateLimit(
  key: string,
  maxAttempts: number = DEFAULT_ACTION_MAX_ATTEMPTS,
  windowMs: number = DEFAULT_ACTION_WINDOW_MS
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Date.now() - windowMs);

  try {
    // 低概率清理过期记录（避免每次请求都执行）
    if (Math.random() < 0.01) {
      await sql`
        DELETE FROM action_rate_limits
        WHERE window_start < ${windowStart}
      `;
    }

    // 原子性 UPSERT：插入或更新，并返回最新值
    // 计数上限记录为 maxAttempts + 1，用于精确判断「第 maxAttempts 次放行、第 maxAttempts+1 次拦截」
    const result = await sql`
      INSERT INTO action_rate_limits (key, attempts, window_start)
      VALUES (${key}, 1, ${now})
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE
          WHEN action_rate_limits.window_start < ${windowStart} THEN 1
          WHEN action_rate_limits.attempts >= ${maxAttempts} THEN ${maxAttempts} + 1
          ELSE action_rate_limits.attempts + 1
        END,
        window_start = CASE
          WHEN action_rate_limits.window_start < ${windowStart} THEN ${now}
          ELSE action_rate_limits.window_start
        END
      RETURNING attempts, window_start
    `;

    const record = result[0];
    const recordWindowStart = new Date(record.window_start);

    // 窗口已过期（理论上已被重置，双重保险）
    if (recordWindowStart < windowStart) {
      return true;
    }

    // 本次请求计数 <= maxAttempts 时放行（即窗口内恰好允许 maxAttempts 次）
    return record.attempts <= maxAttempts;
  } catch (err) {
    console.error('[RateLimit] 数据库查询失败，限流降级放行:', err);
    // 数据库不可用时放行，避免阻塞正常业务
    return true;
  }
}

/**
 * 创建投诉审核日志
 */
export async function createComplaintAuditLog(
  complaintId: string,
  actorId: string,
  action: string,
  comment?: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    await sql`
      INSERT INTO audit_logs (complaint_id, actor_id, action, comment, created_at)
      VALUES (${complaintId}, ${actorId}, ${action}, ${comment || null}, NOW())
    `;
    return { success: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '审计日志写入失败';
    console.error('[AuditLog] 创建投诉审计日志失败:', err);
    return { success: false, error: new Error(message) };
  }
}

/**
 * 获取全局审计日志（分页 + 分类 + 关键词）
 * category: certificate（证书操作）/ complaint（投诉处理，含已删除工单留痕）
 */
export async function getAuditLogs(
  page?: number,
  pageSize?: number,
  category?: string,
  search?: string
): Promise<{ data: SqlRow[]; total: number; error: Error | null }> {
  try {
    const limit = Math.min(pageSize && pageSize > 0 ? pageSize : 50, 100);
    const offset = page && page > 0 ? (page - 1) * limit : 0;

    const categoryCondition =
      category === 'certificate'
        ? sql` AND a.certificate_id IS NOT NULL`
        : category === 'complaint'
          ? sql` AND (a.complaint_id IS NOT NULL OR a.complaint_ref IS NOT NULL)`
          : sql``;

    const likePattern = search?.trim() ? `%${search.trim()}%` : null;
    const searchCondition = likePattern
      ? sql` AND (p.full_name ILIKE ${likePattern}
              OR p.username ILIKE ${likePattern}
              OR a.comment ILIKE ${likePattern}
              OR a.action ILIKE ${likePattern}
              OR c.cert_number ILIKE ${likePattern}
              OR a.complaint_ref ILIKE ${likePattern})`
      : sql``;

    const whereClause = sql`WHERE TRUE ${categoryCondition} ${searchCondition}`;
    const baseFrom = sql`
      FROM audit_logs a
      LEFT JOIN profiles p ON a.actor_id = p.id
      LEFT JOIN certificates c ON a.certificate_id = c.id
    `;

    const result = await sql`
      SELECT a.id, a.certificate_id, a.complaint_id, a.complaint_ref, a.actor_id,
             a.action, a.comment, a.created_at,
             p.full_name AS actor_name, p.username AS actor_username,
             c.cert_number AS cert_number
      ${baseFrom}
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const countRes = await sql`SELECT COUNT(*) as count ${baseFrom} ${whereClause}`;

    const total = parseInt(String(countRes[0]?.count || 0), 10);
    return { data: result || [], total, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '查询审计日志失败';
    console.error('[getAuditLogs] 查询失败:', err);
    return { data: [], total: 0, error: new Error(message) };
  }
}

/**
 * 获取投诉审核日志
 */
export async function getComplaintAuditLogs(complaintId: string): Promise<{ data: SqlRow[]; error: Error | null }> {
  try {
    const result = await sql`
      SELECT a.*, p.full_name as actor_name, p.username as actor_username
      FROM audit_logs a
      LEFT JOIN profiles p ON a.actor_id = p.id
      WHERE a.complaint_id = ${complaintId}
      ORDER BY a.created_at DESC
    `;
    return { data: result || [], error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '查询审计日志失败';
    return { data: [], error: new Error(message) };
  }
}
