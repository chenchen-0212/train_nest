import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 用户实体
 *
 * 【Entity 的职责边界】
 *   ✅ 描述「数据在数据库里长什么样」
 *   ✅ 描述「表和表之间怎么关联」
 *   ✅ 承载与持久化直接相关的逻辑（如字段默认值、级联策略）
 *   ❌ 不写业务规则（「余额不足不能下单」属于 Service）
 *   ❌ 不直接当接口出入参（那是 DTO 的职责，阶段一已讲过原因）
 *
 *   Entity = 数据库的镜像，不是业务的容器。
 *   把它当业务对象用，是项目长大后最难改的技术债之一。
 *
 * 【命名说明】
 *   表名用单数 user（不是 users）。
 *   TypeORM 默认会按类名转小写下划线（User → user），显式声明只是让意图明确。
 *   ⚠️ 若表名撞上 SQL 保留字（如 order / group / desc），必须显式加引号，
 *      或者改用前缀（t_order）。MySQL 8 里 USER 是【非保留】关键字，可以直接用。
 */
@Entity('user')
export class User {
  /**
   * 主键
   *
   * 🔥 类型选择：bigint 而不是 int
   *   INT 上限约 21 亿。用户表、订单表这类「只增不减」的表，
   *   业务量大了会在某一天悄悄写满 —— 而那一刻通常是半夜。
   *   加上自增主键一旦改类型，全表锁 + 所有外键要跟着改，代价极高。
   *   → 凡是长期增长的表，主键直接用 BIGINT。这是几乎零成本的保险。
   *
   * ⚠️ 注意 JS 侧的类型是 **string**，不是 number
   *   原因：JavaScript 的 number 是双精度浮点，安全整数上限是 2^53-1
   *        （约 9000 万亿）。BIGINT 能到 2^63-1，远超这个范围。
   *   TypeORM 为了避免精度丢失，把 bigint 映射成 string 返回。
   *   → 所以 DTO 里 id 也应该是 string；用 number 接会造成精度静默丢失。
   *   本项目启动后会用「看一眼」动作实测确认这一点。
   */
  @PrimaryGeneratedColumn({ type: 'bigint', comment: '主键' })
  id: string;

  /**
   * 登录名
   *
   * unique: true 会生成唯一索引 —— 这条约束由【数据库】保证，
   * 不是由「先查再插」的代码保证。
   *
   * 区别在哪：
   *   代码层面「先 SELECT 确认不存在，再 INSERT」在并发下必然出错
   *   （两个请求同时查到「不存在」，然后都插入 → 两条重复数据）
   *   → 这叫 check-then-act 竞态，唯一索引是最后一道防线，不能省。
   */
  @Index('uk_user_username', {unique: true})
  @Column({
    type: 'varchar',
    length: 50,
    comment: '登录名',
  })
  username: string;

  @Index('uk_user_email', {unique: true})
  @Column({
    type: 'varchar',
    length: 100,
    comment: '邮箱',
  })
  email: string;

  /**
   * 密码哈希
   *
   * 🔒 select: false —— 这是本实体最重要的一个配置
   *
   *   默认所有查询都不带出这个字段。想拿到它必须显式声明：
   *     userRepository.findOne({ where: { username }, select: ['id', 'password'] })
   *     或 queryBuilder.addSelect('user.password')
   *
   *   为什么值得这么做：
   *     ① 响应体泄漏：Controller 直接把实体丢回去时，
   *        password 不会跟着出去（这是最常见的事故来源）
   *     ② 日志泄漏：打印实体对象调试时，哈希不会进日志
   *     ③ 减少传输：登录接口之外的所有查询都白带一个 60 字符字段
   *
   *   设计原则：**默认安全**（secure by default）。
   *   危险字段要「显式取出」，而不是靠每个开发者记得「记得删掉 password」。
   *
   * 长度说明：bcrypt 的输出固定 60 字符。
   *   留 100 是给未来换算法（argon2 的编码串更长）留余量。
   *   ⚠️ 绝不要用 varchar(50) —— 哈希会被静默截断，且截断后依然能通过校验，
   *      是个几乎不可能被发现的严重漏洞。
   */
  @Column({
    type: 'varchar',
    length: 100,
    select: false,
    comment: '密码哈希（bcrypt，60 字符）',
  })
  password: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '昵称',
  })
  nickname: string | null;

  /**
   * 账号状态
   *
   * 用小整数而不是布尔值：布尔只能表达「启用/禁用」两种，
   * 而真实业务通常需要「正常 / 已禁用 / 待验证邮箱 / 已注销」。
   * 从 boolean 改成 tinyint 需要迁移数据，一开始就用 tinyint 更省事。
   */
  @Column({
    type: 'tinyint',
    default: 1,
    comment: '状态 0=禁用 1=正常',
  })
  status: number;

  /**
   * 审计字段
   *
   * @CreateDateColumn / @UpdateDateColumn 由 TypeORM 在写入时自动维护，
   * 不需要业务代码赋值 —— 少了「忘记写 createdAt」这类低级错误。
   *
   * ⚠️ 但它只在【通过 TypeORM 写入】时生效。
   *    直接跑 SQL 的 UPDATE 不会自动更新 updatedAt，
   *    所以表结构里同样配了 ON UPDATE CURRENT_TIMESTAMP 作为数据库层兜底。
   */
  @CreateDateColumn({ type: 'datetime', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', comment: '更新时间' })
  updatedAt: Date;
}
