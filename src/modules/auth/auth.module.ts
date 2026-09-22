import { Module } from '@nestjs/common';
import { JwtStrategy } from './strategies/jwt.strategies.js'
import { PassportModule } from '@nestjs/passport';
import { UserModule } from '../user/user.module.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { SecurityModule } from '../../common/security/security.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { TypeOrmModule } from '@nestjs/typeorm'; 


@Module({
  imports: [
    PassportModule, 
    UserModule, 
    SecurityModule,   // 提供 PasswordService（它不是 @Global，必须显式 import）

    TypeOrmModule.forFeature([RefreshToken]), 
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // ⚠️ 用 getOrThrow，不要写 ?? 'dev-secret'：
        //    给密钥留 fallback，等于在生产环境也能用默认密钥启动（违反 S5）
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.getOrThrow<string>('jwt.accessExpiresIn') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService, RefreshTokenService],
})
export class AuthModule {}
