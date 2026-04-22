import postgres from 'postgres';
import { supabaseAdmin } from './supabase-admin'; // 保留用于 Supabase 模式

// 本地 Postgres 模式（已弃用 Supabase，始终使用本地数据库）
export const USE_LOCAL_DB = true;

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
export async function findProfileForLogin(identifier: string) {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`
      SELECT * FROM profiles 
      WHERE phone = ${identifier} 
         OR username = ${identifier} 
         OR username = ${identifier.toLowerCase()} 
      LIMIT 1
    `;
    return { data: result[0] || null, error: null };
  } else {
    // Supabase 模式
    const { data: phoneProfile, error: phoneErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('phone', identifier)
      .maybeSingle();
      
    if (phoneProfile) return { data: phoneProfile, error: null };

    const { data: userProfile, error: userErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('username', identifier)
      .maybeSingle();

    if (userProfile) return { data: userProfile, error: null };
    
    return await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('username', identifier.toLowerCase())
      .maybeSingle();
  }
}

/**
 * 根据 ID 查找用户信息
 */
export async function getProfileById(id: string) {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`SELECT * FROM profiles WHERE id = ${id} LIMIT 1`;
    return { data: result[0] || null, error: null };
  } else {
    return await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
  }
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
export async function getDealersByProfileId(profileId: string) {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`
      SELECT * FROM dealers 
      WHERE profile_id = ${profileId}
    `;
    return { data: result || [], error: null };
  } else {
    return await supabaseAdmin
      .from('dealers')
      .select('*')
      .eq('profile_id', profileId);
  }
}

/**
 * 获取单个经销商详情（按 ID）
 */
export async function getDealerById(dealerId: string) {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`SELECT * FROM dealers WHERE id = ${dealerId} LIMIT 1`;
    return { data: result[0] || null, error: null };
  } else {
    return await supabaseAdmin
      .from('dealers')
      .select('*')
      .eq('id', dealerId)
      .single();
  }
}

/**
 * 获取所有经销商列表（带证书计数和 profile_id）
 */
export async function getAllDealers() {
  if (USE_LOCAL_DB && sql) {
    try {
      const result = await sql`
        SELECT d.* FROM dealers d ORDER BY d.created_at DESC
      `;
      return { data: result || [], error: null };
    } catch (err: any) {
      return { data: [], error: new Error(err.message || '本地数据库查询失败') };
    }
  } else {
    try {
      const { data, error } = await supabaseAdmin
        .from('dealers')
        .select('*')
        .order('created_at', { ascending: false });
      return { data, error };
    } catch (err: any) {
      return { data: [], error: new Error(err.message || 'Supabase 查询失败') };
    }
  }
}

// ============================================================================
// 【证书数据类】
// ============================================================================

/**
 * 获取经销商的证书列表
 */
export async function getCertificatesByDealerId(dealerId: string) {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`
      SELECT * FROM certificates 
      WHERE dealer_id = ${dealerId}
      ORDER BY created_at DESC
    `;
    return { data: result || [], error: null };
  } else {
    return await supabaseAdmin
      .from('certificates')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });
  }
}

/**
 * 获取待核发证书列表（用于管理面板）
 */
export async function getPendingCertificates(limit?: number) {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`
      SELECT c.*, d.company_name, d.phone, p.id as auditor_id, p.full_name as auditor_name
      FROM certificates c
      LEFT JOIN dealers d ON c.dealer_id = d.id
      LEFT JOIN profiles p ON c.auditor_id = p.id
      WHERE c.status = 'PENDING'
      ORDER BY c.created_at ASC
      ${limit ? sql`LIMIT ${limit}` : sql``}
    `;
    return { data: result || [], error: null };
  } else {
    let query = supabaseAdmin
      .from('certificates')
      .select('id, cert_number, auth_scope, start_date, end_date, status, created_at, auditor_id, dealers(company_name, phone)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });
    
    if (limit) {
      query = query.limit(limit);
    }
    
    const result = await query;
    return result;
  }
}

/**
 * 获取所有证书列表（用于管理面板 - 不仅限待审状态）
 */
export async function getAllCertificates(limit?: number) {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`
      SELECT c.*, d.company_name, d.phone, p.id as auditor_id, p.full_name as auditor_name
      FROM certificates c
      LEFT JOIN dealers d ON c.dealer_id = d.id
      LEFT JOIN profiles p ON c.auditor_id = p.id
      ORDER BY c.created_at DESC
      ${limit ? sql`LIMIT ${limit}` : sql``}
    `;
    return { data: result || [], error: null };
  } else {
    let query = supabaseAdmin
      .from('certificates')
      .select('id, cert_number, auth_scope, start_date, end_date, status, created_at, auditor_id, dealers(company_name, phone)')
      .order('created_at', { ascending: false });
    
    if (limit) {
      query = query.limit(limit);
    }
    
    const result = await query;
    return result;
  }
}

/**
 * 获取已签发且在有效期内的证书计数
 */
export async function getActiveIssuedCertificatesCount() {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`
      SELECT COUNT(*) as count
      FROM certificates
      WHERE status = 'ISSUED' 
      AND end_date >= CURRENT_DATE
    `;
    return { data: { count: parseInt(result[0]?.count || 0) }, error: null };
  } else {
    const result = await supabaseAdmin
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ISSUED')
      .gte('end_date', new Date().toISOString().split('T')[0]);
    
    return { data: { count: result.count || 0 }, error: result.error };
  }
}

// ============================================================================
// 【投诉数据类】
// ============================================================================

/**
 * 获取所有投诉列表
 */
export async function getAllComplaints() {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`
      SELECT * FROM complaints
      ORDER BY created_at DESC
    `;
    return { data: result || [], error: null };
  } else {
    return await supabaseAdmin
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false });
  }
}

/**
 * 获取待处理投诉
 */
export async function getPendingComplaints() {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`
      SELECT * FROM complaints
      WHERE status = 'PENDING'
      ORDER BY created_at DESC
    `;
    return { data: result || [], error: null };
  } else {
    return await supabaseAdmin
      .from('complaints')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });
  }
}

/**
 * 获取待处理投诉计数
 */
export async function getPendingComplaintsCount() {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`
      SELECT COUNT(*) as count
      FROM complaints
      WHERE status = 'PENDING'
    `;
    return { data: { count: parseInt(result[0]?.count || 0) }, error: null };
  } else {
    const result = await supabaseAdmin
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PENDING');
    
    return { data: { count: result.count || 0 }, error: result.error };
  }
}

// ============================================================================
// 【系统统计类】
// ============================================================================

/**
 * 获取系统仪表板统计数据
 */
export async function getDashboardStats(): Promise<{ data: any; error: Error | null }> {
  if (USE_LOCAL_DB && sql) {
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
  } else {
    const [certRes, complaintRes, issuedRes] = await Promise.all([
      supabaseAdmin.from('certificates').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabaseAdmin.from('certificates').select('*', { count: 'exact', head: true }).eq('status', 'ISSUED').gte('end_date', new Date().toISOString().split('T')[0])
    ]);

    return {
      data: {
        totalCertificates: certRes.count || 0,
        pendingComplaints: complaintRes.count || 0,
        issuedValid: issuedRes.count || 0
      },
      error: null
    };
  }
}
