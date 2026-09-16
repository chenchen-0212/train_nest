import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorMessage } from '../constants/error-code.js';

/**
 * 业务异常基类
 *
 * 【为什么需要自定义异常，而不是直接 throw new BadRequestException】
 *
 * 1. NestJS 内置异常只有 HTTP 语义（400/401/404…），
 *    无法表达「库存不足」和「余额不足」的区别 —— 这两个的 HTTP 状态码都是 400。
 *
 * 2. 业务代码里出现 new BadRequestException('库存不足')，
 *    等于把「业务语义」硬编码成「传输语义」，前端无法稳定判断。
 *
 * 3. 继承 HttpException 后，Nest 的异常处理机制仍然认得它
 *    （ExceptionFilter 能拿到 getStatus()），不会破坏框架既有流程。
 *
 * 【为什么默认 HTTP 200】
 *
 * 这是有争议的实践，两种流派：
 *
 *   A 派（本项目采用）：业务失败返回 HTTP 200 + 业务码
 *     + 语义准确：服务本身运转正常，是「业务规则不允许」不是「服务器出错」
 *     + 监控干净：告警阈值只盯 5xx，不会被大量业务失败污染
 *     + 网关/CDN 不会把业务失败当成故障重试
 *     - 前端必须在业务层判断 code，不能只看 HTTP 状态
 *
 *   B 派：业务失败返回 HTTP 400/409
 *     + 符合 REST 语义
 *     - 400 里混着「参数错」和「库存不足」，前端仍然要解析 body 才能区分
 *     - 业务失败会让监控大盘的 4xx 曲线抖动
 *
 * 关键不是选哪派，而是【全体统一】。半 A 半 B 是最糟的结果。
 */
export class BusinessException extends HttpException {
  /** 业务错误码，ExceptionFilter 会把它写进响应体 */
  readonly code: ErrorCode;

  constructor(
    code: ErrorCode,
    /** 覆盖默认文案。需要给用户更具体的信息时才传 */
    message?: string,
    /** 少数场景需要同时表达 HTTP 语义（如幂等冲突用 409）时传 */
    httpStatus: HttpStatus = HttpStatus.OK,
  ) {
    super(message ?? ErrorMessage[code] ?? '业务处理失败', httpStatus);
    this.code = code;
  }

  // ---------- 语义化工厂方法 ----------
  // 好处：调用处读起来像自然语言，且避免到处 new
  //   throw BusinessException.notFound(ErrorCode.APPOINTMENT_NOT_FOUND, '预约 123 不存在')

  static badRequest(code: ErrorCode, message?: string): BusinessException {
    return new BusinessException(code, message, HttpStatus.OK);
  }

  static notFound(code: ErrorCode, message?: string): BusinessException {
    return new BusinessException(code, message, HttpStatus.OK);
  }

  static unauthorized(code: ErrorCode, message?: string): BusinessException {
    return new BusinessException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(code: ErrorCode, message?: string): BusinessException {
    return new BusinessException(code, message, HttpStatus.FORBIDDEN);
  }

  /** 幂等冲突用 409，让调用方能从 HTTP 层就识别出「重复提交」 */
  static conflict(code: ErrorCode, message?: string): BusinessException {
    return new BusinessException(code, message, HttpStatus.CONFLICT);
  }
}
