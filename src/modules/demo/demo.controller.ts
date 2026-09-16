import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { ErrorCode } from '../../common/constants/error-code.js';
import { CreateDemoDto } from './dto/create-demo.dto.js';

/**
 * 教学演示控制器
 *
 * ⚠️ 本模块只为「验证阶段一四项验收标准」而存在。
 *    阶段二开始时会删除。
 *
 * 四个端点对应四种失败形态，用来观察异常过滤器 + 响应拦截器的协作：
 *
 *   GET  /api/demo/ok             正常返回 → 被拦截器包装成统一结构
 *   GET  /api/demo/business-error 业务失败 → HTTP 200 + 业务码
 *   GET  /api/demo/system-error   系统崩溃 → HTTP 500 + 隐藏细节 + 日志留痕
 *   GET  /api/demo/http-error     框架异常 → HTTP 404 + 业务码翻译
 *   POST /api/demo/validate       参数校验 → HTTP 200 + PARAM_INVALID
 */
@ApiTags('教学演示')
@Controller('demo')
export class DemoController {
  @Get('ok')
  @ApiOperation({ summary: '正常返回：观察响应被拦截器包装后的结构' })
  ok() {
    return {
      message: '这是一个正常响应',
      note: '注意它被包进了 { code, message, data, traceId, timestamp }',
      items: [{ id: 1, name: '测试项' }],
    };
  }

  @Get('business-error')
  @ApiOperation({ summary: '业务失败：HTTP 200 + 业务错误码' })
  businessError() {
    // 业务规则不允许，但服务本身运转正常
    throw new BusinessException(ErrorCode.APPOINTMENT_SLOT_FULL);
  }

  @Get('business-error-custom')
  @ApiOperation({ summary: '业务失败：自定义文案 + 覆盖默认 HTTP 状态' })
  businessErrorCustom() {
    throw BusinessException.conflict(
      ErrorCode.APPOINTMENT_DUPLICATED,
      '该时段你已有一条待确认的预约，请勿重复提交',
    );
  }

  @Get('system-error')
  @ApiOperation({ summary: '系统异常：HTTP 500 + 对外隐藏细节 + 日志留痕' })
  systemError() {
    // 故意把敏感信息塞进异常 message，用来验证过滤器会不会泄漏它。
    //
    // ⚠️ 注意：这里用的是【明显的占位符】，不是真实凭据。
    //    本仓库是公开的 —— 把真实密码 / token 写进演示代码或注释，
    //    等于亲手示范自己正在教别人避免的错误。
    //    占位符的名字直接写明了断言内容，验证时 grep 它即可。
    throw new Error(
      '数据库连接失败: host=127.0.0.1 user=app password=DEMO_PASSWORD_SHOULD_NOT_LEAK at /src/db/pool.ts:88',
    );
  }

  @Get('http-error')
  @ApiOperation({ summary: '框架异常：HTTP 404 被翻译成业务码' })
  httpError() {
    throw new NotFoundException('这个路由对应的资源不存在');
  }

  @Post('validate')
  @ApiOperation({ summary: '参数校验失败：观察错误信息如何被压平成一行' })
  validate(@Body() dto: CreateDemoDto) {
    return { received: dto, note: '校验通过才会走到这里' };
  }
}
