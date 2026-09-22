import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RefreshToken } from './entities/refresh-token.entity.js';

/**
 * refresh token 的签发
 *
 * 【本期只做 issue()】
 *   轮转（rotation）/ 复用检测 / 撤销属于 M4，
 *   它们的关键约束是「撤销旧的 + 写入新的」必须原子（陷阱 T10），
 *   需要事务 —— 单独一轮做，别塞在这里草草了事。
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly config: ConfigService,
  ) {}

  /**
   * 签发一个新的 refresh token
   *
   * @returns 原文 —— 只在这一刻存在于内存里，之后返回给客户端，
   *          库里只有它的 SHA-256
   */
  async issue(userId: string, familyId: string = randomUUID()): Promise<string> {
    // ⚠️ 用 hex 而不是 base64url：hex 是 64 字符，正好对上 PRD 的约定（陷阱 T9）
    const raw = randomBytes(32).toString('hex');
    const ttlSeconds = this.config.get<number>('jwt.refreshExpiresInSeconds') ?? 604800;

    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        userId,
        familyId,
        tokenHash: RefreshTokenService.hash(raw),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        revokedAt: null,
        replacedByHash: null,
      }),
    );

    return raw;
  }

  static hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
