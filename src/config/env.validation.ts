import Joi from 'joi';

/**
 * 环境变量校验规则（启动时强制执行）
 *
 * 这是「配置管理」这一课的核心价值所在。
 *
 * 没有它会发生什么：
 *   服务正常启动 → 跑了几分钟 → 第一个请求打进来 → 报 "Cannot read property
 *   'query' of undefined" → 花 20 分钟排查 → 才发现少配了一个环境变量
 *
 * 有了它：
 *   启动的第一秒就报错，并且明确告诉你「DB_HOST is required」
 *
 * 三条规则：
 *   ① 会用的变量，一个都不能漏（漏了就是上线时才发现的故障）
 *   ② 能限制范围的，一定限制（端口必须是合法端口，枚举必须有白名单）
 *   ③ 危险开关默认必须是安全值（synchronize 默认 false）
 */
export const envValidationSchema = Joi.object({
  // ---------- 应用 ----------
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  APP_NAME: Joi.string().default('booking-platform'),
  APP_PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api'),

  // ---------- 日志 ----------
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  LOG_PRETTY: Joi.boolean().truthy('true').falsy('false').default(false),

  // ---------- 数据库 ----------
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(3306),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_DATABASE: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),

  // ---------- 认证 ----------
  // 长度下限是硬要求：密钥太短等于没有签名保护
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
});
