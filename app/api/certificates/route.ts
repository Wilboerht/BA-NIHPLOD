import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

/**
 * 🔑 证书管理 API - 关键设计决策文档
 * 
 * 问题背景：
 * 同一经销商可能用多个门店名称，但对应唯一的手机号和账户
 * 示例：
 *   - dealer1: 名字="用来测试的门店", phone="11111111111"
 *   - dealer2: 名字="dsfsffsfdsfdsfsa", phone="11111111111"
 *   - 这两个是同一个账户，应该共用 profile
 * 
 * 解决方案：
 * ✅ Profile 关联规则：按手机号（username）进行关联
 *   - profiles.username = dealers.phone (关键！)
 *   - profiles.full_name = 当前的经销商名称（会变化）
 *   
 * ❌ 已废弃规则：
 *   - profiles.full_name ↔ dealers.company_name (导致同手机号显示多个状态)
 * 
 * 应用场景：
 * 1. [经销商主页] /workbench/dealers
 *    - 按 phone 分组经销商
 *    - 用 profiles.username 查询对应 profile
 *    - 结果：同 phone 的所有门店都显示为同一账户状态
 * 
 * 2. [证书审核] PUT /api/certificates
 *    - 创建 profile 时：username = phone（关键）
 *    - full_name = 当前提交的经销商名称
 *    - 已存在时：仅更新密码，保留原有 is_first_login 状态
 * 
 * 3. [登录验证] /api/auth/login
 *    - 用户输入：username（手机号）
 *    - 查询：SELECT ... WHERE username = ?
 *    - 自动解决：同手机号登录后自动访问对应账户
 */

/**
 * 辅助函数：将 Data URL 转换为 Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return new Blob([u8arr], { type: 'image/png' });
}

/**
 * 辅助函数：上传证书图片到 Supabase Storage
 */
async function uploadCertificateImage(
  supabaseAdmin: any,
  certNumber: string,
  imageDataUrl: string
): Promise<string> {
  try {
    if (!imageDataUrl || !imageDataUrl.startsWith('data:')) {
      console.warn('Invalid image data URL provided');
      return '';
    }

    const blob = dataUrlToBlob(imageDataUrl);
    const fileName = `certificates/${certNumber}-${Date.now()}.png`;
    
    const { data, error } = await supabaseAdmin.storage
      .from('certificates')
      .upload(fileName, blob, {
        contentType: 'image/png',
        upsert: false
      });

    if (error) {
      console.error('Failed to upload certificate image:', error);
      return '';
    }

    // 生成公开 URL
    const { data: urlData } = supabaseAdmin.storage
      .from('certificates')
      .getPublicUrl(fileName);

    return urlData?.publicUrl || '';
  } catch (err) {
    console.error('Certificate image upload error:', err);
    return '';
  }
}

/**
 * 辅助函数：上传印章图片到 Supabase Storage
 * 用于存储用户上传的自定义印章，与证书图片分开管理
 */
