/**
 * JwtStrategy.validate() 的返回值形状，也就是 request.user 的形状。
 *
 * 把它单独定义出来，是为了让「策略写什么」和「控制器读什么」共用同一份契约，
 * 而不是靠两边各写一遍、运行时才发现字段名不一致。
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  nickname: string | null;
  status: number;
}
