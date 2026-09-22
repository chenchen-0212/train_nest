import { registerDecorator } from 'class-validator';
import type { ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * 按【字节】校验密码长度
 *
 * 为什么不能用 @Length(8, 72)：
 *   @Length 数的是 JS 字符串的 length（UTF-16 码元），
 *   而 bcrypt 只取前 72【字节】。中文一个字 3 字节，24 个汉字就是 72 字节，
 *   第 73 字节之后随便改都能登录成功 —— 这是静默截断，几乎不可能被发现（PRD §3.3）。
 */
export function IsPasswordByteLength(
  min: number,
  max: number,
  options?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isPasswordByteLength',
      target: object.constructor,
      propertyName,
      constraints: [min, max],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string') return false;
          const [minBytes, maxBytes] = args.constraints as [number, number];
          const bytes = Buffer.byteLength(value, 'utf8');
          return bytes >= minBytes && bytes <= maxBytes;
        },
        defaultMessage(args: ValidationArguments): string {
          const [minBytes, maxBytes] = args.constraints as [number, number];
          return `password 长度必须在 ${minBytes} ~ ${maxBytes} 字节之间（中文按 3 字节算）`;
        },
      },
    });
  };
}
