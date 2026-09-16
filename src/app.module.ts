import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import configuration from './config/configuration.js';
import { envValidationSchema } from './config/env.validation.js';
import { buildLoggerOptions } from './config/logger.config.js';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { AppValidationPipe } from './common/pipes/app-validation.pipe.js';

import { HealthModule } from './modules/health/health.module.js';
import { DemoModule } from './modules/demo/demo.module.js';

/**
 * 根模块
 *
 * 【它只做三件事】
 *   ① 装配全局配置（ConfigModule / LoggerModule）
 *   ② 注册全局横切关注点（Pipe / Interceptor / Filter）
 *   ③ 挂载业务模块
 * 它不该出现任何业务逻辑。
 */
@Module({
  imports: [
    // ---------------------------------------------------------------
    // ① 配置模块 —— 必须最先，其他所有模块都依赖它
    // ---------------------------------------------------------------
    ConfigModule.forRoot({
      // isGlobal: true → 其他模块不用重复写 imports: [ConfigModule]
      // 环境变量是全应用共享的基础设施，每个模块都 import 一次是纯噪音
      isGlobal: true,

      // cache: true → 解析一次后缓存，避免每次 get() 都重新查找
      cache: true,

      // 把 configuration.ts 的返回值挂到命名空间上
      load: [configuration],

      // 启动时校验环境变量：不合法直接崩，绝不放行
      validationSchema: envValidationSchema,

      // ⚠️ @nestjs/config v12 的破坏性变更：
      //    校验选项类型从「Joi 原生 ValidationOptions」改成了 Standard Schema 规范
      //      v11 写法：validationOptions: { abortEarly: false }
      //      v12 写法：包进 libraryOptions
      //    原因：v12 同时支持 Joi / Zod / Valibot / ArkType 等，
      //         为了不被单一库的类型绑架，公共选项用规范定义，
      //         库专属选项统一塞进 libraryOptions 透传。
      // 效果：abortEarly: false → 一次报出所有缺失项，而不是修一个报一个
      validationOptions: { libraryOptions: { abortEarly: false } },

      // 多环境 .env：先找 .env.development，再回落到 .env
      // 数组里靠后的文件优先级更高，所以 .env 放后面作为兜底默认值
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],

      // 支持 .env 里写 ${VAR} 引用其他变量
      expandVariables: true,
    }),

    // ---------------------------------------------------------------
    // ② 日志模块 —— 用 forRootAsync 才能读到 ConfigService
    // ---------------------------------------------------------------
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildLoggerOptions({
          level: config.get<string>('log.level') ?? 'info',
          pretty: config.get<boolean>('log.pretty') ?? false,
        }),
    }),

    // ---------------------------------------------------------------
    // ③ 业务模块
    // ---------------------------------------------------------------
    HealthModule,
    DemoModule,
  ],

  /**
   * 【全局横切关注点的正确注册方式】
   *
   * 对比两种写法：
   *
   *   // ❌ main.ts 里 new —— 实例游离于 IoC 容器之外
   *   app.useGlobalPipes(new AppValidationPipe());
   *   app.useGlobalInterceptors(new TransformInterceptor());
   *   app.useGlobalFilters(new AllExceptionsFilter());
   *
   *   // ✅ 走 provider token —— 实例由容器创建，依赖注入可用
   *   { provide: APP_PIPE, useClass: AppValidationPipe }
   *
   * 功能上等价，但第二种：
   *    ① 拦截器/过滤器里可以直接注入 ConfigService、Reflector、Logger
   *    ② 可以在测试模块里覆盖替换
   *    ③ 生命周期钩子（OnModuleInit 等）会正常触发
   *
   * 这是「教程代码」和「企业级代码」最典型的差别之一。
   */
  providers: [
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
