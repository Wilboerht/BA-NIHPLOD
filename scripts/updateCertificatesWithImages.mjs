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

async function updateCertificatesWithPlaceholder() {
  console.log("🔄 更新现有证书的占位符图像...\n");

  // 获取所有没有 final_image_url 的 ISSUED 证书
  const { data: certs, error: err } = await supabase
    .from("certificates")
    .select("*")
    .eq("status", "ISSUED")
    .is("final_image_url", null);

  if (err) {
    console.error("❌ 查询失败:", err);
    return;
  }

  if (!certs || certs.length === 0) {
    console.log("✅ 所有证书都已有图像 URL");
    return;
  }

  console.log(`找到 ${certs.length} 张需要更新的证书\n`);

  // 创建一个简单的占位符 PNG (1x1 透明像素)
  // 这是一个 base64 编码的最小 PNG 文件
  const placeholderPNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

  // 更新所有这些证书
  for (const cert of certs) {
    const { error: updateErr } = await supabase
      .from("certificates")
      .update({ final_image_url: placeholderPNG })
      .eq("id", cert.id);

    if (updateErr) {
      console.error(
        `❌ 更新 ${cert.cert_number} 失败:`,
        updateErr.message
      );
    } else {
      console.log(`✅ ${cert.cert_number} - 已设置占位符`);
    }
  }

  console.log("\n✅ 更新完成！");
  console.log("⚠️  注意：现有证书使用的是占位符图像。");
  console.log("    管理员可以通过重新发布证书来生成真实图像。");
}

updateCertificatesWithPlaceholder().catch(console.error);
