import postgres from 'postgres';

/**
 * 原生 Postgres 连接池
 * 请在 .env.local 中配置 DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
 */
function createDbClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[db] FATAL: DATABASE_URL environment variable is not set.');
    // 返回一个代理对象，在调用时抛出明确的错误，避免 null 导致的隐晦崩溃
    return new Proxy({} as ReturnType<typeof postgres>, {
      get(_target, prop) {
        throw new Error(
          `[db] Database connection failed: DATABASE_URL is not configured. ` +
          `Attempted to access "sql.${String(prop)}". ` +
          `Please set DATABASE_URL in your .env.local file.`
        );
      },
    });
  }
  return postgres(databaseUrl);
}

export const sql = createDbClient();

// ============================================================================
// 【认证类】
// ============================================================================

/**
 * 根据账号查找用户信息 (兼容 phone 或 username)
 */
export async function findProfileForLogin(identifier: string): Promise<{ data: any; error: Error | null }> {
  const result = await sql`
    SELECT * FROM profiles 
    WHERE phone = ${identifier} 
       OR username = ${identifier} 
       OR username = ${identifier.toLowerCase()} 
    LIMIT 1
  `;
  return { data: result[0] || null, error: null };
}

/**
 * 根据 ID 查找用户信息
 */
export async function getProfileById(id: string): Promise<{ data: any; error: Error | null }> {
  const result = await sql`SELECT * FROM profiles WHERE id = ${id} LIMIT 1`;
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

    const allowedRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER'];
    return allowedRoles.includes(profile.role);
  } catch (error) {
    console.error("[checkIsAdmin] Error:", error);
    return false;
  }
}

// ============================================================================
// 【经销商数据类】
// ============================================================================

/**
 * 获取用户关联的经销商信息（按 profile_id）
 */
export async function getDealersByProfileId(profileId: string): Promise<{ data: any[]; error: Error | null }> {
  const result = await sql`
    SELECT * FROM dealers 
    WHERE profile_id = ${profileId}
  `;
  return { data: result || [], error: null };
}

/**
 * 获取单个经销商详情（按 ID）
 */
export async function getDealerById(dealerId: string): Promise<{ data: any; error: Error | null }> {
  const result = await sql`SELECT * FROM dealers WHERE id = ${dealerId} LIMIT 1`;
  return { data: result[0] || null, error: null };
}

/**
 * 获取所有经销商列表（带证书计数和 profile_id）
 */
export async function getAllDealers(): Promise<{ data: any[]; error: Error | null }> {
  try {
    const result = await sql`
      SELECT d.* FROM dealers d ORDER BY d.created_at DESC
    `;
    return { data: result || [], error: null };
  } catch (err: any) {
    return { data: [], error: new Error(err.message || '数据库查询失败') };
  }
}

// ============================================================================
// 【证书数据类】
// ============================================================================

/**
 * 获取经销商的证书列表
 */
export async function getCertificatesByDealerId(dealerId: string): Promise<{ data: any[]; error: Error | null }> {
  const result = await sql`
    SELECT * FROM certificates 
    WHERE dealer_id = ${dealerId}
    ORDER BY created_at DESC
  `;
  // 日期格式化：postgres 库返回 JS Date 对象，前端期望字符串
  const formatted = result.map((row: any) => ({
    ...row,
    start_date: row.start_date instanceof Date
      ? row.start_date.toISOString().split('T')[0]
      : row.start_date,
    end_date: row.end_date instanceof Date
      ? row.end_date.toISOString().split('T')[0]
      : row.end_date,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  }));
  return { data: formatted || [], error: null };
}

/**
 * 获取待核发证书列表（用于管理面板）
 */
export async function getPendingCertificates(limit?: number): Promise<{ data: any[]; error: Error | null }> {
  const result = await sql`
    SELECT c.*, d.company_name, d.phone, p.id as auditor_id, p.full_name as auditor_name
    FROM certificates c
    LEFT JOIN dealers d ON c.dealer_id = d.id
    LEFT JOIN profiles p ON c.auditor_id = p.id
    WHERE c.status = 'PENDING'
    ORDER BY c.created_at ASC
    ${limit ? sql`LIMIT ${limit}` : sql``}
  `;
  // 日期格式化：postgres 库返回 JS Date 对象，前端期望字符串格式
  const formatted = result.map((row: any) => ({
    ...row,
    start_date: row.start_date instanceof Date
      ? row.start_date.toISOString().split('T')[0]
      : row.start_date,
    end_date: row.end_date instanceof Date
      ? row.end_date.toISOString().split('T')[0]
      : row.end_date,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
    dealers: row.company_name ? {
      company_name: row.company_name,
      phone: row.phone
    } : null
  }));
  return { data: formatted || [], error: null };
}

/**
 * 获取所有证书列表（用于管理面板 - 不仅限待审状态）
 */
