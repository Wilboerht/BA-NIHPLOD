import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkCertificates() {
  console.log('🔍 检查新创建的证书...\n');
  
  const certNumbers = ['BAVP-2026-6881', 'BAVP-2026-4236'];
  
  for (const certNumber of certNumbers) {
    console.log(`\n📋 检查证书: ${certNumber}`);
    console.log('='.repeat(50));
    
    try {
      const { data: cert, error } = await supabaseAdmin
        .from('certificates')
        .select('id, cert_number, status, final_image_url, start_date, end_date, dealer_id, dealers(*)')
        .eq('cert_number', certNumber)
        .single();
      
      if (error) {
        console.log('❌ 查询错误:', error.message);
        continue;
      }
      
      if (!cert) {
        console.log('❌ 证书不存在');
        continue;
      }
      
      console.log('✅ 证书信息:');
      console.log('  - ID:', cert.id);
      console.log('  - 证书号:', cert.cert_number);
      console.log('  - 状态:', cert.status);
      console.log('  - 有效期:', cert.start_date, '~', cert.end_date);
      console.log('  - 门店:', cert.dealers?.company_name);
      console.log('  - 手机号:', cert.dealers?.phone);
      
      if (cert.final_image_url) {
        const urlLen = cert.final_image_url.length;
        const preview = cert.final_image_url.substring(0, 80);
        console.log('  - 图片URL: 存在 (长度:', urlLen + ')');
        console.log('    预览:', preview);
        
        // 检测是否是数据URL
        if (cert.final_image_url.startsWith('data:')) {
          console.log('    ⚠️  点检测: 这是 BASE64 数据URL');
        } else if (cert.final_image_url.startsWith('http')) {
          console.log('    ℹ️  检测: 这是远程URL');
        } else {
          console.log('    ❓ 检测: URL格式未知');
        }
      } else {
        console.log('  - 图片URL: ❌ NULL 或为空！');
      }
      
    } catch (err) {
      console.error('❌ 错误:', err);
    }
  }
}

checkCertificates();
