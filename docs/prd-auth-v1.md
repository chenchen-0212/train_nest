# PRD · 认证模块 v1

> **需求规格说明书** ｜ 项目：booking-platform（多商户预约服务平台）
> 交付方式：本文件只定义「要什么」，代码由你实现。
> 里程碑：M1 注册 · M2 登录与签发 · M3 全局防护 · M4 刷新与撤销

---

## 0. 文档信息

| 项 | 值 |
| --- | --- |
| 文档版本 | v1.0 |
| 创建日期 | 2026-09-22 |
| 需求方 | chenchen |
| 代码库 | `D:\nest\booking-platform`（NestJS 12 + ESM + TypeORM + MySQL 8） |
| 上游依赖 | 阶段一基础设施（统一响应 / 全局异常 / 配置校验 / traceId）已就绪 |
| 下游影响 | 阶段三（业务接口）、阶段四（幂等）、阶段五（Redis 迁移）全部依赖本模块 |
| 不在本文档范围 | 授权（RBAC）、前端、限流、邮箱验证、第三方登录 |

---

## 1. 背景、目标与使用场景

### 1.1 业务背景

多商户预约服务平台有三类角色：平台管理员、商户、普通消费者。

在「谁能干什么」（授权）之前，必须先解决「你是谁」（认证）。目前项目里只有一个教学用的 `/api/user/seed` 接口，**任何人都能插入用户、查询用户列表，且密码字段的管理全靠开发者自觉**。这是一个不能上线的状态。

`user` 表、bcrypt 哈希能力、业务错误码 2xxxx 段都已就绪，但**没有任何一条真正的认证链路**。

### 1.2 本期目标（每条都可验证）

```text
G1  未登录的外部调用，默认【全部被拒绝】
    → 验证：新加一个接口不写任何注解，匿名访问应返回 401

G2  用户可以自助注册，密码以 bcrypt 哈希入库，明文永不落库
    → 验证：SELECT COUNT(*) WHERE password='<明文>' = 0

G3  用户可以登录，拿到 access token 与 refresh token
    → 验证：access token 能解出 sub（用户 id），refresh token 在库里只存哈希

G4  受保护接口能拿到「当前登录用户」，且被禁用的账号立即失效
    → 验证：把某用户 status 改成 0，其已签发的有效 token 访问 /api/auth/me
             应被拒绝，而不是继续成功

G5  access token 过期后，用户无需重新输密码即可续期；用户可主动登出
    → 验证：刷新一次后，旧的 refresh token 立即不可再用
```

> **一句话概括本期交付**：让项目从「裸奔的教学 demo」变成「有门禁的系统」。

### 1.3 非目标（明确不做，避免范围蔓延）

| 不做 | 原因 | 归到哪一阶段 |
| --- | --- | --- |
| 角色 / 权限 / RBAC | 本期只回答「你是谁」 | 阶段二后半段 |
| 忘记密码、改密码、邮箱验证 | 依赖邮件通道 | 未排期 |
| 登录失败次数限制、验证码、全局限流 | 需要计数器存储 | 阶段五（Redis） |
| 把 refresh token 迁到 Redis | 本期先用数据库表 | 阶段五 |
| OAuth / 第三方登录 | 无需求来源 | 未排期 |
| 前端页面 | 本项目是后端学习库 | 不在范围 |

**⚠️ 注意 G2/G4 那条「不做限流」的后果**：本期交付后，登录接口可以被无限次暴力尝试。这是**已知且接受**的风险，不是遗漏。PRD 把它显式写出来，是为了让你在阶段五回头补时知道缺口在哪。

---

### 1.4 使用场景（用户故事）

```text
场景 1 · 新用户注册
  未注册访客 → POST /auth/register → 拿到账号
  异常路径：用户名已被占用 / 邮箱已被占用 / 密码太短 / 传了不该传的字段

场景 2 · 登录并访问业务接口
  已注册用户 → POST /auth/login → 拿到 accessToken
            → 之后每个请求带 Authorization: Bearer <accessToken>
            → 服务端凭 token 识别出「当前用户」

场景 3 · token 过期后的无感续期
  用户挂着页面两小时 → accessToken 过期 → 业务请求返回 401 + 20002
  → 前端自动用 refreshToken 调 POST /auth/refresh → 换到新 token，用户无感知
  → 若 refreshToken 也过期 → 只能重新登录

场景 4 · 主动登出 / 强制下线
  用户点「退出登录」→ POST /auth/logout → 该 refreshToken 立即作废
  安全事件（密码泄露、设备丢失）→ 撤销该用户全部会话
```

---

## 2. 核心功能点

### 2.1 功能清单

| 编号 | 功能 | 优先级 | 里程碑 |
| --- | --- | --- | --- |
| F1 | 用户注册（写库 + 唯一性冲突处理） | P0 | M1 |
| F2 | 用户名 / 邮箱唯一索引显式命名 | P0 | M1 |
| F3 | 用户登录（凭据校验 + 状态校验） | P0 | M2 |
| F4 | 签发 access token（JWT） | P0 | M2 |
| F5 | 签发 refresh token（随机串 + 存哈希） | P0 | M2 |
| F6 | 全局默认鉴权（Guard + 放行装饰器） | P0 | M3 |
| F7 | 获取当前登录用户（含禁用即时生效） | P0 | M3 |
| F8 | 令牌刷新（含轮转 rotation） | P0 | M4 |
| F9 | 登出 / 撤销（单个 + 全部） | P0 | M4 |
| F10 | 复用检测（盗用检测 + 家族撤销） | P1 | M4 |
| F11 | 登录时记录设备信息（userAgent） | P2 | M2（可选） |
| F12 | 登录失败的常量时间响应（防时序枚举） | P2 | M2（可选） |

