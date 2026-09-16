import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * DTO（Data Transfer Object）—— 接口层的契约
 *
 * 【DTO 的职责边界】
 *   ✅ 声明「这个接口接受什么形状的数据」
 *   ✅ 声明「每个字段的业务约束」
 *   ✅ 作为接口文档的数据源（@ApiProperty 会被 Swagger 读取）
 *   ❌ 绝不写业务逻辑
 *   ❌ 绝不直接用 Entity 当 DTO
 *
 * 【为什么不能让 Entity 兼职 DTO】
 *   User 实体上有 password 字段，如果直接用它接请求体：
 *     ① 客户端可以传 { password: 'x' } 进来，直接落库
 *     ② 响应里会把 password / 内部状态字段一起吐出去
 *     ③ 实体字段名一变，接口契约就变了 —— 数据库 schema 绑架了 API
 *
 *   这是越权漏洞最常见的来源之一，必须从结构上杜绝：
 *   【入参 DTO】和【出参 DTO】都独立定义，与 Entity 解耦。
 */
export class CreateDemoDto {
  @ApiProperty({ description: '名称', example: '张三' })
  @IsString({ message: 'name 必须是字符串' })
  @Length(2, 10, { message: 'name 长度必须在 2~10 之间' })
  name: string;

  @ApiProperty({ description: '数量', example: 3, minimum: 1, maximum: 100 })
  @IsInt({ message: 'quantity 必须是整数' })
  @Min(1, { message: 'quantity 不能小于 1' })
  @Max(100, { message: 'quantity 不能大于 100' })
  quantity: number;

  /**
   * @IsOptional() 与「可选」的区别很重要：
   *   没有它，字段缺失时所有约束都会失败（即使字段本来就不该必填）。
   *   它必须和其他校验装饰器搭配使用，单独写没有意义。
   */
  @ApiPropertyOptional({
    description: '预约时间（ISO 8601）',
    example: '2026-10-01T10:00:00+08:00',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'scheduledAt 必须是 ISO 8601 时间格式' })
  scheduledAt?: string;
}