async function uploadSealImage(
  supabaseAdmin: any,
  certNumber: string,
  sealImageDataUrl: string
): Promise<string> {
  try {
    if (!sealImageDataUrl) {
      return ''; // 无印章数据
    }

    // 如果是 Data URL（用户上传的自定义印章），上传到 Storage
    if (sealImageDataUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(sealImageDataUrl);
      const fileName = `seals/${certNumber}-${Date.now()}.png`;
      
      const { data, error } = await supabaseAdmin.storage
        .from('certificates')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: false
        });

      if (error) {
        console.warn('Failed to upload seal image:', error);
        return ''; // 失败时返回空，会降级到模板默认印章
      }

      const { data: urlData } = supabaseAdmin.storage
        .from('certificates')
        .getPublicUrl(fileName);

      return urlData?.publicUrl || '';
    } else {
      // 如果已经是 URL（模板中的默认印章），直接返回
      return sealImageDataUrl;
    }
  } catch (err) {
    console.warn('Seal image upload error:', err);
    return '';
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, certData, managerId, certId } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // ✅ 验证 managerId
    if (managerId) {
      const { data: managerExists, error: managerCheckErr } = await supabaseAdmin
        .from('profiles')
        .select('id, username, role')
        .eq('id', managerId)
        .maybeSingle();

      if (managerCheckErr || !managerExists) {
        console.error(`❌ Manager ID 在数据库中不存在或出错: ${managerId}`);
        return NextResponse.json(
          { error: `❌ 身份验证失效：您的登录信息已过期（账户不存在于数据库中）。\n\n请清除浏览器缓存重新登录：\n1. F12 打开开发工具\n2. 应用程序(Application) → 存储(Storage) → 会话存储(SessionStorage)\n3. 清除所有内容\n4. 重新刷新页面并登录。` },
          { status: 403 }
        );
      }
    }

    // --- 流程 1: 审核员提报 (录入数据，状态为 PENDING) ---
    if (action === 'create_pending') {
      // 创建或获取经销商 (通过 phone 去重)
      const { data: existingDealer } = await supabaseAdmin
          .from('dealers')
          .select('id')
          .eq('phone', certData.phone)
          .maybeSingle();

      let dealerId;
      if (existingDealer) {
          dealerId = existingDealer.id;
          // 保留原有的公司名，不要覆盖
      } else {
          const { data: newDealer, error: insErr } = await supabaseAdmin
              .from('dealers')
              .insert({ 
                  company_name: certData.shopName,
                  phone: certData.phone 
              })
              .select('id')
              .single();
          
          if (insErr || !newDealer) throw new Error(`经销商（${certData.shopName}）基础档案录入失败: ${insErr?.message}`);
          dealerId = newDealer.id;
      }

      const { data: cert, error: certErr } = await supabaseAdmin.from('certificates').insert({
        cert_number: `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        dealer_id: dealerId,
        auth_scope: certData.platformId + ' | ' + certData.scopeText,
        start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
        end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
        status: 'PENDING', // 待审核
        auditor_id: managerId, // 提报人作为初审人
        manager_id: null
      }).select().single();

      if (certErr) throw certErr;
      return NextResponse.json({ success: true, status: 'PENDING' });
    }

    // --- 流程 2: 项目负责人审核通过并核发 (创建账户 + 状态转为 ISSUED) ---
    if (action === 'approve_issue') {
      let certDataDb;
      let certNumber: string;
      
      if (certId) {
        // A. 系统流程：处理已有的待审核记录 (通过 ID)
        const { data: dbData, error: getCertErr } = await supabaseAdmin
          .from('certificates')
          .select('*, dealers(*)')
          .eq('id', certId)
          .single();
        if (getCertErr || !dbData) throw new Error("未找到待审核证书 (ID: " + certId + ")");
        certDataDb = dbData;
        certNumber = dbData.cert_number;
      } else if (certData) {
        // B. 管理员直发：直接根据新提交的数据开号 (无 ID)
        // 1. 先查找是否已有该手机号的经销商 (通过 phone 去重)
        const { data: existingDealer } = await supabaseAdmin
            .from('dealers')
            .select('id')
            .eq('phone', certData.phone)
            .maybeSingle();

        let dealerId;
        if (existingDealer) {
            dealerId = existingDealer.id;
            // 保留原有的公司名，不要覆盖
        } else {
            const { data: newDealer, error: insErr } = await supabaseAdmin
                .from('dealers')
                .insert({ 
                    company_name: certData.shopName,
                    phone: certData.phone 
                })
                .select('id')
                .single();
            
            if (insErr || !newDealer) throw new Error(`经销商（${certData.shopName}）基础档案录入失败: ${insErr?.message}`);
            dealerId = newDealer.id;
        }

        certNumber = `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        
        // 上传证书图片
        let finalImageUrl = '';
        if (certData.certImageDataUrl) {
          finalImageUrl = await uploadCertificateImage(supabaseAdmin, certNumber, certData.certImageDataUrl);
        }

        const { data: newCert, error: certErr } = await supabaseAdmin.from('certificates').insert({
            cert_number: certNumber,
            dealer_id: dealerId,
            auth_scope: certData.platformId + ' | ' + certData.scopeText,
            start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
            end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
            status: 'ISSUED', 
            final_image_url: finalImageUrl,
            seal_url: '',  // 不使用自定义签章，仅使用默认公章
            manager_id: managerId
        }).select('*, dealers(*)').single();

        if (certErr) throw certErr;
        certDataDb = newCert;
      } else {
        throw new Error("缺少核发数据");
      }

// 上传证书图片（如果在PENDING流程中）
      if (certId && certData?.certImageDataUrl) {
        const finalImageUrl = await uploadCertificateImage(supabaseAdmin, certNumber, certData.certImageDataUrl);
        
        const { error: updateImgErr } = await supabaseAdmin
          .from('certificates')
          .update({ 
            final_image_url: finalImageUrl,
            seal_url: ''  // 不使用自定义签章，仅使用默认公章
          })
          .eq('id', certId);

        if (updateImgErr) {
          console.warn('Failed to update certificate image URL:', updateImgErr);
        }
      }

      const phone = certDataDb.dealers.phone;
      const passwordHash = await bcrypt.hash(phone, 10);

      // 1. 创建经销商本地账户 (不使用 Supabase auth)
      // 注意：按手机号（username）关联，同一手机号为同一账户
      // 先检查是否已有此电话号的经销商账户
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, is_first_login')
        .eq('username', phone)  // 按 username（手机号）查询
        .maybeSingle();

      let profileId;
      if (existingProfile) {
        // 已存在，仅更新密码（不重置 is_first_login，保留原有状态）
        profileId = existingProfile.id;
        await supabaseAdmin
          .from('profiles')
          .update({ password_hash: passwordHash })
          .eq('id', profileId);
      } else {
        // 新建账户：生成一个临时 UUID 作为 profile id（不需要实际的 auth.users）
        const { data: newProfile, error: profileErr } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: crypto.randomUUID(),
            username: phone,  // 关键：username 存储手机号，用于关联
            full_name: certDataDb.dealers.company_name,
            phone: phone,
            password_hash: passwordHash,
            role: 'DEALER',
            is_first_login: true
          })
          .select('id')
          .single();

        if (profileErr || !newProfile) {
          throw new Error(`经销商账户创建失败: ${profileErr?.message}`);
        }
        profileId = newProfile.id;
      }

      // 2. 如果是从待审核转为ISSUED，需要更新证书状态
      if (certId) {
        const { error: updateErr } = await supabaseAdmin
          .from('certificates')
          .update({ 
            status: 'ISSUED', 
            manager_id: managerId
          })
          .eq('id', certId);

        if (updateErr) throw updateErr;
      }

      return NextResponse.json({ success: true, status: 'ISSUED', phone, password: phone });
    }

    // --- 流程 3: 吊销证书 (管理员行为) ---
    if (action === 'revoke_certificate') {
        const { data: cert, error: certErr } = await supabaseAdmin
            .from('certificates')
            .select('*, dealers(*)')
            .eq('id', certId)
            .single();
        
        if (certErr || !cert) throw new Error("未找到对应证书");

        // 更新数据库状态为 REVOKED
        const { error: updateErr } = await supabaseAdmin
            .from('certificates')
            .update({ status: 'REVOKED' })
            .eq('id', certId);
        
        if (updateErr) throw updateErr;

        return NextResponse.json({ success: true, status: 'REVOKED' });
    }

    // --- 流程 4: 退回/拒绝 审核员提交的申请 ---
    if (action === 'reject_pending') {
      if (!certId) throw new Error("缺少证书 ID");

      const { error: updateErr } = await supabaseAdmin
        .from('certificates')
        .update({ status: 'REJECTED', manager_id: managerId })
        .eq('id', certId)
        .eq('status', 'PENDING'); // 只能退回 PENDING 状态的申请

      if (updateErr) throw updateErr;

      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
