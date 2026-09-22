import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

import { IsPasswordByteLength } from './password-byte-length.validator.js';

const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export class RegisterDto {
  @ApiProperty({ description: '登录名，字母开头，4~50 字符', example: 'alice' })
  @IsString({ message: 'username 必须是字符串' })
  @Length(4, 50, { message: 'username 长度必须在 4~50 之间' })
  @Matches(USERNAME_PATTERN, { message: 'username 必须以字母开头，只能包含字母/数字/下划线' })
  username: string;

  @ApiProperty({ description: '邮箱，入库前自动 trim + 转小写', example: 'Alice@Example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email 格式不正确' })
  @MaxLength(100, { message: 'email 长度不能超过 100' })
  email: string;

  @ApiProperty({ description: '密码，8~72 字节', example: 'Passw0rd123' })
  @IsString({ message: 'password 必须是字符串' })
  @IsPasswordByteLength(8, 72)
  password: string;

  @ApiPropertyOptional({ description: '昵称，不传则存 null', example: '爱丽丝' })
  @IsOptional()
  @IsString({ message: 'nickname 必须是字符串' })
  @MaxLength(50, { message: 'nickname 长度不能超过 50' })
  nickname?: string;
}
