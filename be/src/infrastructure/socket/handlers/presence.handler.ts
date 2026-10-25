/**
 * @file presence.handler.ts
 * @description `presence:heartbeat`/`presence:set` (be.md p0-03 §5.4) — chỉ
 * validate + gia hạn connection registry rồi giao logic cho
 * `modules/presence/presence.service.ts` (tính trạng thái/phát sự kiện tách
 * khỏi Socket.IO để unit test độc lập).
 */
import { z } from "zod";
import { type DefaultEventsMap, type Server, type Socket } from "socket.io";
import { SocketEvent } from "../socket.events";
import type { SocketData } from "../socket.server";
import { ackOk, ackErr, type AckCallback } from "../socket.ack";
import { ErrorCode } from "../../../core/utils/error.codes";
import { socketEventsTotal } from "../../metrics";
import { registryTouch } from "../socket.registry";
import { syncViewing } from "../socket.viewing";
import { heartbeat, setDnd } from "../../../modules/presence/presence.service";

/**
 * `threadId` (p1-07) — tuỳ chọn: thread đang mở trong kênh (`ch:` room của socket); cùng
 * `active=true` → server đặt khoá viewing thread (NT-02). Thiếu/`null` = không mở thread nào.
 */
export const presenceHeartbeatSchema = z.object({
  active: z.boolean(),
  threadId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .nullable()
    .optional(),
});
export const presenceSetSchema = z.object({
  dnd: z.boolean(),
  until: z.string().datetime().optional(),
});

type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export function registerPresenceHandlers(_io: Server, socket: AppSocket): void {
  const user = socket.data.user;

  socket.on(SocketEvent.PRESENCE_HEARTBEAT, async (payload: unknown, ack?: AckCallback) => {
    const parsed = presenceHeartbeatSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.(ackErr(ErrorCode.RT_400));
      socketEventsTotal.inc({ event: SocketEvent.PRESENCE_HEARTBEAT, result: "error" });
      return;
    }

    await registryTouch(user.id);
    await heartbeat(user.id, socket.data.deviceId, parsed.data.active);
    // p1-07 §9 — gia hạn/xoá khoá "đang xem" theo trạng thái foreground của app.
    await syncViewing(socket.id, user.id, socket.rooms, {
      active: parsed.data.active,
      threadId: parsed.data.threadId ?? null,
    });
    ack?.(ackOk());
    socketEventsTotal.inc({ event: SocketEvent.PRESENCE_HEARTBEAT, result: "ok" });
  });

  socket.on(SocketEvent.PRESENCE_SET, async (payload: unknown, ack?: AckCallback) => {
    const parsed = presenceSetSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.(ackErr(ErrorCode.RT_400));
      socketEventsTotal.inc({ event: SocketEvent.PRESENCE_SET, result: "error" });
      return;
    }

    await setDnd(user.id, parsed.data.dnd, parsed.data.until);
    ack?.(ackOk());
    socketEventsTotal.inc({ event: SocketEvent.PRESENCE_SET, result: "ok" });
  });
}
