import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, ErrorMessage, HttpStatusToErrorCode } from '../constants/error-code.js';
import { BusinessException } from '../exceptions/business.exception.js';
import type { ApiResponse } from '../dto/api-response.dto.js';

/**
 * 全局兜底异常过滤器
 *
 * 【@Catch() 不带参数 = 捕获一切】
 * 带参数（如 @Catch(HttpException)）只能捕获 HttpException 及其子类，
 * 普通 Error（比如数据库连接失败、TypeError）会漏过去，被 Nest 的
 * 默认处理器接手，返回一个结构完全不同的 500 响应体。
 *
 * 【职责边界】
 *   过滤器只负责「把任何异常翻译成统一响应体」。
 *   它不该做业务判断，也不该吞掉异常 —— 必须留痕。
 *
 * 【三条铁律】
 *   ① 未知异常绝不把原始 message / stack 返回给客户端
 *      → 信息泄漏：堆栈里可能含绝对路径、SQL 语句、密钥片段
 *   ② 但必须以 error 级别完整记录到日志（含 stack 与 traceId）
 *      → 否则线上只能看到用户截图里的「系统繁忙」，无从排查
 *   ③ HTTP 状态码跟随异常本身，不要一律写 500
 *      → 401 就是 401，写死 500 会让前端无法区分「需要重新登录」和「服务挂了」
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    // traceId 由 nestjs-pino 在 genReqId 中生成并挂到 req.id 上，
    // 请求头里也回写了同名 header。前端报错时把它给我们，就能直接捞日志。
    const traceId = request.id ?? '';

    let httpStatus: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let message: string = ErrorMessage[ErrorCode.INTERNAL_ERROR];

    if (exception instanceof BusinessException) {
      // 我们主动抛的业务异常：语义最完整，直接采用
      httpStatus = exception.getStatus();
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      // 框架内置异常：（ValidationPipe / 404 / Guard 抛出的等）
      httpStatus = exception.getStatus();
      code = HttpStatusToErrorCode[httpStatus] ?? ErrorCode.INTERNAL_ERROR;
      message = this.extractHttpMessage(exception);
    } else {
      // 未知异常：一律按 500 处理，且对外隐去细节
      this.logger.error(
        { traceId, path: request.url, method: request.method, err: exception },
        '未捕获的系统异常',
      );
    }

    const body: ApiResponse<never> = {
      code,
      message,
      data: null,
      traceId,
      timestamp: Date.now(),
    };

    response.status(httpStatus).json(body);
  }

  /**
   * 从 HttpException 里提取对用户友好的文案。
   *
   * HttpException.getResponse() 的返回值有两种形态：
   *   string  → new NotFoundException('用户不存在')
   *   object  → ValidationPipe 抛出的 { message: string[], error, statusCode }
   *
   * 这里把两种都归一成 string。
   */
  private extractHttpMessage(exception: HttpException): string {
    const res = exception.getResponse();

    if (typeof res === 'string') return res;

    if (typeof res === 'object' && res !== null) {
      const msg = (res as { message?: string | string[] }).message;
      if (Array.isArray(msg)) return msg.join('; ');
      if (typeof msg === 'string') return msg;
    }

    return exception.message;
  }
}
