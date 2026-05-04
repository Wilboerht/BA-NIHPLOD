import postgres from 'postgres';

/**
 * 原生 Postgres 连接池
 * 请在 .env.local 中配置 DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
 */
export const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL)
  : (null as any);

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
 * 获取所有投诉列表
 */
export async function getAllComplaints(): Promise<{ data: any[]; error: Error | null }> {
  const result = await sql`
    SELECT * FROM complaints
    ORDER BY created_at DESC
  `;
  return { data: result || [], error: null };
}

/**
 * 获取待处理投诉
 */
export async function getPendingComplaints(): Promise<{ data: any[]; error: Error | null }> {
  const result = await sql`
    SELECT * FROM complaints
    WHERE status = 'PENDING'
    ORDER BY created_at DESC
  `;
  return { data: result || [], error: null };
}

/**
 * 获取待处理投诉计数
 */
export async function getPendingComplaintsCount(): Promise<{ data: { count: number }; error: Error | null }> {
  const result = await sql`
    SELECT COUNT(*) as count
    FROM complaints
    WHERE status = 'PENDING'
  `;
  return { data: { count: parseInt(result[0]?.count || 0) }, error: null };
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
    sql`SELECT COUNT(*) as count FROM complaints WHERE status = 'PENDING'`,
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
