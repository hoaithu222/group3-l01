/**
 * @file typing.handler.ts
 * @description `typing:start`/`typing:stop` (be.md p0-03 §5.5) — yêu cầu
 * socket ĐÃ join room scope (`ch:{id}`/`conv:{id}`) và có quyền gửi tin
 * (`channel.message.send`/`conversation.message.send`, tái dùng
 * `PermissionService.assert()` của p0-02 nên mã lỗi 404/403 tự đúng theo
 * loại scope). Phát `typing` bằng `socket.to(room)` (NGUYÊN VĂN, không qua
 * `emitToRoom`) vì cần loại trừ chính người gửi — `emitToRoom`/`io.to()`
 * không làm được việc đó.
 */
import { z } from "zod";
import { type DefaultEventsMap, type Server, type Socket } from "socket.io";
import { SocketEvent } from "../socket.events";
import { ROOM } from "../socket.rooms";
import type { SocketData } from "../socket.server";
import { ackOk, ackErr, type AckCallback } from "../socket.ack";
import { ErrorCode, type ErrorCodeType } from "../../../core/utils/error.codes";
import { socketEventsTotal } from "../../metrics";
import { stampPayload } from "../socket.emit";
import { setTyping, type TypingState } from "../../../modules/presence/typing.service";
import { permissionService, type Action, type ScopeType } from "../../../core/permission";
import { AppError } from "../../../core/exceptions";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export const typingSchema = z.object({
  scopeType: z.enum(["CHANNEL", "CONVERSATION"]),
  scopeId: objectIdSchema,
  threadId: objectIdSchema.optional(),
});

type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

const SEND_ACTION_BY_SCOPE: Record<"CHANNEL" | "CONVERSATION", Action> = {
  CHANNEL: "channel.message.send",
  CONVERSATION: "conversation.message.send",
};

const SCOPE_TYPE: Record<"CHANNEL" | "CONVERSATION", ScopeType> = {
  CHANNEL: "CHANNEL",
  CONVERSATION: "CONVERSATION",
};

export function registerTypingHandlers(_io: Server, socket: AppSocket): void {
  const user = socket.data.user;

  const handle = (state: TypingState, event: string) => async (payload: unknown, ack?: AckCallback) => {
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.(ackErr(ErrorCode.RT_400));
      socketEventsTotal.inc({ event, result: "error" });
      return;
    }

    const { scopeType, scopeId, threadId } = parsed.data;
    const room = scopeType === "CHANNEL" ? ROOM.channel(scopeId) : ROOM.conversation(scopeId);

    if (!socket.rooms.has(room)) {
      ack?.(ackErr(ErrorCode.RT_409));
      socketEventsTotal.inc({ event, result: "rejected" });
      return;
    }

    try {
      await permissionService.assert(user, SEND_ACTION_BY_SCOPE[scopeType], {
        type: SCOPE_TYPE[scopeType],
        id: scopeId,
      });
    } catch (err) {
      const code: ErrorCodeType = err instanceof AppError ? err.errorCode : ErrorCode.RT_400;
      ack?.(ackErr(code));
      socketEventsTotal.inc({ event, result: "rejected" });
      return;
    }

    await setTyping({ userId: user.id, scopeType, scopeId, threadId }, state);

    // `socket.to()` — KHÔNG phát lại cho chính người gửi (be.md §5.5 bước 4).
    socket
      .to(room)
      .emit(SocketEvent.TYPING, stampPayload({ scopeType, scopeId, threadId, userId: user.id, state }));

    ack?.(ackOk());
    socketEventsTotal.inc({ event, result: "ok" });
  };

  socket.on(SocketEvent.TYPING_START, handle("start", SocketEvent.TYPING_START));
  socket.on(SocketEvent.TYPING_STOP, handle("stop", SocketEvent.TYPING_STOP));
}
