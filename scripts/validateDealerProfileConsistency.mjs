// scripts/validateDealerProfileConsistency.mjs
/**
 * 🔍 经销商-账户一致性验证脚本
 * 
 * 作用：检查系统中是否存在数据不一致的情况
 * 运行：node scripts/validateDealerProfileConsistency.mjs
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function validate() {
  console.log("🔍 开始一致性验证...\n");

  const { data: dealers } = await supabaseAdmin.from("dealers").select("*");
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("role", "DEALER");

  let issues = [];

  // 1. 检查按手机号关联的一致性
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("检查 1: 手机号与账户关联\n");

  const phoneDealerMap = {};
  dealers.forEach((d) => {
    if (!phoneDealerMap[d.phone]) {
      phoneDealerMap[d.phone] = [];
    }
    phoneDealerMap[d.phone].push(d);
  });

  Object.entries(phoneDealerMap).forEach(([phone, dealerList]) => {
    const profile = profiles.find((p) => p.username === phone);

    if (!profile && dealerList.length > 0) {
      // 当前没有 profile，但有经销商
      console.log(`⚠️  手机号 ${phone} - ${dealerList.length} 个经销商，但无 profile`);
      dealerList.forEach((d) => {
        console.log(`   └─ ${d.company_name} (ID: ${d.id})`);
      });
      issues.push({
        type: "missing_profile",
        phone,
        dealers: dealerList,
        message: `手机号 ${phone} 的 ${dealerList.length} 个经销商需要创建 profile`
      });
    } else if (profile && dealerList.length > 0) {
      console.log(`✅ 手机号 ${phone} - ${dealerList.length} 个经销商 ↔ profile`);
    }
  });

  // 2. 检查孤立的 profile（没有对应经销商）
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("检查 2: 孤立账户（无对应经销商）\n");

  profiles.forEach((profile) => {
    const hasDealers = dealers.some((d) => d.phone === profile.username);
    if (!hasDealers) {
      console.log(
        `ℹ️  Profile "${profile.full_name}" (username: ${profile.username})`
      );
      console.log(`   无对应经销商（可能已删除）\n`);
      issues.push({
        type: "orphaned_profile",
        profile,
        message: `Profile ${profile.id} 无对应经销商`
      });
    }
  });

  // 3. 检查 full_name 不规范（新建 profile 时应该设置为最新的经销商名称）
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("检查 3: Profile full_name 规范性\n");

  profiles.forEach((profile) => {
    const dealers_for_phone = dealers.filter((d) => d.phone === profile.username);
    
    if (dealers_for_phone.length > 0) {
      // 检查 full_name 是否在经销商列表中
      const fullNameExists = dealers_for_phone.some((d) => d.company_name === profile.full_name);
      
      if (!fullNameExists) {
        console.log(`⚠️  Profile "${profile.full_name}" 不在对应经销商列表中`);
        console.log(`   实际经销商:`);
        dealers_for_phone.forEach((d) => {
          console.log(`   - "${d.company_name}"`);
        });
        console.log(
          `   💡 建议：full_name 应设为最新/主要的经销商名称\n`
        );
        issues.push({
          type: "mismatch_full_name",
          profile,
          dealers: dealers_for_phone,
          message: `Profile ${profile.id} 的 full_name 不在对应经销商列表中`
        });
      } else {
        console.log(
          `✅ Profile "${profile.full_name}" 对应经销商列表 (${dealers_for_phone.length} 个)`
        );
      }
    }
  });

  // 4. 统计汇总
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("📊 验证总结\n");

  console.log(`总数据:`);
  console.log(`  经销商: ${dealers.length} 个`);
  console.log(`  Profile: ${profiles.length} 个`);
  console.log(`  问题: ${issues.length} 个\n`);

  if (issues.length === 0) {
    console.log("✅ 所有数据一致，无问题！\n");
  } else {
    console.log("❌ 发现问题:\n");
    issues.forEach((issue, idx) => {
      console.log(`${idx + 1}. [${issue.type}] ${issue.message}`);
    });
    console.log("");
  }

  // 5. 验证规则总结
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("📋 数据关联规则\n");
  console.log("✅ 正确的关联方式：");
  console.log("   dealers.phone ↔ profiles.username\n");
  console.log("💡 使用场景：");
  console.log("   - 经销商管理页面：按 phone 分组，用 username 查询 profile");
  console.log("   - 证书审核：按 phone 创建 profile (username = phone)");
  console.log("   - 登录验证：按 username 查询 profile\n");
  console.log("❌ 已废弃的关联方式：");
  console.log("   dealers.company_name ↔ profiles.full_name");
  console.log("   原因：同一手机号可能有多个门店名称\n");
}

validate().catch(console.error);
