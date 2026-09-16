/**
 * 统一响应体契约
 *
 * 【为什么必须统一】
 * 前端要写请求拦截器判断「这次请求到底成功没有」。
 * 如果每个接口返回的结构都不一样，前端就得为每个接口写一套解析逻辑。
 *
 * 统一之后，前端只需要写一次：
 *   if (res.data.code === 0) { 正常处理 }
 *   else { 按 code 分发错误提示 }
 *
 * 【字段设计说明】
 *   code      业务码。0 = 成功。前端唯一需要判断的字段
 *   message   给人看的提示文案。可直接 toast
 *   data      业务数据。失败时为 null，保证前端解析路径不变
 *   traceId   链路追踪 id。前端报错时把这个 id 给后端，能直接定位到那一条请求的全部日志
 *   timestamp 服务端时间戳。便于排查客户端时钟不准导致的时序问题
 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
  traceId: string;
  timestamp: number;
}

/**
 * 分页响应体
 *
 * 注意 page / pageSize 回显：前端渲染分页器需要它们，
 * 让前端自己记一遍容易和后端算错位。
 */
export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 分页查询入参基类，各业务模块的查询 DTO 继承它 */
export class PaginationQueryDto {
  /** 页码，从 1 开始 */
  page?: number = 1;

  /** 每页条数，服务端必须强制上限，否则 pageSize=999999 就是一次全表扫描 */
  pageSize?: number = 20;
}
