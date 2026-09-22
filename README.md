# booking-platform

> **多商户预约服务平台** —— 从 0 搭建的企业级 NestJS 后端项目。
>
> 这不是一个「能跑就行」的教程 Demo。它按企业级项目的标准组织：
> 配置集中管理并在启动时校验、错误语义分层、日志可链路追踪、
> 目录按业务域切分。目的是一步步看清「教程代码」和「生产代码」差在哪。

---

## 当前进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **1** | **项目骨架与基础设施** | ✅ 已完成 |
| **2** | **认证与授权** | 🚧 进行中（见下表） |
| 3 | 数据库模型与核心业务（关系 / 事务 / 防超卖） | ⬜ |
| 4 | 幂等性（核心难点） | ⬜ |
| 5 | 缓存与实时推送（Redis / 分布式锁 / SSE） | ⬜ |
| 6 | 质量与性能（测试 / 慢查询 / N+1 / 压测） | ⬜ |
| 7 | 部署（多环境 / 迁移 / Docker / 优雅关闭） | ⬜ |

阶段二内部进度（需求见 `docs/prd-auth-v1.md`）：

| 里程碑 | 交付物 | 状态 |
| --- | --- | --- |
| M1 注册 | `POST /api/auth/register`；`user` 表唯一索引显式命名 | ✅ |
| M2 登录与签发 | `POST /api/auth/login`；`refresh_token` 表；JWT 签发链路 | ✅ |
| M3 全局防护 | 全局 `JwtAuthGuard`；`GET /api/auth/me`；禁用即时生效 | ✅ |
| M4 刷新与撤销 | `/auth/refresh`（轮转）、`/auth/logout`、复用检测 | ⬜ |

---

## 技术栈

| 维度 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | NestJS 12 | |
| 模块系统 | **ESM** | `"type": "module"`，相对导入必须带 `.js` 后缀 |
| 语言 | TypeScript 6 | `module` / `moduleResolution` 均为 `nodenext` |
| 配置 | `@nestjs/config` + Joi | 启动时强制校验环境变量 |
| 日志 | `nestjs-pino` | 结构化 JSON + `traceId` 链路追踪 + 敏感字段脱敏 |
| 校验 | `class-validator` + `class-transformer` | 装饰器式 DTO 约束 + 隐式类型转换 |
| 文档 | `@nestjs/swagger` | 由 DTO 装饰器自动生成 |
| 数据库 | TypeORM + MySQL 8 | `autoLoadEntities`，`synchronize` 由环境变量控制 |
| 密码 | bcrypt（cost 10） | 明文永不落库 |
| 认证 | `@nestjs/jwt` + Passport（`passport-jwt`） | access token 无状态，refresh token 落库 |
| 包管理 | pnpm 11 | |
| 语法检查 | oxlint | |
| 测试 | Vitest | |

> ⚠️ **ESM 注意**：本项目是 ESM，与你可能见过的多数 Nest 教程（CommonJS）写法不同。
> 详见下方「ESM 与 CommonJS 的差异」。

---

## 目录结构

```text
src/
├── main.ts                     入口：只做装配
├── app.module.ts               根模块：只做装配 + 注册全局横切关注点
│
├── config/                     配置层
│   ├── configuration.ts          配置工厂（唯一的 env 出口）
│   ├── env.validation.ts         Joi 校验规则
│   └── logger.config.ts          日志配置
│
├── common/                     通用层（与业务无关的基础设施）
│   ├── constants/error-code.ts   业务错误码 + 默认文案 + HTTP 兜底映射
│   ├── dto/                      统一响应契约（⚠️ 另有 auth 的入参 DTO，见「已知问题」）
│   ├── exceptions/               业务异常基类
│   ├── filters/                  全局兜底异常过滤器
│   ├── interceptors/             统一响应包装拦截器
│   ├── pipes/                    全局参数校验管道
│   └── security/                 密码哈希能力（bcrypt）
│
├── modules/                    业务模块（每个模块自包含）
│   ├── auth/                     认证（阶段二）
│   │   ├── auth.controller.ts      register / login / me
│   │   ├── auth.service.ts         注册 / 登录编排 / 当前用户
│   │   ├── refresh-token.service.ts refresh token 签发（轮转与撤销待 M4）
│   │   ├── entities/refresh-token.entity.ts
│   │   ├── strategies/jwt.strategies.ts  Passport JWT 策略（validate 里查库）
│   │   ├── guards/jwt-auth.guard.ts      全局守卫（默认拒绝 + 三种 401 映射）
│   │   ├── decorators/             @Public() / @CurrentUser()
│   │   └── types/                  request.user 的契约类型
│   ├── user/                     用户（user 表 + UserService，含教学用接口）
│   ├── health/                   健康检查（不走全局前缀）
│   └── demo/                     教学演示（阶段二结束时删除）
│
└── database/                   数据层基建
    └── database.module.ts        forRootAsync + autoLoadEntities
```

