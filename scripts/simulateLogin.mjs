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

async function simulateLoginAPI() {
  console.log('🔐 模拟登录API请求...\n');
  
  const phone = '11111111111';
  const password = '11111111111';

  try {
    // Step 1: 查询用户
    console.log('Step 1️⃣  查询用户...');
    let profile = null;
    let profileErr = null;
    
    // 先尝试用 phone 查询
    const { data: phoneProfile, error: phoneErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    
    if (phoneProfile) {
      profile = phoneProfile;
      console.log('   ✅ 按phone找到用户');
    } else if (!phoneErr) {
      // phone 查询无错误但没找到，再用 username 查询
      console.log('   ℹ️  按phone未找到，尝试按username查询...');
      const { data: usernameProfile, error: usernameErr } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('username', phone)
        .maybeSingle();
      
      if (usernameProfile) {
        profile = usernameProfile;
        console.log('   ✅ 按username找到用户');
      } else if (!usernameErr) {
        // username 查询无错误但没找到，再用小写 username 查询
        console.log('   ℹ️  按username未找到，尝试按小写username查询...');
        const { data: usernameLowerProfile, error: usernameLowerErr } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('username', phone.toLowerCase())
          .maybeSingle();
        
        profile = usernameLowerProfile;
        profileErr = usernameLowerErr;
        if (profile) {
          console.log('   ✅ 按小写username找到用户');
        }
      } else {
        profileErr = usernameErr;
      }
    } else {
      profileErr = phoneErr;
    }

    if (profileErr || !profile) {
      console.log('   ❌ 用户不存在');
      return {
        error: '账号或密码错误',
        status: 401
      };
    }

    console.log('   用户详情:', {
      id: profile.id,
      phone: profile.phone,
      username: profile.username,
      full_name: profile.full_name,
      role: profile.role,
      is_first_login: profile.is_first_login
    });

    // Step 2: 验证密码
    console.log('\nStep 2️⃣  验证密码...');
    const isPasswordValid = await bcrypt.compare(password, profile.password_hash || '');
    
    if (!isPasswordValid) {
      console.log('   ❌ 密码错误');
      return {
        error: '账号或密码错误',
        status: 401
      };
    }
    
    console.log('   ✅ 密码正确');

    // Step 3: 返回用户信息
    console.log('\nStep 3️⃣  返回用户信息...');
    const result = {
      success: true,
      user: {
        id: profile.id,
        phone: profile.phone,
        username: profile.username,
        full_name: profile.full_name,
        role: profile.role,
        is_first_login: profile.is_first_login
      }
    };
    
    console.log('   ✅ 登录成功！');
    console.log('   返回数据:', JSON.stringify(result, null, 2));
    
    return result;

  } catch (err) {
    console.error('❌ API错误:', err);
    return {
      error: '登录失败：' + err.message,
      status: 500
    };
  }
}

async function main() {
  const result = await simulateLoginAPI();
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 最终结果:');
  console.log('='.repeat(50));
  console.log(JSON.stringify(result, null, 2));
}

main();
