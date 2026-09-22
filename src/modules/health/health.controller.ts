import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator.js'
/**
 * 健康检查
 *
 * 【为什么必须分成两个端点 —— 这是最容易做错的一处基础设施】
 *
 * 容器编排器（K8s / Docker Swarm / 云托管）会打两种探针，行为完全不同：
 *
 *   liveness  （存活）：失败 → 【重启容器】
 *   readiness （就绪）：失败 → 【从负载均衡摘掉，但不重启】
 *
 * 如果把「数据库连通性」放进 liveness：
 *   数据库抖 10 秒 → 所有实例探针失败 → 编排器把所有实例全杀掉重启
 *   → 正在处理的请求全部丢失
 *   → 重启并不能修好数据库，于是陷入反复重启的崩溃循环
 *   → 故障被放大，而不是被隔离
 *
 * 正确做法：
 *   liveness  只回答「进程还在正常运行吗」，不检查任何外部依赖
 *   readiness 才去检查数据库 / Redis 等依赖
 *
 * 这条区分在本地开发时完全感受不到，但它是「服务能不能扛住依赖故障」的分水岭。
 */
// @Public()
@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly config: ConfigService,

    /**
     * 注入 TypeORM 的 DataSource（连接池）
     *
     * @InjectDataSource() 是 @nestjs/typeorm 提供的装饰器。
     * 它在容器里查找 TypeOrmModule.forRoot() 创建的那个 DataSource 实例。
     *
     * 另外两种等价写法：
     *   @InjectDataSource('default')       指定连接名（多数据源时用）
     *   @InjectEntityManager()             注入 EntityManager
     * 不指定名字时就是默认连接。
     */
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: '存活探测 liveness —— 进程还活着吗（不检查任何外部依赖）' })
  liveness() {
    return {
      status: 'up',
      app: this.config.get<string>('app.name'),
      env: this.config.get<string>('app.env'),
      uptime: Math.floor(process.uptime()),
      timestamp: Date.now(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: '就绪探测 readiness —— 依赖都通吗（检查数据库）' })
  async readiness() {
    const database = await this.probeDatabase();

    if (database.status === 'down') {
      // 🔑 必须返回非 2xx —— 编排器就是靠状态码判断的。
      //    返回 200 + { database: 'down' } 是错的：
      //    编排器看到 200 会认为实例健康，继续往里导流量。
      //
      // 注意：错误详情只写日志，不进响应体。
      //      健康检查端点在生产中通常只对内网开放，但保持「不泄漏内部细节」
      //      的一致性更省心 —— 不需要为每个端点单独判断该不该例外。
      throw new ServiceUnavailableException('数据库连接异常，服务暂不可用');
    }

    return {
      status: 'up',
      database,
      timestamp: Date.now(),
    };
  }

  /**
   * 探测数据库连通性
   *
   * 用 SELECT 1 而不是 SELECT NOW() 或查业务表：
   *   ① SELECT 1 不需要访问任何表，开销最低，也最不容易受表结构变更影响
   *   ② 它的语义就是「这条连接还能用吗」，正好对应探测的目的
   *   ③ 它会走完整条链路（连接池取连接 → 发 SQL → 收结果 → 归还连接），
   *      比只判断「连接对象存在吗」可靠得多
   */
  private async probeDatabase(): Promise<{
    status: 'up' | 'down';
    latencyMs: number;
  }> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error(
        { err, latencyMs: Date.now() - start },
        '就绪探测失败：数据库不可达',
      );
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