**三层归属规则**（拿这三条去判断，目录不会分错）：

```text
能被别的业务模块 import、且本身没有业务名词  → common/
含有一个业务名词（appointment / merchant）   → modules/<名词>/
多个业务模块共用的业务逻辑（锁、短信、上传）  → shared/
```

---

## 快速开始

### 前置要求

- Node.js >= 20.11（`import.meta.dirname` 需要）
- pnpm >= 10
- MySQL 8.x

### 1. 准备数据库

```sql
CREATE DATABASE `booking_platform`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER 'booking'@'127.0.0.1' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON `booking_platform`.* TO 'booking'@'127.0.0.1';
FLUSH PRIVILEGES;
```

<details>
<summary>没有 MySQL？用便携版起一个（无需 Docker、无需管理员权限）</summary>

```bash
# 1. 下载解压
curl -L -o mysql.zip "https://mirrors.aliyun.com/mysql/MySQL-8.0/mysql-8.0.28-winx64.zip"
unzip -q mysql.zip

# 2. 初始化数据目录（root 空密码）
mysql-8.0.28-winx64/bin/mysqld --initialize-insecure \
  --basedir="$PWD/mysql-8.0.28-winx64" \
  --datadir="$PWD/mysql-data" \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_0900_ai_ci

# 3. 启动（前台常驻）
mysql-8.0.28-winx64/bin/mysqld \
  --basedir="$PWD/mysql-8.0.28-winx64" \
  --datadir="$PWD/mysql-data" \
  --port=3306 --bind-address=127.0.0.1 --console

# 4. 停止
mysql-8.0.28-winx64/bin/mysqladmin -u root -h 127.0.0.1 shutdown
```

</details>

### 2. 配置环境变量

```bash
cp .env.example .env
```

然后填写 `.env` 中的值。**`.env` 已被 `.gitignore` 排除，不会进入版本库。**

> 设计约定：**新增任何环境变量，必须同步在 `.env.example` 加一行。**
> 只改代码不加模板，下一个人 clone 下来必然启动失败。这是 Code Review 的检查项。

### 3. 启动

```bash
pnpm install
pnpm exec tsc -p tsconfig.build.json   # 编译校验（本机 nest build 会因清不掉 dist/ 失败）
pnpm dev                                # 开发模式（watch 热重载）
```

启动后访问：

```text
接口文档      http://localhost:3000/api/docs
健康检查      http://localhost:3000/health
```

---

## 环境变量清单

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `APP_NAME` | `booking-platform` | 用于 Swagger 标题与健康检查输出 |
| `APP_PORT` | `3000` | 监听端口 |
| `API_PREFIX` | `api` | 全局路由前缀（`/health` 被排除在外） |
| `LOG_LEVEL` | `info` | pino 级别 |
| `LOG_PRETTY` | `false` | 仅开发环境开 |
| `DB_HOST` | 必填 | |
| `DB_PORT` | `3306` | |
| `DB_USERNAME` | 必填 | |
| `DB_PASSWORD` | 必填（可为空串） | |
| `DB_DATABASE` | 必填 | |
| `DB_SYNCHRONIZE` | `false` | ⚠️ 危险开关，生产必须 false |
| `DB_LOGGING` | `false` | 打印 SQL |
| `JWT_SECRET` | 必填 | **≥ 16 位**，不允许硬编码兜底值 |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | 生产建议 15m，开发期可放宽到 2h |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | |

---

## 接口清单

**认证（阶段二）**

| 权限 | 方法 | 路径 | 用途 |
| --- | --- | --- | --- |
| 公开 | POST | `/api/auth/register` | 注册，密码 bcrypt 哈希入库 |
| 公开 | POST | `/api/auth/login` | 登录，签发 access + refresh token |
| 受保护 | GET | `/api/auth/me` | 当前登录用户 |
| ⬜ 待实现 | POST | `/api/auth/refresh` | 刷新（含轮转，M4） |
| ⬜ 待实现 | POST | `/api/auth/logout` | 登出 / 撤销（M4） |

**基础设施与教学用**

