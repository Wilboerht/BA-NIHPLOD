#!/usr/bin/env node

/**
 * 初始化 Supabase Storage Buckets
 * 创建证书和签章存储桶
 * 
 * 使用方法：
 * node scripts/initStorageBuckets.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('❌ Missing Supabase configuration');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceRole ? '✓' : '✗');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function initializeBuckets() {
  try {
    console.log('🚀 初始化 Supabase Storage Buckets...\n');

    // 1. 列出现有的 buckets
    console.log('📋 检查现有 buckets...');
    const { data: existingBuckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    
    if (listError) {
      console.error('❌ 无法列出 buckets:', listError);
      process.exit(1);
    }

    const bucketNames = existingBuckets.map(b => b.name);
    console.log(`   找到 ${bucketNames.length} 个现有 bucket: ${bucketNames.join(', ') || '(无)'}\n`);

    // 2. 创建 certificates bucket
    if (!bucketNames.includes('certificates')) {
      console.log('📦 创建 certificates bucket...');
      const { data: certBucket, error: certError } = await supabaseAdmin.storage.createBucket('certificates', {
        public: true, // 通过 getPublicUrl 生成公开链接
        fileSizeLimit: 52428800 // 50MB
      });

      if (certError) {
        console.error('❌ 创建 certificates bucket 失败:', certError);
        process.exit(1);
      }
      console.log('✅ certificates bucket 创建成功\n');
    } else {
      console.log('✅ certificates bucket 已存在\n');
    }

    // 3. 验证 bucket 访问权限
    console.log('🔐 验证 bucket 访问权限...');
    const { data: testUpload, error: testError } = await supabaseAdmin.storage
      .from('certificates')
      .upload('_test/test.txt', new Blob(['test']), {
        upsert: true,
        cacheControl: '0'
      });

    if (testError) {
      console.error('❌ 无法写入 certificates bucket:', testError);
      process.exit(1);
    }

    // 清理测试文件
    await supabaseAdmin.storage.from('certificates').remove(['_test/test.txt']);
    console.log('✅ bucket 访问权限正常\n');

    // 4. 输出配置信息
    console.log('📝 配置信息：');
    console.log(`   Supabase URL: ${supabaseUrl}`);
    console.log(`   Storage Bucket: certificates`);
    console.log(`   Public: true (支持 getPublicUrl 生成公开链接)`);
    console.log(`   File Size Limit: 50MB\n`);

    console.log('✨ Supabase Storage Buckets 初始化完成！');
    console.log('   现在可以上传证书图片和签章了。');
  } catch (err) {
    console.error('❌ 初始化过程出错:', err);
    process.exit(1);
  }
}

// 运行初始化
initializeBuckets();
