import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { ErrorCode } from '../../common/constants/error-code.js';
import { SeedUserDto } from './dto/seed-user.dto.js';
import { UserService } from './user.service.js';

/**
 * 用户控制器
 *
 * ⚠️ 本控制器的定位（读之前先建立预期）：
 *   它的目的是【把 Repository 的行为变成可观察的输出】，
 *   不是提供可用的业务接口。
 *
 *   真正的接口（注册 / 登录 / 改资料）在第 3、4、5 课写。
 *   本课只解决一个问题：Repository 拿回来的东西，到底是什么？
 *
 * 🔴 当前没有鉴权 —— 任何人都能查用户列表。
 *    这是刻意的：全局 Guard 在第 7 课才装。
 *    在它装上之前，这个项目的接口都是裸的。
 *    （知道「现在是不安全的」比糊里糊涂地安全更重要）
 */
@ApiTags('用户（第 2 课 · Repository 观察用）')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '用户列表 + 总数（观察 findAndCount 发几条 SQL）' })
  async list() {
    const [list, total] = await this.userService.findAndCount();
    return {
      total,
      count: list.length,
      list,
      hint: '注意控制台：findAndCount 内部会发两条 SQL（SELECT + COUNT）',
    };
  }

  @Post('seed')
  @ApiOperation({ summary: '⚠️ 教学用：插入一条测试用户（第 4 课由注册接口取代）' })
  async seed(@Body() dto: SeedUserDto) {
    const { user: saved, diagnostics } = await this.userService.seed(
      dto.username,
      dto.email,
      dto.password,
    );

    return {
      id: saved.id,
      username: saved.username,
      email: saved.email,
      createdAt: saved.createdAt,
      'id 的 JS 类型': typeof saved.id,
      /**
       * ⚠️ 这里刻意保留「是」这个结果，并解释清楚 —— 它是个陷阱。
       *
       * save() 返回的是【你传进去的那个内存对象】（附带了自增 id），
       * 不是从数据库里重新查出来的行。
       * 所以 select: false 对它无效 —— select: false 只作用于【查询】。
       *
       * 换句话说：
       *   能拿到 password 的路径有两条 ——
       *     ① QueryBuilder.addSelect（有意为之）
       *     ② save() / create() 的返回值（无意撞上的）
       *   第 ② 条是很多人踩过的坑：以为「实体上写了 select: false 就安全了」，
       *   结果把 save() 的返回值直接丢给响应体，密码就出去了。
       */
      'password 是否在 save() 返回值里': saved.password === undefined
        ? '否'
        : '是 ← 正常现象：save() 返回的是内存对象，不是查询结果，select: false 不作用于它',
      'password 是否在查询结果里': '否 ← 见 GET /api/user/:username/password-probe 的对比',
      hint: '注意 id 是 string。往下看 GET /api/user/:id 的诊断输出',
      ...diagnostics,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '按 id 查（含 bigint 类型诊断）' })
  async findOne(@Param('id') id: string) {
    const user = await this.userService.findById(id);
    if (!user) {
      throw BusinessException.notFound(ErrorCode.USER_NOT_FOUND);
    }

    /**
     * 大整数精度演示
     *
     * 这里不依赖数据库里真有一条超大 id 的记录 ——
     * 那样要手工 INSERT，而且不直观。
     * 直接在代码里拿 2^53+1（JS 安全整数的第一个「失效点」）做演示，
     * 效果一样，还稳定可复现。
     */
    const BIG = '9007199254740993'; // 2^53 + 1
    const asNumber = String(Number(BIG));

    return {
      user,
      diagnostics: {
        'id 的值': user.id,
        'id 的 JS 类型': typeof user.id,
        'JS 安全整数上限 (2^53-1)': Number.MAX_SAFE_INTEGER,
        '大整数精度演示': {
          原始字符串: BIG,
          'Number() 之后': asNumber,
          判定:
            asNumber === BIG
              ? '相等'
              : '⚠️ 不相等 —— 精度已丢失，而且【不会报错】',
        },
        'password 字段': user.password === undefined
          ? '不在结果里（select: false 生效）'
          : '被带出了（配置失效）',
      },
    };
  }

  @Get(':username/password-probe')
  @ApiOperation({ summary: '诊断 select: false 是否生效（只返回长度，不返回哈希）' })
  async passwordProbe(@Param('username') username: string) {
    const withoutPassword = await this.userService.findByUsername(username);
    if (!withoutPassword) {
      throw BusinessException.notFound(ErrorCode.USER_NOT_FOUND);
    }

    const withPassword =
      await this.userService.findByUsernameWithPassword(username);

    return {
      '① 仓储方法 findOne（默认行为）':
        withoutPassword.password === undefined
          ? 'password 不在结果里 → select: false 生效 ✅'
          : 'password 被带出了 → 配置失效 ❌',
      '② QueryBuilder + addSelect（显式取出）':
        withPassword?.password !== undefined
          ? `password 已取到，长度 ${withPassword.password.length} 字符`
          : 'password 仍未取到 → addSelect 写法有问题 ❌',
      说明: '本接口刻意只返回密码【长度】，不返回哈希本身',
    };
  }
}
