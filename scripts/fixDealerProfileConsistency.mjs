// scripts/fixDealerProfileConsistency.mjs
/**
 * 🔧 经销商-账户一致性自动修复脚本
 * 
 * 功能：
 * 1. 为孤立的手机号创建 profile
 * 2. 更新 profile 的 full_name 为最新的经销商名称
 * 3. 确保数据关联规则一致
 * 
 * 运行：node scripts/fixDealerProfileConsistency.mjs
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fix() {
  console.log("🔧 开始修复数据一致性...\n");

  const { data: dealers } = await supabaseAdmin.from("dealers").select("*");
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("role", "DEALER");

  let createdCount = 0;
  let updatedCount = 0;

  // 1. 按手机号分组经销商
  const phoneDealerMap = {};
  dealers.forEach((d) => {
    if (!phoneDealerMap[d.phone]) {
      phoneDealerMap[d.phone] = [];
    }
    phoneDealerMap[d.phone].push(d);
  });

  // 2. 为缺失的手机号创建 profile
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("第一步: 创建缺失的 profile\n");

  for (const [phone, dealerList] of Object.entries(phoneDealerMap)) {
    const existingProfile = profiles.find((p) => p.username === phone);

    if (!existingProfile) {
      // 使用最新的经销商名称作为 full_name
      const latestDealer = dealerList[0]; // 按创建时间排序，第一个是最新的
      const fullName = latestDealer.company_name;

      const passwordHash = await bcrypt.hash(phone, 10);

      const { data: newProfile, error } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: crypto.randomUUID(),
          username: phone,
          full_name: fullName,
          phone: phone,
          password_hash: passwordHash,
          role: "DEALER",
          is_first_login: true
        })
        .select("id")
        .single();

      if (error) {
        console.log(`❌ 创建 profile 失败 (phone: ${phone}): ${error.message}`);
      } else {
        console.log(`✅ 创建 profile: ${phone} → "${fullName}"`);
        createdCount++;
      }
    }
  }

  // 3. 更新 full_name 为最新的经销商名称
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("第二步: 更新 full_name\n");

  const updatedProfiles = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("role", "DEALER");

  for (const profile of updatedProfiles.data || []) {
    const dealersForPhone = phoneDealerMap[profile.username];

    if (dealersForPhone && dealersForPhone.length > 0) {
      const latestDealer = dealersForPhone[0];
      const newFullName = latestDealer.company_name;

      // 如果 full_name 需要更新
      if (profile.full_name !== newFullName) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ full_name: newFullName })
          .eq("id", profile.id);

        if (error) {
          console.log(
            `❌ 更新失败 (${profile.username}): ${error.message}`
          );
        } else {
          console.log(
            `✅ 更新 ${profile.username}: "${profile.full_name}" → "${newFullName}"`
          );
          updatedCount++;
        }
      }
    }
  }

  // 4. 汇总
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("✨ 修复完成\n");
  console.log(`创建的 profile: ${createdCount} 个`);
  console.log(`更新的 profile: ${updatedCount} 个`);
  console.log(`总计修复: ${createdCount + updatedCount} 个\n`);

  console.log("💡 建议：修复后运行验证脚本确认");
  console.log("   node scripts/validateDealerProfileConsistency.mjs\n");
}

fix().catch(console.error);
