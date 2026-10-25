import { getMessagePollReader, type MessagePollView, type MessagePollViewer } from "../../../shared/ports/message-poll-reader.port";
import { logger } from "../../../infrastructure/logger";
import type { Message } from "../entities/message.interface";

/**
 * p7-04 — nạp khảo sát của các tin `kind=POLL` (chưa thu hồi) trong 1 trang bằng ĐÚNG 1 lần `MessagePollReader.pollsOf()` (không N+1) để `toView()` ghép `MessageView.poll`.
 * `viewer.userId = null` dựng bản dùng chung cho payload phát cả phòng (`message:created`): không có `myOptionIds`.
 *
 * Trả `undefined` (KHÔNG ghép `poll`) khi: cổng chưa đăng ký (worker/test không nạp `chat-extensions`), trang không có khảo sát, hoặc truy vấn lỗi — như `loadSavedFlags`,
 * khảo sát chỉ là phần hiển thị thêm của tin, không được làm hỏng cả trang tin nhắn (client chỉ thiếu thẻ khảo sát ở trang đó, tải lại là có).
 */
export async function loadPolls(viewer: MessagePollViewer, messages: readonly Message[]): Promise<ReadonlyMap<string, MessagePollView> | undefined> {
  const reader = getMessagePollReader();
  if (!reader) return undefined;

  const ids = messages.filter((m) => m.kind === "POLL" && m.deletedAt === null).map((m) => m.id);
  if (ids.length === 0) return undefined;

  try {
    return await reader.pollsOf(viewer, ids);
  } catch (err) {
    logger.warn("[messages] Không nạp được khảo sát, bỏ qua ghép poll vào MessageView", {
      count: ids.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
