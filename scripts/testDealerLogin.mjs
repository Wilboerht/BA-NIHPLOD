import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
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

async function testDealerLogin() {
  console.log('🔍 开始测试经销商登录...\n');
  
  const testPhone = '11111111111';
  
  try {
    // 第1步：查询用户
    console.log(`1️⃣  查询用户 (phone: ${testPhone})...`);
    const { data: phoneProfile, error: phoneErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('phone', testPhone)
      .maybeSingle();
    
    if (phoneErr) {
      console.log('   ❌ 按phone查询出错:', phoneErr);
    } else if (phoneProfile) {
      console.log('   ✅ 找到用户！');
      console.log('   用户信息:', {
        id: phoneProfile.id,
        username: phoneProfile.username,
        full_name: phoneProfile.full_name,
        phone: phoneProfile.phone,
        role: phoneProfile.role,
        is_first_login: phoneProfile.is_first_login,
        password_hash: phoneProfile.password_hash
      });
    } else {
      console.log('   ⚠️  按phone未找到用户');
      
      // 尝试按username查询
      console.log(`\n2️⃣  尝试按username查询 (${testPhone})...`);
      const { data: usernameProfile, error: usernameErr } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('username', testPhone)
        .maybeSingle();
      
      if (usernameErr) {
        console.log('   ❌ 按username查询出错:', usernameErr);
      } else if (usernameProfile) {
        console.log('   ✅ 按username找到用户！');
        console.log('   用户信息:', usernameProfile);
      } else {
        console.log('   ⚠️  按username也未找到用户');
      }
      return;
    }

    // 第2步：测试密码验证
    console.log(`\n2️⃣  测试密码验证...`);
    
    // 测试一些常见的密码
    const testPasswords = [
      '11111111111',
      '111111',
      '123456',
      'test123',
      'password',
      '用来测试的门店'
    ];
    
    for (const testPassword of testPasswords) {
      try {
        const isValid = await bcrypt.compare(testPassword, phoneProfile.password_hash || '');
        console.log(`   密码 "${testPassword}": ${isValid ? '✅ 正确' : '❌ 错误'}`);
      } catch (err) {
        console.log(`   密码 "${testPassword}": ❌ 验证出错 - ${err.message}`);
      }
    }

  } catch (err) {
    console.error('❌ 测试出错:', err);
  }
}

testDealerLogin();
