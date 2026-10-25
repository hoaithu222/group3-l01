/**
 * @file quiz.handler.ts
 * @description `quiz:answer` C→S (p5-01 be.md §3) — kênh nhanh song song
 * `POST /live-quiz/:id/answer`, cùng nghiệp vụ `LiveQuizService.answer()`
 * (atomic Lua trong Redis store, không trả đúng/sai trước `quiz:reveal`).
 * Yêu cầu socket ĐÃ join room `quiz:{id}` (room guard `quiz` chỉ cho người
 * tham gia vào). Rate limit do `socket.ratelimit.ts` (hạng `quizAnswer`) chặn
 * trước khi tới đây.
 */
import { type DefaultEventsMap, type Server, type Socket } from "socket.io";
import { SocketEvent } from "../socket.events";
import { ROOM } from "../socket.rooms";
import type { SocketData } from "../socket.server";
import { ackOk, ackErr, type AckCallback } from "../socket.ack";
import { ErrorCode, type ErrorCodeType } from "../../../core/utils/error.codes";
import { socketEventsTotal } from "../../metrics";
import { AppError } from "../../../core/exceptions";
import { socketAnswerSchema } from "../../../modules/live-quiz/dtos";
import { logger } from "../../logger";

type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

/**
 * ⛔ Nạp MUỘN container live-quiz (dynamic import), KHÔNG import tĩnh ở đầu file. `live-quiz.container` kéo theo study →
 * moderation (`moderation.container` dựng `createChannelAdminPort()` NGAY lúc nạp) → channels; mà `socket.server` lại được chính
 * `channels` import. Import tĩnh ở đây tạo VÒNG PHỤ THUỘC: nạp `channels/services/channel-lifecycle.service` trước thì
 * `ChannelLifecycleService is not a constructor` (TDZ) — làm vỡ vài suite và có thể vỡ cả khởi động tuỳ thứ tự nạp (2026-09-25).
 * Chỉ `socketAnswerSchema` (DTO thuần zod) còn import tĩnh.
 */
async function liveQuiz() {
  const { getLiveQuizContainer } = await import("../../../modules/live-quiz/live-quiz.container");
  return getLiveQuizContainer();
}

const QUIZ_ROOM_PREFIX = ROOM.quiz("");

export function registerQuizHandlers(io: Server, socket: AppSocket): void {
  const event = SocketEvent.QUIZ_ANSWER;

  // p5-01 host-timeout: `disconnecting` (socket.rooms còn nguyên). Service tự bỏ qua nếu user không phải host; host còn thiết bị KHÁC
  // trong room (kiểm đa instance qua `fetchSockets`) → không tính là rời. Lỗi chỉ log — không chặn luồng ngắt kết nối.
  socket.on("disconnecting", () => {
    const userId = socket.data.user?.id;
    if (!userId) return;
    for (const room of socket.rooms) {
      if (!room.startsWith(QUIZ_ROOM_PREFIX)) continue;
      const sessionId = room.slice(QUIZ_ROOM_PREFIX.length);
      const stillConnected = async (): Promise<boolean> => {
        const sockets = await io.in(room).fetchSockets();
        return sockets.some((s) => s.id !== socket.id && (s.data as Partial<SocketData>).user?.id === userId);
      };
      liveQuiz()
        .then((container) => container.service.hostDisconnected(userId, sessionId, stillConnected))
        .catch((err: unknown) => logger.warn("[quiz] Xử lý host rời room lỗi", { sessionId, error: err instanceof Error ? err.message : String(err) }));
    }
  });

  socket.on(event, async (payload: unknown, ack?: AckCallback) => {
    const parsed = socketAnswerSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.(ackErr(ErrorCode.RT_400));
      socketEventsTotal.inc({ event, result: "error" });
      return;
    }

    const { sessionId, index, choice } = parsed.data;
    if (!socket.rooms.has(ROOM.quiz(sessionId))) {
      ack?.(ackErr(ErrorCode.RT_409));
      socketEventsTotal.inc({ event, result: "rejected" });
      return;
    }

    try {
      await (await liveQuiz()).service.answer(socket.data.user, sessionId, index, choice);
    } catch (err) {
      const code: ErrorCodeType = err instanceof AppError ? err.errorCode : ErrorCode.RT_400;
      ack?.(ackErr(code));
      socketEventsTotal.inc({ event, result: "rejected" });
      return;
    }

    ack?.(ackOk());
    socketEventsTotal.inc({ event, result: "ok" });
  });
}