**P0 定义**：缺了它本模块不成立。**P1**：安全要求，强烈建议做。**P2**：可延后，不阻塞验收。

### 2.2 权限边界（本期）

```text
                   需要什么                           举例
─────────────────────────────────────────────────────────────
公开接口      无（显式标注 @Public）        register / login / refresh
                                          logout / health
受保护接口    有效 accessToken              GET /auth/me
                                          （阶段三起：所有业务接口）
```

> **默认拒绝（default deny）**：新接口默认落在「受保护」一侧，想公开必须**显式**声明。
> 反过来做（默认公开、要保护才加注解）是本项目明确禁止的方向——漏加一个注解就是一次数据泄漏。

---

## 3. 接口契约（输入与输出）

### 3.1 通用约定

**响应体**（所有接口统一，已由 `TransformInterceptor` / `AllExceptionsFilter` 保证）：

```json
{
  "code": 0,
  "message": "操作成功",
  "data": { },
  "traceId": "6f1c0b3e-...",
  "timestamp": 1787000000000
}
```

**HTTP 状态码语义边界**（本项目约定，务必遵守）：

```text
2xx  → 请求已被成功处理
       包含「业务规则拒绝」（如登录密码错误），此时 code ≠ 0
4xx  → 传输 / 协议层问题
       401 未认证 · 403 无权限 · 400 参数格式错 · 404 路由不存在
5xx  → 服务端故障
```

| 场景 | HTTP | code |
| --- | --- | --- |
| 注册成功 / 登录成功 / 刷新成功 / 登出成功 | **200** | 0 |
| 参数不合法 | 200 或 400（跟随 ValidationPipe 默认，不强制统一） | 10001 |
| **登录密码错误 / 用户不存在** | **200** | 20004 |
| 登录时账号被禁用 | **200** | 40003 |
| 注册冲突（用户名/邮箱已存在） | **200** | 40002 |
| **未带 token 访问受保护接口** | **401** | 20001 |
| **token 已过期** | **401** | 20002 |
| **token 无效（签名/格式错）** | **401** | 20003 |
| refresh token 无效/已撤销/已过期 | **200** | 20005 |
| 检测到 refresh token 复用 | **200** | 20006 |

> **为什么登录失败返回 200 而不是 401**：401 的语义是「你这个请求没通过认证关卡」，
> 而登录接口本身就是来认证的，它成功执行并得出了「凭据不对」这个业务结论。
> 与「业务失败返回 200 + 业务码」的既有约定保持一致。
>
> **为什么 Guard 拦截走真 401**：那里是传输层语义——请求根本没被允许进入业务逻辑。

**新增错误码**（追加到 `ErrorCode`，2xxxx 段）：

```ts
REFRESH_TOKEN_INVALID = 20005,   // refresh token 无效 / 已撤销 / 已过期
REFRESH_TOKEN_REUSED  = 20006,   // 检测到已轮转的 token 被再次使用
```

**认证请求头**：

```http
Authorization: Bearer <accessToken>
```

**时间单位**：所有 `expiresIn` 字段单位一律为**秒**，与 JWT 规范一致。

### 3.2 数据模型

#### 3.2.1 改造 `user` 表（M1）

现状：`username` / `email` 用的是列级 `unique: true`，TypeORM 生成的索引名是**哈希串**（如 `UQ_78a916df40e02a9deb1c4b75ed`）。

问题：MySQL 唯一键冲突错误（errno 1062）的报错信息里只有**索引名**。索引名是哈希 → **无法判断到底是用户名重复还是邮箱重复**，只能给用户一句含糊的「已存在」。

要求：改为**显式命名的唯一索引**，命名规则 `uk_<表>_<列>`：

```text
uk_user_username
uk_user_email
```

> **验收方式**：`SHOW CREATE TABLE user;` 里必须能看到这两个名字。
> **预期副作用**：`synchronize` 会删掉旧哈希索引、建新索引 —— 请观察它实际生成的 DDL，并确认旧索引是被 DROP 而非被误判为重命名（对照你 09-20 学到的那套 `renameColumns()` 判定逻辑，看它在**索引**上是否适用）。

#### 3.2.2 新增 `refresh_token` 表（M2）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | bigint | PK, 自增 | 主键 |
| `userId` | bigint | NOT NULL, FK → `user.id` | 所属用户 |
| `tokenHash` | varchar(64) | NOT NULL, UNIQUE | **SHA-256 hex，绝不存明文 token** |
| `familyId` | varchar(36) | NOT NULL | 一次登录 = 一个家族，轮转时不变 |
| `expiresAt` | datetime | NOT NULL | 过期时间 |
| `revokedAt` | datetime | NULL | 撤销时间，NULL = 仍有效 |
| `replacedByHash` | varchar(64) | NULL | 轮转链：被哪个新 token 取代 |
| `createdAt` / `updatedAt` | datetime | 自动 | 审计 |

