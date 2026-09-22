import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordService } from '../../common/security/password.service.js';
import { User } from './entities/user.entity.js';
import { ErrorCode } from '../../common/constants/error-code.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';

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

    /**
     * 密码哈希能力
     *
     * 注意它是从 SecurityModule 来的，不是 UserModule 自己提供的 ——
     * 所以 UserModule 必须 imports: [SecurityModule]，
     * 否则这里会报 UnknownDependenciesException。
     *
     * 这个报错的排查路径和第 1 课那次一模一样：
     *   看括号里哪个参数是 ?，就去查那个类所属模块有没有 exports。
     */
    private readonly passwordService: PasswordService,
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
  findByAccountWithPassword(account: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where(
        account.includes('@') ? 'user.email = :account' : 'user.username = :account',
        { account },
      )
      .getOne();
  }

   /**
   * 注册：先哈希再落库，唯一冲突交给数据库的 1062 来判
   *
   * ⚠️ 不要「先 SELECT 确认不存在再 INSERT」—— 并发下必然重复（check-then-act 竞态）
   */
  async createUser(input:{
    username: string;
    email: string;
    password: string;
    nickname?: string;
  }) : Promise<User> {
    const passwordHash = await this.passwordService.hash(input.password);

    try {
      return await this.userRepository.save(
        this.userRepository.create({
          username: input.username,
          email: input.email,
          password: passwordHash,
          nickname: input.nickname ?? null,
          status: 1,
        }),
      );
    } catch (err) {
      throw UserService.translateUniqueConflict(err);
    }
   }

  /** 把 MySQL 的 1062 翻译成「哪个字段冲突」 */
  private static translateUniqueConflict(err: unknown): unknown {
    const driverCode = (err as { driverError?: { code?: string } }).driverError?.code;
    if (driverCode !== 'ER_DUP_ENTRY') return err;

    const message = err instanceof Error ? err.message : '';
    if (message.includes('uk_user_email')) {
      return new BusinessException(ErrorCode.USER_ALREADY_EXISTS, '该邮箱已被注册');
    }
    if (message.includes('uk_user_username')) {
      return new BusinessException(ErrorCode.USER_ALREADY_EXISTS, '该用户名已被占用');
    }
    return new BusinessException(ErrorCode.USER_ALREADY_EXISTS);
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
   * ⚠️ 造测试数据 —— 仅教学使用，第 4 课会被真正的注册接口取代。
   *
   * 关于 password：
   *   现在走真正的 bcrypt 哈希了（第 3 课）。
   *
   *   注意顺序 —— 先哈希，再入库：
   *     ✅ const hash = await this.passwordService.hash(plain);
   *        create({ password: hash })
   *     ❌ 先把明文存进去，再想办法改
   *
   *   「明文永不落库」必须是结构上的保证，不是流程上的自觉。
   */
  async seed(
    username: string,
    email: string,
    plainPassword: string,
  ): Promise<{ user: User; diagnostics: Record<string, unknown> }> {
    const passwordHash = await this.passwordService.hash(plainPassword);

    const user = this.userRepository.create({
      username,
      email,
      password: passwordHash,
      nickname: `测试-${username}`,
      status: 1,
    });

    const saved = await this.userRepository.save(user);

    // 回环验证：用刚存的哈希校验原始密码，证明这条链路是通的
    const verified = await this.passwordService.verify(
      plainPassword,
      passwordHash,
    );

    this.logger.log(
      { id: saved.id, username: saved.username, typeOfId: typeof saved.id },
      '已插入测试用户',
    );

    return {
      user: saved,
      diagnostics: {
        '哈希长度': passwordHash.length,
        '哈希前缀（算法 $2b$ + cost 10）': passwordHash.slice(0, 7),
        算法: passwordHash.slice(0, 4),
        代价因子: passwordHash.slice(4, 7),
        回环验证: verified ? '原密码校验通过' : '校验失败 —— 实现有问题',
        提示: '盐值与哈希都在同一个 60 字符串里，不需要单独字段',
      },
    };
  }
}
