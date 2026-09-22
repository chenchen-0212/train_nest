import { ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { BusinessException } from '../../../common/exceptions/business.exception.js';
import { ErrorCode } from '../../../common/constants/error-code.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // ⚠️ 必须 getAllAndOverride + [handler, class]：
    //    handler 优先于 class，才能「控制器整体受保护、个别方法放行」
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(context);
  }

  /**
   * passport 默认把一切失败都归成 401 通用异常，
   * 「过期」和「无效」在日志里分不出来（PRD 陷阱 T4）。
   * 覆写它，把三种失败映射成三个业务码。
   */
  handleRequest<TUser>(err: unknown, user: TUser | false, info: unknown): TUser {
    // ① Strategy.validate() 主动抛的业务异常 —— 原样交给全局异常过滤器，
    //    否则 40003（账号禁用）会被吞成 401
    if (err) {
      if (err instanceof HttpException) throw err;
      throw BusinessException.unauthorized(ErrorCode.TOKEN_INVALID);
    }

    if (!user) {
      // ⚠️ 不要 import { TokenExpiredError } from 'jsonwebtoken'：
      //    pnpm 的 node_modules 是严格的，jsonwebtoken 只是传递依赖
      //    （幽灵依赖），ESM 下 import 可能直接报模块找不到。
      //    按 name 判断，行为等价且零依赖。
      const name = info instanceof Error ? info.name : '';
      const message = info instanceof Error ? info.message : '';

      if (name === 'TokenExpiredError') {
        throw BusinessException.unauthorized(ErrorCode.TOKEN_EXPIRED); // 401 / 20002
      }
      if (/no auth token|jwt must be provided/i.test(message)) {
        throw BusinessException.unauthorized(ErrorCode.UNAUTHORIZED); // 401 / 20001
      }
      throw BusinessException.unauthorized(ErrorCode.TOKEN_INVALID); // 401 / 20003
    }

    return user;
  }
}
