/**
 * @file auth.handler.ts
 * @description `auth:refresh` (be.md p0-03 §5.2) — làm mới `socket.data.user/exp`
 * KHÔNG cần reconnect (access token 15 phút sống lâu hơn 1 phiên socket, README
 * §2 "Xác thực"). Cũng giữ lịch `session:expiring` (be.md §5.1/§9) — báo client
 * 60s trước khi access token hết hạn nếu họ chưa gọi `auth:refresh`.
 */
import { z } from "zod";
import { type DefaultEventsMap, type Server, type Socket } from "socket.io";
import { verifyAccessContext } from "../../../core/permission/access-context";
import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import { SocketEvent } from "../socket.events";
import type { SocketData } from "../socket.server";
import { ackOk, ackErr, type AckCallback } from "../socket.ack";
import { socketEventsTotal } from "../../metrics";
import { logger } from "../../logger";

export const authRefreshSchema = z.object({ token: z.string().min(20).max(4096) });

type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

/** `socket -> timer` cho lịch `session:expiring` đang chờ — 1 socket chỉ có tối đa 1 timer sống tại 1 thời điểm. */
const expiringTimers = new WeakMap<AppSocket, NodeJS.Timeout>();

/** Đặt lại lịch `session:expiring` theo `socket.data.exp` hiện tại — gọi lúc connect VÀ mỗi lần `auth:refresh` thành công. */
export function scheduleSessionExpiring(socket: AppSocket): void {
  cancelSessionExpiring(socket);
  const exp = socket.data.exp;
  if (!exp) return;

  const leadMs = LIMITS.realtime.sessionExpiringLeadSeconds * 1000;
  const delayMs = exp * 1000 - Date.now() - leadMs;

  const fire = () => {
    if (socket.connected) socket.emit(SocketEvent.SESSION_EXPIRING, { v: 1, exp });
  };

  if (delayMs <= 0) {
    fire();
    return;
  }
  expiringTimers.set(socket, setTimeout(fire, delayMs));
}

/** Huỷ lịch `session:expiring` — gọi lúc `disconnect` (tránh timer sống ngoài vòng đời socket) và trước khi đặt lịch mới. */
export function cancelSessionExpiring(socket: AppSocket): void {
  const timer = expiringTimers.get(socket);
  if (timer) clearTimeout(timer);
  expiringTimers.delete(socket);
}

export function registerAuthHandlers(_io: Server, socket: AppSocket): void {
  socket.on(SocketEvent.AUTH_REFRESH, async (payload: unknown, ack?: AckCallback) => {
    const parsed = authRefreshSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.(ackErr(ErrorCode.RT_400));
      socketEventsTotal.inc({ event: SocketEvent.AUTH_REFRESH, result: "error" });
      return;
    }

    try {
      const ctx = await verifyAccessContext(parsed.data.token);
      if (ctx.user.id !== socket.data.user.id) {
        ack?.(ackErr(ErrorCode.RT_401));
        socketEventsTotal.inc({ event: SocketEvent.AUTH_REFRESH, result: "rejected" });
        socket.disconnect(true);
        return;
      }

      socket.data.user = ctx.user;
      socket.data.exp = ctx.exp;
      scheduleSessionExpiring(socket);
      ack?.(ackOk());
      socketEventsTotal.inc({ event: SocketEvent.AUTH_REFRESH, result: "ok" });
    } catch (err) {
      logger.warn("[auth.handler] auth:refresh thất bại", {
        socketId: socket.id,
        error: err instanceof Error ? err.message : String(err),
      });
      ack?.(ackErr(ErrorCode.RT_401));
      socketEventsTotal.inc({ event: SocketEvent.AUTH_REFRESH, result: "rejected" });
    }
  });
}
