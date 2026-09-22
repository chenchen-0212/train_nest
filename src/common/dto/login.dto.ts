import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '用户名或邮箱（含 @ 按邮箱查）', example: 'alice' })
  @IsString({ message: 'account 必须是字符串' })
  @IsNotEmpty({ message: 'account 不能为空' })
  account: string;

  @ApiProperty({ description: '明文密码', example: 'Passw0rd123' })
  @IsString({ message: 'password 必须是字符串' })
  @IsNotEmpty({ message: 'password 不能为空' })
  password: string;
}
