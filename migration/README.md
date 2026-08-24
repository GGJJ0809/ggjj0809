# 引力场 · 完整迁移手册（摆脱 Readdy，自建服务器）

> 目标：前端部署到宝塔，后端（数据库 + 认证 + 云函数）自建 Supabase，数据完全在自有服务器上。

---

## 一、服务器要求

| 项目 | 你的配置 | 是否达标 |
|---|---|---|
| CPU | 4 核 | ✅ |
| 内存 | 7.3 GB | ✅（自建 Supabase 最低 4G，推荐 8G） |
| 磁盘 | 98 GB（已用 6G） | ✅ |

> ⚠️ 自建 Supabase 是一套约 12 个容器（Postgres + 认证 + API 网关 + 存储 + 实时 + 边缘函数 + 管理面板），需要 Docker + Docker Compose。

---

## 二、迁移全景（7 阶段）

| 阶段 | 内容 | 产出文件 |
|---|---|---|
| 1 | 前端部署到宝塔 | 下载 zip → build → nginx |
| 2 | 自建 Supabase | docker-compose + `.env` |
| 3 | 迁移数据库 | `schema.sql`（结构）+ 手动导数据 |
| 4 | 迁移 4 个云函数 | 重部署 + 重配密钥 |
| 5 | 迁移 Storage | 手动搬文件 |
| 6 | 切换前端连接 + 校验 | 改 `.env` |
| 7 | 断开 Readdy Backend | 最后一步 |

---

## 三、阶段 2：自建 Supabase

1. 克隆官方仓库（版本会更新，以官方为准）：
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   cd supabase/docker
   ```

2. 复制 `.env.example` 为 `.env`，参考本目录的 `supabase.env.example` 填好关键项。

3. **关键：生成 `ANON_KEY` 和 `SERVICE_ROLE_KEY`**。这是 JWT，必须和 `JWT_SECRET` 匹配。用官方脚本生成：
   - https://supabase.com/docs/guides/self-hosting/docker 页面有「Generate API Keys」脚本

4. 启动：
   ```bash
   docker compose up -d
   ```

5. 验证 Studio 面板（默认 http://localhost:8000），并配置 HTTPS 反向代理（宝塔 nginx 反代到 Kong 网关）。

---

## 四、阶段 3：迁移数据库

### 4.1 结构（最重要）
1. 在自建 Supabase 的 SQL Editor 里，执行本目录的 **`schema.sql`**
2. 它包含：62 张业务表的建表语句 + 外键 + 唯一约束 + 1 个自定义函数 + 18 张表的 RLS 策略

### 4.2 数据
- 在 Readdy 后端的 SQL Editor 里，对每张表执行 `SELECT *` 导出（CSV/JSON）
- 按外键依赖顺序导入：先导父表（member_levels、course_categories、product_categories、ai_models、agents 等），再导子表
- 数据导入后，用 `setval('xxx_id_seq', (select max(id) from xxx))` 重置序列，避免主键冲突

### 4.3 auth 用户（最麻烦）
- 用户账号在 `auth.users` 和 `auth.identities` 两张表
- 这两张表是 Supabase 自动创建的，结构不用搬，但**数据要搬**（含加密密码哈希）
- 搬运时保持 `id`（uuid）不变，否则前端 `user_profiles.user_id`、订单 `customer_id` 等引用会断

### 4.4 表清单（62 张业务表，按域）
- 用户/会员：user_profiles, member_levels, user_memberships, membership_logs, affiliates
- 积分/分销：user_points, points_rules, points_transactions, point_products, distribution_settings, distribution_records, distribution_earnings, withdrawal_requests
- 课程/内容：course_categories, courses, chapters, lessons, columns, column_courses, content_categories, content_chapters, content_assets, course_content_units, course_content_assets, user_learning_progress
- 商品：products, product_categories, product_items, product_variants, product_skus, product_custom_fields, product_custom_values
- 订单：order_headers, order_items, payment_configs
- AI 智能体：ai_models, agents, agent_configs, agent_consultant_configs, agent_tool_configs, agent_pricing, agent_share_configs, agent_ui_configs, agent_usage_logs, ai_call_logs, ai_tools
- 知识库：c_libraries, k_libraries, q_libraries, d_libraries, d_archives
- 测评：assessments, assessment_questions, assessment_results
- 活动/直播：activities, activity_registrations, activity_checkins, live_sessions
- 站点配置：site_settings, banners, navigation, homepage_sections

---

## 五、阶段 4：云函数密钥清单

4 个云函数（`supabase/functions/` 目录）迁移到自建 Supabase 后，需重新配置以下密钥（Edge Function Secrets）：

| 密钥名 | 用于 | 是否必需 |
|---|---|---|
| `SUPABASE_URL` | 所有函数 | ✅ 自动 |
| `SUPABASE_ANON_KEY` | 所有函数 | ✅ 自动 |
| `SUPABASE_SERVICE_ROLE_KEY` | 支付回调/积分 | ✅ 自动 |
| `WECHAT_APP_ID` | wechat-h5-prepay | ✅ |
| `WECHAT_MCH_ID` | wechat-h5-prepay | ✅ |
| `WECHAT_SERIAL_NO` | wechat-h5-prepay | ✅ |
| `WECHAT_PRIVATE_KEY` | wechat-h5-prepay（商户私钥） | ✅ |
| `WECHAT_API_V3_KEY` | wechat-pay-notify（APIv3 密钥） | ✅ |
| `WECHAT_PLATFORM_PUBLIC_KEY` | wechat-pay-notify（验签） | ✅ |
| `DEEPSEEK_API_KEY` | agent-chat | 按需 |
| `OPENAI_API_KEY` | agent-chat | 按需 |
| `ANTHROPIC_API_KEY` | agent-chat | 按需 |

### 各函数职责
- `wechat-h5-prepay`：微信 H5 下单，返回 h5_url 并创建 pending 订单
- `wechat-pay-notify`：微信支付回调，验签后把订单标记为 paid + 处理分销返积分
- `points-redeem`：纯积分兑换商品，扣积分 + 建订单 + 记流水
- `agent-chat`：AI 智能体对话，加载 C/K 知识库，调用 DeepSeek/OpenAI/Anthropic

> ⚠️ 微信支付：迁完后需到微信商户平台把「支付回调地址」改成新域名 `https://你的域名/functions/v1/wechat-pay-notify`。

---

## 六、阶段 6：前端切换

改前端 `.env` 两行，指向自建 Supabase：
```
VITE_PUBLIC_SUPABASE_URL="https://你的域名"
VITE_PUBLIC_SUPABASE_ANON_KEY="你的 anon key"
```
然后 `npm run build` 重新打包，重新部署到宝塔。

---

## 七、必须提前知道的坑

1. **auth 用户迁移最麻烦**：要连 `auth.users` + `auth.identities` 一起搬，保持 uuid 不变。
2. **微信支付回调地址要改**：见阶段 4。
3. **自建 = 自己背运维**：数据库备份、容器升级、证书续期、监控都要自己来。
4. **断开 Readdy Backend 是最后一步**：所有功能验证通过前千万别断，断开不可逆。

---

## 八、本目录文件说明

| 文件 | 说明 |
|---|---|
| `schema.sql` | 完整建表 + 外键 + RLS 策略 + 自定义函数 |
| `supabase.env.example` | 自建 Supabase 环境变量模板 |
| `README.md` | 本手册 |