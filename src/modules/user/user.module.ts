import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

/**
 * 用户模块
 *
 * 【forFeature 做了两件事】
 *   ① 把 User 实体注册给 TypeORM（配合 autoLoadEntities: true 生效）
 *      → 这一步是本课「表能被建出来」的关键
 *   ② 在 IoC 容器里创建 User 的 Repository 并注册好 token
 *      → 其他 provider 可以用 @InjectRepository(User) 注入它
 *
 * 【注意：这里刻意【没有】exports】
 *
 * 常见写法是 exports: [TypeOrmModule]，把仓储「转发」给其他模块，
 * 让它们直接 @InjectRepository(User) 操作数据。本项目不这么做。
 *
 * 原因是模块边界：
 *
 *   ❌ 把 Repository 借出去
 *      任何模块都能对 user 表做任意读写 ——
 *      「禁止删除用户」「密码必须哈希后写入」「改状态要发通知」
 *      这些规则全部可以被绕过，而且绕过的地方散落在各处
 *
 *   ✅ 只对外暴露 UserService（下一课会加）
 *      所有对 user 的读写都经过同一扇门，规则只写一次，
 *      将来要加缓存、加审计日志、加事务，都只改一个地方
 *
 * 这和你 DI 那一课学的是同一件事的两面：
 *   exports 决定「谁能看见什么」，而「该不该让人看见」是架构决策。
 *   默认不外借 —— 需要时才开一个口子。
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],

  /**
   * ⭐ 上一课的「刻意不 exports」在这里兑现了：
   *
   *   ❌ exports: [TypeOrmModule]        → 把 Repository 借出去
   *      别人可以绕过 UserService 直接操作 user 表
   *
   *   ✅ exports: [UserService]          → 只借出「服务」
   *      别人只能调用我们允许的方法，规则集中在 Service 内
   *
   * 对外暴露的粒度决定了模块边界的强度。
   * 暴露 Repository = 没有边界；暴露 Service = 有边界。
   */
  exports: [UserService],
})
export class UserModule {}
