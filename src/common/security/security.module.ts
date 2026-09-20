import { Module } from '@nestjs/common';
import { PasswordService } from './password.service.js';

/**
 * 安全能力模块
 *
 * 【为什么要单独建一个模块，而不是把 PasswordService 塞进 UserModule】
 *
 * 需要密码哈希的不止用户模块：
 *   用户注册/登录   → 第 4、5 课
 *   后台管理员账号
 *   商户子账号
 *   修改密码 / 重置密码
 *
 * 如果放在 UserModule 里再 exports 出去：
 *   别的模块要 import UserModule 才能拿到 PasswordService
 *   → 为了用「哈希」这一个能力，被迫依赖整个「用户」模块
 *   → 依赖图越来越乱，最终无法判断改动会波及谁
 *
 * 拆到独立的 SecurityModule：
 *   谁需要就 import 谁，依赖关系清晰且最小。
 *
 * 【关于 @Global() 的取舍】
 *
 *   加上 @Global() 后，所有模块不用 import 就能用 PasswordService。
 *   方便，但代价是「隐式依赖」—— 看一个模块的 imports 列表，
 *   你无法知道它到底用了哪些外部能力。
 *
 *   ✅ 本项目不用 @Global()，坚持显式 import。
 *      只有真正的全局基础设施（ConfigModule）才用。
 *
 * 【一条通用规则】
 *   每个 provider 都必须属于某个模块。
 *   跨模块使用必须通过 items 的 exports + 使用方的 imports，
 *   没有第三条路（@Global 是 imports 的隐式语法糖）。
 *   —— 这就是你在 DI 那一课学的「可见性由模块边界决定」。
 */
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class SecurityModule {}