**索引**：`uk_refresh_token_tokenHash`（唯一）、`idx_refresh_token_userId`、`idx_refresh_token_familyId`。

**外键**：`userId` → `user.id`，策略 **`onDelete: 'CASCADE'`**（删用户即清空其会话）。

> 🔍 **顺带闭环一个悬了很久的问题**：你记忆里有一条待办——「TiDB 是否真的会建外键 / onDelete 是否生效」。
> 本轮在 MySQL 8 本地库上，请用 `SHOW CREATE TABLE refresh_token;` 和
> `information_schema.REFERENTIAL_CONSTRAINTS` 实测确认外键真的被创建了，
> 并把结论写回笔记。这是你从 09-15 就挂着的一条未知数。

#### 3.2.3 为什么 refresh token 存 SHA-256 而不是 bcrypt

这是本模块**最容易想错**的一处，按下表自行核对：

| | 密码 | refresh token |
| --- | --- | --- |
| 输入空间 | 用户自选，熵低（可被字典攻击） | 服务端生成的 256bit 随机串，熵极高 |
| 攻击者拿到哈希后 | 可以暴力枚举出原文 | 枚举空间 2^256，不可能 |
| 校验频率 | 只在登录时一次 | **每次刷新都要查库匹配** |
| 能否用索引查找 | 不能（bcrypt 每次盐不同） | **必须能**（要按 tokenHash 定位行） |
| 结论 | 用 bcrypt（慢哈希） | 用 SHA-256（快哈希） |

> **一句话**：慢哈希是为了对抗「弱输入 + 可枚举」；token 不存在这两个前提，
> 用 bcrypt 只会让你每次刷新都得**全表扫描逐行比对**，纯属自损性能。

### 3.3 接口清单

共 5 个端点，全部挂在 `/api/auth` 下。

---

#### F1 · 注册

```http
POST /api/auth/register
Content-Type: application/json
```
**权限**：公开

**请求体**

| 字段 | 类型 | 必填 | 校验规则 |
| --- | --- | --- | --- |
| `username` | string | 是 | 4~50 字符；`^[a-zA-Z][a-zA-Z0-9_]*$`（字母开头，允许数字下划线） |
| `email` | string | 是 | 合法邮箱格式；≤100 字符；**入库前转小写 + trim** |
| `password` | string | 是 | **8 ~ 72 字节**（注意是**字节**不是字符） |
| `nickname` | string | 否 | ≤50 字符；不传则存 `null` |

> 🔴 **`password` 的 72 必须按字节算**：中文一个字符占 3 字节，24 个汉字就是 72 字节。
> bcrypt 只取前 72 字节，**超出部分静默忽略**——用户设了 80 字符的密码，
> 第 73 字节之后随便改都能登录成功。必须用 `Buffer.byteLength(password, 'utf8')` 判长度。
>
> **刻意不加复杂度规则**（不要「必须含大写 + 数字 + 符号」）：NIST SP 800-63B 指出
> 这类规则会诱导出 `Password1!` 这种形式合规、实际极弱的密码。
> 正确做法是弱密码黑名单 + 登录失败限制（本期限流不做，见 §1.3）。

**成功响应** `code: 0`, HTTP 200

```json
{
  "data": {
    "id": "1",
    "username": "alice",
    "email": "alice@example.com",
    "nickname": "爱丽丝",
    "status": 1,
    "createdAt": "2026-09-22T10:00:00.000Z"
  }
}
```

> ⚠️ **`data` 里绝对不能有 `password`**，一个字节都不行。
> `id` 必须是 **string**（bigint 映射），不能是 number。

**失败响应**

| 触发条件 | code | 说明 |
| --- | --- | --- |
| 用户名已存在 | 40002 | message 需明确指向 `username` |
| 邮箱已存在 | 40002 | message 需明确指向 `email` |
| 参数不合法 | 10001 | 一次报出全部问题 |
| 请求体含未声明字段（如 `status: 0`） | 10001 | `forbidNonWhitelisted` 拦截，不允许自己指定状态 |

---

#### F3 + F4 + F5 · 登录

```http
POST /api/auth/login
Content-Type: application/json
```
**权限**：公开

**请求体**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `account` | string | 是 | **用户名或邮箱**。判定规则：包含 `@` 则按 email 查，否则按 username 查 |
| `password` | string | 是 | 明文密码 |

> **为什么用 `account` 而不是分开两个字段**：前端一个输入框更自然；服务端判定规则必须**确定性**——
> 「含 `@` 走邮箱」是一条无歧义的规则，不要写成「先试用户名再试邮箱」（会有歧义且多一次查询）。