| 权限 | 方法 | 路径 | 用途 |
| --- | --- | --- | --- |
| 公开 | GET | `/health` | 存活探测（**不走全局前缀**，避免基础设施配置被业务配置绑架） |
| 公开 | GET | `/health/ready` | 就绪探测（含数据库连通性） |
| 受保护 | GET | `/api/user` | 用户列表（Repository 行为观察用） |
| 受保护 | POST | `/api/user/seed` | ⚠️ 教学用，M1 后应删除 |
| 受保护 | GET | `/api/demo/*` | 阶段一验收演示（阶段二删除） |

> ⚠️ 上表「权限」列是**设计意图**。当前 `health` / `demo` 的 `@Public()` 尚未补齐，
> 实测会被全局守卫拦成 401 —— 见「已知问题」。

---

## 认证与授权

### 两个 token 的分工

| | access token | refresh token |
| --- | --- | --- |
| 形态 | JWT（自包含） | 不透明随机串（32 字节 → 64 位 hex） |
| 携带位置 | 请求头 `Authorization: Bearer <token>` | **请求体** `{ "refreshToken": "..." }` |
| 携带时机 | 每个受保护的业务请求 | 只在刷新 / 登出时 |
| 服务端校验 | 验签 + `validate()` 查库 | 算 SHA-256 → 查 `refresh_token` 表 |
| 有效期 | 2h | 7d |
| 是否落库 | 否 | 是（**只存哈希**） |

JWT payload 契约（多一个字段都不行）：

```json
{ "sub": "1", "username": "alice", "iat": 1787000000, "exp": 1787007200 }
```

- `sub` 是 **string**（bigint 主键经 TypeORM 映射后的类型），用 number 接会精度丢失
- **不放** `email` / `password`：JWT 是 Base64 编码不是加密，任何人粘贴到 jwt.io 就能读
- **不放** `status`：放了就意味着封禁要等 token 过期才生效

### 怎么用

```bash
# 登录，拿到两个 token
curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"account":"alice","password":"Passw0rd123"}'

# 业务请求：access 贴到头上
curl -s http://127.0.0.1:3000/api/auth/me \
  -H 'Authorization: Bearer <accessToken>'

# 刷新：refresh 放请求体（M4 实现）
curl -s -X POST http://127.0.0.1:3000/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

### 错误码

| 场景 | HTTP | code |
| --- | --- | --- |
| 未带 `Authorization` | **401** | 20001 |
| access token 已过期 | **401** | 20002 |
| access token 签名 / 格式错 | **401** | 20003 |
| 用户不存在 / 密码错误（**两者必须完全一致**） | 200 | 20004 |
| refresh token 无效 / 已撤销 / 已过期 | 200 | 20005 |
| 检测到 refresh token 复用 | 200 | 20006 |
| 注册时用户名 / 邮箱已存在 | 200 | 40002 |
| 账号被禁用 | 200 | 40003 |
| 参数不合法 | 200 | 10001 |

### 三条硬规则

1. **默认拒绝（default deny）**：新接口默认落在「受保护」一侧，想公开必须**显式**声明 `@Public()`。
   反过来做（默认公开、要保护才加注解）漏一个注解就是一次数据泄漏。
2. **每请求查一次库**：`JwtStrategy.validate()` 必须校验用户当前状态。
   代价是每个请求 +1 次主键查询，换来「禁用即时生效」——先正确，后优化。
3. **凭据失败信息不可区分**：`用户不存在` 与 `密码错误` 必须同码同文案，
   否则这个接口就是一把现成的用户名枚举器。

---

## 关键设计决策

| 决策 | 做法 | 原因 |
| --- | --- | --- |
| 全局中间件注册 | 走 `APP_PIPE` / `APP_INTERCEPTOR` / `APP_FILTER` / `APP_GUARD` token | 实例由 IoC 容器创建，可注入依赖；`app.useGlobalXxx()` 创建的是游离实例 |
| 业务码与 HTTP 状态码 | **分离**，`BusinessException` 默认返回 200 + 业务码 | HTTP 状态码是传输层语义，无法区分「库存不足」和「余额不足」 |
| 异常兜底 | `@Catch()` 不带参数，捕获一切 | 带参数会漏掉普通 `Error`，导致响应体结构不一致 |
| 未知异常 | 对外返回统一文案，对内完整记录堆栈 + `traceId` | 兼顾信息不泄漏与可排查 |
| traceId | `genReqId` 优先复用上游 `x-request-id` | 多服务链路追踪的前提 |
| 日志脱敏 | pino `redact` 屏蔽 password / token / cookie | 日志系统访问权限通常比数据库宽松 |
| `pino-pretty` | 仅开发环境开启 | 它走 worker 线程，生产环境应输出 JSON 交由采集器解析 |
| 敏感配置 | `.env` 只存本地；仓库只放 `.env.example` | 公开仓库里绝不放真实凭据 |
| DTO 与 Entity 解耦 | 入参用 DTO，出参手工挑字段（`UserProfile`） | Entity 上有 `password`；`save()` 返回的内存对象不受 `select: false` 约束 |
| 唯一性保证 | 数据库唯一索引，命名 `uk_<表>_<列>` | 冲突错误里只有索引名；哈希索引名无法判断是哪个字段重复 |
| refresh token 存 SHA-256 | 而非 bcrypt | 每次刷新要按哈希定位行 → 必须能建索引；token 熵高，不需要慢哈希 |
| 守卫 / 策略 / 装饰器分工 | Guard 决定拦不拦，Strategy 决定是谁，Decorator 只做参数注入 | 三者靠框架约定通信而非互相 import，可各自独立替换与测试 |

---

## ESM 与 CommonJS 的差异

本项目是 ESM，以下四点在 CommonJS 项目里不存在：

| # | 差异 | 说明 |
| --- | --- | --- |
| 1 | 相对导入必须带 `.js` | 源文件是 `.ts` 也要写 `.js`。否则报 `TS2835`（编译期即拦截） |
| 2 | 没有 `__dirname` | 用 `import.meta.dirname`（Node 20.11+）或 `fileURLToPath(import.meta.url)` |
| 3 | `import type` 会破坏依赖注入 | Nest 靠 `emitDecoratorMetadata` 生成 `design:paramtypes`，类型导入被编译期擦除后拿不到类引用。**构造函数签名里的类型必须值导入** |
| 4 | 无 `require` | 需要时用 `createRequire(import.meta.url)` |

好处：支持顶层 `await`，不需要 IIFE 包裹。

---

## 已知约束与坑

```text
① @nestjs/config v12 破坏性变更
   validationOptions 的类型从 Joi 原生类型改为 Standard Schema 规范
   → 库专属选项要包进 libraryOptions
     validationOptions: { libraryOptions: { abortEarly: false } }

