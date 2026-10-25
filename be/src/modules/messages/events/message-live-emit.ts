import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { redis } from "../../../infrastructure/redis";
import { logger } from "../../../infrastructure/logger";
import { getMessageScope } from "../scope/message-scope.registry";
import { toBroadcastView } from "../services/message-projection";
import type { Message } from "../entities/message.interface";

/** Đủ dài để job `message.events` (chạy sau vài trăm ms – vài giây) thấy cờ; ngắn để không tích khoá Redis. */
const LIVE_EMIT_FLAG_TTL_SECONDS = 120;

function flagKey(messageId: string): string {
  return `msg:live-emitted:${messageId}`;
}

/**
 * Phát `message:created` NGAY sau khi transaction gửi tin commit — không chờ đường bền (outbox relay → BullMQ → worker → đọc lại DB → Redis bridge),
 * vốn tốn nhiều vòng Mongo/Redis và là nguồn trễ chính của tin tới NGƯỜI KHÁC. Đường bền vẫn chạy và vẫn là nguồn sự thật: khi API sập giữa
 * commit và emit thì cờ không được ghi nên job sẽ phát; nếu cờ đã có, job bỏ qua đúng lượt phát này (`wasEmittedLive`). Client khử trùng theo `id`/`clientMessageId`.
 *
 * Best-effort: KHÔNG bao giờ ném — gửi tin đã thành công, lỗi emit không được biến thành lỗi API. Bỏ qua tin `POLL` (cần ghép khảo sát → để job lo).
 */
export function emitMessageCreatedNow(message: Message): void {
  if (message.kind === "POLL") return;
  try {
    const scope = getMessageScope(message.scopeType);
    if (!scope) return;
    emitToRoom(scope.contentRoom(message.scopeId), SocketEvent.MESSAGE_CREATED, toBroadcastView(message));
  } catch (err) {
    logger.warn("[messages] phát nhanh message:created thất bại — job outbox sẽ phát", {
      messageId: message.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  void redis.set(flagKey(message.id), "1", LIVE_EMIT_FLAG_TTL_SECONDS).catch(() => undefined);
}

function activityFlagKey(messageId: string): string {
  return `msg:activity-emitted:${messageId}`;
}

/**
 * Tin HỆ THỐNG (tóm tắt cuộc gọi…) vừa commit: phát ngay `message:created` + `conversation:activity`/`channel:activity` thay vì đợi outbox → worker
 * (cùng lý do `emitMessageCreatedNow`). Đường bền vẫn chạy; job bỏ qua lượt activity nếu cờ đã có (`wasActivityEmittedLive`) để khỏi cộng unread hai lần.
 * Best-effort, không bao giờ ném.
 */
export async function announceSystemMessageNow(message: Message): Promise<void> {
  emitMessageCreatedNow(message);
  if (message.threadKey !== "root") return;
  try {
    const scope = getMessageScope(message.scopeType);
    if (!scope) return;
    await scope.emitActivity(message.scopeId, {
      messageId: message.id,
      seq: message.seq,
      createdAt: message.createdAt,
      kind: message.kind,
      authorId: message.authorId,
      mentions: [],
    });
    await redis.set(activityFlagKey(message.id), "1", LIVE_EMIT_FLAG_TTL_SECONDS);
  } catch (err) {
    logger.warn("[messages] phát nhanh activity tin hệ thống thất bại — job outbox sẽ phát", {
      messageId: message.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Job `message.events` gọi trước `emitActivity`: `true` ⇒ `announceSystemMessageNow` đã phát rồi. Redis lỗi ⇒ `false`. */
export async function wasActivityEmittedLive(messageId: string): Promise<boolean> {
  try {
    return await redis.exists(activityFlagKey(messageId));
  } catch {
    return false;
  }
}

/** Job `message.events` gọi trước khi phát `message:created`: `true` ⇒ API đã phát nhanh rồi, bỏ qua để khỏi trùng. Redis lỗi ⇒ `false` (thà phát trùng còn hơn mất). */
export async function wasEmittedLive(messageId: string): Promise<boolean> {
  try {
    return await redis.exists(flagKey(messageId));
  } catch {
    return false;
  }
}
