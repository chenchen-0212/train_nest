import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

/**
 * 造测试数据的入参 —— 仅本课教学使用
 *
 * 顺带演示一件事：DTO 的约束【不会】写进数据库，
 * 它是接口层的第一道闸门，数据库约束是最后一道。
 * 两道都要有，原因不同：
 *
 *   接口层（DTO）  → 给用户友好提示，拦住 99% 的脏数据
 *   数据库层       → 保证不论数据从哪来（脚本 / 其他服务 / 手工 SQL）
 *                   都不会破坏完整性
 *
 * 只有其中一道都是不完整的：
 *   只有 DTO   → 绕过接口写库的路径不受约束
 *   只有数据库 → 用户收到的是「Duplicate entry」这种看不懂的报错
 */
export class SeedUserDto {
  @ApiProperty({ description: '登录名', example: 'alice' })
  @IsString({ message: 'username 必须是字符串' })
  @Length(2, 50, { message: 'username 长度必须在 2~50 之间' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username 只能包含字母、数字、下划线',
  })
  username: string;

  @ApiProperty({ description: '邮箱', example: 'alice@example.com' })
  @IsEmail({}, { message: 'email 格式不正确' })
  @Length(5, 100, { message: 'email 长度必须在 5~100 之间' })
  email: string;
}