export async function getAllCertificates(limit?: number): Promise<{ data: any[]; error: Error | null }> {
  const result = await sql`
    SELECT c.*, d.company_name, d.phone, p.id as auditor_id, p.full_name as auditor_name
    FROM certificates c
    LEFT JOIN dealers d ON c.dealer_id = d.id
    LEFT JOIN profiles p ON c.auditor_id = p.id
    ORDER BY c.created_at DESC
    ${limit ? sql`LIMIT ${limit}` : sql``}
  `;
  // 转换为嵌套结构以兼容前端（与 Supabase 返回格式一致）
  // postgres 库将 DATE 转为 JS Date 对象，前端期望字符串格式
  const formatted = result.map((row: any) => ({
    ...row,
    start_date: row.start_date instanceof Date
      ? row.start_date.toISOString().split('T')[0]
      : row.start_date,
    end_date: row.end_date instanceof Date
      ? row.end_date.toISOString().split('T')[0]
      : row.end_date,
    dealers: row.company_name ? {
      company_name: row.company_name,
      phone: row.phone
    } : null
  }));
  return { data: formatted || [], error: null };
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
  return { data: { count: parseInt(result[0]?.count || 0) }, error: null };
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
): Promise<{ data: any[]; total: number; error: Error | null }> {
  try {
    const limit = pageSize && pageSize > 0 ? pageSize : 50;
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

    const total = parseInt(countRes[0]?.count || 0);

    return { data: result || [], total, error: null };
  } catch (err: any) {
    return { data: [], total: 0, error: new Error(err.message || '数据库查询失败') };
  }
}

/**
 * 获取待处理投诉（PENDING + INVESTIGATING）
 */
export async function getPendingComplaints(): Promise<{ data: any[]; error: Error | null }> {
  const result = await sql`
    SELECT * FROM complaints
    WHERE status IN ('PENDING', 'INVESTIGATING')
    ORDER BY created_at DESC
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
  return { data: { count: parseInt(result[0]?.count || 0) }, error: null };
}

/**
 * 删除投诉工单（软/硬删除）
 */
export async function deleteComplaint(id: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    await sql`DELETE FROM complaints WHERE id = ${id}`;
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: new Error(err.message || '删除失败') };
  }
}

// ============================================================================
// 【系统统计类】
// ============================================================================

/**
 * 获取系统仪表板统计数据
 */
export async function getDashboardStats(): Promise<{ data: any; error: Error | null }> {
  const [certCountRes, complaintCountRes, issuedCountRes] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM certificates`,
    sql`SELECT COUNT(*) as count FROM complaints WHERE status IN ('PENDING', 'INVESTIGATING')`,
    sql`SELECT COUNT(*) as count FROM certificates WHERE status = 'ISSUED' AND end_date >= CURRENT_DATE`
  ]);
  
  return {
    data: {
      totalCertificates: parseInt(certCountRes[0]?.count || 0),
      pendingComplaints: parseInt(complaintCountRes[0]?.count || 0),
      issuedValid: parseInt(issuedCountRes[0]?.count || 0)
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
    const records = await sql`
      SELECT attempts, window_start FROM action_rate_limits
      WHERE key = ${key}
      LIMIT 1
    `;

    if (records.length === 0) {
      await sql`
        INSERT INTO action_rate_limits (key, attempts, window_start)
        VALUES (${key}, 1, ${now})
      `;
      return true;
    }

    const record = records[0];
    const recordWindowStart = new Date(record.window_start);

    if (recordWindowStart < windowStart) {
      await sql`
        UPDATE action_rate_limits
        SET attempts = 1, window_start = ${now}
        WHERE key = ${key}
      `;
      return true;
    }

    if (record.attempts >= maxAttempts) {
      return false;
    }

    await sql`
      UPDATE action_rate_limits
      SET attempts = attempts + 1
      WHERE key = ${key}
    `;
    return true;
  } catch (err) {
    console.error('[RateLimit] 数据库查询失败，跳过限速检查:', err);
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
  } catch (err: any) {
    console.error('[AuditLog] 创建投诉审计日志失败:', err);
    return { success: false, error: new Error(err.message || '审计日志写入失败') };
  }
}

/**
 * 获取投诉审核日志
 */
export async function getComplaintAuditLogs(complaintId: string): Promise<{ data: any[]; error: Error | null }> {
  try {
    const result = await sql`
      SELECT a.*, p.full_name as actor_name, p.username as actor_username
      FROM audit_logs a
      LEFT JOIN profiles p ON a.actor_id = p.id
      WHERE a.complaint_id = ${complaintId}
      ORDER BY a.created_at DESC
    `;
    return { data: result || [], error: null };
  } catch (err: any) {
    return { data: [], error: new Error(err.message || '查询审计日志失败') };
  }
}