**成功响应** `code: 0`, HTTP 200

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "8Kd2mQ...（64 字符随机串）",
    "tokenType": "Bearer",
    "expiresIn": 7200,
    "user": {
      "id": "1",
      "username": "alice",
      "email": "alice@example.com",
      "nickname": "爱丽丝",
      "status": 1
    }
  }
}
```

**access token 的 payload 契约**（严格限定，多一个字段都不行）：

```json
{
  "sub": "1",             // 用户 id，必须 string
  "username": "alice",
  "iat": 1787000000,
  "exp": 1787007200
}
```

> 🔴 **payload 里不允许出现 `status`**。原因见 §3.4「禁用必须即时生效」。
> **更不允许出现 `password`、`email`**——JWT 的 payload 是 **Base64 编码，不是加密**，
> 任何人粘贴到 jwt.io 就能读到全部内容。把它当成一张**公开的明信片**，不要当成信封。

**失败响应**

| 触发条件 | HTTP | code | 说明 |
| --- | --- | --- | --- |
| 密码错误 | 200 | 20004 | |
| **用户不存在** | 200 | 20004 | **必须与「密码错误」完全同码同文案** |
| 账号被禁用（`status ≠ 1`） | 200 | 40003 | |
| 参数不合法 | — | 10001 | |

> 🔴 **「用户不存在」与「密码错误」必须返回完全相同的结果**，否则攻击者可以
> 拿一个用户名字典逐个试探，把「20004-用户不存在」和「20004-密码错误」的差异
> 当成**用户枚举接口**，先把你们平台上所有真实用户名捞出来，
> 再针对性撞库。这是同类事故里最常见的一个入口。

---

#### F6 + F7 · 当前用户

```http
GET /api/auth/me
Authorization: Bearer <accessToken>
```
**权限**：受保护

**成功响应** `code: 0`, HTTP 200

```json
{
  "data": {
    "id": "1",
    "username": "alice",
    "email": "alice@example.com",
    "nickname": "爱丽丝",
    "status": 1,
    "createdAt": "2026-09-22T10:00:00.000Z",
    "updatedAt": "2026-09-22T10:00:00.000Z"
  }
}
```

**失败响应**

| 触发条件 | HTTP | code |
| --- | --- | --- |
| 完全没带 `Authorization` 头 | 401 | 20001 |
| token 签名错 / 格式非法 | 401 | 20003 |
| token 已过期 | 401 | 20002 |
| token 有效但用户已被禁用 | 200 | 40003 |
| token 有效但用户已被删除 | 401 | 20003 |

> **注意最后两条的差别**：这两种都是「token 本身没问题」，但用户状态变了。
> 它们走的是策略的 `validate()` 返回，不是签名校验失败，所以不能被笼统地
> 归到 20003 里——**否则你无法从日志上区分「有人在伪造 token」和「正常用户的账号被停用」**。

---

#### F8 · 刷新令牌

```http
POST /api/auth/refresh
Content-Type: application/json
```
**权限**：公开（**不能要求 access token**——它就是因为 access token 过期才被调用的）

**请求体**

```json
{ "refreshToken": "8Kd2mQ...（64 字符）" }
```

**成功响应** `code: 0`, HTTP 200

```json
{
  "data": {
    "accessToken": "eyJ...（新）",
    "refreshToken": "Qv7xNp...（新，与请求里的不同）",
    "tokenType": "Bearer",
    "expiresIn": 7200
  }
}
```

🔴 **必须轮转（rotation）**：每次刷新都签发**新的** refresh token，旧的立即作废。

| 触发条件 | HTTP | code |
| --- | --- | --- |
| refresh token 不存在 / 已被撤销 / 已过期 | 200 | 20005 |
| 请求体缺字段或格式错 | — | 10001 |
| **检测到复用（见 F10）** | 200 | 20006，且同时撤销该家族全部 token |

---

#### F9 · 登出

```http
POST /api/auth/logout
Content-Type: application/json
```
**权限**：公开（**同样不能要求 access token**——用户 token 可能已过期，但仍应能登出）

**请求体**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `refreshToken` | string | 是 | 要撤销的令牌 |
| `all` | boolean | 否 | `true` = 撤销该用户**全部**会话；默认 `false` 只撤销这一个家族 |

**成功响应** `code: 0`, HTTP 200，`data: null`

> **幂等要求**：用一个已经失效的 refreshToken 调用登出，**也必须返回成功**。
> 登出的语义是「确保这个 token 用不了了」，重复调用不该报错——
> 否则用户网络重试时会看到一个莫名其妙的失败提示。

---

### 3.4 关键机制说明（三条，都是硬要求）

#### ① 默认全局保护 + 显式放行

```text
请求进来
   │
   ├─ 路由是否标了 @Public() ? ──是──→ 直接放行
   │
   └─否→ 校验 Authorization: Bearer <token>
            │
            ├─ 没带 ──────→ 401 / 20001
            ├─ 签名或格式错 ─→ 401 / 20003
            ├─ 已过期 ─────→ 401 / 20002
            └─ 通过 → 查库校验用户状态
                        ├─ 用户不存在 ─→ 401 / 20003
                        ├─ status ≠ 1 ─→ 200 / 40003
                        └─ 正常 → 挂到 request.user，进入 Controller