② pnpm 10+ 供应链闸门
   依赖的 postinstall 脚本默认不执行，未声明会在 build 时报
   ERR_PNPM_IGNORED_BUILDS
   → 在 pnpm-workspace.yaml 的 allowBuilds 中逐个显式声明

③ TypeORM 在 ESM 下不能用路径 glob
   entities: [__dirname + '/**/*.entity{.ts,.js}']   ← 会崩
   → 改用 autoLoadEntities: true + forFeature([...])

④ bcrypt 只取密码的前 72 字节
   超出部分被静默忽略 —— 80 字符的密码，第 73 字节之后随便改都能登录
   → 密码长度必须用 Buffer.byteLength(password, 'utf8') 按【字节】校验

⑤ 传递依赖不能直接 import
   jsonwebtoken / ms 只是 @nestjs/jwt 的传递依赖，pnpm 下直接 import 属于幽灵依赖
   → 需要 TokenExpiredError 时按 info.name 判断；需要 expiresIn 类型时用类型断言

⑥ @nestjs/jwt 的 expiresIn 类型是 number | StringValue（字面量联合）
   从 ConfigService 取出来的是宽泛 string，直接赋值编译不过
   → 断言为 JwtSignOptions['expiresIn']
```

---

## 已知问题 / 待办

| # | 问题 | 建议 |
| --- | --- | --- |
| 1 | `health.controller.ts` 的 `@Public()` 当前被注释掉，`/health` 会被守卫拦成 401 | 恢复；容器探针匿名访问必须 200 |
| 2 | `demo` / `user` 控制器没有 `@Public()` | demo 加类级 `@Public()`；`user` 的教学接口按 PRD 建议整体删除 |
| 3 | auth 的入参 DTO 放在 `src/common/dto/` | 按三层归属规则移到 `src/modules/auth/dto/` |
| 4 | `strategies/jwt.strategies.ts` 文件名为复数 | 改为 `jwt.strategy.ts` |
| 5 | `/api/docs` 是否被全局守卫拦截尚未实测 | 匿名访问一次并记录结论 |
| 6 | `redact: ['req.body.password']` 是否真的生效（pino-http 默认可能不记录 body） | 发一次含明文密码的请求后 grep 日志确认 |
| 7 | M4：`/auth/refresh` 轮转、`/auth/logout`、复用检测 | 轮转的「撤销旧 + 写入新」必须包在同一个事务里 |

---

## License

UNLICENSED — 个人学习项目。
