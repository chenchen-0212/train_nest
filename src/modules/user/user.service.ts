import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';

/**
 * 用户服务 —— 对 user 表的唯一出入通道
 *
 * 【为什么必须有 Service 层，而不是让 Controller 直接用 Repository】
 *
 *   ❌ Controller 直接注入 Repository
 *      ① 业务规则散落在各个 Controller 里，改一处要全项目搜
 *      ② 别的模块也能拿到 Repository 直接操作，规则形同虚设
 *      ③ 单元测试必须起 HTTP 层
 *      ④ 想加缓存 / 审计日志 / 事务，要改 N 个地方
 *
 *   ✅ Controller → Service → Repository
 *      所有对 user 的读写都经过同一扇门：
 *        要加缓存    → 只在 Service 加
 *        要加审计    → 只在 Service 加
 *        要包事务    → 只在 Service 加
 *
 * 【Repository 提供的两种查询接口，本课都会用到】
 *
 *   1. 仓储方法（find / findOne / save / count …）
 *      优点：简洁、类型安全
 *      局限：表达力有限，比如【取不出 select: false 的字段】
 *
 *   2. QueryBuilder
 *      优点：表达力完整（addSelect / join / 复杂 where）
 *      局限：字符串写字段名，拼错没有编译期提示
 *
 *   → 优先用仓储方法，不够用再降级到 QueryBuilder。
 *     本课你会看到「显式取密码」就属于必须降级的场景。
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    /**
     * @InjectRepository(User) 解析的是 UserModule 里
     * TypeOrmModule.forFeature([User]) 注册的那个 Repository。
     *
     * 这行能工作，依赖两件事：
     *   ① 当前模块 import 了 TypeOrmModule.forFeature([User])
     *   ② 实体已被 TypeORM 认识（autoLoadEntities 收集到了）
     * 缺任一条都会报 UnknownDependenciesException 或找不到实体的错。
     */
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 按主键查单个
   *
   * ⚠️ 注意返回类型是 `User | null`，而不是直接抛异常。
   *
   * 「查不到」到底是错误还是正常情况，取决于调用方：
   *   后台管理查询 → 查不到是错误
   *   「登录时判断用户是否存在」 → 查不到是正常分支
   * Service 不该替调用方决定，所以返回 null，让上层判断。
   */
  findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  /**
   * 按登录名查单个（不含密码）
   *
   * 因为实体上 password 是 select: false，
   * 这个查询返回的对象里【没有】password 字段。
   */
  findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  /**
   * 按登录名查单个，【显式】把密码带出来
   *
   * 这是全项目唯一能拿到密码哈希的地方。
   *
   * 为什么必须用 QueryBuilder：
   *   仓储方法的 select 选项在 TypeORM 里对 select: false 的字段支持不稳定，
   *   而 QueryBuilder 的 addSelect 是明确可靠的写法：
   *     .addSelect('user.password')
   *
   * 这个名字起得长是故意的 —— 调用处一眼能看出
   * 「这里会拿到敏感字段」，review 时好识别。
   */
  findByUsernameWithPassword(username: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .getOne();
  }

  /**
   * 列表 + 总数
   *
   * findAndCount 一次返回两个值，注意它内部会发【两条 SQL】：
   *   一条 SELECT * ... LIMIT n
   *   一条 SELECT COUNT(*) ...
   * 这点在第 6 课做 N+1 与慢查询分析时会重新遇到。
   */
  findAndCount(): Promise<[User[], number]> {
    return this.userRepository.findAndCount({
      order: { id: 'ASC' },
      take: 20,
    });
  }

  count(): Promise<number> {
    return this.userRepository.count();
  }

  /**
   * ⚠️ 造测试数据 —— 仅本课教学使用，第 4 课会被真正的注册接口取代。
   *
   * 关于 password 字段：
   *   这里刻意写入一个【明显不是哈希】的占位串，
   *   而不是写明文密码。
   *   原因：让「密码 = 占位符」这件事在代码里刺眼可见，
   *        避免形成「随手写明文」的习惯。
   *        第 3 课会用 bcrypt 生成真正的哈希。
   */
  async seed(username: string, email: string): Promise<User> {
    const user = this.userRepository.create({
      username,
      email,
      password: 'PLACEHOLDER-NOT-A-REAL-HASH-第3课替换',
      nickname: `测试-${username}`,
      status: 1,
    });

    const saved = await this.userRepository.save(user);

    this.logger.log(
      { id: saved.id, username: saved.username, typeOfId: typeof saved.id },
      '已插入测试用户',
    );

    return saved;
  }
}