```

**必须用 Guard 的全局注册方式**（`APP_GUARD`），**不是**在 `main.ts` 里 `app.useGlobalGuards(new ...)`。
理由与阶段一注册 Pipe/Filter/Interceptor 完全相同：前者进 IoC 容器，可注入 `Reflector`、`ConfigService`；后者是游离实例。

**放行清单**（每个都要显式加 `@Public()`）：

- `POST /api/auth/register`、`/login`、`/refresh`、`/logout`
- `GET /health`、`GET /health/ready`
- `src/modules/demo/*` 里的全部演示接口

> ⚠️ **Swagger 的 `/api/docs` 是否需要 `@Public()`？**
> 结论未定，**需要你实测**：Swagger UI 由 express 中间件直接服务，可能根本不经过 Nest 的 Guard。
> 但 `SwaggerModule` 注册的路由在不同的 Nest 版本上行为可能不同。
> 实测后把结论写进笔记——**这是个非常好的问题，答案没必要靠猜**。

#### ② 禁用必须即时生效（`validate()` 里查库）

`JwtStrategy.validate()` 的契约：

```text
输入：JWT 解出来的 payload（{ sub, username, iat, exp }）
输出：一个对象 → 该对象会被挂到 request.user 上，供 @CurrentUser() 取用
      返回 null / 抛异常 → 请求被拒
```

**硬要求**：`validate()` 里**必须查一次数据库**校验用户当前状态，不能只信 payload。

| 方案 | 禁用生效时机 | 代价 |
| --- | --- | --- |
| payload 里塞 `status`，不查库 | **等 token 过期才生效**（最长 2 小时） | 0 次查询 |
| ✅ `validate()` 里查库（本期采用） | **立即** | 每请求 +1 次查询 |

> 封禁一个盗号账号，两小时后才生效——这在安全事件里是不可接受的。
> **每请求多一次主键查询是必须付的成本**，阶段五用 Redis 缓存这次查询来优化。
> **顺序必须是「先正确，后优化」，反过来会得到一个又快又漏的系统。**

#### ③ 复用检测（F10，M4 核心）

```text
一次登录 = 一个 family（familyId 固定）
每次刷新 = 该 family 下签发新 token，旧 token 标记 revokedAt + replacedByHash

如果有人拿着【已经轮转掉】的旧 token 来刷新：
   ├─ 正常用户不会这么做（前端应该用最新的）
   └─ 只可能是：token 被复制走了，攻击者在用旧的那一份
      → 无法区分「是攻击者」还是「用户重放」，保守处理：
         【撤销该 family 下全部 token】
      → 返回 20006
```

**首次实现范围**：撤销**整个 family**（更精确，不会把用户其他设备踢下线）。
`all: true` 的登出才撤销用户全部家族。

> **实现提示（不是代码）**：轮转到一半失败会留下「旧 token 已撤销、新 token 未签发」的空洞。
> 想一想这两步要不要放进同一个事务。这是阶段四的伏笔，本轮答不上来可以留个 TODO。

---

## 4. 技术要求与约束

### 4.1 技术栈与新增依赖

```bash
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt
pnpm add -D @types/passport-jwt @types/passport
```

| 约束 | 说明 |
| --- | --- |
| **必须用 Passport** | 不用「纯 @nestjs/jwt + 手写 Guard」。你的真实项目 `sse-tasker` 用的就是 Passport-JWT，且 `validate()` 契约是你自评的空白项——本期就是要把它补掉 |
| 不引入 Redis | 已确认，refresh token 落数据库表 |
| 不引入新数据库 | 沿用 MySQL 8.0.28 本地实例 |
| 版本对齐 | 装之前先 `npm view <pkg> version` 确认，不要盲装 |
| **ESM 约束** | 相对导入**必须带 `.js` 后缀**；`__dirname` 不存在；`import type` 会破坏装饰器元数据 |
| **ESM 下 CJS 包** | `passport-jwt` / `passport` 是 CommonJS 包，ESM 里默认导入的行为与 `bcrypt` 同类。装完**先写两行探针确认能 import 成功**，别写到一半才发现 |

### 4.2 安全要求（硬性，逐条可检查）

| # | 要求 |
| --- | --- |
| S1 | 明文密码**永不落库**、永不进日志、永不出现在任何响应体 |
| S2 | access token / refresh token 原文**永不进日志** |
| S3 | refresh token 在库里**只存 SHA-256 哈希** |
| S4 | JWT payload **只放 sub + username**，不含 status / email / password |
| S5 | `JWT_SECRET` 从环境变量读，**不允许硬编码**（已有 Joi 校验，min 16 位） |
| S6 | 「用户不存在」与「密码错误」**响应完全一致** |
| S7 | 唯一性由**数据库唯一索引**保证，不允许「先查再插」作为唯一防线 |
| S8 | 新接口**默认受保护**，公开必须显式声明 |

### 4.3 环境变量变更

当前 `.env` 里是 `JWT_EXPIRES_IN=7d`（阶段一预留）。本期要拆成两个：

```bash
# 改造后
JWT_ACCESS_EXPIRES_IN=2h      # 开发期用 2h 便于调试；生产建议 15m
JWT_REFRESH_EXPIRES_IN=7d
```

| 要做的事 | 说明 |
| --- | --- |
| 改 `.env` 与 `.env.example` | **`.env.example` 只能放占位值** |
| 改 `src/config/env.validation.ts` | Joi schema 同步改，两个都要有默认值 |
| 改 `src/config/configuration.ts` | 配置命名空间同步 |
| 旧变量清理 | `JWT_EXPIRES_IN` 要么删掉，要么保留兼容——**不能两个都读**，否则行为不确定 |

> ⚠️ **安全默认值原则**（阶段一已确立）：危险开关的默认值必须是安全的那一侧。
> `JWT_ACCESS_EXPIRES_IN` 的 Joi 默认值给 `15m`，不要给 `7d`。

### 4.4 可观测性要求

| 要求 | 验收方式 |
| --- | --- |
| 一次「登录 → 访问 /me → 刷新」全链路的日志能靠**同一个 traceId** 串起来 | `grep <traceId> 日志` 能连续看到三段 |
| 关键事件必须有结构化日志 | 登录成功 / 登录失败 / 注册成功 / 注册冲突 / 刷新成功 / **复用检测触发** |
| 复用检测触发必须是 **warn 或 error 级别** | 这是安全事件，不能混在 info 里 |
| 日志里**不能**出现明文密码与 token 原文 | `grep` 日志文件，命中数必须为 0 |

> 🔍 **一个需要你实测的点**：`logger.config.ts` 里配了
> `redact: ['req.body.password', 'req.body.refreshToken', ...]`，
> 但 **pino-http 的默认 request serializer 并不输出 body**。
> 如果 body 从来没被记录，那这两条 redact 规则就是**装饰性的**——看着安全，实际从未生效过。
> 请用一次包含明文密码的登录请求，`grep` 日志确认。把结论写进笔记。

### 4.5 工程约束

| 约束 | 说明 |
| --- | --- |
| 本地构建 | `nest build` 因环境限制必然失败（`dist/` 清不掉），用 `pnpm exec tsc -p tsconfig.build.json` |
| 编译门禁 | 判定编译是否成功**必须用显式退出码**，不要用 `cmd \| head`（管道退出码取最后一个命令） |
| 端口 | 验证时用 `APP_PORT=3100`，避开你自己 `pnpm start:dev` 占用的 3000 |
| 响应格式 | 所有接口必须与 §3.1 的响应体逐字段一致 |
| Swagger | 5 个端点都要有 `@ApiTags` / `@ApiOperation` / `@ApiBearerAuth`（受保护的接口） |

---

## 5. 里程碑与验收标准

> **每个里程碑独立验收。验收标准全部是可执行的动作 + 明确的期望输出。**
> 不接受「我看过了，应该没问题」——贴命令与输出。

### M1 · 注册

**交付物**：`POST /api/auth/register` 可用，`user` 表唯一索引已命名。

| # | 验收动作 | 期望结果 |
| --- | --- | --- |
| 1.1 | 合法入参注册 | HTTP 200，`code: 0`，`data` 含 `id`（**string 类型**），**不含 `password`** |
| 1.2 | 同一用户名再注册一次 | `code: 40002`，message 指向 **username** |
| 1.3 | 用第一个用户的邮箱、换个用户名再注册 | `code: 40002`，message 指向 **email** |
| 1.4 | 密码 7 字节 | `code: 10001` |
| 1.5 | 密码 73 字节（用 `Buffer.byteLength` 构造） | `code: 10001` |
| 1.6 | 传 `{"username":"a","email":"bad","password":"x","status":0}` | `code: 10001`，**一次报出全部问题**，且 `status` 被拒 |
| 1.7 | `SELECT password FROM user WHERE username='xxx'` | 60 字符，`$2b$` 开头 |
| 1.8 | `SELECT COUNT(*) FROM user WHERE password='<刚才的明文>'` | **0** |
| 1.9 | `SHOW CREATE TABLE user;` | 出现 `uk_user_username` 与 `uk_user_email` |
| 1.10 | **并发 20 个不同请求、同一用户名** | **恰好 1 条成功，其余 19 条 40002** |

> **1.10 是本里程碑的核心验收项**。它验证的是「唯一性由数据库保证」这件事——
> 如果你写成了「先 SELECT 确认不存在再 INSERT」，并发下会成功多条。
> 测试方法：
> ```bash
> for i in $(seq 1 20); do
>   curl -s -X POST http://127.0.0.1:3100/api/auth/register \
>     -H 'Content-Type: application/json' \
>     -d '{"username":"raceuser","email":"race'$i'@x.com","password":"Passw0rd123"}' &
> done; wait
> # 然后 SELECT COUNT(*) FROM user WHERE username='raceuser';  → 必须是 1
> ```

---

### M2 · 登录与签发

**交付物**：`POST /api/auth/login` 可用；`refresh_token` 表已建；JWT 签发链路打通。

| # | 验收动作 | 期望结果 |
| --- | --- | --- |
| 2.1 | 正确账号密码登录 | `code: 0`，返回 `accessToken` / `refreshToken` / `expiresIn` |
| 2.2 | 把 `accessToken` 贴到 jwt.io 解码 | payload **只有** `sub` / `username` / `iat` / `exp` |
| 2.3 | `sub` 的类型 | **string** |
| 2.4 | 用**邮箱**作为 `account` 登录 | 成功，且返回的 user 与用户名登录一致 |
| 2.5 | 密码错误 | HTTP **200**，`code: 20004` |
| 2.6 | 用户名不存在 | HTTP **200**，`code: 20004`，**响应与 2.5 逐字节相同** |
| 2.7 | 把某用户 `status` 改成 0 后登录 | `code: 40003` |
| 2.8 | `SELECT * FROM refresh_token;` | `tokenHash` 是 **64 位 hex** |
| 2.9 | `grep '<明文密码>' 应用日志` | **0 命中** |
| 2.10 | `grep '<refreshToken 原文>' 应用日志` | **0 命中** |
| 2.11 | `SHOW CREATE TABLE refresh_token;` | 有外键指向 `user(id)`，`ON DELETE CASCADE` |
| 2.12 | 新增一条 refresh_token 后删掉那条 user | refresh_token 被**级联删除**（验证外键真生效） |

> **2.12 顺手闭环你从 09-15 挂到现在的未知数**：onDelete 到底生不生效。
> **2.11 + 2.12 必须都做**——只看 `SHOW CREATE TABLE` 只能证明「DDL 写了」，
> 真删一次才能证明「行为对」。

---

### M3 · 全局防护

**交付物**：全局 Guard 生效；`GET /api/auth/me` 可用；禁用即时生效。

| # | 验收动作 | 期望结果 |
| --- | --- | --- |
| 3.1 | 不带 `Authorization` 访问 `/api/auth/me` | HTTP **401**，`code: 20001` |
| 3.2 | 带 `Bearer garbage` | HTTP **401**，`code: 20003` |
| 3.3 | 带一个**手工构造的过期 token** | HTTP **401**，`code: 20002` |
| 3.4 | 带有效 token | HTTP 200，`code: 0`，返回当前用户，**不含 password** |
| 3.5 | 匿名访问 `GET /health` 与 `/health/ready` | 200，**未被 Guard 拦截** |
| 3.6 | 匿名访问阶段一的 `/api/demo/ok` | 200（`@Public` 生效） |
| 3.7 | 新建一个临时接口，**不加任何注解**，匿名访问 | **401** ← 验证「默认保护」 |
| 3.8 | **把某用户 `status` 改成 0，用他刚签发的有效 token 访问 `/me`** | `code: 40003`（**不是成功**） |
| 3.9 | 观察日志 | 每个受保护请求都能看到 `validate()` 触发的用户查询 |
| 3.10 | 匿名访问 `/api/docs` | 记录实际结果（**这是待实测项，无预设期望**） |

> **3.8 是本里程碑的核心验收项**。它验证「禁用即时生效」这个设计决策真的落地了。
> 如果你把 `status` 塞进了 JWT payload，这一条会失败——而失败得很隐蔽：
> 你要等 token 过期后重试才会发现。**所以这条必须现在测。**

---

### M4 · 刷新与撤销

**交付物**：`POST /api/auth/refresh` 与 `POST /api/auth/logout` 可用；轮转与复用检测生效。

| # | 验收动作 | 期望结果 |
| --- | --- | --- |
| 4.1 | 用有效 `refreshToken` 刷新 | `code: 0`，返回**新的** accessToken 与**新的** refreshToken |
| 4.2 | 对比新旧 refreshToken | **字符串不同** |
| 4.3 | 用**刚被轮转掉的旧** refreshToken 再刷一次 | `code: 20006` |
| 4.4 | 紧接 4.3，用**最新的**那个 refreshToken 刷新 | **也失败**（family 已被整体撤销） |
| 4.5 | `SELECT * FROM refresh_token` 检查 | 旧行 `revokedAt` 有值、`replacedByHash` 指向新 token |
| 4.6 | 登出后，用该 refreshToken 刷新 | `code: 20005` |
| 4.7 | **重复登出同一个 token** | 仍然 `code: 0`（幂等） |
| 4.8 | `all: true` 登出后，该用户**所有**家族的 token 都失效 | 全部 `20005` |
| 4.9 | 手工把一个 refresh token 的 `expiresAt` 改成过去 | 刷新返回 `code: 20005` |
| 4.10 | 观察日志中复用检测的记录 | **warn/error 级别**，含 userId 与 familyId |

> **4.3 + 4.4 是核心**。它测的是「被盗检测」这条安全链路：
> 单看 4.3 只能证明「旧 token 被拒了」，这没什么价值——
> 价值在 4.4：**旧 token 被使用这件事，必须让整个会话家族一起失效**。
> 只拒掉那一个 token 而不撤销家族，攻击者手里可能还攥着别的。

---

## 6. 需要你实现的代码范围

### 6.1 新增文件

```text
src/modules/auth/
  auth.module.ts                        AuthModule（imports JwtModule / PassportModule / UserModule / TypeOrmModule.forFeature）
  auth.controller.ts                    5 个端点
  auth.service.ts                       注册 / 登录 / 刷新 / 登出的业务编排
  refresh-token.service.ts              refresh token 的签发、轮转、校验、撤销
  entities/refresh-token.entity.ts      refresh_token 表映射

  strategies/jwt.strategy.ts            Passport JWT 策略（validate() 契约在这里）
  guards/jwt-auth.guard.ts              全局 Guard（含 handleRequest 覆写，区分 3 种 401）

  decorators/public.decorator.ts        @Public() 放行标记
  decorators/current-user.decorator.ts  @CurrentUser() 参数装饰器

  dto/register.dto.ts
  dto/login.dto.ts
  dto/refresh-token.dto.ts
  dto/logout.dto.ts
```

### 6.2 需要改动的既有文件

| 文件 | 改什么 |
| --- | --- |
| `src/app.module.ts` | 挂载 `AuthModule`；注册全局 Guard（`APP_GUARD`） |
| `src/modules/user/entities/user.entity.ts` | 唯一索引改为显式命名 `uk_user_username` / `uk_user_email` |
| `src/common/constants/error-code.ts` | 新增 `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` 及其文案 |
| `src/config/env.validation.ts` | JWT 变量拆分 + Joi 规则 |
| `src/config/configuration.ts` | 配置命名空间同步 |
| `.env` / `.env.example` | 变量拆分（`.env.example` 只留占位值） |
| `src/modules/health/health.controller.ts` | 加 `@Public()` |
| `src/modules/demo/demo.controller.ts` | 加 `@Public()` |
| `src/modules/user/user.controller.ts` | 加 `@Public()`（教学用）或直接删掉 `seed` 接口（**建议删**，已被真注册接口取代） |
| `README.md` | 接口清单与认证说明更新 |

### 6.3 不属于你的范围

- 前端代码
- RBAC / 角色表
- Redis 相关
- 部署脚本（阶段七）

---

## 7. 已知陷阱（只描述现象，不给实现）

这些是会真实咬人的地方。我不给答案——你自己踩一次，比我说十遍有用。

| # | 陷阱 | 现象 |
| --- | --- | --- |
| T1 | **幂等不是天然的**：`save()` 返回的是内存对象，不受 `select: false` 约束 | 你把这行返回值直接丢进响应体，`password` 就出去了。第 2 课实测过 |
| T2 | **1062 的报错信息里只有索引名** | 索引名是哈希串时无法判断哪个字段冲突。这就是 §3.2.1 要你先命名索引的原因 |
| T3 | **JWT payload 是 Base64 不是加密** | 任何人粘贴就能读。别往里塞敏感字段 |
| T4 | **Passport 默认把所有失败都归成 401 通用异常** | 你会分不出「过期」和「无效」。需要在 Guard 覆写 `handleRequest` |
| T5 | **Guard 注册成全局后，`/health` 与 demo 接口会一起被拦** | 阶段一的验收项会突然全挂。这是 `@Public()` 存在的意义 |
| T6 | **`@Public()` 的元数据传递依赖 `Reflector`** | 用错 `reflector.getAllAndOverride` / `get` 的层级，会出现「加了注解仍被拦」 |
| T7 | **改索引名会触发 synchronize 的 DDL** | 请观察它生成的是 DROP + ADD 还是别的。对照 09-20 那套 `renameColumns()` 逻辑，看它在索引上是否适用 |
| T8 | **ESM 下 passport-jwt 的默认导入** | 与 bcrypt 同类问题。先写探针确认能 import 成功 |
| T9 | **refresh token 长度用 crypto.randomBytes(32)** | 转成 `base64url` 是 43 字符左右；转 `hex` 是 64 字符。文档约定是 64 字符 hex——**别写完了才发现和表格对不上** |
| T10 | **轮转的两步操作不原子** | 旧 token 撤销成功、新 token 写入失败 → 用户被踢下线且没有任何 token 可用。想一想要不要包事务 |

---

## 8. 待实测确认的未知数（不预设答案）

诚实列出本期我没法凭推断确定的三件事。**实测后把结论写进笔记。**

| # | 未知数 | 验证方式 |
| --- | --- | --- |
| U1 | `/api/docs` 会不会被全局 Guard 拦截 | 加 Guard 后匿名访问，看返回 200 还是 401 |
| U2 | `redact` 里的 `req.body.password` 是否真的生效（pino-http 默认可能根本不记录 body） | 发一次含明文密码的登录请求，`grep` 日志 |
| U3 | 改唯一索引名后，synchronize 生成什么 DDL | 启动看日志中的 ALTER，并 `SHOW CREATE TABLE` 核对 |
| U4 | 用户名/邮箱的大小写敏感性 | MySQL 排序规则是 `utf8mb4_0900_ai_ci`（**不区分大小写**）。用 `Alice` 和 `alice` 分别注册，看是否冲突；再看 `WHERE username='alice'` 能否匹配到 `Alice` |
| U5 | `passport-jwt` 在 ESM 下的导入写法 | 两行探针脚本 |

> **U4 值得特别注意**：它意味着「用户名不区分大小写」这个行为**不是你的代码决定的**，
> 而是 MySQL 排序规则决定的。如果哪天数据库换成 PostgreSQL（默认区分大小写），
> 同一段代码的行为会变。**依赖数据库隐式行为而不显式声明，是跨库迁移时最典型的坑。**

---

## 9. 交付追踪

```text
M1 注册                    ⬜ 未开始
   └ 唯一索引命名           ⬜
M2 登录与签发              ⬜
   └ refresh_token 表 + 外键 ⬜
M3 全局防护                ⬜
   └ 禁用即时生效           ⬜
M4 刷新与撤销              ⬜
   └ 复用检测               ⬜
未知数 U1~U5               ⬜
```

### 完成后的自检清单

- [ ] 5 个端点在 Swagger 上都能看到，且受保护接口标了 Bearer 认证
- [ ] `grep` 日志：明文密码 0 命中、token 原文 0 命中
- [ ] `SELECT COUNT(*) FROM user WHERE password='<任一明文>'` = 0
- [ ] `SHOW CREATE TABLE user` 有 `uk_user_username` / `uk_user_email`
- [ ] `SHOW CREATE TABLE refresh_token` 有 CASCADE 外键，且**真删一次验证过**
- [ ] 并发注册测试：20 并发仅 1 条成功
- [ ] 禁用用户后，其有效 token 立即失效
- [ ] 复用检测能撤销整个 family
- [ ] U1~U5 全部有实测结论
- [ ] 提交信息使用 Conventional Commits 格式

---

## 10. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-09-22 | 初版。确认三项决策：延续 booking-platform / 整模块 + 4 里程碑 / refresh token 落库 |
