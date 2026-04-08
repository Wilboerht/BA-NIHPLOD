# 证书图片丢失原因分析

## 🔍 核心问题

你的两个证书（BAVP-2026-6881 和 BAVP-2026-4236）图片丢失的原因是：

### **管理员核发时没有上传/生成证书图片**

## 完整的问题链

```
管理员点击"审核通过"
    ↓
发送API请求：只包含 certId 和 managerId，没有 certImageDataUrl
    ↓
后端处理 action='approve_issue'
    ↓
检查 certData.certImageDataUrl（为空）
    ↓
final_image_url 保持空值 ''
    ↓
插入数据库时存储空值
    ↓
证书被标记为 ISSUED，但 final_image_url 为空！
    ↓
经销商无法下载（因为没有图片数据）
```

## 📋 具体代码位置

### API 端点 [app/api/certificates/route.ts](app/api/certificates/route.ts#L265-L280)
```javascript
let finalImageUrl = '';
if (certData.certImageDataUrl) {  // ⚠️ 如果没有图片数据，这个判断为false
  finalImageUrl = await uploadCertificateImage(supabaseAdmin, certNumber, certData.certImageDataUrl);
}

const { data: newCert, error: certErr } = await supabaseAdmin.from('certificates').insert({
    // ...
    final_image_url: finalImageUrl,  // ❌ 这里保存空值
    // ...
});
```

### 管理员面板调用 [app/workbench/certificates/page.tsx](app/workbench/certificates/page.tsx#L94-L107)
```javascript
const response = await fetch('/api/certificates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    action: 'approve_issue', 
    certId: id,
    managerId: managerId
    // ❌ 缺少 certImageDataUrl 或 certData
  })
});
```

## ✅ 解决方案

### 方案1：使用CertificateGenerator重新生成（推荐 - 现形有的）
经销商在下载时，系统会检测到图片为空：
```javascript
if (isPlaceholder) {
  console.log("检测到占位符图片，打开 CertificateGenerator 生成真实证书");
  // 打开生成器让用户编辑并生成
}
```

**操作步骤**：  
1. 登录为经销商
2. 进入经销商面板
3. 点击证书的下载按钮
4. 系统会自动打开证书生成器
5. 生成PNG或PDF

### 方案2：修复API，让管理员能上传图片（代码层面修复）

**需要修改**：
1. 管理员界面：添加证书生成器，让管理员核发时能生成和上传图片
2. API：支持在 `approve_issue` 流程中接收图片数据

**代码改进建议**：
```javascript
// 在管理员核发时，应该要求：
// - 要么让管理员先用 CertificateGenerator 生成图片
// - 要么要求管理员上传一个图片文件
// - 否则不允许核发

if (!certData.certImageDataUrl && !existingCert.final_image_url) {
  throw new Error("❌ 核发失败：必须先上传或生成证书图片");
}
```

## 🛡️ 预防措施

为了防止未来出现此问题，应该：

1. **核发流程必须包含图片**
   ```javascript
   if (action === 'approve_issue') {
     // 检査图片是否存在
     if (!certData.certImageDataUrl && !existingCert.final_image_url) {
       return NextResponse.json(
         { error: "必须先生成或上传证书图片，才能完成核发" },
         { status: 400 }
       );
     }
   }
   ```

2. **数据库约束**
   ```sql
   -- 添加非空约束（如果业务允许）
   ALTER TABLE certificates 
   ADD CONSTRAINT check_issued_has_image
   CHECK ((status != 'ISSUED') OR (final_image_url IS NOT NULL AND final_image_url != ''));
   ```

3. **UI提示**
   - 在管理员核发按钮上添加警告：核发后必须生成图片
   - 或者在核发前强制打开证书生成器

## 💡 为什么设计成这样？

目前的设计假设：
- 核发时管理员已经有证书图片（来自CertificateGenerator）
- 但实际上核发流程没有强制这个步骤

这导致管理员可能在没有图片的情况下核发证书。

---

**总结**：图片丢失是因为核发时没有生成和保存证书图片。建议使用经销商面板的生成器重新生成，或让管理员修复这两个证书，确保在核发时包含图片数据。
