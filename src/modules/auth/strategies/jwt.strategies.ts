import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { BusinessException } from '../../../common/exceptions/business.exception.js';
import { ErrorCode } from '../../../common/constants/error-code.js';
import { UserService } from '../../user/user.service.js';

import type { AuthenticatedUser } from '../types/authenticated-user.type.js';

export interface JwtPayload {
  sub: string;
  username: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 必须 false：过期要让 passport 报 TokenExpiredError，
      // 才能被守卫翻译成 20002。写成 true 就永远拿不到「过期」这个信号。
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
    });
  }

  /** 硬要求：每请求查一次库，禁用才能即时生效（PRD §3.4②） */
  async validate(payload: JwtPayload) : Promise<AuthenticatedUser> {
    const user = await this.userService.findById(payload.sub);

    if (!user) throw BusinessException.unauthorized(ErrorCode.TOKEN_INVALID); // 401 / 20003
    if (user.status !== 1) throw new BusinessException(ErrorCode.USER_DISABLED); // 200 / 40003

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      status: user.status,
    };
  }
}
