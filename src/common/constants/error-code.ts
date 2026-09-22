/**
 * 业务错误码
 *
 * 【第一原则】业务码 ≠ HTTP 状态码，两者是「一对多」关系。
 *
 *   HTTP 状态码   → 传输层语义，只有几十个，给网关 / CDN / 浏览器 / 监控用
 *   业务错误码     → 业务层语义，可以有几千个，给前端业务逻辑用
 *
 * 举例：同样是「下单失败」，前端要区分
 *   40001 库存不足      → 提示「该商品已售罄」
 *   40002 余额不足      → 提示「请先充值」并跳转账页
 *   40003 账号被禁用    → 提示「请联系客服」并隐藏下单按钮
 * 这三个的 HTTP 状态码都可以是 200，只有业务码能区分。
 *
 * 【编码规范】分段编码，一眼看出错误归属哪一层
 *   0       → 成功
 *   1xxxx   → 通用 / 参数校验
 *   2xxxx   → 认证（你是谁）
 *   3xxxx   → 权限（你能干什么）
 *   4xxxx   → 业务域
 *   9xxxx   → 系统级
 *
 * 【为什么用 enum 而不是散落的魔法数字】
 *   代码里写 ErrorCode.STOCK_NOT_ENOUGH 是自解释的；
 *   写 40001 三个月后自己都要回来查文档。
 */
export enum ErrorCode {
  // ---- 成功 ----
  SUCCESS = 0,

  // ---- 1xxxx 通用 / 参数 ----
  PARAM_INVALID = 10001,
  RESOURCE_NOT_FOUND = 10002,
  RESOURCE_CONFLICT = 10003,
  TOO_MANY_REQUESTS = 10004,
  SERVICE_UNAVAILABLE = 10005,

  // ---- 2xxxx 认证 ----
  UNAUTHORIZED = 20001,
  TOKEN_EXPIRED = 20002,
  TOKEN_INVALID = 20003,
  CREDENTIALS_INVALID = 20004,
  REFRESH_TOKEN_INVALID = 20005, // 新增：refresh token 无效 / 已撤销 / 已过期
  REFRESH_TOKEN_REUSED = 20006,  // 新增：检测到已轮转的 token 被再次使用

  // ---- 3xxxx 权限 ----
  FORBIDDEN = 30001,
  PERMISSION_DENIED = 30002,

  // ---- 4xxxx 业务域：用户 ----
  USER_NOT_FOUND = 40001,
  USER_ALREADY_EXISTS = 40002,
  USER_DISABLED = 40003,

  // ---- 4xxxx 业务域：预约 ----
  APPOINTMENT_NOT_FOUND = 41001,
  APPOINTMENT_SLOT_FULL = 41002,
  APPOINTMENT_STATUS_INVALID = 41003,
  APPOINTMENT_DUPLICATED = 41004,

  // ---- 9xxxx 系统级 ----
  INTERNAL_ERROR = 99999,
}

/**
 * 错误码 → 默认文案
 *
 * 为什么要有默认文案：
 *   抛出异常时只传错误码就够了，文案不用每次重复写。
 *   需要给用户更具体的信息时，再显式传第二个参数覆盖。
 */
export const ErrorMessage: Record<ErrorCode, string> = {
  [ErrorCode.SUCCESS]: '操作成功',

  [ErrorCode.PARAM_INVALID]: '请求参数不合法',
  [ErrorCode.RESOURCE_NOT_FOUND]: '资源不存在',
  [ErrorCode.RESOURCE_CONFLICT]: '资源状态冲突',
  [ErrorCode.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后再试',
  [ErrorCode.SERVICE_UNAVAILABLE]: '依赖服务不可用，请稍后再试',

  [ErrorCode.UNAUTHORIZED]: '未登录或登录状态已失效',
  [ErrorCode.TOKEN_EXPIRED]: '登录已过期，请重新登录',
  [ErrorCode.TOKEN_INVALID]: '登录凭证无效',
  [ErrorCode.CREDENTIALS_INVALID]: '用户名或密码错误',
  [ErrorCode.REFRESH_TOKEN_INVALID]: '登录状态已失效，请重新登录',
  [ErrorCode.REFRESH_TOKEN_REUSED]: '检测到凭证异常使用，该会话已失效',

  [ErrorCode.FORBIDDEN]: '无权访问该资源',
  [ErrorCode.PERMISSION_DENIED]: '缺少必要的操作权限',

  [ErrorCode.USER_NOT_FOUND]: '用户不存在',
  [ErrorCode.USER_ALREADY_EXISTS]: '用户已存在',
  [ErrorCode.USER_DISABLED]: '账号已被禁用',

  [ErrorCode.APPOINTMENT_NOT_FOUND]: '预约记录不存在',
  [ErrorCode.APPOINTMENT_SLOT_FULL]: '该时段名额已约满',
  [ErrorCode.APPOINTMENT_STATUS_INVALID]: '预约状态不允许此操作',
  [ErrorCode.APPOINTMENT_DUPLICATED]: '请勿重复提交预约',

  [ErrorCode.INTERNAL_ERROR]: '系统繁忙，请稍后再试',
};

/**
 * HTTP 状态码 → 业务错误码（兜底映射）
 *
 * 作用：当异常不是我们自己抛的 BusinessException，而是 Nest 内置异常
 * （比如 ValidationPipe 抛的 BadRequestException、路由不存在抛的
 *  NotFoundException）时，用这张表把 HTTP 语义翻译成业务码，
 * 保证前端拿到的响应体结构永远一致。
 */
export const HttpStatusToErrorCode: Record<number, ErrorCode> = {
  400: ErrorCode.PARAM_INVALID,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.RESOURCE_NOT_FOUND,
  409: ErrorCode.RESOURCE_CONFLICT,
  429: ErrorCode.TOO_MANY_REQUESTS,
  500: ErrorCode.INTERNAL_ERROR,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};
