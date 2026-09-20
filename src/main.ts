import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

/**
 * 应用入口
 *
 * 【装配顺序不是随意的，每一步都有理由】
 *
 *   ① bufferLogs: true   → 启动阶段的日志先缓存，等 Logger 接管后统一输出
 *                          否则 Nest 默认 logger 会先打一堆格式不一致的日志
 *   ② useLogger          → nestjs-pino 接管全局日志（含框架自身日志）
 *   ③ 读配置             → 此时 ConfigModule 已完成 Joi 校验，值一定合法
 *   ④ setGlobalPrefix    → 必须在挂载路由之前生效
 *   ⑤ Swagger            → 建在全局前缀下，避免和业务路由冲突
 *   ⑥ enableShutdownHooks→ 让 onModuleDestroy 能被触发
 *   ⑦ listen             → 最后才开始接客
 *
 * 【为什么这里能用顶层 await】
 *   本项目的 package.json 里有 "type": "module"，TS 编译目标是 ESM，
 *   ESM 规范支持顶层 await —— 不需要再套一个 (async () => {})() 的 IIFE。
 *   这是 ESM 相比 CommonJS 少数几个「写起来更舒服」的地方之一。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ---------- ① 日志 ----------
  const logger = app.get(Logger);
  app.useLogger(logger);

  // ---------- ② 配置 ----------
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? 3000;
  const apiPrefix = config.get<string>('app.apiPrefix') ?? 'api';
  const appName = config.get<string>('app.name') ?? 'booking-platform';

  // ---------- ③ 全局路由前缀 ----------
  // 健康检查排除在前缀之外：容器编排 / 负载均衡的探针地址通常是固定的 /health，
  // 把前缀加进去会让探针配置依赖业务配置，徒增耦合。
  //
  // ⚠️ 两条都要排除：字符串形式的 exclude 是精确匹配，
  //    'health' 不会自动覆盖 'health/ready'。
  app.setGlobalPrefix(apiPrefix, { exclude: ['health', 'health/ready'] });

  // ---------- ④ 接口文档 ----------
  const swaggerConfig = new DocumentBuilder()
    .setTitle(`${appName} API`)
    .setDescription('多商户预约服务平台 · 接口文档')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  // ---------- ⑤ 优雅关闭 ----------
  // 收到 SIGTERM 时，先停止接收新请求，等在途请求处理完再退出。
  // 没有它，滚动发布时正在处理的请求会被直接掐断，用户看到连接重置。
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`服务已启动  →  http://localhost:${port}/${apiPrefix}`);
  logger.log(`接口文档    →  http://localhost:${port}/${apiPrefix}/docs`);
  logger.log(`健康检查    →  http://localhost:${port}/health`);
}

await bootstrap();
