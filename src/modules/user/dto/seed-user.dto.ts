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

  /**
   * 密码
   *
   * ⚠️ 上限必须卡在 72 —— 这是 bcrypt 的一个硬限制，不是随便定的。
   *
   *   bcrypt 只取密码的【前 72 字节】，超出部分被【静默忽略】。
   *   后果：
   *     用户设了 80 位的超长密码 → 实际只有前 72 位有效
   *     用户以为「密码很长很安全」，实际强度由前 72 字节决定
   *     更糟的是：用户输入第 73 位不同的字符也能登录成功，且无人察觉
   *
   *   两种处理方式：
   *     ✅ 在 DTO 直接卡死长度上限（本项目采用，简单明确）
   *     ⚠️ 或先 SHA256 预哈希再交给 bcrypt（能支持任意长度，
   *        但引入额外一步，且要注意编码细节）
   *
   *   注意是【字节】不是【字符】：
   *     一个中文字符在 UTF-8 下占 3 字节 → 24 个汉字就到 72 字节了。
   *     所以「72 个字符」和「72 字节」不是一回事。
   *
   * 下限 8 位是现代基本要求（NIST SP 800-63B 建议至少 8 位）。
   * ⚠️ 但不要加「必须含大写+数字+符号」这类复杂度要求 ——
   *    NIST 明确指出这类规则会诱导用户使用 Password1! 这种弱密码，
   *    且增加记忆负担。正确做法是配合「弱密码黑名单 + 登录失败限制」。
   */
  @ApiProperty({ description: '密码（8~72 字节）', example: 'MyPassword123' })
  @IsString({ message: 'password 必须是字符串' })
  @Length(8, 72, { message: 'password 长度必须在 8~72 之间' })
  password: string;
}
