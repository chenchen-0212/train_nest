import { Injectable, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception.js';
import { ErrorCode } from '../constants/error-code.js';

/**
 * 全局参数校验管道
 *
 * 【为什么继承 ValidationPipe，而不是在 main.ts 里 new】
 *
 *   // main.ts 里这样写，实例是「游离」的 —— 不参与依赖注入
 *   app.useGlobalPipes(new ValidationPipe({ ... }));
 *
 *   // 这样写，实例由 IoC 容器创建，可以注入 ConfigService / Reflector 等
 *   // 在 AppModule 里 { provide: APP_PIPE, useClass: AppValidationPipe }
 *
 * 两者功能上等价，但第二种在企业级项目里是必要的：
 *   ① 管道可能需要读配置（比如「生产环境是否返回详细校验信息」）
 *   ② 需要单元测试时可以直接 new 出来，不用起整个应用
 *   ③ 统一的实例意味着行为一致，不会出现某个模块自己 new 了一个配置不同的管道
 *
 * 【五个关键配置项】
 *
 * transform: true
 *   → 把请求体从普通对象转换成 DTO 类的实例。
 *     没有它，@Transform 装饰器、getter、类方法全部不可用。
 *
 * whitelist: true
 *   → 剥掉 DTO 里没声明的字段。
 *     这是防越权改写的重要手段：客户端传 { role: 'admin' } 而 DTO 里没有
 *     role 字段时，它会被直接丢弃，永远不会进入 service。
 *
 * forbidNonWhitelisted: true
 *   → 有未声明字段时直接报错，而不是静默剥掉。
 *     开发阶段建议开启（能立刻发现前端多传了字段）；
 *     对接第三方回调时可以关掉（对方多传字段不该导致我们失败）。
 *
 * transformOptions.enableImplicitConversion: true
 *   → 把 '20' 自动转成 20，匹配 DTO 上的 @IsInt()。
 *     URL query 里一切都是字符串，没有它 @IsInt() 永远失败。
 *
 * exceptionFactory
 *   → 把校验错误转成我们自己的 BusinessException，
 *     保证校验失败和业务失败走同一套响应结构。
 */
@Injectable()
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors: ValidationError[]) =>
        new BusinessException(
          ErrorCode.PARAM_INVALID,
          // 把校验错误压成一行，便于前端直接 toast
          AppValidationPipe.formatErrors(errors).join('; '),
        ),
    });
  }

  /**
   * 把嵌套的 ValidationError 树压平成 ['字段: 原因'] 的字符串数组。
   *
   * ValidationError 是嵌套结构（对象套对象），
   * 直接 map 只能拿到顶层字段，子字段的约束信息会丢。
   */
  private static formatErrors(
    errors: ValidationError[],
    parentPath = '',
  ): string[] {
    return errors.flatMap((error) => {
      const path = parentPath ? `${parentPath}.${error.property}` : error.property;

      // 当前层级的约束
      const own = error.constraints
        ? [`${path}: ${Object.values(error.constraints).join('、')}`]
        : [];

      // 递归子层级
      const children = error.children?.length
        ? AppValidationPipe.formatErrors(error.children, path)
        : [];

      return [...own, ...children];
    });
  }
}
