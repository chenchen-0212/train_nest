import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

/*
 * ⚠️ 本文件刻意使用 // 行注释来引用代码片段，原因见下方 autoLoadEntities 之前的说明。
 */

/**
 * 数据层基础设施模块
 *
 * 【它解决什么问题】
 * 把「怎么连数据库」这件事从业务代码里彻底剥离。
 * 业务模块只需要写 TypeOrmModule.forFeature([User]) 拿到 Repository，
 * 永远不需要关心连接串、字符池参数、字符集。
 *
 * 【为什么用 forRootAsync 而不是 forRoot】
 *
 *   forRoot      → 同步，拿不到 ConfigService（此时 ConfigModule 还没初始化完）
 *   forRootAsync → 等 ConfigModule 就绪后再构建配置，可以注入 ConfigService
 *
 * 这不只是「写法好看」，它带来三个实际收益：
 *   ① 配置集中：连接参数只在 configuration.ts 出现一次
 *   ② 启动即校验：Joi 已保证值的合法性，这里可以直接信任
 *   ③ 可测试：测试模块可以覆盖 ConfigService，注入一套内存数据库配置
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',

        // ---------- 连接参数：全部来自 ConfigService ----------
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),

        // ============================================================
        // ⭐ autoLoadEntities —— 本项目最关键的一行配置
        //
        // 【它替代了什么】
        // 你可能见过这种写法（你的 sse-tasker 里就是）：
        //
        //     entities: [__dirname + '/**/*.entity{.ts,.js}']
        //
        // ┌──────────────────────────────────────────────────────────┐
        // │ 顺便记一个坑：上面这行【写不进块注释里】。                  │
        // │ 因为 '/**/' 中间含有 * 和 / 相邻的两个字符，                │
        // │ 而 * / 正是块注释的结束标记 —— 注释会在那里提前终止，       │
        // │ 后面全部内容被当成代码解析，报一堆莫名其妙的语法错误。       │
        // │ 所以本文件这段说明用的是 // 行注释。                       │
        // │ （这不是巧合：真实项目里引用路径 / 正则 / 注释时经常撞上。） │
        // └──────────────────────────────────────────────────────────┘
        //
        // 【为什么那种 glob 写法在本项目里会直接崩】
        //   ① ESM 下没有 __dirname
        //      → ReferenceError: __dirname is not defined
        //   ② 即使换成 import.meta.dirname，路径推断在构建后也容易失效
        //      （tsc 产出 dist/ 后目录层级变化，glob 就对不上了）
        //   ③ 它是「隐式」的：实体文件在不在、有没有被匹配到，
        //      只有运行时才知道，编译期毫无提示
        //
        // 【autoLoadEntities 怎么工作】
        //   Nest 会收集所有 TypeOrmModule.forFeature([X, Y]) 里声明过的实体，
        //   自动合并进 TypeORM 的 entities 列表。
        //   → 显式声明、编译期可查、不依赖文件路径、ESM / CJS 通吃。
        //
        // 【代价】每个实体都必须被某个模块 forFeature 过，否则 TypeORM 不认识它。
        //   这不是缺点 —— 恰恰是它「显式」的价值所在。
        // ============================================================
        autoLoadEntities: true,

        // ============================================================
        // 🔴 危险开关：自动同步表结构
        //
        // 打开时，每次启动 TypeORM 都会：
        //   对比「实体定义」与「数据库实际结构」→ 自动执行 ALTER TABLE
        //
        // 会发生的几件事（以下均为实测确认，非推测）：
        //   实体里删一个字段          → DROP COLUMN    → 数据永久丢失
        //   改字段类型                → MODIFY COLUMN  → 可能截断数据
        //   改名【且本次只动了这一处】 → CHANGE         → 数据保留（见下方「重命名检测」）
        //   一次性改两个字段名         → DROP ×2 + ADD ×2 → 数据全丢（重命名检测失效）
        //   同时删一列 + 加一列        → CHANGE         → ⚠️ 被误判为改名，旧数据跑到新列上
        //   全程【没有任何确认提示】，也不会告警。
        //
        // 【重命名检测】TypeORM 在 renameColumns() 里用「一进一出各恰好一个」来【猜】改名：
        //     ① 实体列数与表列数必须完全相同（增删列会直接打破这条）
        //     ② 实体有、表没有的列 恰好 1 个
        //     ③ 表有、实体没有的列 恰好 1 个
        //   三条同时满足 → 判定为重命名，生成 ALTER ... CHANGE，数据跟着走。
        //   少了任何一条 → 退化成 ADD / DROP，数据不保。
        //
        //   ⚠️ 这个判断靠的是「数量恰好匹配」，不是真正的重命名信息。
        //      所以它【无法区分】「把 A 改名成 B」和「删掉 A、新增 B」——
        //      后者会被误判成前者，于是你以为是空的新列，其实继承了一列旧数据。
        //
        //   TypeORM 源码注释自己也承认了这个局限：
        //     "Works if only one column per table was changed.
        //      Changes only column name. If something besides name was changed,
        //      these changes will be ignored."
        //
        //   结论：靠 synchronize 改表结构，本质上是在赌「本次只动了一处」。
        //        生产环境的表结构变更必须交给迁移脚本显式管控。
        //
        // 所以：
        //   本地开发  可以开，方便快速试错（本课就靠它把 user 表建出来）
        //   生产环境  必须是 false，表结构变更交给「迁移脚本」显式管控
        //
        // 本行的正确写法是把判断权交给环境变量，而不是写死 true：
        //   .env（本地）            DB_SYNCHRONIZE=true
        //   .env.production（生产）  DB_SYNCHRONIZE=false
        // ============================================================
        synchronize: config.get<boolean>('database.synchronize'),

        // ============================================================
        // SQL 日志：把「数据库实际发了什么 SQL」变成可见的
        //
        // 这是本课乃至后续所有数据库课程的观察窗口 ——
        // N+1 问题、索引是否命中、事务边界在哪，全部靠它看出来。
        //
        // logger: 'advanced-console' 是 TypeORM 内置的可读格式化器。
        // 注意它【不是 pino】，输出格式和业务日志不统一。
        // 这是个已知取舍：进阶做法是写一个自定义 Logger 把 SQL 转发进 pino，
        // 这样 SQL 日志也能带上 traceId，和请求日志串在一起。
        // 留到「质量与性能」阶段再做。
        // ============================================================
        logging: config.get<boolean>('database.logging')
          ? ['query', 'error', 'warn']
          : ['error'],
        logger: 'advanced-console',

        // ---------- 其他生产级参数 ----------

        // 时区：不指定会跟随系统/容器时区，导致 datetime 字段读写偏移 8 小时
        timezone: '+08:00',

        // 连接池与重试：数据库短暂不可用时不要立刻崩，给它一个重试窗口。
        // 云数据库（TiDB / RDS）重启或网络抖动时，这几行能避免服务启动失败。
        retryAttempts: 5,
        retryDelay: 3000,
      }),
    }),
  ],
})
export class DatabaseModule {}
