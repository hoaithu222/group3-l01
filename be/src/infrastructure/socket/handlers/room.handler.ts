/**
 * @file room.handler.ts
 * @description `room:join`/`room:leave` (be.md p0-03 §5.3) — guard qua
 * `resolveJoinable()` (p0-02 `PermissionService`), ack `{ ok, code? }`.
 */
import { z } from "zod";
import { type DefaultEventsMap, type Server, type Socket } from "socket.io";
import { SocketEvent } from "../socket.events";
import { resolveJoinable, joinRoom, leaveRoom, ROOM } from "../socket.rooms";
import type { SocketData } from "../socket.server";
import { ackOk, ackErr, type AckCallback } from "../socket.ack";
import { ErrorCode } from "../../../core/utils/error.codes";
import { socketEventsTotal } from "../../metrics";
import { syncViewing } from "../socket.viewing";
import { createOpsWatch } from "../socket.ops-watch";

/** 9 kind theo be.md §1: `user ws ch conv call meet board quiz admin`. */
export const roomJoinSchema = z.object({
  kind: z.enum(["user", "ws", "ch", "conv", "call", "meet", "board", "quiz", "admin"]),
  id: z.string().min(1).max(64),
});

type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export function registerRoomHandlers(_io: Server, socket: AppSocket): void {
  const user = socket.data.user;
  // p0-03: socket trong `admin:ops` giữ khoá "có người xem" (Redis) cho cron `ops.stats-broadcast`; dừng khi rời room/ngắt kết nối.
  const opsWatch = createOpsWatch();
  socket.on("disconnect", opsWatch.stop);

  socket.on(SocketEvent.JOIN_ROOM, async (payload: unknown, ack?: AckCallback) => {
    const parsed = roomJoinSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.(ackErr(ErrorCode.RT_400));
      socketEventsTotal.inc({ event: SocketEvent.JOIN_ROOM, result: "error" });
      return;
    }

    const { kind, id } = parsed.data;
    // Server tự join `user:{id}` lúc connect — client không được tự xin qua room:join (be.md §5.3 bước 2).
    if (kind === "user") {
      ack?.(ackErr(ErrorCode.RT_404));
      socketEventsTotal.inc({ event: SocketEvent.JOIN_ROOM, result: "rejected" });
      return;
    }

    const { room, code } = await resolveJoinable(user, kind, id);
    if (!room) {
      ack?.(ackErr(code ?? ErrorCode.PERM_404));
      socketEventsTotal.inc({ event: SocketEvent.JOIN_ROOM, result: "rejected" });
      return;
    }

    await joinRoom(socket, room);
    if (room === ROOM.admin("ops")) opsWatch.start();
    // p1-07 §9 — đánh dấu "đang xem" (conv|ch) cho push decision; best-effort, không chặn ack.
    void syncViewing(socket.id, user.id, socket.rooms);
    ack?.(ackOk());
    socketEventsTotal.inc({ event: SocketEvent.JOIN_ROOM, result: "ok" });
  });

  socket.on(SocketEvent.LEAVE_ROOM, async (payload: unknown, ack?: AckCallback) => {
    const parsed = roomJoinSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.(ackErr(ErrorCode.RT_400));
      socketEventsTotal.inc({ event: SocketEvent.LEAVE_ROOM, result: "error" });
      return;
    }

    const room = `${parsed.data.kind}:${parsed.data.id}`;
    if (!socket.rooms.has(room)) {
      ack?.(ackErr(ErrorCode.RT_409));
      socketEventsTotal.inc({ event: SocketEvent.LEAVE_ROOM, result: "rejected" });
      return;
    }

    await leaveRoom(socket, room);
    if (room === ROOM.admin("ops")) opsWatch.stop();
    void syncViewing(socket.id, user.id, socket.rooms);
    ack?.(ackOk());
    socketEventsTotal.inc({ event: SocketEvent.LEAVE_ROOM, result: "ok" });
  });
}
