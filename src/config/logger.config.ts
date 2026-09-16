import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

interface LoggerBuildOptions {
  level: string;
  pretty: boolean;
}

/**
 * 日志配置工厂
 *
 * 抽出独立文件的理由：AppModule 只该负责「装配」，不该堆满配置细节。
 * 配置项一多，AppModule 就会变成一个谁也读不懂的垃圾场。
 */
export const buildLoggerOptions = ({ level, pretty }: LoggerBuildOptions): Params => ({
  pinoHttp: {
    level,

    /**
     * traceId 生成策略 —— 这是分布式链路追踪的起点
     *
     * 优先级：
     *   ① 上游已传入 x-request-id（网关 / 前端 / 另一个服务）→ 复用
     *      → 这是「跨服务串起同一条链路」的关键
     *   ② 没有则自己生成一个 UUID
     *
     * 同时把 id 回写到响应头，前端报错时能把 id 给到后端，
     * 后端一条命令就能捞出这次请求的全部日志。
     */
    genReqId: (req: IncomingMessage, res: ServerResponse): string => {
      const raw = req.headers['x-request-id'];
      const incoming = Array.isArray(raw) ? raw[0] : raw;
      const id = incoming && incoming.trim() ? incoming.trim() : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },

    /**
     * 日志脱敏 —— 生产环境的硬性要求
     *
     * 日志系统的访问权限通常比数据库宽松得多（运维、审计、甚至第三方采集）。
     * 密码 / token / cookie 一旦进了日志，等于把凭据写进了一个低安全级别的存储。
     *
     * 常见事故：排查问题时把整个 request body 打出来，
     *          日志里从此永久留下了用户的明文密码。
     */
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'req.body.password',
        'req.body.oldPassword',
        'req.body.newPassword',
        'req.body.refreshToken',
        'res.headers["set-cookie"]',
      ],
      censor: '[已脱敏]',
    },

    /**
     * 开发环境用 pino-pretty 转成人类可读的彩色输出。
     *
     * ⚠️ 生产环境必须关闭：
     *   transport 会额外开一个 worker 线程做格式化，而生产的日志应该
     *   原样输出 JSON 到 stdout，由 Filebeat / Loki / 云日志服务去做解析。
     *   在应用里做格式化，等于让业务进程承担了本该由采集器承担的 CPU 开销。
     */
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            singleLine: false,
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined,

    /** 给每条日志附加一个固定字段，便于按来源过滤 */
    customProps: () => ({ ctx: 'HTTP' }),

    /**
     * 自动请求日志开关。
     * 健康检查 / 探针每几秒一次，全部记录下来只会淹没真正的业务日志。
     */
    autoLogging: {
      ignore: (req: IncomingMessage) => req.url === '/health',
    },
  },
});
