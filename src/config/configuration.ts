/**
 * 配置工厂
 *
 * 设计要点：
 * 1. 【单一数据源】所有 process.env 只在这里出现一次，业务代码永远不直接读 env
 * 2. 【按域分组】app / log / database / jwt，读取时路径清晰：config.get('database.host')
 * 3. 【类型转换】env 里一切都是字符串，出口处统一转成 number / boolean
 * 4. 【派生值】isProduction 这类计算值集中在这里，避免业务里到处写 === 'production'
 *
 * 为什么用工厂函数而不是对象字面量：
 * 工厂函数在 ConfigModule 初始化后才执行，此时 .env 已被加载完毕，
 * 写成对象字面量会在模块 import 阶段就求值，读到 undefined。
 */
export default () => ({
  app: {
    name: process.env.APP_NAME as string,
    env: process.env.NODE_ENV as string,
    port: Number(process.env.APP_PORT),
    apiPrefix: process.env.API_PREFIX as string,
    isProduction: process.env.NODE_ENV === 'production',
  },

  log: {
    level: process.env.LOG_LEVEL as string,
    // pino-pretty 只在开发环境开：它通过 worker 线程做格式化，生产环境应输出 JSON 交给采集器
    pretty: process.env.LOG_PRETTY === 'true',
  },

  database: {
    host: process.env.DB_HOST as string,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME as string,
    // 密码允许为空字符串（本地 initialize-insecure 的 root 就是空密码）
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_DATABASE as string,
    // 危险开关，默认关闭。只有在本地开发才允许打开
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET as string,
    expiresIn: process.env.JWT_EXPIRES_IN as string,
  },
});

/** 便于在 Service 里做类型标注，避免各处重复写字符串路径 */
export type AppConfig = ReturnType<typeof configurationShape>;
declare function configurationShape(): {
  app: { name: string; env: string; port: number; apiPrefix: string; isProduction: boolean };
  log: { level: string; pretty: boolean };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    synchronize: boolean;
    logging: boolean;
  };
  jwt: { secret: string; expiresIn: string };
};
