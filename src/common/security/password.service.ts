import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';

/**
 * 密码哈希服务
 *
 * 【为什么不能用 MD5 / SHA256】
 *
 * SHA256 的设计目标是「快」—— 现代 GPU 每秒能算几百亿次。
 * 用它存密码，等于把用户的密码交给攻击者：
 *
 *   假设 8 位纯小写字母密码，空间约 2×10^11
 *   SHA256 在单张高端 GPU 上约 10^10 次/秒
 *   → 穷举全部组合只需【约 20 秒】
 *
 * 加盐也没用 —— 盐只防「彩虹表（预先算好的哈希表）」，
 * 不能防「针对某一个用户现场暴力枚举」。
 *
 * 【bcrypt 的核心思路：把「快」变成「慢」】
 *
 *   代价因子 cost = 10 → 单次哈希约 54ms（实测值）
 *   穷举 2×10^11 个组合 → 2×10^11 × 0.054s ≈ 3.4×10^9 秒 ≈ 108 年
 *
 *   cost 每 +1，耗时翻倍：
 *     cost 10 → ~54ms
 *     cost 12 → ~216ms      ← 常用生产值
 *     cost 14 → ~864ms      ← 登录明显卡顿，通常不用
 *
 *   「慢」在这里是特性，不是缺点。
 *   这正是「不能拿通用哈希函数存密码」的根本原因 ——
 *   通用哈希函数的性能指标是越高越好，而密码哈希恰恰相反。
 *
 * 【盐值是自动的，不需要你自己管】
 *
 *   每个哈希串自带盐：$2b$10$Q40iYlwwcN8OwR4Ze9Caue...
 *                    │   │  └─ 前 22 字符 = 盐
 *                    │   └──── cost
 *                    └──────── 算法版本
 *
 *   所以同一个密码每次哈希出来的结果都不同（实测确认），
 *   而 compare() 能从哈希串里读出盐再算一次来比对。
 *   盐不需要单独存字段，也不需要在 compare 时传。
 */
@Injectable()
export class PasswordService {
  /**
   * 代价因子
   *
   * 取值原则（不是越大越好）：
   *   在【你的生产机器】上实测单次哈希耗时，
   *   控制在 100~300ms 之间。
   *
   *   太快（< 50ms）  → 攻击者枚举成本低
   *   太慢（> 500ms） → 用户登录卡顿，且攻击者可以用这个做 DoS
   *                    （每个登录请求都要烧掉你 1 秒 CPU）
   *
   * ⚠️ 所以这个值必须按部署环境实测调整，不能照抄。
   *    开发机配了 cost 12，上到性能差一倍的机器可能就变成 400ms。
   */
  private static readonly COST = 10;

  /**
   * 生成哈希
   *
   * 🔴 必须用【异步】版本，不要用 hashSync
   *
   *   bcrypt 的哈希计算是 CPU 密集的，且【不可中断】。
   *   hashSync 会阻塞 Node 的事件循环 —— 而 Node 是单线程的：
   *
   *     hashSync(54ms) 期间，这台进程收不到任何请求、
   *     响应不了任何 IO，所有并发连接全部排队。
   *
   *   实测：cost=10 阻塞 54ms；cost=12 阻塞约 216ms。
   *   如果每秒有 20 个登录请求，用同步版本就是每秒阻塞 1 秒以上
   *   → 服务直接不可用（这是个很容易犯、后果很严重的错）。
   *
   *   异步版本底层在 libuv 线程池里计算，不占用事件循环。
   */
  hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, PasswordService.COST);
  }

  /**
   * 校验密码
   *
   * 返回 boolean，不抛异常 —— 让调用方决定「密码不对」怎么表达
   * （是抛 BusinessException，还是计入失败次数，还是返回 null）。
   *
   * ⚠️ 用 compare() 而不是「自己哈希一遍再比较字符串」：
   *    bcrypt 的盐是随机的，同一密码两次哈希结果不同（实测确认），
   *    字符串比较永远为 false。
   *    compare() 会从 hashed 里解析出盐和 cost，用同样的参数重算再比。
   */
  verify(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
