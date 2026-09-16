import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErrorCode } from '../constants/error-code.js';
import type { ApiResponse } from '../dto/api-response.dto.js';

/**
 * 统一响应包装拦截器
 *
 * 【回顾你在「请求生命周期」那一课实测出来的东西】
 *
 * Interceptor 返回的是一个 Observable，值在其中有三条通道：
 *   next      → 正常返回值
 *   error     → 抛出的异常
 *   complete  → 流结束
 *
 * 本拦截器用了 `map`，而 `map` 只作用于 next 通道。
 * 所以：控制器正常 return 的数据会被包装；
 *       控制器 throw 的异常会【直接跳过这个 map】，流入 ExceptionFilter。
 *
 * 这就是你当时实测的「三场景对照表」在真实项目里的落点 ——
 * 它不是纸面知识，它是这一行 map 的必然结果。
 *
 * 【什么时候这个拦截器会失效】
 *
 * 当控制器使用 `@Res()` 直接操作原生响应对象时，
 * Nest 认为你已经自己接管了响应，不再走拦截器的包装流程。
 *
 * 正确做法：
 *   ❌ @Get() foo(@Res() res: Response) { res.json(...) }
 *   ✅ @Get() foo(@Res({ passthrough: true }) res: Response) { ... }
 *      passthrough: true 表示「我只是想设个 header / cookie」，
 *      响应体仍然交回 Nest 处理，拦截器正常生效。
 *
 * 规范：业务代码里禁止裸用 @Res()。需要 SSE / 文件下载这类真正的流式响应时，
 * 用 @Res() 并显式标注 @SkipTransform() 跳过包装（阶段五会用到）。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request & { id?: string }>();

    return next.handle().pipe(
      map((data) => ({
        code: ErrorCode.SUCCESS,
        message: '操作成功',
        // 用 ?? 而不是 ||：null / undefined 归为 null，
        // 但 0 / '' / false 这些合法返回值不能被吞掉
        data: data ?? null,
        traceId: request.id ?? '',
        timestamp: Date.now(),
      })),
    );
  }
}
