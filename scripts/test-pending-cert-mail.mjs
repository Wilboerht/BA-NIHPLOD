#!/usr/bin/env node
/**
 * 测试脚本：发送证书待审核通知邮件
 * 用法：node scripts/test-pending-cert-mail.mjs <收件人邮箱>
 * 示例：node scripts/test-pending-cert-mail.mjs admin@example.com
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';

// 加载 .env.local
const __dirname = fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'noreply@nihplod.cn';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ba.nihplod.cn';

const recipient = process.argv[2];

if (!recipient) {
  console.error('❌ 请提供收件人邮箱');
  console.error('用法：node scripts/test-pending-cert-mail.mjs <收件人邮箱>');
  process.exit(1);
}

if (!RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY 未配置，无法发送邮件');
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

// 模拟真实的通知内容
const shopName = '测试店铺（北京旗舰店）';
const certNumber = 'NIHPLOD-TEST-20260527-001';
const auditorName = '张审核';
const duration = '2026-05-27 ~ 2027-05-26';
const dashboardUrl = `${BASE_URL}/workbench/certificates`;

const text = `有新的授权资质申请待审核

━━━━━━━━━━━━━━━━━━━━
店铺/平台名称：${shopName}
证书编号：${certNumber}
提报人：${auditorName}
有效期：${duration}
━━━━━━━━━━━━━━━━━━━━

请登录管理后台核查：
${dashboardUrl}

—— NIHPLOD 品牌授权管理平台`;

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>待审核通知</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #d97706; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">📋 有新的授权资质申请待审核</h2>
  
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #fef3c7; border-radius: 8px;">
    <tr><td style="padding: 12px 16px; font-weight: bold; width: 120px;">店铺/平台名称</td><td style="padding: 12px 16px;">${shopName}</td></tr>
    <tr style="background: #fffbeb;"><td style="padding: 12px 16px; font-weight: bold;">证书编号</td><td style="padding: 12px 16px; font-family: monospace;">${certNumber}</td></tr>
    <tr><td style="padding: 12px 16px; font-weight: bold;">提报人</td><td style="padding: 12px 16px;">${auditorName}</td></tr>
    <tr style="background: #fffbeb;"><td style="padding: 12px 16px; font-weight: bold;">有效期</td><td style="padding: 12px 16px;">${duration}</td></tr>
  </table>
  
  <p style="text-align: center; margin: 30px 0;">
    <a href="${dashboardUrl}" style="display: inline-block; background: #d97706; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 500;">登录管理后台核查</a>
  </p>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    本邮件由 NIHPLOD 品牌授权管理平台自动发送<br>
    如非本人操作，请忽略此邮件
  </p>
</body>
</html>`;

async function main() {
  console.log('📧 正在发送测试邮件...');
  console.log(`   发件人: ${MAIL_FROM}`);
  console.log(`   收件人: ${recipient}`);
  console.log(`   主题: 【待审核】${shopName} 提交了授权资质申请`);
  console.log(`   API Key: ${RESEND_API_KEY.slice(0, 8)}...`);
  console.log('');

  try {
    const { data, error } = await resend.emails.send({
      from: MAIL_FROM,
      to: recipient,
      subject: `【待审核】${shopName} 提交了授权资质申请`,
      text,
      html,
    });

    if (error) {
      console.error('❌ 发送失败:', error);
      process.exit(1);
    } else {
      console.log('✅ 发送成功!');
      console.log(`   邮件 ID: ${data?.id}`);
      console.log('');
      console.log('提示：如果收件箱未收到，请检查：');
      console.log('  1. 垃圾邮件文件夹');
      console.log('  2. Resend 控制台中的发送记录');
      console.log('  3. 收件人域名是否被 Resend 限制（部分邮箱提供商可能拦截）');
    }
  } catch (err) {
    console.error('❌ 发送异常:', err.message || err);
    process.exit(1);
  }
}

main();
