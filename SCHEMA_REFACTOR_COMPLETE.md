# ✅ Schema 与代码调整完成

## 📋 修改摘要

完成了 **Schema 重构**以支持业务模型：**一个电话号码（phone）可以对应多个经销商主体名称**。

---

## 🔄 Schema 变更

### 1. Dealers 表结构调整

```sql
-- ❌ 之前（错误）
CREATE TABLE dealers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id),  -- 强制一对一关系
    company_name TEXT NOT NULL,
    phone TEXT,
    ...
);

-- ✅ 之后（正确）
CREATE TABLE dealers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,  -- 主体/公司名称
    phone TEXT NOT NULL,  -- 允许重复（一个phone多条记录）
    contact_person TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 加快查询速度
CREATE INDEX dealers_phone_idx ON dealers(phone);
```

**关键变化：**
- ✅ 移除 `profile_id` 外键（改为通过 `phone` 间接关联）
- ✅ `phone` 字段不再唯一（允许多条记录）
- ✅ 新增 `phone` 索引以加快查询

### 2. Certificate Status 枚举调整

```sql
-- ❌ 之前（包含不使用的 AUDITED）
CREATE TYPE certificate_status AS ENUM (
    'PENDING', 'AUDITED', 'ISSUED', 'REJECTED', 'EXPIRED', 'REVOKED'
);

-- ✅ 之后（移除 AUDITED，简化流程）
CREATE TYPE certificate_status AS ENUM (
    'PENDING', 'ISSUED', 'REJECTED', 'EXPIRED', 'REVOKED'
);
```

**流程说明：**
- `PENDING` - 审核员提报，待初审
- `ISSUED` - 项目负责人核发，已生效
- `REJECTED` - 申请被退回
- `EXPIRED` - 协议到期
- `REVOKED` - 被撤销

---

## 💻 代码适配

### 关键修改：`getOrCreateDealer()` 函数

```typescript
// ✅ 新的双源实现（支持一个phone多个company_name）
async function getOrCreateDealer(phone: string, shopName: string) {
  if (USE_LOCAL_DB && sql) {
    // 查询 (phone, company_name) 组合是否已存在
    const existing = await sql`
      SELECT id FROM dealers 
      WHERE phone = ${phone} AND company_name = ${shopName} 
      LIMIT 1
    `;
    
    if (existing.length > 0) {
      return existing[0].id;  // 返回已存在的记录
    }
    
    // 创建新的主体记录
    const result = await sql`
      INSERT INTO dealers (company_name, phone) 
      VALUES (${shopName}, ${phone}) 
      RETURNING id
    `;
    return result[0].id;
  } else {
    // Supabase 版本...
  }
}
```

**业务逻辑：**
1. 按 `(phone, company_name)` 组合查询
2. 如果已存在 → 返回该记录 ID
3. 如果不存在 → 创建新记录

**这样支持：**
- ✅ 同一个平台号（phone）可以注册为多个品牌方（company_name）
- ✅ 每个组合对应一条独立的证书记录

---

## 📊 业务流程示例

### 场景：一个经销商有多个品牌授权

```
电话号码: 138-6666-6666
└─ 主体1: "深圳XX公司"
│  └─ 证书1: BAVP-2026-2024 (授权品牌A)
│  └─ 证书2: BAVP-2026-2025 (授权品牌B)
│
└─ 主体2: "深圳XX工作室"
   └─ 证书3: BAVP-2026-2026 (授权品牌C)
```

**数据表示：**

| dealers 表 | phone | company_name |
|-----------|-------|--------------|
| ID-001 | 138-6666-6666 | 深圳XX公司 |
| ID-002 | 138-6666-6666 | 深圳XX工作室 |

| certificates 表 | cert_number | dealer_id | status |
|-----------------|-------------|-----------|--------|
| BAVP-2026-2024 | ID-001 | ISSUED |
| BAVP-2026-2025 | ID-001 | ISSUED |
| BAVP-2026-2026 | ID-002 | ISSUED |

| profiles 表 | username | role |
|-------------|----------|------|
| 138-6666-6666 | DEALER | 一个账户对应所有证书 |

---

## ✨ 改造完成清单

### Schema 文件
- ✅ `db/schema.sql` - Dealers 表结构调整
- ✅ `db/schema.sql` - Certificate Status 枚举调整

### 代码文件
- ✅ `app/api/certificates/route.ts` - getOrCreateDealer 函数更新
- ✅ `app/api/certificates/verify/route.ts` - 已兼容新结构
- ✅ `app/actions.ts` - 已兼容新结构

---

## 🚀 部署验证

### 1. 删除旧的本地数据库（如已创建）
```bash
sudo -u postgres dropdb ba_nihplod_db
```

### 2. 创建新的数据库并初始化
```bash
# 创建用户和数据库
createdb -U postgres ba_nihplod_db
psql -U postgres -d ba_nihplod_db -c "CREATE USER nihplod_user WITH PASSWORD 'Moidas888!';"
psql -U postgres -d ba_nihplod_db -c "GRANT ALL PRIVILEGES ON DATABASE ba_nihplod_db TO nihplod_user;"

# 初始化表结构（使用新 schema）
psql -U nihplod_user -h localhost -d ba_nihplod_db -f db/schema.sql
```

### 3. 测试多主体场景
```bash
# 创建第一个主体
curl -X POST http://localhost:3000/api/certificates \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_pending",
    "managerId": "admin-id-here",
    "certData": {
      "phone": "13800000001",
      "shopName": "深圳XX公司",
      "platformId": "BAVP",
      "scopeText": "品牌A授权",
      "authorizer": "品牌总部",
      "duration": "2024.01.01 - 2025.12.31"
    }
  }'

# 创建第二个主体（同一phone）
curl -X POST http://localhost:3000/api/certificates \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_pending",
    "managerId": "admin-id-here",
    "certData": {
      "phone": "13800000001",
      "shopName": "深圳XX工作室",  # 不同的company_name
      "platformId": "BAVP",
      "scopeText": "品牌B授权",
      "authorizer": "品牌总部",
      "duration": "2024.01.01 - 2025.12.31"
    }
  }'

# 验证：应该创建两条独立的证书记录
```

---

## 📝 注意事项

1. **现有数据迁移**
   - 如有现有数据，迁移前请备份
   - 需要手动处理旧 schema 中 `profile_id` 的外键关系

2. **关键字段**
   - `phone` 是经销商和用户的连接点
   - `(phone, company_name)` 是 dealer 表的自然键
   - 一个 `phone` 对应一个用户账户（profiles）
   - 一个 `phone` 可以对应多个经销商主体（dealers）

3. **RLS 策略**
   - 当前 RLS 已禁用（为本地数据库兼容性）
   - 生产环境可根据需要启用 RLS

---

完成！现在你的项目已完全适配本地 PostgreSQL 且支持业务需求。✨
