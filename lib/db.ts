import postgres from 'postgres';
import { ADMIN_ROLES } from '@/types';

/**
 * 原生 Postgres 连接池（保留用于复杂 SQL 查询）
 * 请在 .env.local 中配置 DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
 */
let sqlInstance: ReturnType<typeof postgres> | null = null;

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
  });
}

export const sql = new Proxy(
  function () {} as unknown as ReturnType<typeof postgres>,
  {
    get(_target, prop) {
      if (!sqlInstance) {
        sqlInstance = createDbClient();
      }
      const value = sqlInstance[prop as keyof ReturnType<typeof postgres>];
      return typeof value === 'function' ? (value as Function).bind(sqlInstance) : value;
    },
    apply(_target, _thisArg, args: unknown[]) {
      if (!sqlInstance) {
        sqlInstance = createDbClient();
      }
      return (sqlInstance as unknown as (...args: unknown[]) => unknown)(...args);
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
    SELECT id, username, full_name, phone, password_hash, role, is_banned, is_first_login
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
  offset?: number
): Promise<{ data: SqlRow[]; total: number; error: Error | null }> {
  const countRes = await sql`SELECT COUNT(*) as count FROM certificates`;
  const total = parseInt(String(countRes[0]?.count || 0), 10);

  const result = await sql`
    SELECT c.id, c.cert_number, c.dealer_id, c.template_id, c.auth_scope, c.start_date, c.end_date, c.status, c.final_image_url, c.seal_url, c.auditor_id, c.manager_id, c.created_at, c.updated_at, d.company_name, d.phone, p.id as profile_id, p.full_name as auditor_name
    FROM certificates c
    LEFT JOIN dealers d ON c.dealer_id = d.id
    LEFT JOIN profiles p ON c.auditor_id = p.id
    ORDER BY c.created_at DESC
    ${limit ? sql`LIMIT ${limit}` : sql``}
    ${offset ? sql`OFFSET ${offset}` : sql``}
  `;
  const formatted = result.map(buildDealersNested);
  return { data: formatted || [], total, error: null };
}

/**
 * 获取已签发且在有效期内的证书计数
 */
export async function getActiveIssuedCertificatesCount(): Promise<{ data: { count: number }; error: Error | null }> {
  const result = await sql`
    SELECT COUNT(*) as count
    FROM certificates
    WHERE status = 'ISSUED'
    AND end_date >= CURRENT_DATE
  `;
  return { data: { count: parseInt(String(result[0]?.count || 0), 10) }, error: null };
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
  status?: string
): Promise<{ data: SqlRow[]; total: number; error: Error | null }> {
  try {
    const limit = Math.min(pageSize && pageSize > 0 ? pageSize : 50, 200);
    const offset = page && page > 0 ? (page - 1) * limit : 0;

    let result;
    let countRes;

    if (status && status !== 'ALL') {
      result = await sql`
        SELECT * FROM complaints
        WHERE status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countRes = await sql`SELECT COUNT(*) as count FROM complaints WHERE status = ${status}`;
    } else {
      result = await sql`
        SELECT * FROM complaints
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countRes = await sql`SELECT COUNT(*) as count FROM complaints`;
    }

    const total = parseInt(String(countRes[0]?.count || 0), 10);
    // 调试日志已移除

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

/**
 * 删除投诉工单（软/硬删除）
 */
export async function deleteComplaint(id: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    await sql`DELETE FROM complaints WHERE id = ${id}`;
    return { success: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '删除失败';
    return { success: false, error: new Error(message) };
  }
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
    const result = await sql`
      INSERT INTO action_rate_limits (key, attempts, window_start)
      VALUES (${key}, 1, ${now})
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE
          WHEN action_rate_limits.window_start < ${windowStart} THEN 1
          WHEN action_rate_limits.attempts >= ${maxAttempts} THEN action_rate_limits.attempts
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

    return record.attempts < maxAttempts;
  } catch (err) {
    console.error('[RateLimit] 数据库查询失败，拒绝请求以保障安全:', err);
    return false;
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
