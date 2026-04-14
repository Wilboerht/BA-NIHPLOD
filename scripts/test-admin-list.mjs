#!/usr/bin/env node

/**
 * 测试 /api/admin/list 端点是否返回 is_banned 字段
 */

const BASE_URL = 'http://localhost:3000';

async function testAdminListEndpoint() {
  console.log('🧪 测试 /api/admin/list 端点...\n');

  try {
    const response = await fetch(`${BASE_URL}/api/admin/list`);
    
    if (!response.ok) {
      console.error(`❌ 端点返回错误: ${response.status} ${response.statusText}`);
      return;
    }

    const result = await response.json();
    console.log('✅ 成功获取数据\n');

    if (result.error) {
      console.error(`❌ API 返回错误: ${result.error}`);
      return;
    }

    const data = result.data || [];
    
    if (data.length === 0) {
      console.warn('⚠️  管理员列表为空');
      return;
    }

    console.log(`✅ 找到 ${data.length} 个管理员记录\n`);

    // 分析返回的字段
    const firstRecord = data[0];
    console.log('📋 第一条记录的字段:');
    console.log('─'.repeat(50));
    
    const fields = Object.keys(firstRecord);
    fields.forEach(field => {
      const value = firstRecord[field];
      const hasValue = value !== null && value !== undefined ? '✓' : '✗';
      console.log(`  ${hasValue} ${field}: ${JSON.stringify(value)}`);
    });

    console.log('─'.repeat(50) + '\n');

    // 检查是否包含 is_banned 字段
    if ('is_banned' in firstRecord) {
      console.log('✅ 数据包含 is_banned 字段\n');
      
      // 统计禁用状态
      const bannedCount = data.filter(item => item.is_banned === true).length;
      const activetCount = data.filter(item => item.is_banned === false).length;
      
      console.log(`📊 账户状态统计:`);
      console.log(`  • 已激活: ${activetCount}`);
      console.log(`  • 已禁用: ${bannedCount}\n`);
    } else {
      console.error('❌ 数据不包含 is_banned 字段');
      console.log('\n🔧 可能的原因:');
      console.log('  1. 数据库中 profiles 表缺少 is_banned 列');
      console.log('  2. 需要运行迁移脚本添加该列');
      console.log('  3. 建议执行: npm run migrate\n');
    }

  } catch (error) {
    console.error(`❌ 请求失败: ${error.message}`);
    console.log('\n💡 提示: 确保开发服务器正在 http://localhost:3000 运行');
    console.log('   执行: npm run dev\n');
  }
}

testAdminListEndpoint();
