import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/**
 * 健康检查模块
 *
 * 阶段二起，这个模块还会加上：
 *   - /health/live   存活探测：进程还在吗（不查依赖，否则数据库抖动会导致容器被反复重启）
 *   - /health/ready  就绪探测：依赖都通吗（数据库 / Redis 连不上就不接流量）
 *
 * 两者的区别很关键：
 *   存活失败 → 编排系统【重启】容器
 *   就绪失败 → 编排系统【摘除】流量，但不重启
 * 如果把数据库检查放进存活探测，数据库一抖动，全部容器会被同时重启 —— 雪上加霜。
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
