import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

async function checkCertificates() {
  console.log("🔍 检查数据库中的证书数据...\n");

  // 1. 获取所有证书
  const { data: certs, error: certsError } = await supabase
    .from("certificates")
    .select("*")
    .eq("status", "ISSUED")
    .limit(10);

  if (certsError) {
    console.error("❌ 获取证书失败:", certsError);
    return;
  }

  console.log(`✅ 找到 ${certs.length} 张证书:\n`);
  certs.forEach((cert, i) => {
    console.log(`[${i + 1}] 证书 #${cert.cert_number}`);
    console.log(`    ID: ${cert.id}`);
    console.log(`    dealer_id: ${cert.dealer_id}`);
    console.log(`    status: ${cert.status}`);
    console.log(`    final_image_url: ${cert.final_image_url || "❌ 为 NULL"}`);
    console.log(`    start_date: ${cert.start_date}`);
    console.log(`    end_date: ${cert.end_date}`);
    console.log();
  });

  // 2. 获取dealers和profiles信息
  console.log("\n📋 检查经销商和用户关系...\n");

  const { data: dealers } = await supabase
    .from("dealers")
    .select("*")
    .limit(5);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "DEALER")
    .limit(5);

  if (dealers && dealers.length > 0) {
    console.log(`✅ 经销商列表 (前5个):`);
    dealers.forEach((d) => {
      console.log(`  - ${d.company_name} (phone: ${d.phone})`);
    });
  }

  if (profiles && profiles.length > 0) {
    console.log(`\n✅ DEALER 角色用户列表 (前5个):`);
    profiles.forEach((p) => {
      console.log(`  - ${p.username} (phone: ${p.phone}, role: ${p.role})`);
    });
  }
}

checkCertificates().catch(console.error);
