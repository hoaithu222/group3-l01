import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";
import { JwtUtils } from "../utils/jwt";

/**
 * Thu hồi TỨC THÌ một phiên riêng lẻ (đăng xuất, thu hồi phiên, vượt trần số
 * phiên) mà không phải chờ access token hết hạn.
 *
 * `Session.revokedAt` trong DB chặn được `POST /auth/refresh` nhưng KHÔNG chặn
 * access token đã phát hành (JWT tự đủ dữ liệu, chỉ hết hạn sau
 * `JWT_EXPIRES_IN`). Nên mỗi lần thu hồi ghi thêm một dấu nhỏ trên Redis
 * (`session:revoked:<sid>`, TTL = tuổi thọ tối đa của access token) và
 * `verifyAccessContext` kiểm dấu này cho token có claim `sid`.
 *
 * Thu hồi HÀNG LOẠT (khoá, đổi vai trò, đổi/đặt lại mật khẩu, đăng xuất mọi
 * nơi, phát hiện dùng lại refresh token) không cần dấu này: `sessionVersion`
 * tăng đã vô hiệu mọi access token cũ.
 *
 * Redis lỗi/chưa sẵn sàng ⇒ dấu không ghi được (log cảnh báo, không chặn
 * nghiệp vụ) — access token còn sống tới khi hết hạn, cùng giới hạn với
 * blacklist token đăng xuất.
 */

const REVOKED_PREFIX = "session:revoked:";
/** Đệm thêm để dấu sống lâu hơn token dài nhất (sai lệch đồng hồ ≤ 5 s + độ trễ ghi). */
const TTL_SLACK_SECONDS = 60;

function revokedKey(sessionId: string): string {
  return `${REVOKED_PREFIX}${sessionId}`;
}

/** Đánh dấu các phiên đã bị thu hồi — best-effort, không bao giờ ném lỗi. */
export async function markSessionsRevoked(sessionIds: readonly string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const ttl = JwtUtils.accessTokenTtlSeconds() + TTL_SLACK_SECONDS;
  const results = await Promise.allSettled(
    sessionIds.map((id) => redis.set(revokedKey(id), "1", ttl))
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    logger.warn("[session-revocation] Không ghi được dấu thu hồi phiên lên Redis", {
      failed,
      total: sessionIds.length,
    });
  }
}

/** Phiên `sessionId` đã bị thu hồi chưa? Redis lỗi ⇒ `false` (cho qua, như blacklist token). */
export async function isSessionRevoked(sessionId: string): Promise<boolean> {
  try {
    const value = await redis.get<string>(revokedKey(sessionId));
    return value !== null && value !== undefined;
  } catch {
    return false;
  }
}
