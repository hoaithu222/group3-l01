import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions/AppError";
import { ErrorCode } from "../../../core/utils/error.codes";
import { disconnectUserSockets } from "../../../infrastructure/socket";
import type { SessionService, CurrentSessionRef } from "../services/session.service";
import type { AuditRecorder } from "../services/auth-audit";

const REFRESH_COOKIE_NAME = "refresh_token";

/**
 * "Phiên hiện tại" của người gọi: `sid` của access token (mọi client, kể cả
 * app không có cookie) và/hoặc refresh token trong cookie (web). Trước đây chỉ
 * nhận cookie nên với app `isCurrent` luôn `false` và người dùng thu hồi nhầm
 * chính phiên đang dùng được.
 */
function currentSessionOf(req: Request): CurrentSessionRef {
  return {
    sessionId: req.user?.sessionId,
    refreshToken: req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined,
  };
}

export function createSessionController(sessionService: SessionService, audit?: AuditRecorder) {
  /** GET /auth/sessions — list current user's active sessions */
  const listSessions = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);

    const sessions = await sessionService.listActive(req.user.id, currentSessionOf(req));

    ResponseUtils.success(res, sessions, "Danh sách phiên đăng nhập");
  });

  /** DELETE /auth/sessions/:id — revoke a session */
  const revokeSession = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);

    await sessionService.revoke(req.params.id, req.user.id, currentSessionOf(req));
    await audit?.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "auth.session-revoke",
      targetType: "User",
      targetId: req.user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { sessionId: req.params.id },
    });
    // Ngắt socket của user để thiết bị vừa bị thu hồi mất kết nối realtime NGAY; các thiết bị còn lại
    // tự kết nối lại bằng token còn hiệu lực, còn thiết bị bị thu hồi bị từ chối ở handshake (AUTH_004).
    disconnectUserSockets(req.user.id, "session-revoked");

    ResponseUtils.success(res, null, "Đã thu hồi phiên đăng nhập");
  });

  return { listSessions, revokeSession };
}
