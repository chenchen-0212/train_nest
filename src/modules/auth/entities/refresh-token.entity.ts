import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity.js';

/**
 * refresh token 表
 *
 * 【它和 access token 是两种东西】
 *   access token  → JWT，自包含、无状态、过期就废，服务端不存
 *   refresh token → 不透明随机串，服务端必须存（因为要能【撤销】）
 *
 * 【为什么存 SHA-256 而不是 bcrypt】
 *   每次刷新都要「按 token 定位到那一行」→ 必须能建唯一索引查。
 *   bcrypt 每次盐不同，同一输入哈希结果不同 → 只能全表扫描逐行比对。
 *   而 token 是 256bit 随机数，不存在「弱输入 + 可枚举」的问题，
 *   慢哈希在这里毫无收益，纯属自损性能。（PRD §3.2.3）
 */
@Entity('refresh_token')
export class RefreshToken {
  @PrimaryGeneratedColumn({ type: 'bigint', comment: '主键' })
  id: string;

  @Index('idx_refresh_token_userId')
  @Column({ type: 'bigint', comment: '所属用户' })
  userId: string;

  /** ⚠️ 只存哈希，原文永不落库（S3） */
  @Index('uk_refresh_token_tokenHash', { unique: true })
  @Column({ type: 'varchar', length: 64, comment: 'token 的 SHA-256（hex）' })
  tokenHash: string;

  /** 一次登录 = 一个家族；轮转时不变，复用检测时整族撤销 */
  @Index('idx_refresh_token_familyId')
  @Column({ type: 'varchar', length: 36, comment: '家族 id（UUID）' })
  familyId: string;

  @Column({ type: 'datetime', comment: '过期时间' })
  expiresAt: Date;

  /** NULL = 仍有效 */
  @Column({ type: 'datetime', nullable: true, comment: '撤销时间' })
  revokedAt: Date | null;

  /** 轮转链：这一行被哪个新 token 取代了 */
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '被轮转成的下一个 token 哈希' })
  replacedByHash: string | null;

  @CreateDateColumn({ type: 'datetime', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', comment: '更新时间' })
  updatedAt: Date;

  /**
   * 外键：删用户即清空其会话（onDelete: CASCADE）
   *
   * ⚠️ 这里同时声明了 userId 列和同名的 @JoinColumn —— TypeORM 允许这么写；
   *    若 synchronize 报重复列，删掉下面这个关联、只留 userId 列即可。
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
