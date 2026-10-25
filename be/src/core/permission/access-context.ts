import { JwtUtils, type JwtPayload } from "../utils/jwt";
import { UnauthorizedError, AccountLockedError } from "../exceptions";
import { ErrorCode } from "../utils/error.codes";
import { isSessionRevoked } from "../auth/session-revocation";
import { getUserStatusCached } from "./user-status";
import type { AuthUser } from "../types/express";

export interface AccessContext {
  user: AuthUser;
  jti?: string;
  exp?: number;
}

/**
 * Xác thực access token — dùng chung cho HTTP (`authenticateToken`) và
 * Socket.IO (`io.use`) để hai kênh không bao giờ lệch nhau (vd HTTP đã chặn
 * token bị khoá tài khoản nhưng socket vẫn nhận).
 *
 * Thứ tự kiểm:
 *   1. Chữ ký/hạn/`iss`/`aud`/thuật toán JWT hợp lệ — làm TRƯỚC mọi truy vấn
 *      Redis/DB để token rác không tốn tài nguyên hạ tầng.
 *   2. Blacklist Redis (token đã logout), dấu "phiên đã thu hồi" (claim `sid`)
 *      và trạng thái tài khoản (cache Redis 60s qua `getUserStatusCached`) —
 *      ba tra cứu độc lập nên chạy song song.
 *   3. Trạng thái tài khoản (khoá/chờ xoá/ẩn danh).
 *   4. `sessionVersion` trong token khớp với hiện tại (phát hiện phiên đã bị
 *      thu hồi do khoá/đổi role/đổi mật khẩu/thu hồi tất cả session).
 *
 * Ném AppError subclass — nơi gọi (middleware HTTP hay io.use) tự quyết định
 * cách chuyển thành response (`next(err)` ở HTTP, `err.data = { code }` ở
 * socket) thay vì hàm này tự biết về Express/Socket.IO.
 */
export async function verifyAccessContext(token: string): Promise<AccessContext> {
  let payload: JwtPayload;
  try {
    payload = JwtUtils.verifyToken(token);
  } catch {
    throw new UnauthorizedError("Token không hợp lệ hoặc đã hết hạn");
  }

  const [blacklisted, sessionRevoked, snap] = await Promise.all([
    JwtUtils.isTokenBlacklisted(token),
    payload.sid ? isSessionRevoked(payload.sid) : Promise.resolve(false),
    getUserStatusCached(payload.userId),
  ]);

  if (blacklisted) {
    throw new UnauthorizedError("Token đã bị thu hồi, vui lòng đăng nhập lại");
  }
  if (!snap) {
    throw new UnauthorizedError("Người dùng không tồn tại");
  }
  if (snap.status === "LOCKED" || snap.status === "ANONYMIZED") {
    throw new AccountLockedError(ErrorCode.AUTH_011);
  }
  if (snap.status === "PENDING_DELETION") {
    throw new AccountLockedError(ErrorCode.AUTH_012);
  }
  if ((payload.sv ?? 1) !== snap.sessionVersion) {
    throw new UnauthorizedError("Phiên đã bị thu hồi, vui lòng đăng nhập lại", ErrorCode.AUTH_004);
  }
  if (sessionRevoked) {
    throw new UnauthorizedError("Phiên đã bị thu hồi, vui lòng đăng nhập lại", ErrorCode.AUTH_004);
  }

  const user: AuthUser = {
    id: payload.userId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    permissions: [],
    ...(payload.sid && { sessionId: payload.sid }),
  };

  return { user, jti: payload.jti, exp: payload.exp };
}
