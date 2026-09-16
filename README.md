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
| 2 | 认证与权限（JWT / RBAC / Redis 权限缓存） | ⬜ |
| 3 | 数据库模型与核心业务（关系 / 事务 / 防超卖） | ⬜ |
| 4 | 幂等性（核心难点） | ⬜ |
| 5 | 缓存与实时推送（Redis / 分布式锁 / SSE） | ⬜ |
| 6 | 质量与性能（测试 / 慢查询 / N+1 / 压测） | ⬜ |
| 7 | 部署（多环境 / 迁移 / Docker / 优雅关闭） | ⬜ |

---

## 技术栈

| 维度 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | NestJS 12 | |
| 模块系统 | **ESM** | `"type": "module"`，相对导入必须带 `.js` 后缀 |
| 语言 | TypeScript 6 | `module` / `moduleResolution` 均为 `nodenext` |
| 配置 | `@nestjs/config` + Joi | 启动时强制校验环境变量 |
| 日志 | `nestjs-pino` | 结构化 JSON + `traceId` 链路追踪 + 敏感字段脱敏 |
| 校验 | `class-validator` | 装饰器式 DTO 约束 |
| 文档 | `@nestjs/swagger` | 由 DTO 装饰器自动生成 |
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
├── app.module.ts               根模块：只做装配
│
├── config/                     配置层
│   ├── configuration.ts          配置工厂（唯一的 env 出口）
│   ├── env.validation.ts         Joi 校验规则
│   └── logger.config.ts          日志配置
│
├── common/                     通用层（与业务无关的基础设施）
│   ├── constants/error-code.ts   业务错误码 + 默认文案 + HTTP 兜底映射
│   ├── dto/api-response.dto.ts   统一响应契约
│   ├── exceptions/               业务异常基类
│   ├── filters/                  全局兜底异常过滤器
│   ├── interceptors/             统一响应包装拦截器
│   └── pipes/                    全局参数校验管道
│
├── modules/                    业务模块（每个模块自包含）
│   ├── health/                   健康检查（不走全局前缀）
│   └── demo/                     教学演示（阶段二删除）
│
└── database/                   数据层基建（阶段三落地）
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
pnpm build
node dist/main.js        # 生产模式
pnpm start:dev           # 开发模式（watch 热重载）
```

启动后访问：

```text
接口文档      http://localhost:3000/api/docs
健康检查      http://localhost:3000/health
```

---

## 阶段一：已实现的接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | 存活探测（**不走全局前缀**，避免基础设施配置被业务配置绑架） |
| GET | `/api/demo/ok` | 正常返回，观察统一响应包装 |
| GET | `/api/demo/business-error` | 业务失败 → HTTP 200 + 业务码 |
| GET | `/api/demo/business-error-custom` | 业务失败 + 覆盖 HTTP 状态 → 409 |
| GET | `/api/demo/system-error` | 系统异常 → HTTP 500 且对外隐藏细节 |
| GET | `/api/demo/http-error` | 框架异常 → HTTP 404 被翻译成业务码 |
| POST | `/api/demo/validate` | 参数校验失败 → 业务码 `10001` |

> `demo` 模块仅用于验证阶段一的四项验收标准，阶段二会删除。

---

## 关键设计决策

| 决策 | 做法 | 原因 |
| --- | --- | --- |
| 全局中间件注册 | 走 `APP_PIPE` / `APP_INTERCEPTOR` / `APP_FILTER` token | 实例由 IoC 容器创建，可注入依赖；`app.useGlobalXxx()` 创建的是游离实例 |
| 业务码与 HTTP 状态码 | **分离**，`BusinessException` 默认返回 200 + 业务码 | HTTP 状态码是传输层语义，无法区分「库存不足」和「余额不足」 |
| 异常兜底 | `@Catch()` 不带参数，捕获一切 | 带参数会漏掉普通 `Error`，导致响应体结构不一致 |
| 未知异常 | 对外返回统一文案，对内完整记录堆栈 + `traceId` | 兼顾信息不泄漏与可排查 |
| traceId | `genReqId` 优先复用上游 `x-request-id` | 多服务链路追踪的前提 |
| 日志脱敏 | pino `redact` 屏蔽 password / token / cookie | 日志系统访问权限通常比数据库宽松 |
| `pino-pretty` | 仅开发环境开启 | 它走 worker 线程，生产环境应输出 JSON 交由采集器解析 |
| 敏感配置 | `.env` 只存本地；仓库只放 `.env.example` | 公开仓库里绝不放真实凭据 |

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

## 已知环境约束

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
```

---

## License

UNLICENSED — 个人学习项目。
