import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { ErrorCode } from '../../common/constants/error-code.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PasswordService } from '../../common/security/password.service.js';
import { User } from '../user/entities/user.entity.js';
import { UserService } from '../user/user.service.js';
import type { LoginDto } from '../../common/dto/login.dto.js';
import type { RegisterDto } from '../../common/dto/register.dto.js';
import { RefreshTokenService } from './refresh-token.service.js';

/**
 * 用户的对外形状
 *
 * 存在的唯一理由：**手工挑字段**。
 * 不能用 User 实体直接当出参 —— 注册/登录时手里的 user 对象
 * 是从 addSelect('user.password') 取出来的，内存对象不受 select: false 约束（陷阱 T1）。
 */
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  nickname: string | null;
  status: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** ⚠️ 单位是【秒】，不是 '2h'（PRD §3.1） */
  expiresIn: number;
  user: UserProfile;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly userService: UserService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto): Promise<UserProfile> {
    const user = await this.userService.createUser({
      username: dto.username,
      email: dto.email,
      password: dto.password,
      nickname: dto.nickname,
    });

    this.logger.log({ userId: user.id, username: user.username }, '注册成功');
    return AuthService.toProfile(user, true);
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    // ① 判定规则确定性：含 @ 走邮箱
    const account = dto.account.includes('@') ? dto.account.trim().toLowerCase() : dto.account;
    const user = await this.userService.findByAccountWithPassword(account);

    // ② 「用户不存在」和「密码错误」必须完全同码同文案（S6），
    //    否则这个接口就是一把现成的用户名枚举器
    if (!user) throw new BusinessException(ErrorCode.CREDENTIALS_INVALID);
    const matched = await this.passwordService.verify(dto.password, user.password);
    if (!matched) throw new BusinessException(ErrorCode.CREDENTIALS_INVALID);

    // ③ 状态校验放在凭据校验【之后】：否则不用知道密码就能探出账号存在
    if (user.status !== 1) throw new BusinessException(ErrorCode.USER_DISABLED);

    // ④ 签发：access 是 JWT，refresh 是随机串
    const accessToken = await this.signAccessToken(user.id, user.username);
    const refreshToken = await this.refreshTokenService.issue(user.id);

    // ⑤ 日志只记 userId —— 密码与 token 原文永不进日志（S1 / S2）
    this.logger.log({ userId: user.id }, '登录成功');

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<number>('jwt.accessExpiresInSeconds') ?? 900,
      user: AuthService.toProfile(user),
    };
  }

  /** 当前用户：@CurrentUser() 只给 id，完整字段回库查 */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.userService.findById(userId);
    if (!user) throw BusinessException.unauthorized(ErrorCode.TOKEN_INVALID);
    return AuthService.toProfile(user, true);
  }

  /**
   * 签发 access token
   *
   * payload 只放 sub + username（PRD §3.3）：
   *   ❌ 不放 email / password —— JWT 是 Base64 不是加密，谁都能读
   *   ❌ 不放 status —— 放了的话「禁用即时生效」就废了，得等 token 过期
   * iat / exp 由 jsonwebtoken 自动写入，不要手写。
   */
  private signAccessToken(sub: string, username: string): Promise<string> {
    return this.jwtService.signAsync({ sub, username });
  }

  private static toProfile(user: User, withTimestamps = false): UserProfile {
    const profile: UserProfile = {
      id: user.id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      status: user.status,
    };

    if (withTimestamps) {
      profile.createdAt = user.createdAt;
      profile.updatedAt = user.updatedAt;
    }

    return profile;
  }
}
